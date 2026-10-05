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
from app.db.models import BpmnDiagram, WorkflowDefinition
from app.db.session import get_db
from app.schemas.bpmn import (
    BpmnDiagramCreate,
    BpmnDiagramOut,
    BpmnDiagramSummary,
    BpmnDiagramUpdate,
    CompiledWorkflowOut,
    PublishAsAppOut,
)
from app.services import workflow_engine
from app.services.bpmn_compile import compile_bpmn_to_workflow
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
