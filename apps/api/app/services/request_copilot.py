"""Request & approver copilot (D2).

Given a request — its form data, approval history and similar past cases — the copilot
produces an advisory briefing: a short summary, missing/inconsistent information,
policy/attention flags, and a recommended decision *with reasons*. The human always
decides; this only surfaces what's already in the data.

Grounding: ``analyze`` accepts optional ``grounding`` snippets (D3 RAG) that are
injected into the prompt so recommendations can cite workspace policy. Similar past
cases are computed deterministically (real instances), never invented by the model.

Degrades gracefully: with no AI key, a disabled feature or any error, it returns a
deterministic summary so the panel always shows something useful.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy import select

from app.db.models import User, WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.services import ai_client, ai_gateway
from app.services.ai_client import AiError

logger = logging.getLogger(__name__)

_EVENT_LABELS = {
    "request.submitted": "submitted",
    "request.commented": "comment",
    "step.started": "step started",
    "step.approved": "approved",
    "step.rejected": "rejected",
    "step.returned": "returned to originator",
    "step.timer_elapsed": "timer elapsed",
    "workflow.completed": "completed",
}


def _trim(v, n: int = 300) -> str:
    s = "" if v is None else str(v)
    return s if len(s) <= n else s[: n - 1] + "…"


def fields(defn: WorkflowDefinition, data: dict) -> list[dict]:
    """[{label, key, value}] for the request's form fields (labels from the schema)."""
    out: list[dict] = []
    schema_fields = (defn.form_schema or {}).get("fields") or [] if defn else []
    seen = set()
    for f in schema_fields:
        if not isinstance(f, dict):
            continue
        key = f.get("key") or f.get("name")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({"label": f.get("label") or key, "key": key, "value": _trim((data or {}).get(key))})
    # include data keys not in the schema (ad-hoc / service outputs)
    for key, val in (data or {}).items():
        if key not in seen:
            out.append({"label": key, "key": key, "value": _trim(val)})
    return out


def _timeline(db, inst: WorkflowInstance, limit: int = 15) -> list[str]:
    evs = db.scalars(
        select(WorkflowEvent)
        .where(WorkflowEvent.instance_id == inst.id)
        .order_by(WorkflowEvent.created_at.asc())
    ).all()
    evs = evs[-limit:]
    names: dict[UUID, str] = {}
    lines: list[str] = []
    for ev in evs:
        label = _EVENT_LABELS.get(ev.event_type, ev.event_type)
        who = ""
        if ev.actor_user_id:
            if ev.actor_user_id not in names:
                u = db.get(User, ev.actor_user_id)
                names[ev.actor_user_id] = u.full_name if u else "someone"
            who = f" by {names[ev.actor_user_id]}"
        payload = ev.payload or {}
        note = payload.get("comment") or payload.get("note") or payload.get("reason") or ""
        when = ev.created_at.date().isoformat() if ev.created_at else ""
        lines.append(f"{when}: {label}{who}" + (f" — {_trim(note, 160)}" if note else ""))
    return lines


def related_cases(db, inst: WorkflowInstance, limit: int = 5) -> list[dict]:
    """Recent decided instances of the same workflow (real cases, for precedent)."""
    rows = db.scalars(
        select(WorkflowInstance)
        .where(
            WorkflowInstance.company_id == inst.company_id,
            WorkflowInstance.workflow_definition_id == inst.workflow_definition_id,
            WorkflowInstance.id != inst.id,
            WorkflowInstance.status.in_(("approved", "rejected")),
        )
        .order_by(WorkflowInstance.updated_at.desc())
        .limit(limit)
    ).all()
    out = []
    for r in rows:
        amount = (r.request_data or {}).get("amount")
        out.append(
            {
                "reference": r.reference_number or str(r.id)[:8],
                "status": r.status,
                "amount": None if amount is None else str(amount),
            }
        )
    return out


def _fallback(inst: WorkflowInstance, defn: WorkflowDefinition, flds: list[dict], related: list[dict]) -> dict:
    name = inst.workflow_name or (defn.name if defn else "Request")
    return {
        "summary": f"{name} — status: {inst.status}. {len(flds)} fields captured.",
        "missing_info": [f["label"] for f in flds if not f["value"]][:5],
        "flags": [],
        "recommendation": {
            "decision": "none",
            "rationale": "AI is unavailable, so no recommendation — review the details manually.",
            "confidence": "low",
        },
        "related": related,
        "ai_used": False,
    }


