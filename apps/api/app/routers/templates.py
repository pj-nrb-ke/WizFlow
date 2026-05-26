import uuid as _uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.data.workflow_templates import get_template, list_template_summaries
from app.db.models import WorkflowDefinition
from app.db.session import get_db
from app.schemas.phase1 import WorkflowTemplateCloneOut, WorkflowTemplateSummary
from app.services.custom_workflow import workflow_name_taken

router = APIRouter(prefix="/templates", tags=["Templates"])

MANAGER_ROLES = ("company_admin", "manager")


@router.get("", response_model=list[WorkflowTemplateSummary])
def list_templates(
    user: CurrentUser = Depends(require_company),
) -> list[WorkflowTemplateSummary]:
    _ = user
    return [WorkflowTemplateSummary(**t) for t in list_template_summaries()]


@router.post("/{template_id}/clone", response_model=WorkflowTemplateCloneOut, status_code=status.HTTP_201_CREATED)
def clone_template(
    template_id: str,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowTemplateCloneOut:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")

    tpl = get_template(template_id)
    if not tpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    name = tpl["name"]
    if workflow_name_taken(db, user.company_id, name):
        name = f"{name} (from template)"

    defn = WorkflowDefinition(
        company_id=user.company_id,
        family_id=_uuid.uuid4(),
        name=name,
        form_schema=tpl.get("form_schema") or {},
        steps=tpl.get("steps") or [],
        routing_rules=tpl.get("routing_rules") or [],
        settings=tpl.get("settings") or {},
        status="draft",
        version=1,
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    db.commit()
    db.refresh(defn)
    return WorkflowTemplateCloneOut(workflow_id=defn.id, name=defn.name, status=defn.status)
