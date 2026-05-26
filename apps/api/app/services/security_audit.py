"""Security audit trail for enterprise compliance."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
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
