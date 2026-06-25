"""Authenticated management of public form tokens and guest submissions."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import CurrentUser, require_company, require_roles
from app.core.security import hash_password
from app.db.models import Company, GuestAttachment, GuestSubmission, PublicFormToken, Role, User, UserRole, WorkflowDefinition
from app.db.session import get_db
from app.services.brevo_mail import send_welcome_email, send_rejection_email

router = APIRouter(tags=["Guest Submissions"])

_MANAGER_ROLES = ("company_admin", "manager")


def _get_workflow(db: Session, workflow_id: uuid.UUID, company_id: uuid.UUID) -> WorkflowDefinition:
    wf = db.scalar(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.company_id == company_id,
        )
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return wf


def _active_token(db: Session, workflow_id: uuid.UUID) -> PublicFormToken | None:
    return db.scalar(
        select(PublicFormToken).where(
            PublicFormToken.workflow_definition_id == workflow_id,
            PublicFormToken.revoked.is_(False),
        ).order_by(PublicFormToken.created_at.desc())
    )


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class PublicLinkOut(BaseModel):
    id: str
    url: str
    created_at: datetime
    expires_at: datetime | None
    revoked: bool


class GuestSubOut(BaseModel):
    id: str
    guest_name: str
    guest_email: str
    status: str
    submitted_at: datetime
    review_note: str | None


class AttachmentInfo(BaseModel):
    id: str
    field_key: str
    original_filename: str
    size_bytes: int


class GuestSubDetail(GuestSubOut):
    data: dict
    ip_address: str | None
    reviewed_at: datetime | None
    attachments: list[AttachmentInfo]


class RejectBody(BaseModel):
    reason: str = ""


# ── Public link management ───────────────────────────────────────────────────

@router.get("/workflows/{workflow_id}/public-link", response_model=PublicLinkOut | None)
def get_public_link(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> PublicLinkOut | None:
    _get_workflow(db, workflow_id, user.company_id)
    tok = _active_token(db, workflow_id)
    if not tok:
        return None
    return PublicLinkOut(
        id=str(tok.id),
        url=f"{settings.app_url}/p/{tok.token}",
        created_at=tok.created_at,
        expires_at=tok.expires_at,
        revoked=tok.revoked,
    )


@router.post("/workflows/{workflow_id}/public-link", response_model=PublicLinkOut, status_code=201)
def create_public_link(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> PublicLinkOut:
    wf = _get_workflow(db, workflow_id, user.company_id)
    if wf.status != "published":
        raise HTTPException(status_code=400, detail="Only published workflows can have a public link.")

    # Revoke any existing active token
    existing = _active_token(db, workflow_id)
    if existing:
        existing.revoked = True
        db.flush()

    tok = PublicFormToken(
        id=uuid.uuid4(),
        company_id=user.company_id,
        workflow_definition_id=workflow_id,
        token=secrets.token_urlsafe(32),
        created_by=user.id,
    )
    db.add(tok)
    db.commit()
    db.refresh(tok)

    return PublicLinkOut(
        id=str(tok.id),
        url=f"{settings.app_url}/p/{tok.token}",
        created_at=tok.created_at,
        expires_at=tok.expires_at,
        revoked=tok.revoked,
    )


@router.delete("/workflows/{workflow_id}/public-link", status_code=204)
def revoke_public_link(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> None:
    _get_workflow(db, workflow_id, user.company_id)
    tok = _active_token(db, workflow_id)
    if not tok:
        raise HTTPException(status_code=404, detail="No active public link.")
    tok.revoked = True
    db.commit()


# ── Guest submission list / detail ───────────────────────────────────────────

@router.get("/workflows/{workflow_id}/guest-submissions", response_model=list[GuestSubOut])
def list_guest_submissions(
    workflow_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> list[GuestSubOut]:
    _get_workflow(db, workflow_id, user.company_id)
    subs = db.scalars(
        select(GuestSubmission)
        .where(
            GuestSubmission.workflow_definition_id == workflow_id,
            GuestSubmission.company_id == user.company_id,
        )
        .order_by(GuestSubmission.submitted_at.desc())
    ).all()
    return [
        GuestSubOut(
            id=str(s.id),
            guest_name=s.guest_name,
            guest_email=s.guest_email,
            status=s.status,
            submitted_at=s.submitted_at,
            review_note=s.review_note,
        )
        for s in subs
    ]


@router.get("/workflows/{workflow_id}/guest-submissions/{sub_id}", response_model=GuestSubDetail)
def get_guest_submission(
    workflow_id: uuid.UUID,
    sub_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> GuestSubDetail:
    _get_workflow(db, workflow_id, user.company_id)
    sub = db.scalar(
        select(GuestSubmission).where(
            GuestSubmission.id == sub_id,
            GuestSubmission.workflow_definition_id == workflow_id,
            GuestSubmission.company_id == user.company_id,
        )
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    atts = db.scalars(
        select(GuestAttachment).where(GuestAttachment.guest_submission_id == sub.id)
    ).all()

    return GuestSubDetail(
        id=str(sub.id),
        guest_name=sub.guest_name,
        guest_email=sub.guest_email,
        status=sub.status,
        submitted_at=sub.submitted_at,
        review_note=sub.review_note,
        data=sub.data,
        ip_address=sub.ip_address,
        reviewed_at=sub.reviewed_at,
        attachments=[
            AttachmentInfo(
                id=str(a.id),
                field_key=a.field_key,
                original_filename=a.original_filename,
                size_bytes=a.size_bytes,
            )
            for a in atts
        ],
    )


# ── Accept ───────────────────────────────────────────────────────────────────

@router.post("/workflows/{workflow_id}/guest-submissions/{sub_id}/accept", status_code=200)
def accept_guest_submission(
    workflow_id: uuid.UUID,
    sub_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> dict:
    _get_workflow(db, workflow_id, user.company_id)
    sub = db.scalar(
        select(GuestSubmission).where(
            GuestSubmission.id == sub_id,
            GuestSubmission.workflow_definition_id == workflow_id,
            GuestSubmission.company_id == user.company_id,
        )
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if sub.status != "pending":
        raise HTTPException(status_code=400, detail=f"Submission is already {sub.status}.")

    email = sub.guest_email.lower()
    full_name = sub.guest_name

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    company = db.scalar(select(Company).where(Company.id == user.company_id))
    company_name = company.name if company else "WizFlow"

    temp_password = secrets.token_urlsafe(12)
    new_user = User(
        id=uuid.uuid4(),
        company_id=user.company_id,
        email=email,
        password_hash=hash_password(temp_password),
        full_name=full_name,
    )
    db.add(new_user)
    db.flush()

    role = db.scalar(
        select(Role).where(Role.company_id == user.company_id, Role.slug == "originator")
    )
    if role:
        db.add(UserRole(user_id=new_user.id, role_id=role.id))

    sub.status = "accepted"
    sub.reviewed_by = user.id
    sub.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    send_welcome_email(
        to_email=email,
        full_name=full_name,
        company_name=company_name,
        temp_password=temp_password,
        login_url=f"{settings.app_url}/login",
    )

    return {"message": "Account created and welcome email sent.", "user_id": str(new_user.id)}


# ── Reject ───────────────────────────────────────────────────────────────────

@router.post("/workflows/{workflow_id}/guest-submissions/{sub_id}/reject", status_code=200)
def reject_guest_submission(
    workflow_id: uuid.UUID,
    sub_id: uuid.UUID,
    body: RejectBody,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> dict:
    _get_workflow(db, workflow_id, user.company_id)
    sub = db.scalar(
        select(GuestSubmission).where(
            GuestSubmission.id == sub_id,
            GuestSubmission.workflow_definition_id == workflow_id,
            GuestSubmission.company_id == user.company_id,
        )
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if sub.status != "pending":
        raise HTTPException(status_code=400, detail=f"Submission is already {sub.status}.")

    company = db.scalar(select(Company).where(Company.id == user.company_id))
    company_name = company.name if company else "WizFlow"

    sub.status = "rejected"
    sub.reviewed_by = user.id
    sub.reviewed_at = datetime.now(timezone.utc)
    sub.review_note = body.reason.strip()[:2000] if body.reason else None
    db.commit()

    send_rejection_email(
        to_email=sub.guest_email,
        full_name=sub.guest_name,
        company_name=company_name,
        reason=body.reason.strip() if body.reason else "",
    )

    return {"message": "Submission rejected and applicant notified."}


# ── Attachment download ───────────────────────────────────────────────────────

@router.get("/guest-attachments/{att_id}/download")
def download_guest_attachment(
    att_id: uuid.UUID,
    user: CurrentUser = Depends(require_roles(*_MANAGER_ROLES)),
    db: Session = Depends(get_db),
) -> FileResponse:
    att = db.scalar(select(GuestAttachment).where(GuestAttachment.id == att_id))
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    # Verify the attachment belongs to a submission in the caller's company
    if att.guest_submission_id:
        sub = db.scalar(
            select(GuestSubmission).where(
                GuestSubmission.id == att.guest_submission_id,
                GuestSubmission.company_id == user.company_id,
            )
        )
        if not sub:
            raise HTTPException(status_code=403, detail="Access denied.")
    else:
        raise HTTPException(status_code=404, detail="Attachment not yet linked to a submission.")

    path = Path(att.storage_path).resolve()
    allowed_root = (Path(settings.file_storage_path) / "guest").resolve()
    if not str(path).startswith(str(allowed_root)):
        raise HTTPException(status_code=403, detail="Access denied.")
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on server.")

    return FileResponse(
        path=str(path),
        media_type=att.content_type or "application/octet-stream",
        filename=att.original_filename,
    )
