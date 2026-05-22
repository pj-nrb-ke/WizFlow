import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import WorkflowDefinition
from app.db.session import get_db
from app.schemas.ai import AiDraftRequest, AiDraftResponse, AiRefineRequest, AiSaveRequest
from app.schemas.workflow import WorkflowDefinitionOut
from app.services import ai_workflow

router = APIRouter(prefix="/ai/workflow", tags=["AI"])

MANAGER_ROLES = ("company_admin", "manager")


@router.post("/draft", response_model=AiDraftResponse)
def ai_draft(
    body: AiDraftRequest,
    user: CurrentUser = Depends(require_company),
) -> AiDraftResponse:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    try:
        result = ai_workflow.draft_from_description(body.description)
    except ai_workflow.AiWorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return AiDraftResponse(**result)


@router.post("/refine", response_model=AiDraftResponse)
def ai_refine(
    body: AiRefineRequest,
    user: CurrentUser = Depends(require_company),
) -> AiDraftResponse:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    try:
        result = ai_workflow.refine_draft(body.current_draft, body.instruction)
    except ai_workflow.AiWorkflowError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return AiDraftResponse(**result)


@router.get("/explain/{workflow_id}")
def ai_explain(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> dict:
    defn = db.get(WorkflowDefinition, workflow_id)
    if not defn or defn.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    from app.services.versioning import snapshot_definition

    snap = snapshot_definition(defn)
    text = ai_workflow.explain_definition({**snap, "ai_prompt": defn.ai_prompt})
    return {"explanation": text}


@router.post("/save", response_model=WorkflowDefinitionOut, status_code=status.HTTP_201_CREATED)
def ai_save(
    body: AiSaveRequest,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> WorkflowDefinition:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")

    draft = body.draft
    defn = WorkflowDefinition(
        company_id=user.company_id,
        family_id=uuid.uuid4(),
        name=str(draft.get("name", "AI Workflow"))[:200],
        form_schema=draft.get("form_schema", {}),
        steps=draft.get("steps", []),
        routing_rules=draft.get("routing_rules", []),
        settings=draft.get("settings", {}),
        status="draft",
        version=1,
        ai_generated=True,
        ai_prompt=body.description,
    )
    db.add(defn)
    db.flush()
    defn.family_id = defn.id
    db.commit()
    db.refresh(defn)
    return defn
