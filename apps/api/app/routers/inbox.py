from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import Attachment, Notification, User, WorkflowDefinition, WorkflowInstance
from app.db.session import get_db
from app.schemas.request import ApprovalAction, AttachmentOut, InboxItem, WorkflowInstanceOut
from app.services import instance_engine
from app.services.approval_notify import notify_approvers_for_step, notify_originator_decision
from app.services.assignees import needs_claim, user_can_see_inbox
from app.services.xlsx_export import rows_to_xlsx
from app.services.events import record_event
from app.services.files import save_upload
from app.services.instance_engine import _step_name
from app.services.csv_export import rows_to_csv
from app.services.instance_queries import get_instance, to_out
from app.services.notifications import notify_users
from app.services import analytics as analytics_service
from app.services.request_serial import backfill_reference_for_instance

router = APIRouter(tags=["Inbox"])


def _build_inbox_items(
    db: Session,
    user: CurrentUser,
    *,
    workflow_id: UUID | None = None,
    q_text: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    department: str | None = None,
    overdue_only: bool = False,
    priority: str | None = None,
) -> list[InboxItem]:
    q = select(WorkflowInstance).where(
        WorkflowInstance.company_id == user.company_id,
        WorkflowInstance.status == "in_progress",
    )
    if workflow_id:
        q = q.where(WorkflowInstance.workflow_definition_id == workflow_id)
    # Text search is applied in-loop so we can match current approver names too.
    if date_from:
        q = q.where(WorkflowInstance.submitted_at >= date_from)
    if date_to:
        q = q.where(WorkflowInstance.submitted_at <= date_to)

    rows = db.scalars(q.order_by(WorkflowInstance.submitted_at.desc()))
    items: list[InboxItem] = []
    now = datetime.now(timezone.utc)
    for inst in rows:
        if not user_can_see_inbox(inst, user.id):
            continue
        if department:
            dept = str((inst.request_data or {}).get("department") or "")
            if department.lower() not in dept.lower():
                continue
        amount_val = (inst.request_data or {}).get("amount")
        try:
            amt = float(amount_val) if amount_val is not None else None
        except (TypeError, ValueError):
            amt = None
        if min_amount is not None and (amt is None or amt < min_amount):
            continue
        if max_amount is not None and (amt is None or amt > max_amount):
            continue
        defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
        sla = int((defn.settings or {}).get("sla_hours", 48)) if defn else 48
        if overdue_only and not analytics_service._instance_overdue(db, inst, analytics_service._load_sla_map(db, user.company_id), now):
            continue
        inst_priority = str(
            (inst.request_data or {}).get("priority")
            or (defn.settings or {}).get("default_priority")
            or "normal"
        ).lower()
        if priority and inst_priority != priority.strip().lower():
            continue
        if q_text:
            term_l = q_text.strip().lower()
            originator_name_early = ""
            if inst.originator_user_id:
                o = db.get(User, inst.originator_user_id)
                originator_name_early = (o.full_name if o else "").lower()
            ref = (inst.reference_number or "").lower()
            wf = inst.workflow_name.lower()
            approver_match = any(
                term_l in (a.get("full_name") or "").lower() for a in (inst.assignees or [])
            )
            if (
                term_l not in ref
                and term_l not in wf
                and term_l not in originator_name_early
                and not approver_match
            ):
                continue
        step_name = _step_name(defn, inst.current_step_id) if defn else inst.current_step_id or ""
        originator_name = ""
        if inst.originator_user_id:
            o = db.get(User, inst.originator_user_id)
            originator_name = o.full_name if o else ""
        amount = inst.request_data.get("amount")
        ref = inst.reference_number
        if not ref and defn:
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


@router.get("/inbox", response_model=list[InboxItem])
def get_inbox(
    workflow_id: UUID | None = None,
    q: str | None = Query(None, description="Search reference, workflow name, or originator"),
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    min_amount: float | None = None,
    max_amount: float | None = None,
    department: str | None = None,
    overdue_only: bool = False,
    priority: str | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[InboxItem]:
    return _build_inbox_items(
        db,
        user,
        workflow_id=workflow_id,
        q_text=q,
        date_from=from_date,
        date_to=to_date,
        min_amount=min_amount,
        max_amount=max_amount,
        department=department,
        overdue_only=overdue_only,
        priority=priority,
    )


def _inbox_export_rows(items: list[InboxItem]) -> tuple[list[str], list[list[str]]]:
    headers = [
        "reference_number",
        "workflow_name",
        "step_name",
        "originator_name",
        "submitted_at",
        "amount",
    ]
    rows = [
        [
            i.reference_number or "",
            i.workflow_name,
            i.step_name,
            i.originator_name,
            i.submitted_at.isoformat() if i.submitted_at else "",
            i.amount_preview or "",
        ]
        for i in items
    ]
    return headers, rows


@router.get("/inbox/export.csv", response_class=PlainTextResponse)
def export_inbox_csv(
    workflow_id: UUID | None = None,
    q: str | None = None,
    priority: str | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> str:
    items = _build_inbox_items(
        db, user, workflow_id=workflow_id, q_text=q, priority=priority
    )
    headers, rows = _inbox_export_rows(items)
    return rows_to_csv(headers, rows)


@router.get("/inbox/export.xlsx")
def export_inbox_xlsx(
    workflow_id: UUID | None = None,
    q: str | None = None,
    priority: str | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> Response:
    items = _build_inbox_items(
        db, user, workflow_id=workflow_id, q_text=q, priority=priority
    )
    headers, rows = _inbox_export_rows(items)
    data = rows_to_xlsx(headers, rows)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inbox.xlsx"},
    )


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

    if action in ("approve", "reject"):
        notify_originator_decision(
            db,
            instance=inst,
            defn=defn,
            action=action,
            actor_user_id=user.id,
            comment=comment,
        )

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
