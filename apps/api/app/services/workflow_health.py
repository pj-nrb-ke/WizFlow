"""Pre-publish workflow health checks (Phase 1)."""

from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from app.db.models import WorkflowDefinition
from app.services.initiators import custom_workflow_settings, resolve_initiator_user_ids
from app.services.workflow_engine import is_automated_step

Severity = Literal["error", "warning"]


def _issue(severity: Severity, message: str) -> dict:
    return {"severity": severity, "message": message}


def _step_ids(steps: list) -> list[str]:
    return [s["id"] for s in steps if isinstance(s, dict) and s.get("id")]


def _step_has_assignee(step: dict) -> bool:
    assignee = step.get("assignee") or {}
    atype = assignee.get("type")
    if atype == "role":
        return bool(assignee.get("value"))
    if atype == "users":
        return bool(assignee.get("user_ids"))
    if atype == "dynamic":
        return bool(assignee.get("value"))
    return False


def check_workflow_health(db: Session, defn: WorkflowDefinition) -> list[dict]:
    issues: list[dict] = []
    steps = defn.steps or []
    step_ids = _step_ids(steps)

    if not defn.name or not defn.name.strip():
        issues.append(_issue("error", "Workflow name is required"))

    fields = (defn.form_schema or {}).get("fields")
    if fields is None or fields == []:
        issues.append(_issue("error", "Form has no fields — add at least one field before publishing"))

    seen: set[str] = set()
    for step in steps:
        if not isinstance(step, dict):
            issues.append(_issue("error", "Invalid step entry (must be an object)"))
            continue
        sid = step.get("id")
        if sid:
            if sid in seen:
                issues.append(_issue("error", f"Duplicate step id: {sid}"))
            seen.add(sid)
        if not is_automated_step(step):
            # automated/service steps (notify, record, webhook, …) carry no human assignee
            if not _step_has_assignee(step):
                label = step.get("name") or sid or "unknown"
                issues.append(_issue("error", f"Step '{label}' has no assignees configured"))
            else:
                assignee = step.get("assignee") or {}
                if assignee.get("type") == "users" and not (assignee.get("user_ids") or []):
                    label = step.get("name") or sid or "unknown"
                    issues.append(_issue("error", f"Step '{label}' is missing approvers (empty user list)"))

    for i, rule in enumerate(defn.routing_rules or []):
        if not isinstance(rule, dict):
            continue
        skip_to = rule.get("skip_to")
        if skip_to and skip_to not in step_ids:
            issues.append(
                _issue("error", f"Routing rule {i + 1} references unknown step '{skip_to}'")
            )

    cw = custom_workflow_settings(defn.settings)
    if cw:
        initiator = cw.get("initiator") or {}
        if not initiator.get("everyone"):
            allowed = resolve_initiator_user_ids(db, defn.company_id, initiator)
            if not allowed:
                issues.append(
                    _issue("error", "Custom workflow has no initiators — select users or groups")
                )

    if not steps:
        issues.append(_issue("error", "At least one approval step is required"))
    elif len(step_ids) != len(steps):
        issues.append(_issue("warning", "Some steps are missing an id"))

    return issues


def health_summary(issues: list[dict]) -> dict:
    has_error = any(i.get("severity") == "error" for i in issues)
    return {"issues": issues, "ok": not has_error}


if __name__ == "__main__":  # self-check: automated/service steps need no assignee
    class _NS:
        name = "t"
        form_schema = {"fields": [{"key": "a", "type": "text", "label": "A"}]}
        routing_rules: list = []
        settings: dict = {}

        def __init__(self, steps):
            self.steps = steps

    ok = check_workflow_health(None, _NS([  # type: ignore[arg-type]
        {"id": "rec", "name": "Save to ExpenseClaim", "type": "record", "entity_slug": "expense_claim"},
        {"id": "s1", "name": "Manager", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
    ]))
    assert not any("no assignees" in i["message"] for i in ok), ok
    bad = check_workflow_health(None, _NS([{"id": "s1", "name": "Review", "type": "approval"}]))  # type: ignore[arg-type]
    assert any("no assignees" in i["message"] for i in bad), bad
    print("workflow_health self-check OK — automated steps exempt from assignee check")
