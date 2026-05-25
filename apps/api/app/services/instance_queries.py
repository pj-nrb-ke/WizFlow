from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, WorkflowDefinition, WorkflowInstance
from app.schemas.request import WorkflowInstanceOut, WorkflowInstanceSummary
from app.services.assignees import needs_claim, user_can_act, user_can_see_inbox
from app.services.instance_engine import _step_name
from app.services.request_serial import backfill_reference_for_instance
from app.services.ui_settings import ui_from_instance


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


def to_summary(
    inst: WorkflowInstance,
    defn: WorkflowDefinition | None = None,
    *,
    db: Session | None = None,
) -> WorkflowInstanceSummary:
    step_name = _step_name(defn, inst.current_step_id) if defn else inst.current_step_id
    ref = inst.reference_number
    if not ref and db and defn:
        ref = backfill_reference_for_instance(db, inst, defn)
    return WorkflowInstanceSummary(
        id=inst.id,
        reference_number=ref,
        workflow_name=inst.workflow_name or (defn.name if defn else ""),
        status=inst.status,
        current_step=inst.current_step_id,
        current_step_name=step_name,
        submitted_at=inst.submitted_at,
    )


def to_out(
    db: Session,
    inst: WorkflowInstance,
    defn: WorkflowDefinition,
    viewer_id: UUID | None = None,
) -> WorkflowInstanceOut:
    originator_name = None
    if inst.originator_user_id:
        u = db.get(User, inst.originator_user_id)
        originator_name = u.full_name if u else None
    if not inst.reference_number:
        backfill_reference_for_instance(db, inst, defn)
    summary = to_summary(inst, defn, db=db)
    ui = ui_from_instance(defn.settings, inst.request_data)
    can_act = user_can_act(inst, viewer_id) if viewer_id else False
    claim_needed = needs_claim(inst, viewer_id) if viewer_id else False
    return WorkflowInstanceOut(
        **summary.model_dump(),
        workflow_definition_id=inst.workflow_definition_id,
        originator_user_id=inst.originator_user_id,
        originator_name=originator_name,
        request_data=inst.request_data,
        assignees=inst.assignees or [],
        assignment_mode=inst.assignment_mode,
        needs_claim=claim_needed,
        can_act=can_act,
        step_sequence=inst.step_sequence or [],
        ui_theme=ui["ui_theme"],
        form_layout=ui["form_layout"],
        created_at=inst.created_at,
        updated_at=inst.updated_at,
    )
