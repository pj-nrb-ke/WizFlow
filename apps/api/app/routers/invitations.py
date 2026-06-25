"""Email-based user invitation flow — DB-backed with hashed tokens."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.deps import CurrentUser, require_roles
from app.core.security import hash_password
from app.db.models import Company, Role, User, UserInvite, UserRole
from app.db.session import get_db
from app.routers.admin import ADMIN_ROLES, _user_out
from app.schemas.org import UserOut
from app.services.brevo_mail import send_invite_email

router = APIRouter(tags=["Invitations"])

INVITE_TTL_HOURS = 72


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _is_expired(invite: UserInvite) -> bool:
    return datetime.now(timezone.utc) > invite.expires_at


def _invite_status(invite: UserInvite) -> str:
    if invite.accepted_at:
        return "accepted"
    if invite.revoked:
        return "revoked"
    if _is_expired(invite):
        return "expired"
    return "pending"


# ── Pydantic schemas ────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    email: EmailStr
    role_slugs: list[str]


class InviteOut(BaseModel):
    id: str
    email: str
    role_slugs: list[str]
    invited_by_name: str
    expires_at: datetime
    created_at: datetime
    status: str


class InvitePreview(BaseModel):
    email: str
    invited_by_name: str
    company_name: str
    role_slugs: list[str]


class AcceptInvite(BaseModel):
    full_name: str
    password: str


def _to_out(inv: UserInvite) -> InviteOut:
    return InviteOut(
        id=str(inv.id),
        email=inv.email,
        role_slugs=inv.role_slugs,
        invited_by_name=inv.invited_by_name,
        expires_at=inv.expires_at,
        created_at=inv.created_at,
        status=_invite_status(inv),
    )


# ── Admin: send invite ──────────────────────────────────────────────────────

@router.post(
    "/admin/invitations",
    response_model=InviteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    body: InviteCreate,
    current_user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> InviteOut:
    email = body.email.strip().lower()

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="This email already has an account.")

    company = db.scalar(select(Company).where(Company.id == current_user.company_id))
    company_name = company.name if company else "WizFlow"

    # Expire any existing pending invite for this email in this company
    existing = db.scalars(
        select(UserInvite).where(
            UserInvite.company_id == current_user.company_id,
            UserInvite.email == email,
            UserInvite.accepted_at.is_(None),
            UserInvite.revoked.is_(False),
        )
    ).all()
    for old in existing:
        old.revoked = True
    db.flush()

    token = secrets.token_urlsafe(32)
    invite = UserInvite(
        id=uuid.uuid4(),
        company_id=current_user.company_id,
        email=email,
        role_slugs=body.role_slugs,
        token_hash=_hash_token(token),
        invited_by_id=current_user.id,
        invited_by_name=current_user.full_name or current_user.email,
        company_name=company_name,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    invite_url = f"{settings.app_url}/invite/{token}"
    send_invite_email(
        to_email=email,
        invited_by_name=current_user.full_name or current_user.email,
        company_name=company_name,
        invite_url=invite_url,
    )

    return _to_out(invite)


# ── Admin: list invites ─────────────────────────────────────────────────────

@router.get("/admin/invitations", response_model=list[InviteOut])
def list_invitations(
    current_user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[InviteOut]:
    invites = db.scalars(
        select(UserInvite)
        .where(UserInvite.company_id == current_user.company_id)
        .order_by(UserInvite.created_at.desc())
    ).all()
    return [_to_out(i) for i in invites]


# ── Admin: resend invite ────────────────────────────────────────────────────

@router.post("/admin/invitations/{invite_id}/resend", response_model=InviteOut)
def resend_invitation(
    invite_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> InviteOut:
    invite = db.scalar(
        select(UserInvite).where(
            UserInvite.id == invite_id,
            UserInvite.company_id == current_user.company_id,
        )
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.accepted_at:
        raise HTTPException(status_code=400, detail="Invite already accepted.")
    if invite.revoked:
        raise HTTPException(status_code=400, detail="Invite has been revoked.")

    # Issue a fresh token and reset expiry
    token = secrets.token_urlsafe(32)
    invite.token_hash = _hash_token(token)
    invite.expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)
    db.commit()
    db.refresh(invite)

    invite_url = f"{settings.app_url}/invite/{token}"
    send_invite_email(
        to_email=invite.email,
        invited_by_name=invite.invited_by_name,
        company_name=invite.company_name,
        invite_url=invite_url,
    )

    return _to_out(invite)


# ── Admin: revoke invite ────────────────────────────────────────────────────

@router.delete("/admin/invitations/{invite_id}", status_code=204)
def revoke_invitation(
    invite_id: uuid.UUID,
    current_user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    invite = db.scalar(
        select(UserInvite).where(
            UserInvite.id == invite_id,
            UserInvite.company_id == current_user.company_id,
        )
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.accepted_at:
        raise HTTPException(status_code=400, detail="Cannot revoke an already-accepted invite.")
    invite.revoked = True
    db.commit()


# ── Public: validate token ──────────────────────────────────────────────────

@router.get("/invitations/{token}", response_model=InvitePreview)
def get_invitation(token: str, db: Session = Depends(get_db)) -> InvitePreview:
    invite = db.scalar(select(UserInvite).where(UserInvite.token_hash == _hash_token(token)))
    if not invite or invite.revoked:
        raise HTTPException(status_code=404, detail="Invitation not found or has been cancelled.")
    if invite.accepted_at:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")
    if _is_expired(invite):
        raise HTTPException(status_code=410, detail="This invitation has expired. Ask your admin to resend it.")
    return InvitePreview(
        email=invite.email,
        invited_by_name=invite.invited_by_name,
        company_name=invite.company_name,
        role_slugs=invite.role_slugs,
    )


# ── Public: accept invite ───────────────────────────────────────────────────

@router.post("/invitations/{token}/accept", response_model=UserOut)
def accept_invitation(
    token: str,
    body: AcceptInvite,
    db: Session = Depends(get_db),
) -> UserOut:
    invite = db.scalar(select(UserInvite).where(UserInvite.token_hash == _hash_token(token)))
    if not invite or invite.revoked:
        raise HTTPException(status_code=404, detail="Invitation not found or has been cancelled.")
    if invite.accepted_at:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")
    if _is_expired(invite):
        raise HTTPException(status_code=410, detail="This invitation has expired. Ask your admin to resend it.")

    if db.scalar(select(User).where(User.email == invite.email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    company = db.scalar(select(Company).where(Company.id == invite.company_id))
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")

    new_user = User(
        company_id=company.id,
        email=invite.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
    )
    db.add(new_user)
    db.flush()

    for slug in invite.role_slugs:
        role = db.scalar(select(Role).where(Role.company_id == company.id, Role.slug == slug))
        if role:
            db.add(UserRole(user_id=new_user.id, role_id=role.id))

    invite.accepted_at = datetime.now(timezone.utc)
    db.commit()

    db_user = db.scalar(
        select(User)
        .where(User.id == new_user.id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    return _user_out(db_user)
