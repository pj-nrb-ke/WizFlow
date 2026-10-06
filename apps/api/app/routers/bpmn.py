"""Process Designer — standalone BPMN 2.0 diagram CRUD + a one-way workflow bridge.

Isolated from the approval engine: it only reads/writes the ``bpmn_diagrams`` table
and (for the bridge) reads a WorkflowDefinition to render it as BPMN. It never
mutates workflows or drives execution.
"""

import uuid as _uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_company, require_permission
from app.db.models import BpmnDiagram, BpmnInstance, WorkflowDefinition
from app.db.session import get_db
from app.schemas.bpmn import (
    AssistantIn,
    AssistantOut,
    BpmnDiagramCreate,
    BpmnDiagramOut,
    BpmnDiagramSummary,
    BpmnDiagramUpdate,
    BpmnTemplateOut,
    CompiledWorkflowOut,
    FromRequirementsIn,
    FromTemplateIn,
    MyNativeTaskOut,
    NativeInstanceOut,
    NativeRunIn,
    NativeTaskCompleteIn,
    PublishAsAppOut,
)
from app.data.workflow_templates import get_template, list_template_summaries
from app.services import ai_workflow, native_instance, native_service, workflow_engine
from app.services.bpmn_assistant import assist, draft_to_diagram
from app.services.bpmn_compile import compile_bpmn_to_workflow, needs_native_execution
from app.services.bpmn_export import EMPTY_DIAGRAM_XML, workflow_to_bpmn
from app.services.events import record_event

router = APIRouter(prefix="/bpmn", tags=["Process Designer (BPMN)"])
ADMIN_ROLES = ("company_admin", "manager")


def _get_owned(db: Session, diagram_id: UUID, company_id: UUID) -> BpmnDiagram:
    row = db.get(BpmnDiagram, diagram_id)
    if not row or row.company_id != company_id:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.get("", response_model=list[BpmnDiagramSummary])
