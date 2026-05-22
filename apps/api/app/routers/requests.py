from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import User, WorkflowDefinition, WorkflowEvent, WorkflowInstance
from app.db.session import get_db
from app.schemas.request import (
    RequestUpdate,
    WorkflowEventOut,
    WorkflowInstanceOut,
    WorkflowInstanceSummary,
)
from app.services import instance_engine
from app.services.instance_queries import get_instance, to_out, to_summary

router = APIRouter(prefix="/requests", tags=["Requests"])


@router.get("", response_model=list[WorkflowInstanceSummary])
def list_my_requests(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowInstanceSummary]:
    rows = db.scalars(
        select(WorkflowInstance)
        .where(
            WorkflowInstance.company_id == user.company_id,
            WorkflowInstance.originator_user_id == user.id,
        )
        .order_by(WorkflowInstance.created_at.desc())
    )
    return [to_summary(r) for r in rows]


@router.get("/{request_id}", response_model=WorkflowInstanceOut)
def get_request(
    request_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    inst = get_instance(db, request_id, user.company_id)
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    return to_out(db, inst, defn)


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
    db.commit()
    db.refresh(inst)
    return to_out(db, inst, defn)


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
                actor_user_id=ev.actor_user_id,
                actor_name=actor_name,
                payload=ev.payload,
                created_at=ev.created_at,
            )
        )
    return out
