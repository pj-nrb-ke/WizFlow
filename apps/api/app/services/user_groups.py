"""User group membership resolution."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import User, UserGroup, UserGroupMember


def group_member_user_ids(db: Session, company_id: UUID, group_id: UUID) -> list[UUID]:
    rows = db.scalars(
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroup.id == group_id,
            UserGroup.company_id == company_id,
        )
    )
    return list(rows)


def expand_user_ids(
    db: Session,
    company_id: UUID,
    *,
    user_ids: list[UUID] | None = None,
    group_ids: list[UUID] | None = None,
) -> list[UUID]:
    """Return unique active user ids from direct users and group members (stable order)."""
    seen: set[UUID] = set()
    ordered: list[UUID] = []

    def add(uid: UUID) -> None:
        if uid in seen:
            return
        u = db.get(User, uid)
        if u and u.company_id == company_id and u.is_active:
            seen.add(uid)
            ordered.append(uid)

    for uid in user_ids or []:
        add(uid)
    for gid in group_ids or []:
        for uid in group_member_user_ids(db, company_id, gid):
            add(uid)
    return ordered
