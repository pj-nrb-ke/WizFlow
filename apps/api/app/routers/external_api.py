"""Public API for external systems (API key auth). ERP integrations excluded."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import ApiKeyContext, require_api_scope
from app.db.models import WorkflowDefinition, WorkflowInstance
from app.db.session import get_db
from app.schemas.integrations import ExternalRequestSubmit
from app.schemas.request import WorkflowInstanceOut, WorkflowInstanceSummary
from app.services import instance_engine
from app.services.initiators import user_can_initiate
from app.services.instance_queries import get_instance, to_out, to_summary

router = APIRouter(prefix="/external", tags=["Public API"])


@router.get("/requests", response_model=list[WorkflowInstanceSummary])
def external_list_requests(
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, le=200),
    ctx: ApiKeyContext = Depends(require_api_scope("requests:read")),
    db: Session = Depends(get_db),
) -> list[WorkflowInstanceSummary]:
    q = select(WorkflowInstance).where(WorkflowInstance.company_id == ctx.company_id)
    if status_filter:
        q = q.where(WorkflowInstance.status.in_(status_filter.split(",")))
    rows = db.scalars(q.order_by(WorkflowInstance.submitted_at.desc()).limit(limit)).all()
    out: list[WorkflowInstanceSummary] = []
    for r in rows:
        defn = db.get(WorkflowDefinition, r.workflow_definition_id)
        out.append(to_summary(r, defn, db=db))
    db.commit()
    return out


@router.get("/requests/{request_id}", response_model=WorkflowInstanceOut)
def external_get_request(
    request_id: UUID,
    ctx: ApiKeyContext = Depends(require_api_scope("requests:read")),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    inst = get_instance(db, request_id, ctx.company_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Request not found")
    defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
    return to_out(inst, defn, db=db, viewer_id=ctx.service_user_id)


@router.post("/requests", response_model=WorkflowInstanceOut, status_code=status.HTTP_201_CREATED)
def external_submit_request(
    body: ExternalRequestSubmit,
    ctx: ApiKeyContext = Depends(require_api_scope("requests:write")),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    defn = db.get(WorkflowDefinition, body.workflow_id)
    if not defn or defn.company_id != ctx.company_id or defn.status != "published":
        raise HTTPException(status_code=404, detail="Published workflow not found")
    if not user_can_initiate(db, ctx.service_user_id, defn):
        raise HTTPException(status_code=403, detail="Service user cannot initiate this workflow")

    try:
        inst = instance_engine.submit_request(
            db,
            defn=defn,
            company_id=ctx.company_id,
            user_id=ctx.service_user_id,
            data=body.data,
        )
    except instance_engine.RequestError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.commit()
    db.refresh(inst)
    return to_out(inst, defn, db=db, viewer_id=ctx.service_user_id)
