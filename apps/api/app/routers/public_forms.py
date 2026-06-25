"""Public (unauthenticated) form endpoints — no login required."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import GuestSubmission, PublicFormToken, WorkflowDefinition
from app.db.session import get_db

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

    sub = GuestSubmission(
        id=uuid.uuid4(),
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
    db.commit()

    return PublicSubmitOut(
        id=str(sub.id),
        message="Thank you for your submission. We will be in touch soon.",
    )
