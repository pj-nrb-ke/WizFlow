from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, require_company, require_roles
from app.db.models import User, UserGroup, UserGroupMember, WorkflowDefinition, WorkflowEvent
from app.db.session import get_db
from app.schemas.request import RequestSubmit, WorkflowInstanceOut
from app.schemas.phase1 import HealthCheckOut, HealthIssue
from app.schemas.web_phases import WorkflowTuneIn
from app.schemas.workflow import (
    PublishPreview,
    PublishRequest,
    SimulationRequest,
    SimulationResult,
    WorkflowDefinitionCreate,
    WorkflowDefinitionOut,
    WorkflowDefinitionListOut,
    WorkflowDefinitionSummary,
    WorkflowDefinitionUpdate,
    WorkflowEventOut,
    WorkflowPreview,
    WorkflowVersionOut,
)
from app.schemas.user_group import (
    CustomWorkflowCreate,
    NameCheckOut,
    OrgDirectoryOut,
    OrgUserOut,
    UserGroupOut,
    UserGroupMemberOut,
)
from app.services import instance_engine, workflow_engine
from app.services.recurring_schedules import close_obligations_for_instance
from app.services.custom_workflow import (
    CustomWorkflowError,
    build_custom_settings,
    build_steps_from_chain,
    workflow_name_taken,
)
from app.services.events import record_event
from app.services.initiators import effective_form_schema, user_can_initiate
from app.services.instance_queries import to_out
from app.services.approval_notify import notify_approvers_for_step
from app.services import versioning
from app.services.workflow_health import check_workflow_health, health_summary
from app.services.xlsx_export import rows_to_xlsx

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


