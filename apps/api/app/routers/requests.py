from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import Attachment, User, WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.db.session import get_db
from app.schemas.request import (
    AttachmentOut,
    RequestUpdate,
    WorkflowEventOut,
    WorkflowInstanceOut,
    WorkflowInstanceSummary,
)
from app.services import instance_engine
from app.services.approval_notify import notify_approvers_for_step
from app.services.csv_export import rows_to_csv
from app.services.event_labels import label_for_event
from app.services.instance_queries import get_instance, to_out, to_summary
from app.services.request_filters import list_my_requests as query_my_requests

router = APIRouter(prefix="/requests", tags=["Requests"])


def _summaries_for_instances(db: Session, rows: list[WorkflowInstance]) -> list[WorkflowInstanceSummary]:
    out: list[WorkflowInstanceSummary] = []
    for r in rows:
        defn = db.get(WorkflowDefinition, r.workflow_definition_id)
        out.append(to_summary(r, defn, db=db))
    db.commit()
    return out


@router.get("", response_model=list[WorkflowInstanceSummary])
def list_my_requests(
    status: str | None = Query(None, description="Comma-separated statuses"),
    q: str | None = Query(None, description="Search reference number or workflow name"),
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowInstanceSummary]:
    rows = query_my_requests(
        db,
        company_id=user.company_id,
        originator_user_id=user.id,
        status=status,
        q_text=q,
        workflow_id=workflow_id,
    )
    return _summaries_for_instances(db, rows)


@router.get("/export.csv", response_class=PlainTextResponse)
def export_my_requests_csv(
    status: str | None = Query(None),
    q: str | None = None,
    workflow_id: UUID | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> str:
    rows = query_my_requests(
        db,
        company_id=user.company_id,
        originator_user_id=user.id,
        status=status,
        q_text=q,
        workflow_id=workflow_id,
    )
    summaries = _summaries_for_instances(db, rows)
    rows = [
        [
            s.reference_number or "",
            s.workflow_name,
            s.status,
            s.current_step_name or s.current_step or "",
            s.submitted_at.isoformat() if s.submitted_at else "",
            s.amount_preview or "",
        ]
        for s in summaries
    ]
    return rows_to_csv(
        ["reference_number", "workflow_name", "status", "current_step", "submitted_at", "amount"],
        rows,
    )


@router.get("/{request_id}", response_model=WorkflowInstanceOut)
def get_request(
    request_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    inst = get_instance(db, request_id, user.company_id)
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    return to_out(db, inst, defn, user.id)


@router.patch("/{request_id}", response_model=WorkflowInstanceOut)
def update_returned_request(
    request_id: UUID,
    body: RequestUpdate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    inst = get_instance(db, request_id, user.company_id)
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    if not defn:
        raise HTTPException(status_code=404, detail="Workflow definition missing")
    try:
        instance_engine.resubmit_returned(db, inst, defn, user.id, body.data)
    except instance_engine.RequestError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if inst.current_step_id:
        notify_approvers_for_step(db, instance=inst, defn=defn, step_id=inst.current_step_id)
    db.commit()
    db.refresh(inst)
    return to_out(db, inst, defn, user.id)


@router.get("/{request_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(
    request_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[Attachment]:
    inst = get_instance(db, request_id, user.company_id)
    return list(
        db.scalars(
            select(Attachment)
            .where(Attachment.instance_id == inst.id)
            .order_by(Attachment.created_at.desc())
        )
    )


@router.get("/{request_id}/events", response_model=list[WorkflowEventOut])
def get_request_events(
    request_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowEventOut]:
    inst = get_instance(db, request_id, user.company_id)
    events = db.scalars(
        select(WorkflowEvent)
        .where(
            WorkflowEvent.company_id == user.company_id,
            WorkflowEvent.instance_id == inst.id,
        )
        .order_by(WorkflowEvent.created_at.asc())
    )
    out: list[WorkflowEventOut] = []
    for ev in events:
        actor_name = None
        if ev.actor_user_id:
            u = db.get(User, ev.actor_user_id)
            actor_name = u.full_name if u else None
        out.append(
            WorkflowEventOut(
                id=ev.id,
                event_type=ev.event_type,
                event_label=label_for_event(ev.event_type),
                actor_user_id=ev.actor_user_id,
                actor_name=actor_name,
                payload=ev.payload,
                created_at=ev.created_at,
            )
        )
    return out


@router.get("/{request_id}/audit-export", response_class=PlainTextResponse)
def audit_export(
    request_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    inst = get_instance(db, request_id, user.company_id)
    events = db.scalars(
        select(WorkflowEvent)
        .where(
            WorkflowEvent.company_id == user.company_id,
            WorkflowEvent.instance_id == inst.id,
        )
        .order_by(WorkflowEvent.created_at.asc())
    )
    rows: list[list[str]] = []
    for ev in events:
        actor_name = ""
        if ev.actor_user_id:
            u = db.get(User, ev.actor_user_id)
            actor_name = u.full_name if u else ""
        payload = ev.payload or {}
        step = payload.get("step_id") or ""
        comment = payload.get("comment") or ""
        rows.append(
            [
                ev.created_at.isoformat(),
                ev.event_type,
                actor_name,
                str(step),
                str(comment),
            ]
        )
    body = rows_to_csv(["timestamp", "event_type", "actor", "step", "comment"], rows)
    return PlainTextResponse(content=body, media_type="text/csv")
