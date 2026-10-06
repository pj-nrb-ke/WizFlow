"""AI-generated apps from requirements packs (D4).

Gated on WORKFLOWS_MANAGE. Generate returns a reviewable plan (nothing is created);
create builds the entities + a DRAFT workflow the user then publishes normally.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_permission
from app.db.session import get_db
from app.schemas.app_builder import AppPlan, CreateOut, GenerateIn
from app.services import app_builder

router = APIRouter(prefix="/ai-apps", tags=["AI apps"])


@router.post("/generate", response_model=AppPlan)
def generate(
    body: GenerateIn,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
) -> AppPlan:
    try:
        plan = app_builder.generate_plan(body.requirements, company_id=user.company_id, title=body.title)
    except app_builder.AppBuilderError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return AppPlan(**plan)


@router.post("/create", response_model=CreateOut, status_code=status.HTTP_201_CREATED)
def create(
    plan: AppPlan,
    user: CurrentUser = Depends(require_permission(perms.WORKFLOWS_MANAGE)),
    db: Session = Depends(get_db),
) -> CreateOut:
    result = app_builder.create_app(db, plan.model_dump(), company_id=user.company_id, created_by=user.id)
    return CreateOut(**result)
