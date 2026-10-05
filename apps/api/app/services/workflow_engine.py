"""Headless workflow engine — publish validation and simulation (P2)."""

from __future__ import annotations

from app.db.models import WorkflowDefinition
from app.schemas.workflow import SimulationResult
from app.services.assignees import ASSIGNMENT_MODES


class WorkflowValidationError(ValueError):
    pass


# Service steps run automatically and *do* something (then auto-advance).
SERVICE_STEP_TYPES = {"notify", "webhook", "ai", "document"}
# Steps that run automatically (no human assignee); the scheduler progresses them.
# Timers wait; service steps act. Both are driven by phase2_automation.
AUTOMATED_STEP_TYPES = {"timer"} | SERVICE_STEP_TYPES


def is_automated_step(step: dict) -> bool:
    return (step.get("type") or "approval") in AUTOMATED_STEP_TYPES


def timer_wait_hours(step: dict) -> int | None:
    """Resolve a timer step's wait, in hours (from wait_hours, else wait_days)."""
    for key, mult in (("wait_hours", 1), ("wait_days", 24)):
        raw = step.get(key)
        if raw is not None:
            try:
                return max(1, int(raw) * mult)
            except (TypeError, ValueError):
                pass
    return None


def _validate_assignee(step: dict) -> None:
    assignee = step.get("assignee") or {}
    atype = assignee.get("type")
    if not atype:
        raise WorkflowValidationError(f"Step '{step.get('id')}' needs assignee type")
    if atype == "role":
        if not assignee.get("value"):
            raise WorkflowValidationError(f"Step '{step.get('id')}' needs assignee role value")
    elif atype == "users":
        ids = assignee.get("user_ids") or []
        if not ids:
            raise WorkflowValidationError(f"Step '{step.get('id')}' needs at least one user_id")
        mode = assignee.get("mode") or "claim"
        if mode not in ASSIGNMENT_MODES:
            raise WorkflowValidationError(
                f"Step '{step.get('id')}' mode must be one of: {', '.join(sorted(ASSIGNMENT_MODES))}"
            )
    else:
        raise WorkflowValidationError(f"Step '{step.get('id')}' assignee type must be 'role' or 'users'")


def validate_definition(defn: WorkflowDefinition) -> None:
    if not defn.name or not defn.name.strip():
        raise WorkflowValidationError("Workflow name is required")
    if not defn.steps or len(defn.steps) < 1:
        raise WorkflowValidationError("At least one approval step is required")
    for step in defn.steps:
        if not isinstance(step, dict):
            raise WorkflowValidationError("Each step must be an object")
        if not step.get("id") or not step.get("name"):
            raise WorkflowValidationError("Each step requires id and name")
        if is_automated_step(step):
            t = step.get("type")
            if t == "timer" and timer_wait_hours(step) is None:
                raise WorkflowValidationError(
                    f"Timer step '{step.get('id')}' needs wait_hours or wait_days"
                )
            if t == "webhook" and not str(step.get("url") or "").strip():
                raise WorkflowValidationError(f"Webhook step '{step.get('id')}' needs a url")
            if t == "ai" and not str(step.get("prompt") or step.get("ai_prompt") or "").strip():
                raise WorkflowValidationError(f"AI step '{step.get('id')}' needs a prompt")
            if t == "document" and not str(step.get("template_id") or "").strip():
                raise WorkflowValidationError(f"Document step '{step.get('id')}' needs a template_id")
            # notify: message is optional (defaults to a generic update)
        else:
            _validate_assignee(step)


