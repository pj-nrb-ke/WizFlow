"""Email-based user invitation flow."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Company, Role, User, UserRole
from app.db.session import get_db
from app.routers.admin import ADMIN_ROLES, _user_out
from app.schemas.admin import UserOut
from app.services.auth import hash_password
from app.services.brevo_mail import send_invite_email
from app.utils.auth import CurrentUser, require_roles

router = APIRouter(tags=["Invitations"])

INVITE_TTL_HOURS = 72


# ── Pydantic schemas ────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    email: EmailStr
    role_slugs: list[str]


class InviteOut(BaseModel):
    id: str
    email: str
    role_slugs: list[str]
    expires_at: datetime
    accepted: bool


class AcceptInvite(BaseModel):
    full_name: str
    password: str


# ── In-memory store (no extra table migration complexity) ───────────────────
# Stored as dict keyed by token → InviteRecord dict
_invites: dict[str, dict] = {}


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

    # Reject if already a member
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="This email already has an account.")

    # Expire any previous pending invites for this email in this company
    for token, rec in list(_invites.items()):
        if rec["company_id"] == str(current_user.company_id) and rec["email"] == email:
            del _invites[token]

    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)
    invite_id = str(uuid.uuid4())

    _invites[token] = {
        "id": invite_id,
        "company_id": str(current_user.company_id),
        "email": email,
        "role_slugs": body.role_slugs,
        "invited_by_name": current_user.full_name,
        "company_name": current_user.company.name if current_user.company else "WizFlow",
        "expires_at": expires_at,
        "accepted_at": None,
    }

    from app.config import settings
    invite_url = f"{settings.app_url}/invite/{token}"

    sent = send_invite_email(
        to_email=email,
        invited_by_name=current_user.full_name,
        company_name=current_user.company.name if current_user.company else "WizFlow",
        invite_url=invite_url,
    )
    if not sent:
        # Still return success — invite is stored, they just need the link
        pass

    return InviteOut(
        id=invite_id,
        email=email,
        role_slugs=body.role_slugs,
        expires_at=expires_at,
        accepted=False,
    )


# ── Public: validate token ──────────────────────────────────────────────────

class InvitePreview(BaseModel):
    email: str
    invited_by_name: str
    company_name: str
    role_slugs: list[str]


@router.get("/invitations/{token}", response_model=InvitePreview)
def get_invitation(token: str) -> InvitePreview:
    rec = _invites.get(token)
    if not rec:
        raise HTTPException(status_code=404, detail="Invitation not found or expired.")
    if rec["accepted_at"]:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")
    if datetime.now(timezone.utc) > rec["expires_at"]:
        raise HTTPException(status_code=410, detail="This invitation has expired.")
    return InvitePreview(
        email=rec["email"],
        invited_by_name=rec["invited_by_name"],
        company_name=rec["company_name"],
        role_slugs=rec["role_slugs"],
    )


# ── Public: accept invite ───────────────────────────────────────────────────

@router.post("/invitations/{token}/accept", response_model=UserOut)
def accept_invitation(
    token: str,
    body: AcceptInvite,
    db: Session = Depends(get_db),
) -> UserOut:
    rec = _invites.get(token)
    if not rec:
        raise HTTPException(status_code=404, detail="Invitation not found or expired.")
    if rec["accepted_at"]:
        raise HTTPException(status_code=410, detail="This invitation has already been used.")
    if datetime.now(timezone.utc) > rec["expires_at"]:
        raise HTTPException(status_code=410, detail="This invitation link has expired.")

    email = rec["email"]
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    company = db.scalar(select(Company).where(Company.id == uuid.UUID(rec["company_id"])))
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")

    new_user = User(
        company_id=company.id,
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
    )
    db.add(new_user)
    db.flush()

    for slug in rec["role_slugs"]:
        role = db.scalar(
            select(Role).where(Role.company_id == company.id, Role.slug == slug)
        )
        if role:
            db.add(UserRole(user_id=new_user.id, role_id=role.id))

    db.commit()

    rec["accepted_at"] = datetime.now(timezone.utc)

    db_user = db.scalar(
        select(User)
        .where(User.id == new_user.id)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
    )
    return _user_out(db_user)
