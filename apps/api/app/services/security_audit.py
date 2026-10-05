"""Security audit trail for enterprise compliance."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import SecurityAuditLog


def log_security_event(
    db: Session,
    *,
    action: str,
    company_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
    detail: dict | None = None,
) -> SecurityAuditLog:
    row = SecurityAuditLog(
        company_id=company_id,
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        detail=detail or {},
    )
    db.add(row)
    return row


def recent_failed_logins(db: Session, email: str, *, within_minutes: int) -> int:
    """Count failed login attempts for an email in the recent window (brute-force guard).

    Counts from the audit trail (login already logs auth.login_failed), so there is no
    extra counter to keep or reset — the window clears itself as attempts age out.
    """
    since = datetime.now(timezone.utc) - timedelta(minutes=within_minutes)
    return db.scalar(
        select(func.count())
        .select_from(SecurityAuditLog)
        .where(
            SecurityAuditLog.action == "auth.login_failed",
            SecurityAuditLog.created_at >= since,
            SecurityAuditLog.detail["email"].astext == email,
        )
    ) or 0


def list_security_logs(
    db: Session,
    company_id: UUID,
    *,
    limit: int = 100,
) -> list[SecurityAuditLog]:
    return list(
        db.scalars(
            select(SecurityAuditLog)
            .where(SecurityAuditLog.company_id == company_id)
            .order_by(SecurityAuditLog.created_at.desc())
            .limit(min(limit, 500))
        )
    )
