"""Notify approvers in-app and by email with magic approval links."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import User, WorkflowDefinition, WorkflowInstance
from app.services import approval_tokens
from app.services.brevo_mail import send_approval_email
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
            user_ids.append(UUID(a["user_id"]))

    notify_users(
        db,
        company_id=instance.company_id,
        user_ids=user_ids,
        title=t,
        body=b,
        instance_id=instance.id,
        send_email=False,
    )

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
    if action == "approved":
        if instance.status == "approved":
            status_label = "fully approved"
        else:
            status_label = "approved at current step — awaiting next approver"
        title = f"Request approved: {instance.workflow_name}"
    elif action == "rejected":
        status_label = "rejected"
        title = f"Request rejected: {instance.workflow_name}"
    else:
        return

    body = (
        f"{actor_name} {status_label} your request"
        + (f' — "{comment}"' if comment else "")
        + (f" ({ref})" if ref else "")
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
    send_request_status_email(
        to_email=originator.email,
        to_name=originator.full_name,
        subject=f"{title} [{ref}]" if ref else title,
        workflow_name=instance.workflow_name,
        status_label=status_label,
        actor_name=actor_name,
        comment=comment,
        view_url=view_url,
    )
