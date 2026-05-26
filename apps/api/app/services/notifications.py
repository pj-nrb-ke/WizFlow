"""In-app notifications and optional email (P4)."""

from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Notification, User

logger = logging.getLogger("wizflow.notifications")


def notify_users(
    db: Session,
    *,
    company_id: UUID,
    user_ids: list[UUID],
    title: str,
    body: str,
    instance_id: UUID | None = None,
    send_email: bool = True,
    send_push: bool = True,
    push_actionable: bool | None = None,
) -> None:
    for uid in user_ids:
        db.add(
            Notification(
                company_id=company_id,
                user_id=uid,
                instance_id=instance_id,
                title=title,
                body=body,
            )
        )
        if send_email:
            user = db.get(User, uid)
            if user and user.email:
                send_email_notification(user.email, title, body)

    if send_push and user_ids:
        from app.services.push_delivery import send_push_to_users

        actionable = push_actionable
        if actionable is None:
            actionable = bool(instance_id and "approval" in title.lower())
        send_push_to_users(
            db,
            user_ids=user_ids,
            title=title,
            body=body,
            instance_id=instance_id,
            actionable=actionable,
        )


def send_email_notification(to_email: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        logger.info("Email (dev log): to=%s subject=%s body=%s", to_email, subject, body)
        return
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user or "noreply@wizflow.biz"
        msg["To"] = to_email
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user and settings.smtp_pass:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_pass)
            server.send_message(msg)
    except Exception as e:
        logger.warning("Failed to send email to %s: %s", to_email, e)
