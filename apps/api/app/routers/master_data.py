from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import MasterDataEntry
from app.db.session import get_db
from app.schemas.web_phases import MasterDataEntryCreate, MasterDataEntryOut, MasterDataEntryUpdate

router = APIRouter(prefix="/master-data", tags=["Master data"])

MANAGER_ROLES = ("company_admin", "manager")

MASTER_CATEGORIES = (
    "department",
    "branch",
    "cost_center",
    "vendor",
    "project",
    "expense_type",
    "category",
    "approval_limit",
)


@router.get("/categories")
def list_categories(user: CurrentUser = Depends(require_company)) -> dict:
    _ = user
    return {"categories": list(MASTER_CATEGORIES)}


@router.get("", response_model=list[MasterDataEntryOut])
def list_entries(
    category: str | None = None,
    active_only: bool = True,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[MasterDataEntry]:
    q = select(MasterDataEntry).where(MasterDataEntry.company_id == user.company_id)
    if category:
        q = q.where(MasterDataEntry.category == category)
    if active_only:
        q = q.where(MasterDataEntry.is_active.is_(True))
    return list(db.scalars(q.order_by(MasterDataEntry.category, MasterDataEntry.label)))


@router.post("", response_model=MasterDataEntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    body: MasterDataEntryCreate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> MasterDataEntry:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    if body.category not in MASTER_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Use: {', '.join(MASTER_CATEGORIES)}")
    existing = db.scalar(
        select(MasterDataEntry).where(
            MasterDataEntry.company_id == user.company_id,
            MasterDataEntry.category == body.category,
            MasterDataEntry.code == body.code.strip(),
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Code already exists in this category")
    row = MasterDataEntry(
        company_id=user.company_id,
        category=body.category,
        code=body.code.strip(),
        label=body.label.strip(),
        meta=body.meta,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{entry_id}", response_model=MasterDataEntryOut)
def update_entry(
    entry_id: UUID,
    body: MasterDataEntryUpdate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> MasterDataEntry:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    row = db.get(MasterDataEntry, entry_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    if body.label is not None:
        row.label = body.label.strip()
    if body.meta is not None:
        row.meta = body.meta
    if body.is_active is not None:
        row.is_active = body.is_active
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> None:
    if not any(r in MANAGER_ROLES for r in user.roles):
        raise HTTPException(status_code=403, detail="Manager role required")
    row = db.get(MasterDataEntry, entry_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    row.is_active = False
    db.commit()
