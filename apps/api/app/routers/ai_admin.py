"""AI control plane admin API (D1).

Admin-only (INTEGRATIONS_MANAGE): read the workspace AI policy + this month's usage,
and update the policy (kill switch, monthly budget, per-feature toggles). Deliberately
off the manager's screen — managers get working AI, admins get the dials.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core import permissions as perms
from app.core.deps import CurrentUser, require_permission
from app.db.models import AiGovernance
from app.db.session import get_db
from app.schemas.ai_governance import GovernanceOut, GovernanceUpdate, OverviewOut
from app.services import ai_client, ai_gateway

router = APIRouter(prefix="/ai-admin", tags=["AI controls"])


def _governance_out(gov: AiGovernance | None) -> GovernanceOut:
    if gov is None:
        return GovernanceOut()
    return GovernanceOut(
        ai_enabled=gov.ai_enabled,
        monthly_budget_usd=(None if gov.monthly_budget_usd is None else float(gov.monthly_budget_usd)),
        disabled_tasks=list(gov.disabled_tasks or []),
    )


@router.get("/overview", response_model=OverviewOut)
def overview(
    user: CurrentUser = Depends(require_permission(perms.INTEGRATIONS_MANAGE)),
    db: Session = Depends(get_db),
) -> OverviewOut:
    gov = db.scalar(select(AiGovernance).where(AiGovernance.company_id == user.company_id))
    return OverviewOut(
        ai_configured=ai_client.is_configured(),
        provider=ai_client.provider(),
        global_enabled=settings.ai_enabled,
        default_model=settings.ai_model,
        strong_model=(settings.ai_strong_model or settings.ai_model),
        governance=_governance_out(gov),
        usage=ai_gateway.usage_summary(db, user.company_id),
        tasks=ai_gateway.TASK_CATALOG,
    )


@router.patch("/governance", response_model=GovernanceOut)
def update_governance(
    body: GovernanceUpdate,
    user: CurrentUser = Depends(require_permission(perms.INTEGRATIONS_MANAGE)),
    db: Session = Depends(get_db),
) -> GovernanceOut:
    gov = db.scalar(select(AiGovernance).where(AiGovernance.company_id == user.company_id))
    if gov is None:
        gov = AiGovernance(company_id=user.company_id)
        db.add(gov)
    gov.ai_enabled = body.ai_enabled
    gov.monthly_budget_usd = body.monthly_budget_usd
    # keep only real task keys so a stale client can't persist junk
    valid = {t["key"] for t in ai_gateway.TASK_CATALOG}
    gov.disabled_tasks = [t for t in body.disabled_tasks if t in valid]
    db.commit()
    db.refresh(gov)
    return _governance_out(gov)
