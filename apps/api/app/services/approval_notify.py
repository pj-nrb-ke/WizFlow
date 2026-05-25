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
