"""Process intelligence API (D5).

Gated on ANALYTICS_VIEW (the insight capability). Read-only: it mines existing history
and recommends — it never changes a workflow.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import permissions as perms
from app.core.deps import CurrentUser, require_permission
from app.db.models import WorkflowDefinition
from app.db.session import get_db
from app.schemas.process_intel import ReportOut
from app.services import process_intel

router = APIRouter(prefix="/process-intel", tags=["Process intelligence"])


@router.get("/{workflow_id}", response_model=ReportOut)
def workflow_report(
    workflow_id: UUID,
    user: CurrentUser = Depends(require_permission(perms.ANALYTICS_VIEW)),
    db: Session = Depends(get_db),
) -> ReportOut:
    defn = db.get(WorkflowDefinition, workflow_id)
    if not defn or defn.company_id != user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return ReportOut(**process_intel.report(db, user.company_id, defn))
