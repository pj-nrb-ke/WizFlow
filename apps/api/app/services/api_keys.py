"""Company API keys for public / external API access."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ApiKey, User

API_KEY_PREFIX = "wf_"
DEFAULT_SCOPES = ["requests:read", "requests:write"]


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Return (full_key, key_prefix, key_hash)."""
    prefix = secrets.token_hex(4)
    secret = secrets.token_urlsafe(24)
    full = f"{API_KEY_PREFIX}{prefix}_{secret}"
    return full, prefix[:12], hash_api_key(full)


def create_api_key(
    db: Session,
    *,
    company_id: UUID,
    name: str,
    service_user_id: UUID,
    created_by: UUID | None,
    scopes: list[str] | None = None,
) -> tuple[ApiKey, str]:
    user = db.get(User, service_user_id)
    if not user or user.company_id != company_id:
        raise ValueError("Service user must belong to the company")

    full, key_prefix, key_hash = generate_api_key()
    row = ApiKey(
        company_id=company_id,
        name=name.strip()[:120],
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=scopes or list(DEFAULT_SCOPES),
        service_user_id=service_user_id,
        created_by=created_by,
        is_active=True,
    )
    db.add(row)
    db.flush()
    return row, full


def resolve_api_key(db: Session, raw_key: str) -> ApiKey | None:
    if not raw_key or not raw_key.startswith(API_KEY_PREFIX):
        return None
    digest = hash_api_key(raw_key.strip())
    row = db.scalar(
        select(ApiKey).where(ApiKey.key_hash == digest, ApiKey.is_active.is_(True))
    )
    if row:
        row.last_used_at = datetime.now(timezone.utc)
    return row


def has_scope(key: ApiKey, scope: str) -> bool:
    scopes = key.scopes or []
    return scope in scopes or "*" in scopes