def _as_number(value: object) -> int | float | None:
    """Coerce routing operands; reject bool and non-numeric strings."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            n: int | float = float(s) if "." in s else int(s)
            return int(n) if isinstance(n, float) and n.is_integer() else n
        except ValueError:
            return None
    return None


def _is_empty(v: object) -> bool:
    return v is None or v == "" or v == [] or v == {}


def _eval_condition(when: dict, data: dict) -> bool:
    """Evaluate a routing condition against request data.

    Backwards-compatible with the flat ``{field, op, value}`` shape (existing rules
    evaluate identically). Adds compound groups and richer operators:
      * compound: ``{"all": [cond, ...]}`` (AND) / ``{"any": [cond, ...]}`` (OR), nestable
      * strings: eq, ne, contains, not_contains, in, not_in, is_empty, not_empty
      * ordered: gt/gte/lt/lte (numeric), before/after (numeric or ISO-date/text)
    """
    if not isinstance(when, dict):
        return False

    # ── Compound groups (recursive) ──
    if "all" in when:
        subs = when.get("all")
        return isinstance(subs, list) and all(_eval_condition(c, data) for c in subs)
    if "any" in when:
        subs = when.get("any")
        return isinstance(subs, list) and any(_eval_condition(c, data) for c in subs)

    field = when.get("field")
    op = when.get("op")
    expected = when.get("value")
    if field is None or op is None:
        return False
    actual = data.get(field)

    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "is_empty":
        return _is_empty(actual)
    if op == "not_empty":
        return not _is_empty(actual)
    if op == "in":
        return actual in (expected if isinstance(expected, list) else [expected])
    if op == "not_in":
        return actual not in (expected if isinstance(expected, list) else [expected])
    if op in ("contains", "not_contains"):
        hit = expected is not None and str(expected).lower() in str(actual).lower()
        return hit if op == "contains" else not hit
    if op in ("gt", "gte", "lt", "lte", "before", "after"):
        a: object = _as_number(actual)
        e: object = _as_number(expected)
        if a is None or e is None:  # not both numeric → compare as text (ISO dates sort correctly)
            if actual is None or expected is None:
                return False
            a, e = str(actual), str(expected)
        if op in ("gt", "after"):
            return a > e  # type: ignore[operator]
        if op == "gte":
            return a >= e  # type: ignore[operator]
        if op in ("lt", "before"):
            return a < e  # type: ignore[operator]
        return a <= e  # type: ignore[operator]
    return False


def simulate(defn: WorkflowDefinition, sample_data: dict) -> SimulationResult:
    steps = defn.steps or []
    routing = defn.routing_rules or []
    step_ids = [s["id"] for s in steps if isinstance(s, dict) and s.get("id")]
    if not step_ids:
        raise WorkflowValidationError("No valid steps to simulate")

    routing_applied: list[str] = []
    skip_targets: set[str] = set()
    for rule in routing:
        if not isinstance(rule, dict):
            continue
        when = rule.get("when") or {}
        skip_to = rule.get("skip_to")
        if skip_to and _eval_condition(when, sample_data):
            routing_applied.append(f"skip_to:{skip_to}")
            idx = step_ids.index(skip_to) if skip_to in step_ids else -1
            if idx > 0:
                for sid in step_ids[:idx]:
                    skip_targets.add(sid)

    traversed: list[str] = []
    for sid in step_ids:
        if sid in skip_targets:
            continue
        traversed.append(sid)

    if not traversed:
        traversed = [step_ids[0]]

    return SimulationResult(
        steps_traversed=traversed,
        final_status="in_progress",
        routing_applied=routing_applied,
    )


if __name__ == "__main__":  # self-check: routing condition evaluator
    ec = _eval_condition
    # backwards-compat: numeric + eq + in
    assert ec({"field": "amount", "op": "gt", "value": 5000}, {"amount": 9000})
    assert not ec({"field": "amount", "op": "gt", "value": 5000}, {"amount": 100})
    assert ec({"field": "amount", "op": "gt", "value": "5000"}, {"amount": "9000"})  # string digits
    assert ec({"field": "type", "op": "eq", "value": "Own Damage"}, {"type": "Own Damage"})
    assert ec({"field": "type", "op": "in", "value": ["A", "B"]}, {"type": "B"})
    # new string ops
    assert ec({"field": "type", "op": "not_in", "value": ["A", "B"]}, {"type": "C"})
    assert ec({"field": "note", "op": "contains", "value": "urgent"}, {"note": "This is URGENT"})
    assert ec({"field": "note", "op": "not_contains", "value": "urgent"}, {"note": "routine"})
    assert ec({"field": "doc", "op": "is_empty"}, {"doc": ""})
    assert ec({"field": "doc", "op": "not_empty"}, {"doc": "file.pdf"})
    # boolean (checkbox) decisions
    assert ec({"field": "deny", "op": "eq", "value": True}, {"deny": True})
    # dates (ISO strings sort correctly)
    assert ec({"field": "d", "op": "after", "value": "2026-01-01"}, {"d": "2026-06-01"})
    assert ec({"field": "d", "op": "before", "value": "2026-01-01"}, {"d": "2025-12-31"})
    # compound AND / OR, nestable
    assert ec({"all": [{"field": "type", "op": "eq", "value": "3rd Party Injury"},
                       {"field": "amount", "op": "gte", "value": 100000}]},
              {"type": "3rd Party Injury", "amount": 150000})
    assert not ec({"all": [{"field": "type", "op": "eq", "value": "3rd Party Injury"},
                           {"field": "amount", "op": "gte", "value": 100000}]},
                  {"type": "3rd Party Injury", "amount": 50000})
    assert ec({"any": [{"field": "type", "op": "eq", "value": "Repudiation"},
                       {"field": "deny", "op": "eq", "value": True}]},
              {"type": "Own Damage", "deny": True})

    # ── timer / automated steps ──
    from types import SimpleNamespace as _NS
    assert is_automated_step({"type": "timer"})
    assert not is_automated_step({"type": "approval"})
    assert not is_automated_step({})  # defaults to approval
    assert timer_wait_hours({"wait_days": 14}) == 336
    assert timer_wait_hours({"wait_hours": 48}) == 48
    assert timer_wait_hours({}) is None
    # a timer step needs no assignee; a human step still does
    validate_definition(_NS(name="t", steps=[
        {"id": "s1", "name": "Wait", "type": "timer", "wait_days": 14},
        {"id": "s2", "name": "Review", "type": "approval", "assignee": {"type": "role", "value": "manager"}},
    ]))
    try:
        validate_definition(_NS(name="t", steps=[{"id": "s1", "name": "Wait", "type": "timer"}]))
        raise AssertionError("timer without wait_hours/wait_days should fail")
    except WorkflowValidationError:
        pass

    # ── service / automated steps ──
    assert is_automated_step({"type": "notify"})
    assert is_automated_step({"type": "webhook"})
    assert is_automated_step({"type": "ai"})
    assert is_automated_step({"type": "document"})
    validate_definition(_NS(name="t", steps=[
        {"id": "n", "name": "Tell originator", "type": "notify", "message": "Done: {reference}"},
        {"id": "w", "name": "Post to ERP", "type": "webhook", "url": "https://erp.example.com/hook"},
        {"id": "a", "name": "Triage", "type": "ai", "prompt": "Summarise the risk"},
        {"id": "d", "name": "Demand letter", "type": "document", "template_id": "demand"},
    ]))
    for bad in ({"id": "w", "name": "W", "type": "webhook"},
                {"id": "a", "name": "A", "type": "ai"},
                {"id": "d", "name": "D", "type": "document"}):
        try:
            validate_definition(_NS(name="t", steps=[bad]))
            raise AssertionError(f"{bad['type']} without config should fail")
        except WorkflowValidationError:
            pass
    print("workflow_engine routing + timer + service self-check OK")