@router.get("/check-name", response_model=NameCheckOut)
def check_workflow_name(
    name: str = Query(..., min_length=1),
    exclude_id: UUID | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> NameCheckOut:
    taken = workflow_name_taken(db, user.company_id, name, exclude_id=exclude_id)
    return NameCheckOut(name=name.strip(), available=not taken)


@router.get("/org-directory", response_model=OrgDirectoryOut)
def org_directory(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> OrgDirectoryOut:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")
    users = db.scalars(
        select(User)
        .where(User.company_id == user.company_id, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    groups = db.scalars(
        select(UserGroup)
        .where(UserGroup.company_id == user.company_id)
        .options(joinedload(UserGroup.members).joinedload(UserGroupMember.user))
        .order_by(UserGroup.name)
    ).unique()
    user_out = [OrgUserOut(id=u.id, email=u.email, full_name=u.full_name) for u in users]
    group_out = []
    for g in groups:
        members = [
            UserGroupMemberOut(user_id=m.user.id, full_name=m.user.full_name, email=m.user.email)
            for m in g.members
            if m.user
        ]
        group_out.append(
            UserGroupOut(id=g.id, name=g.name, member_count=len(members), members=members, created_at=g.created_at)
        )
    return OrgDirectoryOut(users=user_out, groups=group_out)


@router.get("/company-users", response_model=list[OrgUserOut])
def company_users(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[OrgUserOut]:
    """Active company users for employee selectors and form dropdowns."""
    users = db.scalars(
        select(User)
        .where(User.company_id == user.company_id, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    return [OrgUserOut(id=u.id, email=u.email, full_name=u.full_name) for u in users]


@router.get("/form-options", response_model=list[WorkflowDefinitionListOut])
def list_form_options(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowDefinition]:
    """Published workflows that have a form (for attaching to a custom approval workflow)."""
    rows = list(
        db.scalars(
            select(WorkflowDefinition)
            .where(
                WorkflowDefinition.company_id == user.company_id,
                WorkflowDefinition.status == "published",
            )
            .order_by(WorkflowDefinition.name)
        )
    )
    return [w for w in rows if (w.form_schema or {}).get("fields")]


@router.post("/custom", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
def create_custom_workflow(
    body: CustomWorkflowCreate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")

    name = body.name.strip()
    if workflow_name_taken(db, user.company_id, name):
        raise HTTPException(status_code=409, detail="A workflow with this name already exists")

    form_wf = _get_definition(db, body.attached_form_workflow_id, user.company_id)
    if form_wf.status != "published":
        raise HTTPException(status_code=400, detail="Attached form must be a published workflow")
    if not (form_wf.form_schema or {}).get("fields"):
        raise HTTPException(status_code=400, detail="Attached workflow has no form fields")

    import uuid as _uuid

    chain = [{"type": item.type, "id": str(item.id)} for item in body.approver_chain]
    try:
        steps = build_steps_from_chain(db, user.company_id, chain)
    except CustomWorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))

    initiator = {
        "everyone": body.initiator.everyone,
        "user_ids": [str(u) for u in body.initiator.user_ids],
        "group_ids": [str(g) for g in body.initiator.group_ids],
    }
    settings = build_custom_settings(
        attached_form_workflow_id=str(body.attached_form_workflow_id),
        initiator=initiator,
        approver_chain=chain,
    )

    defn = WorkflowDefinition(
        company_id=user.company_id,
        family_id=_uuid.uuid4(),
        name=name,
        form_schema=effective_form_schema(form_wf, form_wf),
        steps=steps,
        routing_rules=[],
        settings=settings,
        status="draft",
        version=1,
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    db.commit()
    db.refresh(defn)
    return defn


@router.get("/export.xlsx")
def export_workflows_xlsx(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> Response:
    rows_db = list(
        db.scalars(
            select(WorkflowDefinition)
            .where(WorkflowDefinition.company_id == user.company_id)
            .order_by(WorkflowDefinition.name)
        )
    )
    data = rows_to_xlsx(
        ["name", "status", "version", "updated_at"],
        [
            [
                w.name,
                w.status,
                str(w.version),
                w.updated_at.isoformat() if w.updated_at else "",
            ]
            for w in rows_db
        ],
    )
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=workflows.xlsx"},
    )


@router.get("", response_model=list[WorkflowDefinitionListOut])
def list_workflows(
    status_filter: str | None = Query(None, alias="status"),
    initiator_only: bool = Query(False, alias="initiator_only"),
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[WorkflowDefinition]:
    q = select(WorkflowDefinition).where(WorkflowDefinition.company_id == user.company_id)
    if status_filter:
        q = q.where(WorkflowDefinition.status == status_filter)
    rows = list(db.scalars(q.order_by(WorkflowDefinition.updated_at.desc())))
    if initiator_only:
        rows = [w for w in rows if user_can_initiate(db, user.id, w)]
    return rows


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


@router.post("/{workflow_id}/tune")
def tune_workflow(
    workflow_id: UUID,
    body: WorkflowTuneIn,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> dict:
    from app.services.versioning import snapshot_definition
    from app.services.workflow_commands import apply_plain_english_command

    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")
    defn = _get_definition(db, workflow_id, user.company_id)
    if defn.status != "draft":
        raise HTTPException(status_code=400, detail="Tune is only available on draft workflows")
    snap = snapshot_definition(defn)
    try:
        updated, explanation = apply_plain_english_command(snap, body.instruction)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    defn.name = updated.get("name", defn.name)
    defn.form_schema = updated.get("form_schema", defn.form_schema)
    defn.steps = updated.get("steps", defn.steps)
    defn.routing_rules = updated.get("routing_rules", defn.routing_rules)
    defn.settings = updated.get("settings", defn.settings)
    db.commit()
    return {"explanation": explanation, "workflow_id": str(defn.id)}


@router.get("/{workflow_id}/health-check", response_model=HealthCheckOut)
def workflow_health_check(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> HealthCheckOut:
    defn = _get_definition(db, workflow_id, user.company_id)
    issues = check_workflow_health(db, defn)
    summary = health_summary(issues)
    return HealthCheckOut(
        issues=[HealthIssue(**i) for i in issues],
        ok=summary["ok"],
    )


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
    if defn.status != "draft" and any(
        x is not None for x in (body.name, body.form_schema, body.steps, body.routing_rules)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft workflows can edit structure; create a new version or update settings (theme) only",
        )

    if body.name is not None:
        defn.name = body.name.strip()
    if body.form_schema is not None:
        defn.form_schema = body.form_schema
    if body.steps is not None:
        defn.steps = body.steps
    if body.routing_rules is not None:
        defn.routing_rules = body.routing_rules
    if body.settings is not None:
        merged = dict(defn.settings or {})
        merged.update(body.settings)
        defn.settings = merged

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


@router.post("/{workflow_id}/clone", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
def clone_workflow(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")
    import copy
    import uuid as _uuid

    src = _get_definition(db, workflow_id, user.company_id)
    base = (src.name or "Workflow").strip()
    name = f"{base} (copy)"
    i = 2
    while workflow_name_taken(db, user.company_id, name):
        name = f"{base} (copy {i})"
        i += 1
    new_settings = copy.deepcopy(src.settings or {})
    new_settings.pop("published_at", None)
    new_settings.pop("last_simulated_at", None)
    defn = WorkflowDefinition(
        company_id=user.company_id,
        family_id=_uuid.uuid4(),
        name=name[:200],
        form_schema=copy.deepcopy(src.form_schema),
        steps=copy.deepcopy(src.steps),
        routing_rules=copy.deepcopy(src.routing_rules),
        settings=new_settings,
        status="draft",
        version=1,
        ai_generated=src.ai_generated,
        ai_prompt=src.ai_prompt,
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    db.commit()
    db.refresh(defn)
    return defn


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

    if inst.current_step_id:
        notify_approvers_for_step(
            db,
            instance=inst,
            defn=defn,
            step_id=inst.current_step_id,
            title=f"Approval needed: {inst.workflow_name}",
            body="New request submitted — please review.",
        )
    # Close any matching recurring-activity obligation for this submitter.
    close_obligations_for_instance(db, inst)
    db.commit()
    db.refresh(inst)
    return to_out(db, inst, defn, user.id)


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


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_roles("company_admin", "manager")),
    db: Session = Depends(get_db),
) -> None:
    from sqlalchemy import text as sql
    _get_definition(db, workflow_id, user.company_id)
    wid = str(workflow_id)
    # Delete child records of workflow_instances first
    db.execute(sql("DELETE FROM approval_tokens WHERE instance_id IN (SELECT id FROM workflow_instances WHERE workflow_definition_id = :w)"), {"w": wid})
    db.execute(sql("DELETE FROM attachments WHERE instance_id IN (SELECT id FROM workflow_instances WHERE workflow_definition_id = :w)"), {"w": wid})
    db.execute(sql("DELETE FROM notifications WHERE instance_id IN (SELECT id FROM workflow_instances WHERE workflow_definition_id = :w)"), {"w": wid})
    db.execute(sql("DELETE FROM sla_alert_log WHERE instance_id IN (SELECT id FROM workflow_instances WHERE workflow_definition_id = :w)"), {"w": wid})
    db.execute(sql("DELETE FROM workflow_events WHERE instance_id IN (SELECT id FROM workflow_instances WHERE workflow_definition_id = :w)"), {"w": wid})
    # Delete direct children of workflow_definitions
    db.execute(sql("DELETE FROM workflow_events WHERE workflow_definition_id = :w"), {"w": wid})
    db.execute(sql("DELETE FROM workflow_instances WHERE workflow_definition_id = :w"), {"w": wid})
    db.execute(sql("DELETE FROM request_drafts WHERE workflow_definition_id = :w"), {"w": wid})
    db.execute(sql("DELETE FROM workflow_schedules WHERE workflow_definition_id = :w"), {"w": wid})
    db.execute(sql("DELETE FROM workflow_version_history WHERE workflow_definition_id = :w"), {"w": wid})
    db.execute(sql("DELETE FROM workflow_definitions WHERE id = :w"), {"w": wid})
    db.commit()
