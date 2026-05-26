from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import SavedReportView
from app.db.session import get_db
from app.schemas.web_phases import SavedReportViewCreate, SavedReportViewOut

router = APIRouter(prefix="/saved-views", tags=["Saved report views"])


@router.get("", response_model=list[SavedReportViewOut])
def list_views(
    report_type: str | None = None,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[SavedReportView]:
    q = select(SavedReportView).where(
        SavedReportView.company_id == user.company_id,
        SavedReportView.user_id == user.id,
    )
    if report_type:
        q = q.where(SavedReportView.report_type == report_type)
    return list(db.scalars(q.order_by(SavedReportView.created_at.desc())))


@router.post("", response_model=SavedReportViewOut, status_code=status.HTTP_201_CREATED)
def create_view(
    body: SavedReportViewCreate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> SavedReportView:
    row = SavedReportView(
        company_id=user.company_id,
        user_id=user.id,
        name=body.name.strip(),
        report_type=body.report_type,
        filters=body.filters,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_view(
    view_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(SavedReportView, view_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
