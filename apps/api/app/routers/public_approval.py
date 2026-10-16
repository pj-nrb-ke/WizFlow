"""Public approval via email magic link (no login)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import WorkflowDefinition, WorkflowInstance
from app.db.session import get_db
from app.schemas.request import PublicApprovalDecide, PublicApprovalView
from app.services import approval_tokens, instance_engine
from app.services.approval_notify import notify_approvers_for_step, notify_originator_decision
from app.services.assignees import user_can_act
from app.services.approval_tokens import get_valid_token, mark_token_used
from app.services.instance_queries import get_instance

router = APIRouter(prefix="/public/approval", tags=["Public approval"])


@router.get("/{token}", response_model=PublicApprovalView)
def view_approval(
    token: str,
    db: Session = Depends(get_db),
) -> PublicApprovalView:
    row = get_valid_token(db, token)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired link")

    inst = db.get(WorkflowInstance, row.instance_id)
    if not inst or inst.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request is no longer pending")
    if inst.current_step_id != row.step_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This approval step has already moved on")

    if not user_can_act(inst, row.user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not assigned to this step")

    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    summary = approval_tokens.public_request_summary(db, inst, defn, row.step_id)
    return PublicApprovalView(
        reference_number=summary.get("reference_number"),
        workflow_name=summary["workflow_name"],
        step_name=summary["step_name"] or row.step_id,
        originator_name=summary["originator_name"],
        submitted_at=inst.submitted_at,
        request_preview=summary["request_preview"],
        can_approve=True,
        can_reject=True,
    )


@router.post("/{token}/decide", response_model=dict)
def decide_approval(
    token: str,
    body: PublicApprovalDecide,
    db: Session = Depends(get_db),
) -> dict:
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")

    row = get_valid_token(db, token)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired link")

    inst = get_instance(db, row.instance_id, row.company_id)
    if inst.status != "in_progress" or inst.current_step_id != row.step_id:
        raise HTTPException(status_code=400, detail="Request is no longer at this step")

    if not user_can_act(inst, row.user_id):
        raise HTTPException(status_code=403, detail="You are not assigned to this step")

    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    if not defn:
        raise HTTPException(status_code=404, detail="Workflow definition missing")

    try:
        if body.action == "approve":
            instance_engine.approve_request(db, inst, defn, row.user_id, body.comment)
        else:
            instance_engine.reject_request(db, inst, row.user_id, body.comment)
    except instance_engine.RequestError as e:
        raise HTTPException(status_code=400, detail=str(e))

    mark_token_used(db, row)

    if body.action in ("approve", "reject"):
        notify_originator_decision(
            db,
            instance=inst,
            defn=defn,
            action=body.action,
            actor_user_id=row.user_id,
            comment=body.comment,
        )

    if body.action == "approve" and inst.status == "in_progress" and inst.current_step_id:
        notify_approvers_for_step(
            db,
            instance=inst,
            defn=defn,
            step_id=inst.current_step_id,
        )

    db.commit()
    return {"status": inst.status, "message": f"Request {body.action}d successfully."}
