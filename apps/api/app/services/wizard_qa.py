"""Guided AI workflow wizard Q&A."""

from __future__ import annotations

from app.services import ai_workflow


def wizard_questions(description: str) -> dict:
    desc = description.strip()
    questions = [
        {
            "id": "purpose",
            "prompt": "What is the main purpose of this workflow?",
            "type": "text",
            "default": desc[:200] if desc else "",
        },
        {
            "id": "amount_field",
            "prompt": "Does this request involve a monetary amount?",
            "type": "yesno",
            "default": "yes" if any(w in desc.lower() for w in ("expense", "purchase", "cash", "payment", "invoice")) else "no",
        },
        {
            "id": "approver_chain",
            "prompt": "Who should approve? (e.g. manager then finance)",
            "type": "text",
            "default": "Manager, then Finance for high amounts",
        },
        {
            "id": "sla_hours",
            "prompt": "Target completion time in hours?",
            "type": "number",
            "default": "48",
        },
        {
            "id": "notifications",
            "prompt": "Notify approvers by email when a step is assigned?",
            "type": "yesno",
            "default": "yes",
        },
    ]
    return {
        "questions": questions,
        "initial_hint": "Answer a few questions — we'll draft the form, approval chain, and SLA settings.",
    }


def wizard_finalize(description: str, answers: dict) -> dict:
    parts = [description.strip()]
    for key, val in answers.items():
        if val:
            parts.append(f"{key}: {val}")
    combined = "\n".join(parts)
    result = ai_workflow.draft_from_description(combined)
    settings = dict(result["draft"].get("settings") or {})
    try:
        sla = int(answers.get("sla_hours") or settings.get("sla_hours") or 48)
        settings["sla_hours"] = sla
    except (TypeError, ValueError):
        pass
    if str(answers.get("notifications", "yes")).lower() in ("yes", "true", "1"):
        settings["notify_email"] = True
    result["draft"]["settings"] = settings
    result["explanation"] = (
        result.get("explanation", "")
        + " Configured from guided wizard answers (form, chain, SLA, notifications)."
    ).strip()
    return result
