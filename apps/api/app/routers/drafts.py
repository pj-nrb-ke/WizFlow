from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import RequestDraft, WorkflowDefinition
from app.db.session import get_db
from app.schemas.web_phases import RequestDraftOut, RequestDraftSave

router = APIRouter(prefix="/drafts", tags=["Drafts"])


@router.get("", response_model=list[RequestDraftOut])
def list_drafts(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[RequestDraft]:
    return list(
        db.scalars(
            select(RequestDraft)
            .where(RequestDraft.user_id == user.id, RequestDraft.company_id == user.company_id)
            .order_by(RequestDraft.updated_at.desc())
        )
    )


@router.put("/{workflow_id}", response_model=RequestDraftOut)
def save_draft(
    workflow_id: UUID,
    body: RequestDraftSave,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> RequestDraft:
    defn = db.get(WorkflowDefinition, workflow_id)
    if not defn or defn.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    row = db.scalar(
        select(RequestDraft).where(
            RequestDraft.user_id == user.id,
            RequestDraft.workflow_definition_id == workflow_id,
        )
    )
    if row:
        row.data = body.data
        row.workflow_name = defn.name
    else:
        row = RequestDraft(
            company_id=user.company_id,
            user_id=user.id,
            workflow_definition_id=workflow_id,
            workflow_name=defn.name,
            data=body.data,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(
    draft_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(RequestDraft, draft_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    db.delete(row)
    db.commit()
