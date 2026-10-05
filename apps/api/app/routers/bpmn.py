"""Process Designer — standalone BPMN 2.0 diagram CRUD + a one-way workflow bridge.

Isolated from the approval engine: it only reads/writes the ``bpmn_diagrams`` table
and (for the bridge) reads a WorkflowDefinition to render it as BPMN. It never
mutates workflows or drives execution.
"""

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
)
from app.services.bpmn_export import EMPTY_DIAGRAM_XML, workflow_to_bpmn

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
