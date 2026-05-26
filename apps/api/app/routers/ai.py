import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import WorkflowDefinition
from app.db.session import get_db
from app.schemas.ai import AiDraftRequest, AiDraftResponse, AiRefineRequest, AiSaveRequest
from app.schemas.web_phases import WizardFinalizeIn, WizardQuestionsOut
from app.services import wizard_qa
from app.schemas.workflow import WorkflowDefinitionOut
from app.services import ai_workflow

router = APIRouter(prefix="/ai/workflow", tags=["AI"])

MANAGER_ROLES = ("company_admin", "manager")


@router.post("/wizard/questions", response_model=WizardQuestionsOut)
def ai_wizard_questions(
    body: AiDraftRequest,
    user: CurrentUser = Depends(require_company),
) -> WizardQuestionsOut:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    return WizardQuestionsOut(**wizard_qa.wizard_questions(body.description))


@router.post("/wizard/finalize", response_model=AiDraftResponse)
def ai_wizard_finalize(
    body: WizardFinalizeIn,
    user: CurrentUser = Depends(require_company),
) -> AiDraftResponse:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    result = wizard_qa.wizard_finalize(body.description, body.answers)
    return AiDraftResponse(**result)


@router.post("/policy/analyze")
def ai_policy_analyze(
    body: AiDraftRequest,
    user: CurrentUser = Depends(require_company),
) -> dict:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    draft = ai_workflow.draft_from_description(
        f"Policy-based workflow. Requirements from document:\n{body.description}"
    )
    return {
        "suggested_workflow": draft["draft"],
        "explanation": draft["explanation"],
        "gaps": draft.get("gaps", []),
    }


@router.get("/optimize/{workflow_id}")
def ai_optimize_workflow(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> dict:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    defn = db.get(WorkflowDefinition, workflow_id)
    if not defn or defn.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    from app.services.versioning import snapshot_definition

    snap = snapshot_definition(defn)
    suggestions = []
    steps = snap.get("steps") or []
    if len(steps) > 4:
        suggestions.append("Consider combining approval steps — more than 4 steps may slow processing.")
    if not snap.get("routing_rules"):
        suggestions.append("Add amount-based routing to skip steps for small requests.")
    settings = snap.get("settings") or {}
    if not settings.get("sla_hours"):
        suggestions.append("Set sla_hours in workflow settings for SLA tracking.")
    return {"workflow_id": str(workflow_id), "suggestions": suggestions or ["Workflow structure looks reasonable."]}


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