_SYSTEM = (
    "You are an approval copilot inside a business workflow tool. You help an approver "
    "understand a request quickly and decide well. Use ONLY the information provided — "
    "request data, approval history, similar past cases, and any policy excerpts. Never "
    "invent policy, amounts or facts. Be concise and neutral. The human makes the final "
    "decision. Output JSON only with keys: summary (2-3 sentences), missing_info (array "
    "of short strings for missing or inconsistent information), flags (array of objects "
    "{severity: 'info'|'warning', text}), recommendation (object {decision: "
    "'approve'|'return'|'reject'|'none', rationale: short string, confidence: "
    "'low'|'medium'|'high'})."
)


def analyze(db, inst: WorkflowInstance, defn: WorkflowDefinition, *, grounding: list[str] | None = None) -> dict:
    flds = fields(defn, inst.request_data or {})
    related = related_cases(db, inst)
    if not ai_client.is_configured():
        return _fallback(inst, defn, flds, related)

    timeline = _timeline(db, inst)
    name = inst.workflow_name or (defn.name if defn else "Request")
    parts = [
        f"Workflow: {name}",
        f"Status: {inst.status}; current step: {inst.current_step_id or '—'}",
        "",
        "Request fields:",
        *[f"- {f['label']}: {f['value'] or '(empty)'}" for f in flds],
    ]
    if timeline:
        parts += ["", "Approval history:", *[f"- {t}" for t in timeline]]
    if related:
        parts += ["", "Similar past cases (reference — outcome — amount):",
                  *[f"- {r['reference']} — {r['status']}" + (f" — {r['amount']}" if r['amount'] else "") for r in related]]
    if grounding:
        parts += ["", "Relevant policy excerpts (authoritative — cite if used):",
                  *[f"- {_trim(g, 500)}" for g in grounding]]
    parts += ["", "Return the JSON described in your instructions."]
    user = "\n".join(parts)

    try:
        raw = ai_gateway.run(
            task=ai_gateway.TASK_COPILOT, system=_SYSTEM, user=user,
            company_id=inst.company_id, json_mode=True, temperature=0.2, max_tokens=700,
        )
        data = ai_client.parse_json(raw)
    except (AiError, json.JSONDecodeError, ValueError) as e:
        logger.warning("copilot fell back for instance %s: %s", inst.id, e)
        return _fallback(inst, defn, flds, related)

    # normalise + always attach the deterministic related list
    rec = data.get("recommendation") or {}
    return {
        "summary": _trim(data.get("summary") or "", 1200),
        "missing_info": [str(x) for x in (data.get("missing_info") or [])][:8],
        "flags": [
            {"severity": ("warning" if str(f.get("severity")) == "warning" else "info"), "text": _trim(f.get("text"), 300)}
            for f in (data.get("flags") or [])
            if isinstance(f, dict) and f.get("text")
        ][:8],
        "recommendation": {
            "decision": rec.get("decision") if rec.get("decision") in ("approve", "return", "reject", "none") else "none",
            "rationale": _trim(rec.get("rationale") or "", 600),
            "confidence": rec.get("confidence") if rec.get("confidence") in ("low", "medium", "high") else "low",
        },
        "related": related,
        "ai_used": True,
    }


if __name__ == "__main__":  # self-check: field extraction (no DB/AI)
    class _D:
        name = "Purchase"
        form_schema = {"fields": [{"key": "vendor", "label": "Vendor"}, {"key": "amount", "label": "Amount"}]}

    f = fields(_D(), {"vendor": "Acme", "amount": 1000, "extra": "x"})
    labels = [x["label"] for x in f]
    assert labels == ["Vendor", "Amount", "extra"], labels  # schema order, then ad-hoc keys
    assert f[0]["value"] == "Acme" and f[1]["value"] == "1000"
    assert _trim("a" * 500, 10) == "aaaaaaaaa…"
    print("request_copilot self-check OK")
