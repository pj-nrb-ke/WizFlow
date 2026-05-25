"""Initiator rules for custom workflows attached to forms."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, WorkflowDefinition
from app.services.user_groups import expand_user_ids


def custom_workflow_settings(settings: dict | None) -> dict | None:
    if not settings:
        return None
    cw = settings.get("custom_workflow")
    return cw if isinstance(cw, dict) else None


def resolve_initiator_user_ids(db: Session, company_id: UUID, initiator: dict) -> list[UUID]:
    if initiator.get("everyone"):
        return list(
            db.scalars(
                select(User.id)
                .where(User.company_id == company_id, User.is_active.is_(True))
                .order_by(User.created_at.asc(), User.email.asc())
            )
        )
    raw_users = initiator.get("user_ids") or []
    raw_groups = initiator.get("group_ids") or []
    user_ids = [UUID(x) if isinstance(x, str) else x for x in raw_users]
    group_ids = [UUID(x) if isinstance(x, str) else x for x in raw_groups]
    return expand_user_ids(db, company_id, user_ids=user_ids, group_ids=group_ids)


def user_can_initiate(db: Session, user_id: UUID, defn: WorkflowDefinition) -> bool:
    cw = custom_workflow_settings(defn.settings)
    if not cw:
        return True
    initiator = cw.get("initiator") or {}
    allowed = resolve_initiator_user_ids(db, defn.company_id, initiator)
    return user_id in allowed


def effective_form_schema(defn: WorkflowDefinition, form_source: WorkflowDefinition | None) -> dict:
    if form_source and (form_source.form_schema or {}).get("fields"):
        return form_source.form_schema
    return defn.form_schema or {}
