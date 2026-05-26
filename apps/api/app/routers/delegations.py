from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import ApprovalDelegation, User
from app.db.session import get_db
from app.schemas.web_phases import DelegationCreate, DelegationOut

router = APIRouter(prefix="/delegations", tags=["Delegations"])


@router.get("", response_model=list[DelegationOut])
def list_delegations(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[DelegationOut]:
    rows = db.scalars(
        select(ApprovalDelegation).where(
            ApprovalDelegation.company_id == user.company_id,
            ApprovalDelegation.user_id == user.id,
            ApprovalDelegation.is_active.is_(True),
        )
    )
    out: list[DelegationOut] = []
    for d in rows:
        delegate = db.get(User, d.delegate_user_id)
        out.append(
            DelegationOut(
                id=d.id,
                user_id=d.user_id,
                delegate_user_id=d.delegate_user_id,
                delegate_name=delegate.full_name if delegate else "",
                starts_at=d.starts_at,
                ends_at=d.ends_at,
                is_active=d.is_active,
            )
        )
    return out


@router.post("", response_model=DelegationOut, status_code=status.HTTP_201_CREATED)
def create_delegation(
    body: DelegationCreate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> DelegationOut:
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    delegate = db.get(User, body.delegate_user_id)
    if not delegate or delegate.company_id != user.company_id:
        raise HTTPException(status_code=400, detail="Invalid delegate user")
    row = ApprovalDelegation(
        company_id=user.company_id,
        user_id=user.id,
        delegate_user_id=body.delegate_user_id,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return DelegationOut(
        id=row.id,
        user_id=row.user_id,
        delegate_user_id=row.delegate_user_id,
        delegate_name=delegate.full_name,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        is_active=row.is_active,
    )


@router.delete("/{delegation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_delegation(
    delegation_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(ApprovalDelegation, delegation_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    row.is_active = False
    db.commit()
