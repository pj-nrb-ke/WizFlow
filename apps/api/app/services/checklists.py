"""Checklist business logic: token generation, name lookup, progress, reporting."""

from __future__ import annotations

import secrets
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Checklist, ChecklistTask, User
from app.schemas.checklists import ChecklistReport, ReportRow, ReportUserRow


def gen_token() -> str:
    """Unguessable, URL-safe token for a no-login task link."""
    return secrets.token_urlsafe(32)


def name_map(db: Session, ids: set[UUID | None]) -> dict[UUID, str]:
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = db.scalars(select(User).where(User.id.in_(clean)))
    return {u.id: u.full_name for u in rows}


def task_progress(tasks: list[ChecklistTask]) -> tuple[int, int, int]:
    total = len(tasks)
    done = sum(1 for t in tasks if t.status == "done")
    pct = round(done * 100 / total) if total else 0
    return total, done, pct


def resolve_task_token(db: Session, token: str) -> ChecklistTask:
    task = db.scalar(select(ChecklistTask).where(ChecklistTask.access_token == token))
    if not task or task.token_revoked:
        raise HTTPException(status_code=404, detail="This task link is no longer active.")
    return task


def outcome_of(task: ChecklistTask) -> tuple[str, int | None, date | None]:
    """Classify a task against its due date. Returns (outcome, variance_days, completed_on)."""
    completed_on = task.completed_at.date() if task.completed_at else None
    if task.status == "done":
        if not task.due_date or completed_on is None:
            return "on_time", 0, completed_on
        variance = (completed_on - task.due_date).days
        if variance > 0:
            return "late", variance, completed_on
        if variance < 0:
            return "early", variance, completed_on
        return "on_time", 0, completed_on
    if task.status == "skipped":
        return "skipped", None, None
    if task.due_date and task.due_date < date.today():
        return "overdue", None, None
    return "pending", None, None


def build_report(
    db: Session,
    company_id: UUID,
    *,
    checklist_id: UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> ChecklistReport:
    stmt = (
        select(ChecklistTask, Checklist.name)
        .join(Checklist, ChecklistTask.checklist_id == Checklist.id)
        .where(ChecklistTask.company_id == company_id)
    )
    if checklist_id:
        stmt = stmt.where(ChecklistTask.checklist_id == checklist_id)
    if from_date:
        stmt = stmt.where(ChecklistTask.due_date >= from_date)
    if to_date:
        stmt = stmt.where(ChecklistTask.due_date <= to_date)

    raw = list(db.execute(stmt))
    nm = name_map(db, {t.assignee_user_id for t, _ in raw})

    rows: list[ReportRow] = []
    agg: dict[UUID | None, dict] = {}
    total = completed = on_time = late = 0

    for task, cname in raw:
        outcome, variance, completed_on = outcome_of(task)
        aname = nm.get(task.assignee_user_id)
        rows.append(
            ReportRow(
                task_id=task.id,
                checklist_name=cname,
                title=task.title,
                assignee_name=aname,
                due_date=task.due_date,
                completed_on=completed_on,
                status=task.status,
                outcome=outcome,
                variance_days=variance,
            )
        )
        total += 1
        a = agg.setdefault(
            task.assignee_user_id,
            {"name": aname or "Unassigned", "total": 0, "completed": 0, "on_time": 0, "late": 0, "var_sum": 0, "var_n": 0},
        )
        a["total"] += 1
        if task.status == "done":
            completed += 1
            a["completed"] += 1
            if outcome in ("on_time", "early"):
                on_time += 1
                a["on_time"] += 1
            elif outcome == "late":
                late += 1
                a["late"] += 1
            if variance is not None:
                a["var_sum"] += variance
                a["var_n"] += 1

    by_user = [
        ReportUserRow(
            user_id=uid,
            user_name=a["name"],
            total=a["total"],
            completed=a["completed"],
            on_time=a["on_time"],
            late=a["late"],
            on_time_pct=round(a["on_time"] * 100 / a["completed"], 1) if a["completed"] else 0.0,
            avg_variance_days=round(a["var_sum"] / a["var_n"], 1) if a["var_n"] else None,
        )
        for uid, a in agg.items()
    ]
    by_user.sort(key=lambda r: (-r.total, r.user_name))

    return ChecklistReport(
        rows=rows,
        by_user=by_user,
        total=total,
        completed=completed,
        on_time=on_time,
        late=late,
        on_time_pct=round(on_time * 100 / completed, 1) if completed else 0.0,
    )
