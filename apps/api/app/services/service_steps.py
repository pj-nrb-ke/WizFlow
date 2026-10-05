"""Execute automated 'service' steps — the non-human side of the workflow.

A service step does something and then auto-advances (unlike a timer, which only
waits). Three kinds, each reusing machinery already in the codebase:
  * ``notify``  → in-app/email notification (notify_users)
  * ``webhook`` → POST the request to an external URL (SSRF-guarded via webhooks)
  * ``ai``      → LLM writes a note into the request timeline

Driven by the scheduler (``phase2_automation.process_service_steps``), never on
the request path — they may make network calls that must not block a user's HTTP
request.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.db.models import Attachment, WorkflowDefinition, WorkflowInstance
from app.services import ai_client, doc_templates
from app.services.assignees import _users_for_role
from app.services.events import record_event
from app.services.files import save_bytes
from app.services.notifications import notify_users
from app.services.ui_settings import strip_ui_keys
from app.services.webhooks import is_safe_webhook_url
from app.services.workflow_engine import SERVICE_STEP_TYPES

logger = logging.getLogger("wizflow.service_steps")


def _render(template: str | None, data: dict) -> str:
    """Fill ``{field}`` placeholders from request data; leave unknown ones as-is."""
    out = template or ""
    for key, value in (data or {}).items():
        out = out.replace("{" + str(key) + "}", str(value))
    return out


def _run_notify(db: Session, inst: WorkflowInstance, defn: WorkflowDefinition, step: dict, data: dict) -> str:
    recipients: list[UUID] = []
    if inst.originator_user_id:
        recipients.append(inst.originator_user_id)
    role = step.get("notify_role")
    if role:
        recipients.extend(u.id for u in _users_for_role(db, inst.company_id, role))
    recipients = list(dict.fromkeys(recipients))  # dedupe, keep order
    if not recipients:
        return "notify: no recipients"
    title = _render(step.get("title") or f"Update: {inst.workflow_name}", data)
    body = _render(step.get("message") or step.get("title") or "Automated workflow update.", data)
    notify_users(
        db,
        company_id=inst.company_id,
        user_ids=recipients,
        title=title,
        body=body,
        instance_id=inst.id,
    )
    return f"notify: {len(recipients)} recipient(s)"


def _run_webhook(db: Session, inst: WorkflowInstance, defn: WorkflowDefinition, step: dict, data: dict) -> str:
    url = str(step.get("url") or "").strip()
    if not is_safe_webhook_url(url):
        return "webhook: blocked (unsafe or private URL)"
    body = {
        "instance_id": str(inst.id),
        "reference": inst.reference_number,
        "workflow": inst.workflow_name,
        "step_id": step.get("id"),
        "data": data,
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(url, json=body)
        return f"webhook: HTTP {resp.status_code}"
    except Exception as e:  # pragma: no cover - network; never wedge the instance
        logger.warning("webhook step failed for %s: %s", inst.id, e)
        return f"webhook: error ({type(e).__name__})"


def _ai_note(prompt: str, data: dict) -> str:
    if not ai_client.is_configured():
        return f"[AI step] {prompt} — (no AI key configured)"
    try:
        system = (
            "You are an automated step inside a business approval workflow. "
            "Follow the instruction using only the request data provided and return "
            "a concise note (2-4 sentences) to add to the request's timeline."
        )
        user = f"Instruction: {prompt}\n\nRequest data (JSON):\n{json.dumps(data, default=str)}"
        return ai_client.chat(system, user, temperature=0.3) or f"[AI step] {prompt}"
    except Exception as e:  # pragma: no cover - LLM/network hiccup
        logger.warning("ai step fell back for prompt %r: %s", prompt[:40], e)
        return f"[AI step] {prompt} — (AI unavailable)"


def _run_ai(db: Session, inst: WorkflowInstance, defn: WorkflowDefinition, step: dict, data: dict) -> str:
    prompt = str(step.get("prompt") or step.get("ai_prompt") or "").strip()
    note = _ai_note(prompt, data)
    # Surface the result in the timeline, same channel as a human/voice comment.
    record_event(
        db,
        company_id=inst.company_id,
        event_type="request.commented",
        actor_user_id=None,
        instance_id=inst.id,
        payload={"comment": f"\U0001F916 {note}", "ai_step": step.get("id")},
    )
    return "ai: note added"


def _run_document(db: Session, inst: WorkflowInstance, defn: WorkflowDefinition, step: dict, data: dict) -> str:
    template = doc_templates.find_template(defn, step.get("template_id") or "")
    if not template:
        return f"document: template {step.get('template_id')!r} not found"
    pdf = doc_templates.render_pdf(template, inst)
    rel, name, size = save_bytes(
        inst.company_id, inst.id, pdf, doc_templates.output_filename(template, inst)
    )
    db.add(
        Attachment(
            company_id=inst.company_id,
            instance_id=inst.id,
            uploaded_by=None,
            filename=name,
            storage_path=rel,
            content_type="application/pdf",
            size_bytes=size,
        )
    )
    record_event(
        db,
        company_id=inst.company_id,
        event_type="document.generated",
        actor_user_id=None,
        instance_id=inst.id,
        payload={"template_id": template["id"], "filename": name, "auto": True},
    )
    return f"document: {name}"


_RUNNERS = {"notify": _run_notify, "webhook": _run_webhook, "ai": _run_ai, "document": _run_document}


def execute_service_step(
    db: Session, inst: WorkflowInstance, defn: WorkflowDefinition, step: dict
) -> str:
    """Run one service step against an instance; return a short result summary.

    ponytail: at-least-once — a crash after the side effect but before the caller
    advances the instance can re-run it next tick. Add an idempotency log if a
    step ever does something that must not repeat.
    """
    runner = _RUNNERS.get(step.get("type") or "")
    if runner is None:
        return f"unknown service step type: {step.get('type')!r}"
    data = strip_ui_keys(inst.request_data or {})
    return runner(db, inst, defn, step, data)


if __name__ == "__main__":  # self-check: runner registry matches the engine's type set
    assert set(_RUNNERS) == SERVICE_STEP_TYPES, (set(_RUNNERS), SERVICE_STEP_TYPES)
    assert _render("Hi {name}, ref {reference}", {"name": "Pat", "reference": "R-1"}) == "Hi Pat, ref R-1"
    assert _render("no placeholders", {"x": 1}) == "no placeholders"
    assert _ai_note("summarise", {}).startswith("[AI step]")  # no key in test env
    print("service_steps self-check OK")
