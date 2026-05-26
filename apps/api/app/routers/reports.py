"""MIS-style action history (timestamped audit trail)."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_roles
from app.db.models import User, WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.db.session import get_db
from app.schemas.request import MisActionRow
from app.services.event_labels import label_for_event
from app.services.request_serial import backfill_reference_for_instance

router = APIRouter(prefix="/reports", tags=["Reports"])

ADMIN_ROLES = ("company_admin", "manager")


def _fetch_mis_actions(
    db: Session,
    user: CurrentUser,
    from_date: datetime | None,
    to_date: datetime | None,
    workflow_id: UUID | None,
    status: str | None,
) -> list[MisActionRow]:
    q = (
        select(WorkflowEvent, WorkflowInstance)
        .join(WorkflowInstance, WorkflowInstance.id == WorkflowEvent.instance_id)
        .where(
            WorkflowEvent.company_id == user.company_id,
            WorkflowEvent.instance_id.isnot(None),
        )
        .order_by(WorkflowEvent.created_at.asc())
    )
    if from_date:
        q = q.where(WorkflowEvent.created_at >= from_date)
    if to_date:
        q = q.where(WorkflowEvent.created_at <= to_date)
    if workflow_id:
        q = q.where(WorkflowInstance.workflow_definition_id == workflow_id)
    if status:
        q = q.where(WorkflowInstance.status == status)

    rows: list[MisActionRow] = []
    for ev, inst in db.execute(q):
        ref = inst.reference_number
        if not ref:
            defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
            if defn:
                ref = backfill_reference_for_instance(db, inst, defn)
        actor_name = None
        if ev.actor_user_id:
            u = db.get(User, ev.actor_user_id)
            actor_name = u.full_name if u else None
        payload = ev.payload or {}
        rows.append(
            MisActionRow(
                reference_number=ref,
                workflow_name=inst.workflow_name,
                request_status=inst.status,
                event_type=ev.event_type,
                event_label=label_for_event(ev.event_type),
                action_at=ev.created_at,
                actor_name=actor_name,
                step_id=payload.get("step_id"),
                comment=payload.get("comment") or None,
            )
        )
    db.commit()
    return rows


@router.get("/mis/actions", response_model=list[MisActionRow])
def mis_actions(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = Query(None),
    status: str | None = Query(None),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[MisActionRow]:
    return _fetch_mis_actions(db, user, from_date, to_date, workflow_id, status)


@router.get("/mis/actions.csv", response_class=PlainTextResponse)
def mis_actions_csv(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    workflow_id: UUID | None = Query(None),
    status: str | None = Query(None),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> str:
    rows = _fetch_mis_actions(db, user, from_date, to_date, workflow_id, status)
    lines = [
        "reference_number,workflow_name,request_status,event_label,action_at,actor_name,step_id,comment"
    ]
    for r in rows:
        comment = (r.comment or "").replace('"', '""')
        lines.append(
            f'"{r.reference_number or ""}","{r.workflow_name}","{r.request_status}",'
            f'"{r.event_label}","{r.action_at.isoformat()}","{r.actor_name or ""}",'
            f'"{r.step_id or ""}","{comment}"'
        )
    return "\n".join(lines) + "\n"
