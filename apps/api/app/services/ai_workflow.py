"""AI workflow draft, refine, explain (P6). Falls back to templates when no API key."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import settings
from app.services import workflow_engine
from app.services.ui_settings import suggest_ui_for_workflow_name


class AiWorkflowError(ValueError):
    pass


def _detect_template(description: str) -> str:
    d = description.lower()
    if "purchase" in d or "procurement" in d:
        return "purchase"
    if "leave" in d or "vacation" in d or "holiday" in d:
        return "leave"
    if "petty" in d or "cash" in d or "expense" in d:
        return "petty_cash"
    return "generic"


TEMPLATES: dict[str, dict[str, Any]] = {
    "petty_cash": {
        "name": "Petty Cash Approval",
        "form_schema": {
            "fields": [
                {"key": "amount", "type": "number", "label": "Amount", "required": True},
                {"key": "purpose", "type": "text", "label": "Purpose", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": [
            {"id": "step_manager", "name": "Manager Approval", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
            {"id": "step_finance", "name": "Finance Approval", "type": "approval", "assignee": {"type": "role", "value": "company_admin"}},
        ],
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 5000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 48},
    },
    "purchase": {
        "name": "Purchase Request",
        "form_schema": {
            "fields": [
                {"key": "amount", "type": "number", "label": "Total amount", "required": True},
                {"key": "item_description", "type": "text", "label": "Item / service", "required": True},
                {"key": "vendor", "type": "text", "label": "Vendor", "required": True},
                {"key": "department", "type": "text", "label": "Department", "required": True},
            ]
        },
        "steps": [
            {"id": "step_manager", "name": "Manager Approval", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
            {"id": "step_finance", "name": "Finance Approval", "type": "approval", "assignee": {"type": "role", "value": "company_admin"}},
        ],
        "routing_rules": [
            {"when": {"field": "amount", "op": "gt", "value": 10000}, "skip_to": "step_finance"}
        ],
        "settings": {"sla_hours": 72},
    },
    "leave": {
        "name": "Leave Approval",
        "form_schema": {
            "fields": [
                {"key": "start_date", "type": "date", "label": "Start date", "required": True},
                {"key": "end_date", "type": "date", "label": "End date", "required": True},
                {"key": "leave_type", "type": "text", "label": "Leave type", "required": True},
                {"key": "reason", "type": "textarea", "label": "Reason", "required": False},
            ]
        },
        "steps": [
            {"id": "step_manager", "name": "Manager Approval", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
        ],
        "routing_rules": [],
        "settings": {"sla_hours": 48},
    },
    "generic": {
        "name": "Custom Approval Workflow",
        "form_schema": {
            "fields": [
                {"key": "title", "type": "text", "label": "Request title", "required": True},
                {"key": "details", "type": "textarea", "label": "Details", "required": True},
            ]
        },
        "steps": [
            {"id": "step_manager", "name": "Manager Approval", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
        ],
        "routing_rules": [],
        "settings": {"sla_hours": 48},
    },
}


def _template_draft(description: str) -> dict[str, Any]:
    key = _detect_template(description)
    data = json.loads(json.dumps(TEMPLATES[key]))
    data["settings"] = {**(data.get("settings") or {}), **suggest_ui_for_workflow_name(data["name"])}
    gaps: list[str] = []
    if "manager" not in description.lower() and key == "generic":
        gaps.append("Consider specifying who approves (e.g. manager, finance).")
    if key == "purchase" and "finance" not in description.lower():
        gaps.append("Finance approval step included for amounts over 10,000.")
    return {
        "draft": data,
        "explanation": _explain_draft(data, description),
        "gaps": gaps,
        "source": "template",
    }


def _explain_draft(draft: dict, description: str) -> str:
    steps = ", ".join(s.get("name", "") for s in draft.get("steps", []) if isinstance(s, dict))
    fields = len((draft.get("form_schema") or {}).get("fields") or [])
    return (
        f"This workflow '{draft.get('name')}' was designed from your description. "
        f"It collects {fields} form field(s) and routes through: {steps}. "
        f"Review the preview, run a test, then publish when ready."
    )


def _call_openai(system: str, user: str) -> dict[str, Any]:
    if not settings.ai_api_key:
        raise AiWorkflowError("No AI API key configured")
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": settings.ai_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }
    headers = {"Authorization": f"Bearer {settings.ai_api_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=60.0) as client:
        r = client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
    return json.loads(content)


SYSTEM_PROMPT = """You are WizFlow's workflow designer. Output JSON only with keys:
draft (object with name, form_schema.fields[], steps[], routing_rules[], settings),
explanation (plain business language string),
gaps (array of strings for missing info).
Each step needs id, name, type=approval, assignee {type: role, value: manager|company_admin|approver}.
Form field keys must be snake_case."""


def draft_from_description(description: str) -> dict[str, Any]:
    description = description.strip()
    if len(description) < 10:
        raise AiWorkflowError("Please describe the workflow in at least 10 characters")

    if settings.ai_api_key:
        try:
            result = _call_openai(SYSTEM_PROMPT, f"Create a workflow for: {description}")
            draft = result.get("draft") or result
            workflow_engine.validate_definition(_MockDefn(draft))
            return {
                "draft": draft,
                "explanation": result.get("explanation") or _explain_draft(draft, description),
                "gaps": result.get("gaps") or [],
                "source": "openai",
            }
        except Exception:
            pass

    return _template_draft(description)


def refine_draft(current: dict, instruction: str) -> dict[str, Any]:
    instruction = instruction.strip()
    if not instruction:
        raise AiWorkflowError("Refinement instruction is required")

    merged = json.loads(json.dumps(current))

    if settings.ai_api_key:
        try:
            result = _call_openai(
                SYSTEM_PROMPT,
                f"Current workflow JSON:\n{json.dumps(merged)}\n\nApply this change: {instruction}",
            )
            draft = result.get("draft") or result
            return {
                "draft": draft,
                "explanation": result.get("explanation", "Workflow updated."),
                "gaps": result.get("gaps") or [],
                "source": "openai",
            }
        except Exception:
            pass

    # Simple rule-based refine
    low = instruction.lower()
    if "finance" in low and "step_finance" not in str(merged.get("steps")):
        merged.setdefault("steps", []).append(
            {
                "id": "step_finance",
                "name": "Finance Approval",
                "type": "approval",
                "assignee": {"type": "role", "value": "company_admin"},
            }
        )
    if re.search(r"amount|(\d+)", low):
        m = re.search(r"(\d{3,})", instruction)
        if m:
            merged.setdefault("routing_rules", []).append(
                {
                    "when": {"field": "amount", "op": "gt", "value": int(m.group(1))},
                    "skip_to": "step_finance",
                }
            )
    if "rename" in low or "name" in low:
        capitalized = [w for w in instruction.split() if w[:1].isupper()]
        if capitalized:
            merged["name"] = " ".join(capitalized[:3])

    return {
        "draft": merged,
        "explanation": f"Applied your change: {instruction}",
        "gaps": [],
        "source": "template",
    }


def explain_definition(defn_dict: dict) -> str:
    return _explain_draft(defn_dict, defn_dict.get("ai_prompt") or "")


class _MockDefn:
    def __init__(self, data: dict):
        self.name = data.get("name", "")
        self.steps = data.get("steps", [])
        self.form_schema = data.get("form_schema", {})
