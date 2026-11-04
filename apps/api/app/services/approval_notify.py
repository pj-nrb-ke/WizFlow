"""Notify approvers in-app and by email with magic approval links."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import Company, User, WorkflowDefinition, WorkflowInstance
from app.services import approval_tokens
from app.services.brevo_mail import send_approval_email
from app.services.company_settings import branding_from_settings
from app.services.notifications import notify_users

logger = logging.getLogger("wizflow.approval_notify")


def notify_approvers_for_step(
    db: Session,
    *,
    instance: WorkflowInstance,
    defn: WorkflowDefinition,
    step_id: str,
    title: str | None = None,
    body: str | None = None,
) -> None:
    if not instance.assignees:
        return
    t = title or f"Approval needed: {instance.workflow_name}"
    b = body or "A request is waiting for your approval."
    user_ids: list[UUID] = []
    for a in instance.assignees:
        if a.get("user_id"):
            uid = UUID(a["user_id"])
            # The originator can't approve their own request (self-approval guard),
            # so don't send them an "approval needed" email — they get a progress
            # update via notify_originator_decision instead.
            if uid == instance.originator_user_id:
                continue
            user_ids.append(uid)

    notify_users(
        db,
        company_id=instance.company_id,
        user_ids=user_ids,
        title=t,
        body=b,
        instance_id=instance.id,
        send_email=False,
    )

    company = db.get(Company, instance.company_id)
    branding = branding_from_settings(company.settings if company else None)
    client_name = company.name if company else None

    for uid in user_ids:
        user = db.get(User, uid)
        if not user or not user.email:
            continue
        raw = approval_tokens.create_approval_token(
            db,
            company_id=instance.company_id,
            instance=instance,
            user_id=uid,
            step_id=step_id,
        )
        url = approval_tokens.build_approval_url(raw)
        summary = approval_tokens.public_request_summary(db, instance, defn, step_id)
        ref = instance.reference_number or ""
        subject_line = f"{t} [{ref}]" if ref else t
        send_approval_email(
            to_email=user.email,
            to_name=user.full_name,
            subject=subject_line,
            workflow_name=summary["workflow_name"],
            step_name=summary["step_name"] or step_id,
            originator_name=summary["originator_name"],
            request_preview=summary["request_preview"],
            approval_url=url,
            client_logo_url=branding.get("logo_url"),
            client_name=client_name,
        )


def notify_originator_decision(
    db: Session,
    *,
    instance: WorkflowInstance,
    defn: WorkflowDefinition,
    action: str,
    actor_user_id: UUID,
    comment: str | None = None,
) -> None:
    """Notify request initiator in-app and by email when a step is approved or rejected."""
    if not instance.originator_user_id:
        return
    originator = db.get(User, instance.originator_user_id)
    if not originator:
        return
    actor = db.get(User, actor_user_id)
    actor_name = actor.full_name if actor else "An approver"

    ref = instance.reference_number or ""
    # Callers pass the present-tense action ("approve"/"reject"); accept the
    # past-tense form too so this never silently no-ops again.
    if action in ("approve", "approved"):
        if instance.status == "approved":
            status_label = "fully approved"
            title = f"Request fully approved: {instance.workflow_name}"
        else:
            step_name = next(
                (s.get("name") for s in (defn.steps or []) if s.get("id") == instance.current_step_id),
                None,
            )
            status_label = (
                f"approved and moved to the '{step_name}' step"
                if step_name
                else "approved at the current step — awaiting the next approver"
            )
            title = f"Request moved forward: {instance.workflow_name}"
    elif action in ("reject", "rejected"):
        status_label = "rejected"
        title = f"Request rejected: {instance.workflow_name}"
    else:
        return

    body = (
        f"Your request{f' {ref}' if ref else ''} was {status_label} by {actor_name}"
        + (f' — "{comment}"' if comment else "")
        + "."
    )
    notify_users(
        db,
        company_id=instance.company_id,
        user_ids=[originator.id],
        title=title,
        body=body,
        instance_id=instance.id,
        send_email=False,
    )

    from app.config import settings
    from app.services.brevo_mail import send_request_status_email

    app_url = settings.app_url.rstrip("/")
    view_url = f"{app_url}/requests/{instance.id}"
    company = db.get(Company, instance.company_id)
    branding = branding_from_settings(company.settings if company else None)
    send_request_status_email(
        to_email=originator.email,
        to_name=originator.full_name,
        subject=f"{title} [{ref}]" if ref else title,
        workflow_name=instance.workflow_name,
        status_label=status_label,
        actor_name=actor_name,
        comment=comment,
        view_url=view_url,
        client_logo_url=branding.get("logo_url"),
        client_name=company.name if company else None,
    )
