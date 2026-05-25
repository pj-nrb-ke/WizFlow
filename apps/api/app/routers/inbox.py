from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import Attachment, Notification, User, WorkflowDefinition, WorkflowInstance
from app.db.session import get_db
from app.schemas.request import ApprovalAction, AttachmentOut, InboxItem, WorkflowInstanceOut
from app.services import instance_engine
from app.services.approval_notify import notify_approvers_for_step
from app.services.assignees import needs_claim, user_can_see_inbox
from app.services.events import record_event
from app.services.files import save_upload
from app.services.instance_engine import _step_name
from app.services.instance_queries import get_instance, to_out
from app.services.notifications import notify_users

router = APIRouter(tags=["Inbox"])


@router.get("/inbox", response_model=list[InboxItem])
def get_inbox(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[InboxItem]:
    rows = db.scalars(
        select(WorkflowInstance)
        .where(
            WorkflowInstance.company_id == user.company_id,
            WorkflowInstance.status == "in_progress",
        )
        .order_by(WorkflowInstance.submitted_at.desc())
    )
    items: list[InboxItem] = []
    for inst in rows:
        if not user_can_see_inbox(inst, user.id):
            continue
        defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
        step_name = _step_name(defn, inst.current_step_id) if defn else inst.current_step_id or ""
        originator_name = ""
        if inst.originator_user_id:
            o = db.get(User, inst.originator_user_id)
            originator_name = o.full_name if o else ""
        amount = inst.request_data.get("amount")
        ref = inst.reference_number
        if not ref and defn:
            from app.services.request_serial import backfill_reference_for_instance

            ref = backfill_reference_for_instance(db, inst, defn)
        items.append(
            InboxItem(
                request_id=inst.id,
                reference_number=ref,
                workflow_name=inst.workflow_name,
                step_name=step_name or "",
                step_id=inst.current_step_id or "",
                submitted_at=inst.submitted_at,
                originator_name=originator_name,
                amount_preview=str(amount) if amount is not None else None,
                needs_claim=needs_claim(inst, user.id),
            )
        )
    db.commit()
    return items


@router.post("/requests/{request_id}/claim", response_model=WorkflowInstanceOut)
def claim_request(
    request_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    inst = get_instance(db, request_id, user.company_id)
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    if not defn:
        raise HTTPException(status_code=404, detail="Workflow definition missing")
    try:
        instance_engine.try_claim_task(db, inst, user.id)
    except instance_engine.RequestError as e:
        raise HTTPException(status_code=400, detail=str(e))
    record_event(
        db,
        company_id=inst.company_id,
        event_type="step.claimed",
        actor_user_id=user.id,
        instance_id=inst.id,
        payload={"step_id": inst.current_step_id},
    )
    db.commit()
    db.refresh(inst)
    return to_out(db, inst, defn, user.id)


def _act(
    db: Session,
    request_id: UUID,
    user: CurrentUser,
    action: str,
    comment: str | None,
) -> WorkflowInstanceOut:
    inst = get_instance(db, request_id, user.company_id)
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    if not defn:
        raise HTTPException(status_code=404, detail="Workflow definition missing")
    try:
        if action == "approve":
            instance_engine.approve_request(db, inst, defn, user.id, comment)
        elif action == "reject":
            instance_engine.reject_request(db, inst, user.id, comment)
        elif action == "return":
            instance_engine.return_request(db, inst, user.id, comment)
        else:
            raise HTTPException(status_code=400, detail="Unknown action")
    except instance_engine.RequestError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if action == "approve" and inst.status == "in_progress" and inst.current_step_id:
        notify_approvers_for_step(
            db,
            instance=inst,
            defn=defn,
            step_id=inst.current_step_id,
        )
    elif action in ("reject", "return") and inst.originator_user_id:
        notify_users(
            db,
            company_id=inst.company_id,
            user_ids=[inst.originator_user_id],
            title=f"Request {action}ed: {inst.workflow_name}",
            body=comment or f"Your request was {action}ed.",
            instance_id=inst.id,
        )
    elif action == "approve" and inst.status == "approved" and inst.originator_user_id:
        notify_users(
            db,
            company_id=inst.company_id,
            user_ids=[inst.originator_user_id],
            title=f"Request approved: {inst.workflow_name}",
            body="Your request has been fully approved.",
            instance_id=inst.id,
        )

    db.commit()
    db.refresh(inst)
    return to_out(db, inst, defn, user.id)


@router.post("/requests/{request_id}/approve", response_model=WorkflowInstanceOut)
def approve(
    request_id: UUID,
    body: ApprovalAction | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    return _act(db, request_id, user, "approve", body.comment if body else None)


@router.post("/requests/{request_id}/reject", response_model=WorkflowInstanceOut)
def reject(
    request_id: UUID,
    body: ApprovalAction | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    return _act(db, request_id, user, "reject", body.comment if body else None)


@router.post("/requests/{request_id}/return", response_model=WorkflowInstanceOut)
def return_request_route(
    request_id: UUID,
    body: ApprovalAction | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    return _act(db, request_id, user, "return", body.comment if body else None)


@router.post("/requests/{request_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    request_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> Attachment:
    inst = get_instance(db, request_id, user.company_id)
    if inst.status == "rejected":
        raise HTTPException(status_code=400, detail="Cannot attach to rejected request")

    path, filename, size = save_upload(inst.company_id, inst.id, file)
    att = Attachment(
        company_id=inst.company_id,
        instance_id=inst.id,
        uploaded_by=user.id,
        filename=filename,
        storage_path=path,
        content_type=file.content_type,
        size_bytes=size,
    )
    db.add(att)
    record_event(
        db,
        company_id=inst.company_id,
        event_type="file.uploaded",
        actor_user_id=user.id,
        instance_id=inst.id,
        payload={"filename": filename, "size_bytes": size},
    )
    db.commit()
    db.refresh(att)
    return att
