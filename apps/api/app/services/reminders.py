"""Recurring staff reminder processing."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ReminderOccurrence, ReminderRule, User
from app.services.notifications import notify_users
from app.services.user_groups import expand_user_ids

logger = logging.getLogger("wizflow.reminders")


def _mark_missed(db: Session, company_id: UUID | None, today: date) -> int:
    q = (
        select(ReminderOccurrence)
        .where(ReminderOccurrence.status == "pending", ReminderOccurrence.due_date < today)
    )
    if company_id:
        q = q.where(ReminderOccurrence.company_id == company_id)
    count = 0
    for occ in db.scalars(q):
        occ.status = "missed"
        count += 1
    return count


def process_reminder_rules(db: Session, *, company_id: UUID | None = None) -> int:
    now = datetime.now(timezone.utc)
    today = now.date()
    dow = now.weekday()  # 0=Mon, 6=Sun

    _mark_missed(db, company_id, today)

    q = select(ReminderRule).where(ReminderRule.is_active.is_(True))
    if company_id:
        q = q.where(ReminderRule.company_id == company_id)

    sent = 0
    for rule in db.scalars(q):
        if dow not in (rule.days_of_week or []):
            continue
        if now.hour < rule.send_hour:
            continue

        user_ids = expand_user_ids(
            db,
            rule.company_id,
            user_ids=[UUID(str(x)) for x in (rule.assignee_user_ids or [])],
            group_ids=[UUID(str(x)) for x in (rule.assignee_group_ids or [])],
        )

        newly_notified: list[UUID] = []
        for uid in user_ids:
            existing = db.scalar(
                select(ReminderOccurrence).where(
                    ReminderOccurrence.rule_id == rule.id,
                    ReminderOccurrence.user_id == uid,
                    ReminderOccurrence.due_date == today,
                )
            )
            if existing:
                continue
            occ = ReminderOccurrence(
                company_id=rule.company_id,
                rule_id=rule.id,
                user_id=uid,
                due_date=today,
                status="pending",
            )
            db.add(occ)
            newly_notified.append(uid)

        if newly_notified:
            db.flush()
            body = rule.description or f"Please complete: {rule.name}"
            notify_users(
                db,
                company_id=rule.company_id,
                user_ids=newly_notified,
                title=f"Reminder: {rule.name}",
                body=body,
                send_email=True,
                send_push=True,
            )
            sent += len(newly_notified)

    db.commit()
    return sent


def acknowledge_occurrence(db: Session, occurrence_id: UUID, user_id: UUID) -> ReminderOccurrence | None:
    occ = db.get(ReminderOccurrence, occurrence_id)
    if not occ or occ.user_id != user_id:
        return None
    occ.status = "done"
    occ.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(occ)
    return occ


def get_user_occurrences(
    db: Session, company_id: UUID, user_id: UUID, *, limit: int = 50
) -> list[ReminderOccurrence]:
    rows = db.scalars(
        select(ReminderOccurrence)
        .where(
            ReminderOccurrence.company_id == company_id,
            ReminderOccurrence.user_id == user_id,
        )
        .order_by(ReminderOccurrence.due_date.desc())
        .limit(limit)
    )
    return list(rows)
