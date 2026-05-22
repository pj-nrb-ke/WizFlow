"""Headless workflow engine — publish validation and simulation (P2)."""

from __future__ import annotations

from app.db.models import WorkflowDefinition
from app.schemas.workflow import SimulationResult


class WorkflowValidationError(ValueError):
    pass


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
        assignee = step.get("assignee") or {}
        if not assignee.get("type") or not assignee.get("value"):
            raise WorkflowValidationError(f"Step '{step.get('id')}' needs assignee type and value")


def _eval_condition(when: dict, data: dict) -> bool:
    field = when.get("field")
    op = when.get("op")
    expected = when.get("value")
    if field is None:
        return False
    actual = data.get(field)
    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "gt":
        return actual is not None and expected is not None and actual > expected
    if op == "gte":
        return actual is not None and expected is not None and actual >= expected
    if op == "lt":
        return actual is not None and expected is not None and actual < expected
    if op == "lte":
        return actual is not None and expected is not None and actual <= expected
    if op == "in":
        return actual in (expected if isinstance(expected, list) else [expected])
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
