"""SLA alerts, escalations, scheduled reports, recurring workflow triggers."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Company,
    KpiTarget,
    ReportSubscription,
    SlaAlertLog,
    User,
    UserRole,
    Role,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowSchedule,
)
from app.schemas.phase2 import AutomationRunOut
from app.services import analytics as analytics_service
from app.services.assignees import _users_for_role
from app.services.brevo_mail import send_form_invitation_email, send_plain_email
from app.services.events import record_event
from app.services.instance_engine import submit_request
from app.services.notifications import notify_users
from app.services.sla_engine import effective_sla_hours, find_step, is_step_at_risk, is_step_overdue, step_started_at

logger = logging.getLogger("wizflow.phase2")


def _alert_exists(db: Session, instance_id: UUID, alert_type: str, step_id: str | None) -> bool:
    q = select(SlaAlertLog).where(
        SlaAlertLog.instance_id == instance_id,
        SlaAlertLog.alert_type == alert_type,
    )
    if step_id:
        q = q.where(SlaAlertLog.step_id == step_id)
    return db.scalar(q) is not None


def _log_alert(db: Session, *, company_id: UUID, instance_id: UUID, alert_type: str, step_id: str | None) -> None:
    if _alert_exists(db, instance_id, alert_type, step_id):
        return
    db.add(
        SlaAlertLog(
            company_id=company_id,
            instance_id=instance_id,
            alert_type=alert_type,
            step_id=step_id,
        )
    )


def process_sla_alerts(db: Session, *, company_id: UUID | None = None) -> tuple[int, int]:
    """Notify at-risk (80% SLA) and overdue steps. Returns (warnings, breaches)."""
    now = datetime.now(timezone.utc)
    q = select(WorkflowInstance).where(WorkflowInstance.status == "in_progress")
    if company_id:
        q = q.where(WorkflowInstance.company_id == company_id)
    warnings = breaches = 0

    for inst in db.scalars(q):
        defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
        if not defn:
            continue
        step_id = inst.current_step_id or ""
        if is_step_overdue(db, inst, defn, now=now):
            if not _alert_exists(db, inst.id, "sla_breach", step_id):
                _log_alert(db, company_id=inst.company_id, instance_id=inst.id, alert_type="sla_breach", step_id=step_id)
                user_ids = [a.get("user_id") for a in (inst.assignees or []) if a.get("user_id")]
                if inst.originator_user_id:
                    user_ids.append(str(inst.originator_user_id))
                notify_users(
                    db,
                    company_id=inst.company_id,
                    user_ids=[UUID(x) for x in user_ids if x],
                    title=f"Overdue: {inst.workflow_name}",
                    body=f"Request {inst.reference_number or inst.id} exceeded the SLA for the current step.",
                    instance_id=inst.id,
                )
                breaches += 1
        elif is_step_at_risk(db, inst, defn, now=now):
            if not _alert_exists(db, inst.id, "sla_warning", step_id):
                _log_alert(db, company_id=inst.company_id, instance_id=inst.id, alert_type="sla_warning", step_id=step_id)
                user_ids = [a.get("user_id") for a in (inst.assignees or []) if a.get("user_id")]
                notify_users(
                    db,
                    company_id=inst.company_id,
                    user_ids=[UUID(x) for x in user_ids if x],
                    title=f"SLA warning: {inst.workflow_name}",
                    body=f"Request {inst.reference_number or ''} is approaching its deadline.",
                    instance_id=inst.id,
                )
                warnings += 1
    return warnings, breaches


def process_escalations(db: Session, *, company_id: UUID | None = None) -> int:
    """Escalate overdue instances to managers when workflow settings enable it."""
    now = datetime.now(timezone.utc)
    q = select(WorkflowInstance).where(WorkflowInstance.status == "in_progress")
    if company_id:
        q = q.where(WorkflowInstance.company_id == company_id)
    count = 0

    for inst in db.scalars(q):
        defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
        if not defn:
            continue
        esc = (defn.settings or {}).get("escalation") or {}
        if not esc.get("enabled", True):
            continue
        if not is_step_overdue(db, inst, defn, now=now):
            continue
        step_id = inst.current_step_id or ""
        if _alert_exists(db, inst.id, "escalated", step_id):
            continue
        role = esc.get("escalate_to_role") or "manager"
        managers = _users_for_role(db, inst.company_id, role)
        if not managers:
            continue
        _log_alert(db, company_id=inst.company_id, instance_id=inst.id, alert_type="escalated", step_id=step_id)
        notify_users(
            db,
            company_id=inst.company_id,
            user_ids=[m.id for m in managers],
            title=f"Escalation: {inst.workflow_name}",
            body=f"Overdue approval on {inst.reference_number or 'request'} requires manager attention.",
            instance_id=inst.id,
        )
        record_event(
            db,
            company_id=inst.company_id,
            event_type="step.escalated",
            actor_user_id=None,
            instance_id=inst.id,
            payload={"step_id": step_id, "escalate_to_role": role},
        )
        count += 1
    db.commit()
    return count


def _frequency_due(last: datetime | None, frequency: str, now: datetime) -> bool:
    if last is None:
        return True
    delta = now - last
    if frequency == "daily":
        return delta >= timedelta(days=1)
    if frequency == "weekly":
        return delta >= timedelta(days=7)
    if frequency == "monthly":
        return delta >= timedelta(days=28)
    return delta >= timedelta(days=7)


def _build_report_body(db: Session, sub: ReportSubscription) -> str:
    ctx = analytics_service.AnalyticsContext(
        company_id=sub.company_id,
        from_date=None,
        to_date=None,
        workflow_id=None,
    )
    f = sub.filters or {}
    if f.get("from"):
        ctx.from_date = datetime.fromisoformat(str(f["from"]).replace("Z", "+00:00"))
    if f.get("to"):
        ctx.to_date = datetime.fromisoformat(str(f["to"]).replace("Z", "+00:00"))
    if f.get("workflow_id"):
        ctx.workflow_id = UUID(str(f["workflow_id"]))

    if sub.report_type == "executive_summary":
        s = analytics_service.executive_summary(db, ctx)
        return (
            f"WizFlow report: {sub.name}\n\n"
            f"Total requests: {s.total_requests}\n"
            f"In progress: {s.in_progress}\n"
            f"Overdue: {s.overdue_count}\n"
            f"SLA compliance: {s.sla_compliance_pct}%\n"
            f"Rejection rate: {s.rejection_rate}%\n"
        )
    exc = analytics_service.exceptions_summary(db, ctx)
    return (
        f"WizFlow report: {sub.name}\n\n"
        f"Rejected: {exc.rejected_count}\n"
        f"Returned: {exc.returned_count}\n"
        f"Overdue: {exc.overdue_count}\n"
    )


def process_report_subscriptions(db: Session, *, company_id: UUID | None = None) -> int:
    now = datetime.now(timezone.utc)
    q = select(ReportSubscription).where(ReportSubscription.is_active.is_(True))
    if company_id:
        q = q.where(ReportSubscription.company_id == company_id)
    sent = 0
    for sub in db.scalars(q):
        if not _frequency_due(sub.last_sent_at, sub.frequency, now):
            continue
        user = db.get(User, sub.user_id)
        if not user or not user.email:
            continue
        body = _build_report_body(db, sub)
        try:
            send_plain_email(user.email, f"WizFlow — {sub.name}", body)
        except Exception as e:
            logger.warning("Report email failed for %s: %s", sub.id, e)
            continue
        sub.last_sent_at = now
        sent += 1
    db.commit()
    return sent


def _send_form_schedule(db: Session, sched: WorkflowSchedule, defn: WorkflowDefinition, now: datetime) -> int:
    """Send form invitation emails for a send_form schedule. Returns number of emails sent."""
    sender = db.get(User, sched.initiator_user_id) if sched.initiator_user_id else None
    sender_name = (sender.full_name or sender.email) if sender else "WizFlow"
    company = db.get(Company, sched.company_id)
    company_name = company.name if company else "WizFlow"

    from app.config import settings as _settings
    form_url = f"{_settings.app_url}/submit?wf={defn.id}"

    sent = 0
    for uid_str in (sched.recipient_user_ids or []):
        try:
            import uuid as _uuid
            uid = _uuid.UUID(str(uid_str))
        except (ValueError, AttributeError):
            continue
        recipient = db.get(User, uid)
        if not recipient or recipient.company_id != sched.company_id:
            continue
        try:
            ok = send_form_invitation_email(
                to_email=recipient.email,
                to_name=recipient.full_name or recipient.email,
                sender_name=sender_name,
                company_name=company_name,
                workflow_name=defn.name,
                form_url=form_url,
            )
            if ok:
                sent += 1
        except Exception as e:
            logger.warning("Form schedule %s email to %s failed: %s", sched.id, recipient.email, e)
    return sent


def process_workflow_schedules(db: Session, *, company_id: UUID | None = None) -> int:
    now = datetime.now(timezone.utc)
    q = select(WorkflowSchedule).where(WorkflowSchedule.is_active.is_(True))
    if company_id:
        q = q.where(WorkflowSchedule.company_id == company_id)
    ran = 0
    for sched in db.scalars(q):
        defn = db.get(WorkflowDefinition, sched.workflow_definition_id)
        if not defn or defn.status != "published":
            continue

        # ── send_form type: email recipients ──
        if getattr(sched, "schedule_type", "auto_submit") == "send_form":
            due = False
            if sched.frequency == "once":
                due = (sched.next_run_at is not None
                       and sched.last_run_at is None
                       and now >= sched.next_run_at)
            else:
                due = _frequency_due(sched.last_run_at, sched.frequency, now)
            if not due:
                continue
            try:
                _send_form_schedule(db, sched, defn, now)
                sched.last_run_at = now
                if sched.frequency == "once":
                    sched.is_active = False
                ran += 1
            except Exception as e:
                logger.warning("Form schedule %s failed: %s", sched.id, e)
            continue

        # ── auto_submit type: create workflow instance ──
        if not _frequency_due(sched.last_run_at, sched.frequency, now):
            continue
        uid = sched.initiator_user_id
        if not uid:
            admin = db.scalar(
                select(User)
                .join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .where(User.company_id == sched.company_id, Role.slug == "company_admin")
                .limit(1)
            )
            uid = admin.id if admin else None
        if not uid:
            continue
        try:
            submit_request(
                db,
                defn=defn,
                user_id=uid,
                company_id=sched.company_id,
                data=dict(sched.default_data or {}),
            )
            sched.last_run_at = now
            ran += 1
        except Exception as e:
            logger.warning("Schedule %s failed: %s", sched.id, e)
    db.commit()
    return ran


def run_all_automation(db: Session, *, company_id: UUID | None = None) -> AutomationRunOut:
    from app.services.reminders import process_reminder_rules
    from app.services.recurring_activities import (
        process_activity_reminders,
        process_recurring_activities,
    )

    warnings, breaches = process_sla_alerts(db, company_id=company_id)
    db.commit()
    escalations = process_escalations(db, company_id=company_id)
    reports = process_report_subscriptions(db, company_id=company_id)
    schedules = process_workflow_schedules(db, company_id=company_id)
    reminders = process_reminder_rules(db, company_id=company_id)
    activities_opened = process_recurring_activities(db, company_id=company_id)
    activity_reminders = process_activity_reminders(db, company_id=company_id)
    return AutomationRunOut(
        sla_warnings=warnings,
        sla_breaches=breaches,
        escalations=escalations,
        reports_sent=reports,
        schedules_run=schedules,
        reminders_sent=reminders,
        activities_opened=activities_opened,
        activity_reminders=activity_reminders,
    )
