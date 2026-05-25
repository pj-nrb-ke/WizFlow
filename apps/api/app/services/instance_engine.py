"""Workflow instance lifecycle: submit, advance, approve/reject/return (P3–P4)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import WorkflowDefinition, WorkflowInstance
from app.services import workflow_engine
from app.services.assignees import (
    apply_step_assignment,
    claim_task,
    resolve_step_assignment,
    user_can_act,
)
from app.services.events import record_event
from app.services.request_serial import allocate_reference_number
from app.services.ui_settings import attach_ui_snapshot, strip_ui_keys


class RequestError(ValueError):
    pass


def _step_map(defn: WorkflowDefinition) -> dict[str, dict]:
    return {s["id"]: s for s in (defn.steps or []) if isinstance(s, dict) and s.get("id")}


def _step_name(defn: WorkflowDefinition, step_id: str | None) -> str | None:
    if not step_id:
        return None
    step = _step_map(defn).get(step_id)
    return str(step["name"]) if step else step_id


def compute_step_sequence(defn: WorkflowDefinition, request_data: dict) -> list[str]:
    result = workflow_engine.simulate(defn, request_data)
    return result.steps_traversed


def validate_form_data(defn: WorkflowDefinition, data: dict) -> None:
    clean = strip_ui_keys(data)
    fields = (defn.form_schema or {}).get("fields") or []
    for field in fields:
        if not isinstance(field, dict):
            continue
        key = field.get("key")
        if field.get("required") and key and (clean.get(key) is None or clean.get(key) == ""):
            raise RequestError(f"Field '{field.get('label', key)}' is required")


def resolve_assignees_for_step(
    db: Session, company_id: UUID, step: dict, family_id: UUID | None = None
) -> list[dict]:
    assignment = resolve_step_assignment(
        db, company_id=company_id, step=step, family_id=family_id
    )
    return assignment.assignees


def _apply_step_to_instance(
    db: Session,
    instance: WorkflowInstance,
    defn: WorkflowDefinition,
    step: dict,
) -> None:
    assignment = resolve_step_assignment(
        db,
        company_id=instance.company_id,
        step=step,
        family_id=defn.family_id,
    )
    if not assignment.assignees:
        raise RequestError(f"No users found for approvers on step '{step.get('id')}'")
    apply_step_assignment(instance, assignment)


def submit_request(
    db: Session,
    *,
    defn: WorkflowDefinition,
    user_id: UUID,
    company_id: UUID,
    data: dict,
) -> WorkflowInstance:
    if defn.status != "published":
        raise RequestError("Workflow must be published before submitting requests")

    validate_form_data(defn, data)
    stored_data = attach_ui_snapshot(data, defn.settings)
    step_sequence = compute_step_sequence(defn, strip_ui_keys(data))
    if not step_sequence:
        raise RequestError("No approval steps resolved for this request")

    first_step_id = step_sequence[0]
    step = _step_map(defn).get(first_step_id)
    if not step:
        raise RequestError(f"Step '{first_step_id}' not found")

    now = datetime.now(timezone.utc)
    instance = WorkflowInstance(
        company_id=company_id,
        workflow_definition_id=defn.id,
        originator_user_id=user_id,
        status="in_progress",
        current_step_id=first_step_id,
        request_data=stored_data,
        assignees=[],
        step_sequence=step_sequence,
        workflow_name=defn.name,
        submitted_at=now,
    )
    db.add(instance)
    db.flush()
    instance.reference_number = allocate_reference_number(
        db, company_id=company_id, defn=defn, when=now
    )
    _apply_step_to_instance(db, instance, defn, step)

    record_event(
        db,
        company_id=company_id,
        event_type="request.submitted",
        actor_user_id=user_id,
        instance_id=instance.id,
        payload={"workflow_name": defn.name, "data": strip_ui_keys(data)},
    )
    record_event(
        db,
        company_id=company_id,
        event_type="step.started",
        actor_user_id=user_id,
        instance_id=instance.id,
        payload={"step_id": first_step_id, "step_name": step.get("name")},
    )
    return instance


def try_claim_task(db: Session, instance: WorkflowInstance, user_id: UUID) -> None:
    try:
        claim_task(db, instance, user_id)
    except ValueError as e:
        raise RequestError(str(e)) from e


def _advance_or_complete(
    db: Session,
    instance: WorkflowInstance,
    defn: WorkflowDefinition,
    actor_id: UUID,
    event_type: str,
    comment: str | None,
) -> WorkflowInstance:
    step_sequence = instance.step_sequence or []
    current = instance.current_step_id
    try:
        idx = step_sequence.index(current) if current else -1
    except ValueError:
        idx = -1

    record_event(
        db,
        company_id=instance.company_id,
        event_type=event_type,
        actor_user_id=actor_id,
        instance_id=instance.id,
        payload={"step_id": current, "comment": comment or ""},
    )

    next_idx = idx + 1
    if next_idx >= len(step_sequence):
        instance.status = "approved" if event_type == "step.approved" else instance.status
        instance.current_step_id = None
        instance.assignees = []
        instance.assignment_mode = None
        instance.claimed_by_user_id = None
        record_event(
            db,
            company_id=instance.company_id,
            event_type="workflow.completed",
            actor_user_id=actor_id,
            instance_id=instance.id,
            payload={"final_status": instance.status},
        )
        return instance

    next_step_id = step_sequence[next_idx]
    step = _step_map(defn).get(next_step_id)
    if not step:
        raise RequestError(f"Next step '{next_step_id}' not found")

    instance.current_step_id = next_step_id
    _apply_step_to_instance(db, instance, defn, step)
    instance.status = "in_progress"
    record_event(
        db,
        company_id=instance.company_id,
        event_type="step.started",
        actor_user_id=actor_id,
        instance_id=instance.id,
        payload={"step_id": next_step_id, "step_name": step.get("name")},
    )
    return instance


def approve_request(
    db: Session,
    instance: WorkflowInstance,
    defn: WorkflowDefinition,
    actor_id: UUID,
    comment: str | None,
) -> WorkflowInstance:
    if not user_can_act(instance, actor_id):
        raise RequestError("You are not assigned to approve this step")
    return _advance_or_complete(db, instance, defn, actor_id, "step.approved", comment)


def reject_request(
    db: Session,
    instance: WorkflowInstance,
    actor_id: UUID,
    comment: str | None,
) -> WorkflowInstance:
    if not user_can_act(instance, actor_id):
        raise RequestError("You are not assigned to reject this step")
    record_event(
        db,
        company_id=instance.company_id,
        event_type="step.rejected",
        actor_user_id=actor_id,
        instance_id=instance.id,
        payload={"step_id": instance.current_step_id, "comment": comment or ""},
    )
    instance.status = "rejected"
    instance.current_step_id = None
    instance.assignees = []
    instance.assignment_mode = None
    instance.claimed_by_user_id = None
    record_event(
        db,
        company_id=instance.company_id,
        event_type="workflow.completed",
        actor_user_id=actor_id,
        instance_id=instance.id,
        payload={"final_status": "rejected"},
    )
    return instance


def return_request(
    db: Session,
    instance: WorkflowInstance,
    actor_id: UUID,
    comment: str | None,
) -> WorkflowInstance:
    if not user_can_act(instance, actor_id):
        raise RequestError("You are not assigned to return this step")
    record_event(
        db,
        company_id=instance.company_id,
        event_type="step.returned",
        actor_user_id=actor_id,
        instance_id=instance.id,
        payload={"step_id": instance.current_step_id, "comment": comment or ""},
    )
    instance.status = "returned"
    instance.current_step_id = None
    instance.assignees = []
    instance.assignment_mode = None
    instance.claimed_by_user_id = None
    return instance


def resubmit_returned(
    db: Session,
    instance: WorkflowInstance,
    defn: WorkflowDefinition,
    user_id: UUID,
    data: dict,
) -> WorkflowInstance:
    if instance.status != "returned":
        raise RequestError("Only returned requests can be updated and resubmitted")
    if instance.originator_user_id != user_id:
        raise RequestError("Only the originator can resubmit this request")

    validate_form_data(defn, data)
    step_sequence = compute_step_sequence(defn, strip_ui_keys(data))
    first_step_id = step_sequence[0]
    step = _step_map(defn).get(first_step_id)
    if not step:
        raise RequestError("Invalid step sequence")

    instance.request_data = attach_ui_snapshot(data, defn.settings)
    instance.step_sequence = step_sequence
    instance.status = "in_progress"
    instance.current_step_id = first_step_id
    _apply_step_to_instance(db, instance, defn, step)
    instance.submitted_at = datetime.now(timezone.utc)

    record_event(
        db,
        company_id=instance.company_id,
        event_type="request.submitted",
        actor_user_id=user_id,
        instance_id=instance.id,
        payload={"resubmit": True, "data": data},
    )
    record_event(
        db,
        company_id=instance.company_id,
        event_type="step.started",
        actor_user_id=user_id,
        instance_id=instance.id,
        payload={"step_id": first_step_id},
    )
    return instance
