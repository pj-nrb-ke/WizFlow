"""Signed one-time approval links (no login required)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import ApprovalToken, User, WorkflowDefinition, WorkflowInstance
from app.services.instance_engine import _step_name
from app.services.ui_settings import strip_ui_keys

TOKEN_TTL_DAYS = 3


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_approval_token(
    db: Session,
    *,
    company_id: UUID,
    instance: WorkflowInstance,
    user_id: UUID,
    step_id: str,
) -> str:
    raw = secrets.token_urlsafe(32)
    row = ApprovalToken(
        company_id=company_id,
        instance_id=instance.id,
        user_id=user_id,
        step_id=step_id,
        token_hash=_hash_token(raw),
        expires_at=datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    )
    db.add(row)
    db.flush()
    return raw


def get_valid_token(db: Session, raw: str) -> ApprovalToken | None:
    h = _hash_token(raw)
    row = db.scalar(select(ApprovalToken).where(ApprovalToken.token_hash == h))
    if not row:
        return None
    now = datetime.now(timezone.utc)
    if row.used_at is not None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now:
        return None
    return row


def mark_token_used(db: Session, row: ApprovalToken) -> None:
    row.used_at = datetime.now(timezone.utc)


def build_approval_url(raw_token: str) -> str:
    base = settings.app_url.rstrip("/")
    return f"{base}/approve/{raw_token}"


def public_request_summary(
    db: Session,
    instance: WorkflowInstance,
    defn: WorkflowDefinition | None,
    step_id: str,
) -> dict:
    step_name = _step_name(defn, step_id) if defn else step_id
    originator_name = ""
    if instance.originator_user_id:
        u = db.get(User, instance.originator_user_id)
        originator_name = u.full_name if u else ""
    data = strip_ui_keys(instance.request_data or {})
    preview = {k: v for k, v in list(data.items())[:12]}
    return {
        "reference_number": instance.reference_number,
        "workflow_name": instance.workflow_name,
        "step_name": step_name or step_id,
        "originator_name": originator_name,
        "submitted_at": instance.submitted_at.isoformat() if instance.submitted_at else None,
        "request_preview": preview,
        "status": instance.status,
    }
