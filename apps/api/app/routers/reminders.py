"""Recurring staff reminders: rules, occurrences, compliance report."""

from __future__ import annotations

import csv
import io
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, require_company, require_roles
from app.db.models import ReminderOccurrence, ReminderRule, User
from app.db.session import get_db
from app.schemas.reminders import (
    ComplianceReportOut,
    ComplianceReportRow,
    ReminderOccurrenceOut,
    ReminderRuleCreate,
    ReminderRuleOut,
    ReminderRuleUpdate,
)
from app.services.reminders import acknowledge_occurrence, get_user_occurrences

router = APIRouter(prefix="/reminders", tags=["Reminders"])
ADMIN_ROLES = ("company_admin", "manager")


def _rule_out(rule: ReminderRule) -> ReminderRuleOut:
    return ReminderRuleOut(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        days_of_week=list(rule.days_of_week or []),
        send_hour=rule.send_hour,
        assignee_user_ids=[UUID(str(x)) for x in (rule.assignee_user_ids or [])],
        assignee_group_ids=[UUID(str(x)) for x in (rule.assignee_group_ids or [])],
        is_active=rule.is_active,
        created_at=rule.created_at,
    )


def _occ_out(occ: ReminderOccurrence, db: Session) -> ReminderOccurrenceOut:
    rule = db.get(ReminderRule, occ.rule_id)
    user = db.get(User, occ.user_id)
    return ReminderOccurrenceOut(
        id=occ.id,
        rule_id=occ.rule_id,
        rule_name=rule.name if rule else "",
        user_id=occ.user_id,
        user_name=user.full_name if user else "",
        due_date=occ.due_date,
        status=occ.status,
        acknowledged_at=occ.acknowledged_at,
    )


# ── Rules (admin/manager) ──────────────────────────────────────────────────────

@router.get("/rules", response_model=list[ReminderRuleOut])
def list_rules(
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> list[ReminderRuleOut]:
    rows = db.scalars(
        select(ReminderRule)
        .where(ReminderRule.company_id == user.company_id)
        .order_by(ReminderRule.created_at.desc())
    )
    return [_rule_out(r) for r in rows]


@router.post("/rules", response_model=ReminderRuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(
    body: ReminderRuleCreate,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> ReminderRuleOut:
    rule = ReminderRule(
        company_id=user.company_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        days_of_week=body.days_of_week,
        send_hour=max(0, min(23, body.send_hour)),
        assignee_user_ids=[str(x) for x in body.assignee_user_ids],
        assignee_group_ids=[str(x) for x in body.assignee_group_ids],
        created_by=user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_out(rule)


@router.patch("/rules/{rule_id}", response_model=ReminderRuleOut)
def update_rule(
    rule_id: UUID,
    body: ReminderRuleUpdate,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> ReminderRuleOut:
    rule = db.get(ReminderRule, rule_id)
    if not rule or rule.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    if body.name is not None:
        rule.name = body.name.strip()
    if body.description is not None:
        rule.description = body.description.strip() or None
    if body.days_of_week is not None:
        rule.days_of_week = body.days_of_week
    if body.send_hour is not None:
        rule.send_hour = max(0, min(23, body.send_hour))
    if body.assignee_user_ids is not None:
        rule.assignee_user_ids = [str(x) for x in body.assignee_user_ids]
    if body.assignee_group_ids is not None:
        rule.assignee_group_ids = [str(x) for x in body.assignee_group_ids]
    if body.is_active is not None:
        rule.is_active = body.is_active
    db.commit()
    db.refresh(rule)
    return _rule_out(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: UUID,
    user: CurrentUser = Depends(require_roles("company_admin")),
    db: Session = Depends(get_db),
) -> None:
    rule = db.get(ReminderRule, rule_id)
    if not rule or rule.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(rule)
    db.commit()


# ── My reminders (any authenticated user) ─────────────────────────────────────

@router.get("/my", response_model=list[ReminderOccurrenceOut])
def list_my_occurrences(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[ReminderOccurrenceOut]:
    occs = get_user_occurrences(db, user.company_id, user.id)
    return [_occ_out(o, db) for o in occs]


@router.post("/occurrences/{occurrence_id}/acknowledge", response_model=ReminderOccurrenceOut)
def acknowledge(
    occurrence_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> ReminderOccurrenceOut:
    occ = acknowledge_occurrence(db, occurrence_id, user.id)
    if not occ:
        raise HTTPException(status_code=404, detail="Not found or not yours")
    return _occ_out(occ, db)


# ── Compliance report (admin/manager) ─────────────────────────────────────────

def _build_report(
    db: Session,
    company_id: UUID,
    rule_id: UUID | None,
    user_id: UUID | None,
    from_date: date | None,
    to_date: date | None,
    status_filter: str | None,
) -> list[ReminderOccurrence]:
    q = select(ReminderOccurrence).where(ReminderOccurrence.company_id == company_id)
    if rule_id:
        q = q.where(ReminderOccurrence.rule_id == rule_id)
    if user_id:
        q = q.where(ReminderOccurrence.user_id == user_id)
    if from_date:
        q = q.where(ReminderOccurrence.due_date >= from_date)
    if to_date:
        q = q.where(ReminderOccurrence.due_date <= to_date)
    if status_filter:
        q = q.where(ReminderOccurrence.status == status_filter)
    q = q.order_by(ReminderOccurrence.due_date.desc(), ReminderOccurrence.created_at.desc())
    return list(db.scalars(q))


@router.get("/report", response_model=ComplianceReportOut)
def compliance_report(
    rule_id: UUID | None = Query(None),
    user_id: UUID | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> ComplianceReportOut:
    occs = _build_report(db, user.company_id, rule_id, user_id, from_date, to_date, status_filter)

    rows: list[ComplianceReportRow] = []
    done = missed = pending = 0
    for occ in occs:
        rule = db.get(ReminderRule, occ.rule_id)
        u = db.get(User, occ.user_id)
        rows.append(
            ComplianceReportRow(
                occurrence_id=occ.id,
                rule_id=occ.rule_id,
                rule_name=rule.name if rule else "",
                user_id=occ.user_id,
                user_name=u.full_name if u else "",
                due_date=occ.due_date,
                status=occ.status,
                acknowledged_at=occ.acknowledged_at,
            )
        )
        if occ.status == "done":
            done += 1
        elif occ.status == "missed":
            missed += 1
        else:
            pending += 1

    total = len(rows)
    closed = done + missed
    compliance_pct = round((done / closed) * 100, 1) if closed > 0 else 0.0

    return ComplianceReportOut(
        rows=rows,
        total=total,
        done=done,
        missed=missed,
        pending=pending,
        compliance_pct=compliance_pct,
    )


@router.get("/report/export.csv")
def export_report_csv(
    rule_id: UUID | None = Query(None),
    user_id: UUID | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    user: CurrentUser = Depends(require_roles(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    occs = _build_report(db, user.company_id, rule_id, user_id, from_date, to_date, status_filter)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Rule", "Staff Member", "Due Date", "Status", "Acknowledged At"])
    for occ in occs:
        rule = db.get(ReminderRule, occ.rule_id)
        u = db.get(User, occ.user_id)
        writer.writerow([
            rule.name if rule else "",
            u.full_name if u else "",
            occ.due_date.isoformat(),
            occ.status,
            occ.acknowledged_at.isoformat() if occ.acknowledged_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reminder-compliance.csv"},
    )
