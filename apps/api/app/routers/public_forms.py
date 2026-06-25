"""Public (unauthenticated) form endpoints — no login required."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import GuestAttachment, GuestSubmission, PublicFormToken, WorkflowDefinition
from app.db.session import get_db

# ── MIME type whitelist (magic bytes, not extension) ─────────────────────────

_MAGIC: list[tuple[bytes, str, str]] = [
    (b"\x25\x50\x44\x46", "application/pdf", ".pdf"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89\x50\x4e\x47\x0d\x0a\x1a\x0a", "image/png", ".png"),
]
_MAX_FILE_BYTES = 10 * 1024 * 1024


def _try_uuid(s: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(s)
    except ValueError:
        return None


def _detect_mime(header: bytes) -> tuple[str, str] | None:
    for magic, mime, ext in _MAGIC:
        if header[: len(magic)] == magic:
            return mime, ext
    return None

router = APIRouter(tags=["Public Forms"])

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(value: Any) -> Any:
    """Recursively strip HTML tags from string values in dicts/lists."""
    if isinstance(value, str):
        return _TAG_RE.sub("", value).strip()
    if isinstance(value, dict):
        return {k: _strip_html(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_strip_html(v) for v in value]
    return value


def _resolve_token(token_str: str, db: Session) -> PublicFormToken:
    tok = db.scalar(select(PublicFormToken).where(PublicFormToken.token == token_str))
    if not tok or tok.revoked:
        raise HTTPException(status_code=404, detail="This form link is no longer active.")
    if tok.expires_at and datetime.now(timezone.utc) > tok.expires_at:
        raise HTTPException(status_code=410, detail="This form link has expired.")
    return tok


# ── GET /public/forms/{token} ────────────────────────────────────────────────

class PublicFormSchema(BaseModel):
    workflow_id: str
    workflow_name: str
    company_name: str
    form_schema: dict
    settings: dict


@router.get("/public/forms/{token}", response_model=PublicFormSchema)
def get_public_form(token: str, db: Session = Depends(get_db)) -> PublicFormSchema:
    tok = _resolve_token(token, db)
    wf = db.scalar(
        select(WorkflowDefinition).where(WorkflowDefinition.id == tok.workflow_definition_id)
    )
    if not wf or wf.status != "published":
        raise HTTPException(status_code=404, detail="This form is not available.")

    from sqlalchemy import select as _sel
    from app.db.models import Company
    company = db.scalar(_sel(Company).where(Company.id == wf.company_id))

    return PublicFormSchema(
        workflow_id=str(wf.id),
        workflow_name=wf.name,
        company_name=company.name if company else "",
        form_schema=wf.form_schema,
        settings=wf.settings or {},
    )


# ── POST /public/forms/{token}/upload ────────────────────────────────────────

class UploadOut(BaseModel):
    id: str
    original_filename: str
    size_bytes: int


@router.post("/public/forms/{token}/upload", response_model=UploadOut)
async def upload_form_file(
    token: str,
    field_key: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UploadOut:
    tok = _resolve_token(token, db)

    content = await file.read()
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    result = _detect_mime(content[:8])
    if result is None:
        raise HTTPException(status_code=415, detail="Only PDF, JPG, and PNG files are allowed.")
    detected_mime, ext = result

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = Path(settings.file_storage_path) / "guest"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / safe_name).write_bytes(content)

    att = GuestAttachment(
        id=uuid.uuid4(),
        token_id=tok.id,
        field_key=field_key[:100],
        original_filename=(file.filename or "upload")[:255],
        storage_path=str(dest / safe_name),
        content_type=detected_mime,
        size_bytes=len(content),
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    return UploadOut(
        id=str(att.id),
        original_filename=att.original_filename,
        size_bytes=att.size_bytes,
    )


# ── POST /public/forms/{token}/submit ────────────────────────────────────────

class PublicSubmitBody(BaseModel):
    guest_name: str
    guest_email: EmailStr
    data: dict
    honeypot: str = ""  # must be empty; filled = bot

    @field_validator("guest_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required.")
        if len(v) > 200:
            raise ValueError("Name is too long.")
        return v

    @field_validator("data")
    @classmethod
    def data_size(cls, v: dict) -> dict:
        if len(str(v)) > 100_000:
            raise ValueError("Submission data is too large.")
        return v


class PublicSubmitOut(BaseModel):
    id: str
    message: str


@router.post("/public/forms/{token}/submit", response_model=PublicSubmitOut)
def submit_public_form(
    token: str,
    body: PublicSubmitBody,
    request: Request,
    db: Session = Depends(get_db),
) -> PublicSubmitOut:
    # Honeypot check — silently discard bots
    if body.honeypot:
        return PublicSubmitOut(id=str(uuid.uuid4()), message="Thank you for your submission.")

    tok = _resolve_token(token, db)
    wf = db.scalar(
        select(WorkflowDefinition).where(WorkflowDefinition.id == tok.workflow_definition_id)
    )
    if not wf or wf.status != "published":
        raise HTTPException(status_code=404, detail="This form is not available.")

    ip = (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()[:45]
        or (request.client.host if request.client else None)
    )

    clean_data = _strip_html(body.data)
    clean_data["__guest_name"] = _strip_html(body.guest_name)
    clean_data["__guest_email"] = str(body.guest_email).lower()

    sub_id = uuid.uuid4()
    sub = GuestSubmission(
        id=sub_id,
        company_id=wf.company_id,
        workflow_definition_id=wf.id,
        token_id=tok.id,
        guest_name=body.guest_name.strip()[:200],
        guest_email=str(body.guest_email).lower()[:255],
        data=clean_data,
        status="pending",
        ip_address=ip,
    )
    db.add(sub)
    db.flush()

    # Link any pre-uploaded attachments referenced in the submitted data
    att_ids = {
        str(v) for v in clean_data.values()
        if isinstance(v, str) and len(v) in (32, 36)
    }
    if att_ids:
        orphans = db.scalars(
            select(GuestAttachment).where(
                GuestAttachment.id.in_([_try_uuid(a) for a in att_ids if _try_uuid(a)]),
                GuestAttachment.token_id == tok.id,
                GuestAttachment.guest_submission_id.is_(None),
            )
        ).all()
        for orphan in orphans:
            orphan.guest_submission_id = sub_id

    db.commit()

    return PublicSubmitOut(
        id=str(sub.id),
        message="Thank you for your submission. We will be in touch soon.",
    )
