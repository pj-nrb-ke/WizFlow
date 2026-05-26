"""Plain-English workflow fine-tuning (rule-based + AI refine fallback)."""

from __future__ import annotations

import copy
import re
from typing import Any

from app.services import ai_workflow


def apply_plain_english_command(defn: dict[str, Any], instruction: str) -> tuple[dict[str, Any], str]:
    """Return updated draft snapshot and human-readable summary."""
    text = instruction.strip().lower()
    draft = copy.deepcopy(defn)
    steps = list(draft.get("steps") or [])
    routing = list(draft.get("routing_rules") or [])
    settings = dict(draft.get("settings") or {})

    if "send rejected" in text and "originator" in text:
        routing.append(
            {
                "when": {"status": "returned"},
                "action": "notify_originator",
                "note": "Returned to originator for correction",
            }
        )
        draft["routing_rules"] = routing
        return draft, "Added routing note: returned requests go back to the originator."

    m = re.search(r"above\s+([\d,]+)", text)
    threshold = int(m.group(1).replace(",", "")) if m else None

    if threshold and ("finance" in text or "add" in text):
        step_id = "step_finance"
        if not any(s.get("id") == step_id for s in steps):
            steps.append(
                {
                    "id": step_id,
                    "name": "Finance Approval",
                    "type": "approval",
                    "assignee": {"type": "role", "value": "company_admin"},
                    "sla_hours": settings.get("sla_hours", 48),
                }
            )
            routing.append(
                {"when": {"field": "amount", "op": "gt", "value": threshold}, "skip_to": step_id}
            )
            draft["steps"] = steps
            draft["routing_rules"] = routing
            return draft, f"Added Finance approval for amounts above {threshold:,}."

    if "sla" in text:
        hm = re.search(r"(\d+)\s*h", text)
        if hm:
            settings["sla_hours"] = int(hm.group(1))
            draft["settings"] = settings
            return draft, f"Set workflow SLA to {settings['sla_hours']} hours."

    try:
        refined = ai_workflow.refine_draft(draft, instruction)
        return refined["draft"], refined.get("explanation", "Applied AI refinement.")
    except ai_workflow.AiWorkflowError as exc:
        raise ValueError(str(exc)) from exc
