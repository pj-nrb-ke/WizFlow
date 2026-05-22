from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import WorkflowDefinition, WorkflowEvent
from app.db.session import get_db
from app.schemas.request import RequestSubmit, WorkflowInstanceOut
from app.schemas.workflow import (
    PublishPreview,
    PublishRequest,
    SimulationRequest,
    SimulationResult,
    WorkflowDefinitionCreate,
    WorkflowDefinitionOut,
    WorkflowDefinitionSummary,
    WorkflowDefinitionUpdate,
    WorkflowEventOut,
    WorkflowPreview,
    WorkflowVersionOut,
)
from app.services import instance_engine, workflow_engine
from app.services.events import record_event
from app.services.instance_queries import to_out
from app.services.notifications import notify_users
from app.services import versioning

router = APIRouter(prefix="/workflows", tags=["Workflows"])

MANAGER_ROLES = ("company_admin", "manager")


def _get_definition(db: Session, workflow_id: UUID, company_id: UUID) -> WorkflowDefinition:
    defn = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.company_id == company_id,
        )
    )
    if not defn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return defn


@router.get("", response_model=list[WorkflowDefinitionSummary])
def list_workflows(
    status_filter: str | None = Query(None, alias="status"),
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowDefinition]:
    q = select(WorkflowDefinition).where(WorkflowDefinition.company_id == user.company_id)
    if status_filter:
        q = q.where(WorkflowDefinition.status == status_filter)
    return list(db.scalars(q.order_by(WorkflowDefinition.updated_at.desc())))


@router.post("", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
def create_workflow(
    body: WorkflowDefinitionCreate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")

    import uuid as _uuid

    defn = WorkflowDefinition(
        company_id=user.company_id,
        family_id=_uuid.uuid4(),
        name=body.name.strip(),
        form_schema=body.form_schema,
        steps=body.steps,
        routing_rules=body.routing_rules,
        settings=body.settings,
        status="draft",
        version=1,
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    db.commit()
    db.refresh(defn)
    return defn


@router.get("/{workflow_id}", response_model=WorkflowDefinitionOut)
def get_workflow(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    return _get_definition(db, workflow_id, user.company_id)


@router.patch("/{workflow_id}", response_model=WorkflowDefinitionOut)
def update_workflow(
    workflow_id: UUID,
    body: WorkflowDefinitionUpdate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")

    defn = _get_definition(db, workflow_id, user.company_id)
    if defn.status != "draft":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft workflows can be edited")

    if body.name is not None:
        defn.name = body.name.strip()
    if body.form_schema is not None:
        defn.form_schema = body.form_schema
    if body.steps is not None:
        defn.steps = body.steps
    if body.routing_rules is not None:
        defn.routing_rules = body.routing_rules
    if body.settings is not None:
        defn.settings = body.settings

    db.commit()
    db.refresh(defn)
    return defn


@router.get("/{workflow_id}/preview", response_model=WorkflowPreview)
def preview_workflow(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowPreview:
    defn = _get_definition(db, workflow_id, user.company_id)
    data = versioning.build_preview(defn)
    return WorkflowPreview(**data)


@router.get("/{workflow_id}/publish-preview", response_model=PublishPreview)
def publish_preview(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> PublishPreview:
    defn = _get_definition(db, workflow_id, user.company_id)
    before = versioning.get_last_published_snapshot(db, defn.family_id, user.company_id)
    after = versioning.snapshot_definition(defn)
    return PublishPreview(
        change_summary=versioning.compute_change_summary(before, after),
        current=after,
        previous=before,
    )


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionOut])
def list_versions(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list:
    defn = _get_definition(db, workflow_id, user.company_id)
    return versioning.list_versions(db, defn.family_id, user.company_id)


@router.post("/{workflow_id}/new-version", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
def new_version(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    defn = _get_definition(db, workflow_id, user.company_id)
    try:
        draft = versioning.create_new_draft_version(db, defn, user.company_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(draft)
    return draft


@router.post("/{workflow_id}/rollback/{version}", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
def rollback_version(
    workflow_id: UUID,
    version: int,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    defn = _get_definition(db, workflow_id, user.company_id)
    try:
        draft = versioning.rollback_to_version(
            db, family_id=defn.family_id, company_id=user.company_id, version=version
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(draft)
    return draft


@router.post("/{workflow_id}/publish", response_model=WorkflowDefinitionOut)
def publish_workflow(
    workflow_id: UUID,
    body: PublishRequest | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")

    defn = _get_definition(db, workflow_id, user.company_id)
    req = body or PublishRequest()
    try:
        versioning.ensure_publish_allowed(
            defn,
            confirm_preview=req.confirm_preview,
            test_completed=req.test_completed,
        )
    except (ValueError, workflow_engine.WorkflowValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    versioning.archive_and_publish(
        db,
        defn,
        company_id=user.company_id,
        user_id=user.id,
        change_summary=req.change_summary_note,
    )
    record_event(
        db,
        company_id=user.company_id,
        event_type="workflow.published",
        actor_user_id=user.id,
        workflow_definition_id=defn.id,
        payload={"name": defn.name, "version": defn.version},
    )
    db.commit()
    db.refresh(defn)
    return defn


@router.post("/{workflow_id}/simulate", response_model=SimulationResult)
def simulate_workflow(
    workflow_id: UUID,
    body: SimulationRequest,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> SimulationResult:
    defn = _get_definition(db, workflow_id, user.company_id)
    try:
        workflow_engine.validate_definition(defn)
        result = workflow_engine.simulate(defn, body.data)
    except workflow_engine.WorkflowValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    versioning.mark_simulated(defn)
    record_event(
        db,
        company_id=user.company_id,
        event_type="step.started",
        actor_user_id=user.id,
        workflow_definition_id=defn.id,
        payload={"simulation": True, "sample_data": body.data, "steps_traversed": result.steps_traversed},
    )
    db.commit()
    return result


@router.post("/{workflow_id}/submit", response_model=WorkflowInstanceOut, status_code=status.HTTP_201_CREATED)
def submit_request(
    workflow_id: UUID,
    body: RequestSubmit,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowInstanceOut:
    defn = _get_definition(db, workflow_id, user.company_id)
    try:
        inst = instance_engine.submit_request(
            db,
            defn=defn,
            user_id=user.id,
            company_id=user.company_id,
            data=body.data,
        )
    except instance_engine.RequestError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    assignee_ids = [UUID(a["user_id"]) for a in inst.assignees if a.get("user_id")]
    notify_users(
        db,
        company_id=user.company_id,
        user_ids=assignee_ids,
        title=f"Approval needed: {inst.workflow_name}",
        body=f"New request submitted — please review.",
        instance_id=inst.id,
    )
    db.commit()
    db.refresh(inst)
    return to_out(db, inst, defn)


@router.get("/{workflow_id}/events", response_model=list[WorkflowEventOut])
def list_workflow_events(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowEvent]:
    _get_definition(db, workflow_id, user.company_id)
    return list(
        db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.company_id == user.company_id,
                WorkflowEvent.workflow_definition_id == workflow_id,
            )
            .order_by(WorkflowEvent.created_at.desc())
        )
    )
