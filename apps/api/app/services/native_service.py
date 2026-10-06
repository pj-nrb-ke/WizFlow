"""Execute a native-BPMN service task (Phase B · B4).

When the native engine starts a serviceTask, this runs the matching action — the
same notify/webhook/ai actions the linear engine's service steps use — reading
config from the diagram's bindings. Returns data to merge back into the token
(so an AI result can feed a downstream gateway), or None.

build_runner() yields the callback native_instance._drive expects:
``runner(bpmn_id, task_data) -> dict | None``.

ponytail: reuses the primitives (notify_users / webhooks SSRF guard / ai_client)
rather than the WorkflowInstance-coupled service_steps. 'document' is deferred for
native (it needs the request/form context the linear path has).
"""

from __future__ import annotations

import json
import logging

import httpx
from sqlalchemy.orm import Session

from app.db.models import BpmnInstance
from app.services import ai_client
from app.services.assignees import _users_for_role
from app.services.notifications import notify_users
from app.services.webhooks import is_safe_webhook_url

logger = logging.getLogger("wizflow.native_service")


def _render(template: str | None, data: dict) -> str:
    out = template or ""
    for key, value in (data or {}).items():
        out = out.replace("{" + str(key) + "}", str(value))
    return out


def build_runner(db: Session, inst: BpmnInstance, service_by_id: dict):
    """Return runner(bpmn_id, task_data) -> dict|None for native service tasks."""

    def run(bpmn_id: str, task_data: dict) -> dict | None:
        cfg = service_by_id.get(bpmn_id)
        if not cfg:
            return None  # no config → complete as a no-op so the flow proceeds
        stype = (cfg.get("type") or "notify").lower()
        try:
            if stype == "notify":
                recipients = []
                if inst.originator_user_id:
                    recipients.append(inst.originator_user_id)
                role = cfg.get("notify_role")
                if role:
                    recipients += [u.id for u in _users_for_role(db, inst.company_id, role)]
                if recipients:
                    notify_users(
                        db,
                        company_id=inst.company_id,
                        user_ids=list(dict.fromkeys(recipients)),
                        title=_render(cfg.get("title") or f"Update: {inst.name}", task_data),
                        body=_render(cfg.get("message") or "Automated workflow update.", task_data),
                    )
                return None
            if stype == "webhook":
                url = str(cfg.get("url") or "").strip()
                if is_safe_webhook_url(url):
                    try:
                        with httpx.Client(timeout=5.0) as client:
                            client.post(url, json={"instance_id": str(inst.id), "name": inst.name, "data": task_data})
                    except Exception as e:  # pragma: no cover - network
                        logger.warning("native webhook failed for %s: %s", inst.id, e)
                return None
            if stype == "ai":
                if not ai_client.is_configured():
                    return None
                try:
                    out = ai_client.chat(
                        "You are an automated step in a business workflow. Follow the instruction using "
                        "only the data provided and return a concise result.",
                        f"Instruction: {cfg.get('prompt')}\n\nData (JSON):\n{json.dumps(task_data, default=str)}",
                    )
                    return {cfg.get("output_key") or "ai_result": out}
                except Exception as e:  # pragma: no cover
                    logger.warning("native ai step failed for %s: %s", inst.id, e)
                    return None
            # 'document' deferred for native (needs the request/form context)
        except Exception as e:  # pragma: no cover - never wedge the run
            logger.warning("native service task %s (%s) failed: %s", bpmn_id, stype, e)
        return None

    return run
