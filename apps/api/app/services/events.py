from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import WorkflowEvent


def record_event(
    db: Session,
    *,
    company_id: UUID,
    event_type: str,
    actor_user_id: UUID | None = None,
    payload: dict | None = None,
    instance_id: UUID | None = None,
    workflow_definition_id: UUID | None = None,
) -> WorkflowEvent:
    if not instance_id and not workflow_definition_id:
        raise ValueError("Either instance_id or workflow_definition_id required")
    event = WorkflowEvent(
        company_id=company_id,
        instance_id=instance_id,
        workflow_definition_id=workflow_definition_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        payload=payload or {},
    )
    db.add(event)
    return event
