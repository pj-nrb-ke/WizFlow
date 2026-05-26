from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import WorkflowEvent, WorkflowInstance


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
    merged = dict(payload or {})
    merged.setdefault("recorded_at", datetime.now(timezone.utc).isoformat())
    if instance_id:
        inst = db.get(WorkflowInstance, instance_id)
        if inst and inst.reference_number:
            merged.setdefault("reference_number", inst.reference_number)
    event = WorkflowEvent(
        company_id=company_id,
        instance_id=instance_id,
        workflow_definition_id=workflow_definition_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        payload=merged,
    )
    db.add(event)
    try:
        from app.services.webhooks import dispatch_for_event

        dispatch_for_event(
            db,
            company_id=company_id,
            event_type=event_type,
            payload={
                "instance_id": str(instance_id) if instance_id else None,
                "workflow_definition_id": str(workflow_definition_id) if workflow_definition_id else None,
                "event_type": event_type,
                **merged,
            },
        )
    except Exception:
        pass
    return event