def list_diagrams(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[BpmnDiagram]:
    return list(
        db.scalars(
            select(BpmnDiagram)
            .where(BpmnDiagram.company_id == user.company_id)
            .order_by(BpmnDiagram.updated_at.desc())
        )
    )


@router.post("", response_model=BpmnDiagramOut, status_code=status.HTTP_201_CREATED)
def create_diagram(
    body: BpmnDiagramCreate,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BpmnDiagram:
    row = BpmnDiagram(
        company_id=user.company_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        bpmn_xml=body.bpmn_xml or EMPTY_DIAGRAM_XML,
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/templates", response_model=list[BpmnTemplateOut])
def list_starter_templates(
    user: CurrentUser = Depends(require_company),
) -> list[BpmnTemplateOut]:
    """Starter processes a manager can begin a diagram from (Template gallery)."""
    return [BpmnTemplateOut(**t) for t in list_template_summaries()]


def _create_from_draft(db: Session, user: CurrentUser, draft: dict, *, description: str | None = None) -> BpmnDiagram:
    d = draft_to_diagram(draft)
    row = BpmnDiagram(
        company_id=user.company_id,
        name=d["name"],
        description=description,
        bpmn_xml=d["bpmn_xml"],
        bindings=d["bindings"],
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/from-template", response_model=BpmnDiagramOut, status_code=status.HTTP_201_CREATED)
def create_from_template(
    body: FromTemplateIn,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BpmnDiagram:
    """Template gallery: start a new diagram from a prebuilt starter process."""
    tpl = get_template(body.template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return _create_from_draft(db, user, tpl, description=f"Started from the {tpl['name']} template.")


@router.post("/from-requirements", response_model=BpmnDiagramOut, status_code=status.HTTP_201_CREATED)
def create_from_requirements(
    body: FromRequirementsIn,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BpmnDiagram:
    """AI-from-requirements: describe the process → AI drafts a diagram to refine & publish."""
    try:
        result = ai_workflow.draft_from_description(body.description)
    except ai_workflow.AiWorkflowError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _create_from_draft(db, user, result.get("draft") or {}, description="Drafted from a requirement by AI.")


@router.post(
    "/from-workflow/{workflow_id}",
    response_model=BpmnDiagramOut,
    status_code=status.HTTP_201_CREATED,
)
def import_from_workflow(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BpmnDiagram:
    """Bridge: render an existing workflow's linear flow as a new (editable) BPMN diagram."""
    defn = db.get(WorkflowDefinition, workflow_id)
    if not defn or defn.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    row = BpmnDiagram(
        company_id=user.company_id,
        name=f"{defn.name} (BPMN)",
        description="Generated from a workflow — a read-only snapshot of the approval flow, now editable.",
        bpmn_xml=workflow_to_bpmn(defn.name, defn.steps or []),
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/{diagram_id}/compile", response_model=CompiledWorkflowOut)
def compile_diagram(
    diagram_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> CompiledWorkflowOut:
    """A2: preview compiling this diagram into a runnable workflow (validation only, no write)."""
    row = _get_owned(db, diagram_id, user.company_id)
    r = compile_bpmn_to_workflow(row.bpmn_xml, name=row.name, bindings=row.bindings)
    return CompiledWorkflowOut(
        ok=r.ok, name=r.name, form_schema=r.form_schema, steps=r.steps,
        routing_rules=r.routing_rules, errors=r.errors, warnings=r.warnings,
        native_shapes=needs_native_execution(row.bpmn_xml),
    )


@router.post("/{diagram_id}/publish-as-app", response_model=PublishAsAppOut, status_code=status.HTTP_201_CREATED)
def publish_as_app(
    diagram_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> PublishAsAppOut:
    """A3: turn the diagram into a draft workflow 'app'. The manager reviews & publishes it
    through the normal workflow preview (which runs the full publish gates)."""
    row = _get_owned(db, diagram_id, user.company_id)
    r = compile_bpmn_to_workflow(row.bpmn_xml, name=row.name, bindings=row.bindings)
    if not r.ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(r.errors))

    defn = WorkflowDefinition(
        company_id=user.company_id,
        family_id=_uuid.uuid4(),
        name=r.name,
        version=1,
        status="draft",
        form_schema=r.form_schema,
        steps=r.steps,
        routing_rules=r.routing_rules,
        settings={"source": "bpmn", "bpmn_diagram_id": str(row.id)},
    )
    # Engine-level validation beyond the compiler's shape checks.
    try:
        workflow_engine.validate_definition(defn)
    except workflow_engine.WorkflowValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    record_event(
        db,
        company_id=user.company_id,
        event_type="workflow.created_from_bpmn",
        actor_user_id=user.id,
        workflow_definition_id=defn.id,
        payload={"bpmn_diagram_id": str(row.id), "name": r.name, "steps": len(r.steps)},
    )
    db.commit()
    db.refresh(defn)
    return PublishAsAppOut(workflow_id=defn.id, name=defn.name, warnings=r.warnings)


@router.post("/{diagram_id}/assistant", response_model=AssistantOut)
def assistant(
    diagram_id: UUID,
    body: AssistantIn,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> AssistantOut:
    """A4: conversational step-builder. Describe a change; the diagram + form update."""
    row = _get_owned(db, diagram_id, user.company_id)
    try:
        r = assist(xml=row.bpmn_xml, bindings=row.bindings, message=body.message)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    row.bpmn_xml = r["bpmn_xml"]
    row.bindings = r["bindings"]
    db.commit()
    return AssistantOut(**r)


def _native_out(inst: BpmnInstance, ready: list[dict]) -> NativeInstanceOut:
    return NativeInstanceOut(id=inst.id, name=inst.name, status=inst.status, ready_tasks=ready)


@router.post("/{diagram_id}/run", response_model=NativeInstanceOut, status_code=status.HTTP_201_CREATED)
def run_native(
    diagram_id: UUID,
    body: NativeRunIn,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> NativeInstanceOut:
    """Phase B: start a native-BPMN run of a diagram (for diagrams the linear engine can't model)."""
    row = _get_owned(db, diagram_id, user.company_id)
    # Create the instance first so service tasks can run with its context.
    inst = BpmnInstance(
        company_id=user.company_id,
        diagram_id=row.id,
        name=row.name,
        status="running",
        originator_user_id=user.id,
    )
    db.add(inst)
    db.flush()
    runner = native_service.build_runner(db, inst, _services_from_bindings(row.bindings))
    try:
        snap = native_instance.start(row.bpmn_xml, row.bindings, body.data, service_runner=runner)
    except Exception as e:  # parse/exec errors surface as 400
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not start native run: {e}")
    inst.spiff_state = snap["state"]
    inst.status = snap["status"]
    db.commit()
    db.refresh(inst)
    return _native_out(inst, snap["ready_tasks"])


def _get_native(db: Session, instance_id: UUID, company_id: UUID) -> BpmnInstance:
    inst = db.get(BpmnInstance, instance_id)
    if not inst or inst.company_id != company_id:
        raise HTTPException(status_code=404, detail="Native instance not found")
    return inst


def _services_from_bindings(bindings: dict | None) -> dict:
    """bpmn element id → service config, from a diagram's bindings."""
    tasks = (bindings or {}).get("tasks") or {}
    return {k: (v or {}).get("service") for k, v in tasks.items() if (v or {}).get("service")}


def _instance_task_assignees(db: Session, inst: BpmnInstance) -> dict:
    """bpmn element id → assignee binding, from the instance's diagram (or empty)."""
    diagram = db.get(BpmnDiagram, inst.diagram_id) if inst.diagram_id else None
    return {k: (v or {}).get("assignee") for k, v in ((diagram.bindings or {}).get("tasks") or {}).items()} if diagram else {}


def _instance_services(db: Session, inst: BpmnInstance) -> dict:
    diagram = db.get(BpmnDiagram, inst.diagram_id) if inst.diagram_id else None
    return _services_from_bindings(diagram.bindings if diagram else None)


@router.get("/native/my-tasks", response_model=list[MyNativeTaskOut])
def my_native_tasks(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[MyNativeTaskOut]:
    """Native-app human tasks awaiting the current user — the inbox bridge (Phase B · B3).

    ponytail: deserializes each running instance per call; fine at demo scale, index
    ready tasks in a column if this list grows hot.
    """
    out: list[MyNativeTaskOut] = []
    running = db.scalars(
        select(BpmnInstance).where(
            BpmnInstance.company_id == user.company_id, BpmnInstance.status == "running"
        )
    )
    for inst in running:
        if not inst.spiff_state:
            continue
        assignees = _instance_task_assignees(db, inst)
        for t in native_instance.ready_tasks(inst.spiff_state):
            if native_instance.user_eligible(assignees.get(t["bpmn_id"]), user.roles, user.id):
                out.append(MyNativeTaskOut(
                    instance_id=inst.id, instance_name=inst.name,
                    task_id=t["id"], task_name=t["name"],
                ))
    return out


@router.get("/native/{instance_id}", response_model=NativeInstanceOut)
def get_native(
    instance_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> NativeInstanceOut:
    inst = _get_native(db, instance_id, user.company_id)
    ready = native_instance.ready_tasks(inst.spiff_state) if inst.spiff_state else []
    return _native_out(inst, ready)


@router.post("/native/{instance_id}/tasks/{task_id}/complete", response_model=NativeInstanceOut)
def complete_native_task(
    instance_id: UUID,
    task_id: str,
    body: NativeTaskCompleteIn,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> NativeInstanceOut:
    inst = _get_native(db, instance_id, user.company_id)
    if inst.status != "running":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Instance is not running")
    assignees = _instance_task_assignees(db, inst)
    authorize = lambda bpmn_id: native_instance.user_eligible(assignees.get(bpmn_id), user.roles, user.id)  # noqa: E731
    runner = native_service.build_runner(db, inst, _instance_services(db, inst))
    try:
        snap = native_instance.complete_task(inst.spiff_state, task_id, body.data, authorize=authorize, service_runner=runner)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    inst.spiff_state = snap["state"]
    inst.status = snap["status"]
    db.commit()
    db.refresh(inst)
    return _native_out(inst, snap["ready_tasks"])


@router.get("/{diagram_id}", response_model=BpmnDiagramOut)
def get_diagram(
    diagram_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> BpmnDiagram:
    return _get_owned(db, diagram_id, user.company_id)


@router.patch("/{diagram_id}", response_model=BpmnDiagramOut)
def update_diagram(
    diagram_id: UUID,
    body: BpmnDiagramUpdate,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> BpmnDiagram:
    row = _get_owned(db, diagram_id, user.company_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is not None:
        row.name = data["name"].strip()
    if "description" in data:
        row.description = (data["description"] or "").strip() or None
    if data.get("bpmn_xml") is not None:
        row.bpmn_xml = data["bpmn_xml"]
    if "bindings" in data:
        row.bindings = data["bindings"]
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{diagram_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_diagram(
    diagram_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> None:
    row = _get_owned(db, diagram_id, user.company_id)
    db.delete(row)
    db.commit()
