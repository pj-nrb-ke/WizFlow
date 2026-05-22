from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, WorkflowDefinition, WorkflowInstance
from app.schemas.request import WorkflowInstanceOut, WorkflowInstanceSummary
from app.services.instance_engine import _step_name


def get_instance(db: Session, request_id: UUID, company_id: UUID) -> WorkflowInstance:
    inst = db.scalar(
        select(WorkflowInstance).where(
            WorkflowInstance.id == request_id,
            WorkflowInstance.company_id == company_id,
        )
    )
    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return inst


def to_summary(inst: WorkflowInstance, defn: WorkflowDefinition | None = None) -> WorkflowInstanceSummary:
    step_name = _step_name(defn, inst.current_step_id) if defn else inst.current_step_id
    return WorkflowInstanceSummary(
        id=inst.id,
        workflow_name=inst.workflow_name or (defn.name if defn else ""),
        status=inst.status,
        current_step=inst.current_step_id,
        current_step_name=step_name,
        submitted_at=inst.submitted_at,
    )


def to_out(db: Session, inst: WorkflowInstance, defn: WorkflowDefinition) -> WorkflowInstanceOut:
    originator_name = None
    if inst.originator_user_id:
        u = db.get(User, inst.originator_user_id)
        originator_name = u.full_name if u else None
    summary = to_summary(inst, defn)
    return WorkflowInstanceOut(
        **summary.model_dump(),
        workflow_definition_id=inst.workflow_definition_id,
        originator_user_id=inst.originator_user_id,
        originator_name=originator_name,
        request_data=inst.request_data,
        assignees=inst.assignees or [],
        step_sequence=inst.step_sequence or [],
        created_at=inst.created_at,
        updated_at=inst.updated_at,
    )
