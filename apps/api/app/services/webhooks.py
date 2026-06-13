"""Outbound webhooks for workflow events."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import WebhookDelivery, WebhookEndpoint

WEBHOOK_EVENTS = (
    "request.submitted",
    "step.approved",
    "step.rejected",
    "request.returned",
    "workflow.completed",
    "file.uploaded",
)


def generate_webhook_secret() -> str:
    return secrets.token_urlsafe(32)


def dispatch_for_event(
    db: Session,
    *,
    company_id: UUID,
    event_type: str,
    payload: dict,
) -> None:
    if event_type not in WEBHOOK_EVENTS:
        return

    hooks = db.scalars(
        select(WebhookEndpoint).where(
            WebhookEndpoint.company_id == company_id,
            WebhookEndpoint.is_active.is_(True),
        )
    ).all()

    body = {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": payload,
    }
    raw = json.dumps(body, default=str).encode("utf-8")

    for hook in hooks:
        subscribed = hook.events or []
        if subscribed and event_type not in subscribed and "*" not in subscribed:
            continue
        _deliver(db, hook, event_type, body, raw)


def _deliver(
    db: Session,
    hook: WebhookEndpoint,
    event_type: str,
    body: dict,
    raw: bytes,
) -> None:
    sig = hmac.new(hook.secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    delivery = WebhookDelivery(webhook_id=hook.id, event_type=event_type, payload=body)
    db.add(delivery)
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                hook.url,
                content=raw,
                headers={
                    "Content-Type": "application/json",
                    "X-WizFlow-Event": event_type,
                    "X-WizFlow-Signature": f"sha256={sig}",
                },
            )
        delivery.status_code = resp.status_code
        delivery.success = 200 <= resp.status_code < 300
        if not delivery.success:
            delivery.error_message = (resp.text or "")[:500]
    except Exception as e:
        delivery.success = False
        delivery.error_message = str(e)[:500]
    return delivery


def send_test_event(db: Session, hook: WebhookEndpoint) -> WebhookDelivery:
    """Deliver a one-off test payload to a single webhook and return the result."""
    body = {
        "event": "test.ping",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {"message": "Test webhook from WizFlow", "webhook_name": hook.name},
    }
    raw = json.dumps(body, default=str).encode("utf-8")
    delivery = _deliver(db, hook, "test.ping", body, raw)
    db.flush()
    return delivery
