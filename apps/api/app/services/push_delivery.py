"""Expo push notification delivery for registered mobile devices."""

from __future__ import annotations

import logging
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import DevicePushToken, User
from app.services.company_settings import user_notification_preferences

logger = logging.getLogger("wizflow.push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push_to_users(
    db: Session,
    *,
    user_ids: list[UUID],
    title: str,
    body: str,
    instance_id: UUID | None = None,
    actionable: bool = False,
) -> None:
    if not user_ids or not settings.expo_push_enabled:
        return

    messages: list[dict] = []
    for uid in user_ids:
        user = db.get(User, uid)
        if not user:
            continue
        prefs = user_notification_preferences(user)
        if not prefs.get("in_app", True) or not prefs.get("push", True):
            continue

        tokens = list(db.scalars(select(DevicePushToken.token).where(DevicePushToken.user_id == uid)))
        for token in tokens:
            if not token or not token.startswith("ExponentPushToken"):
                continue
            payload: dict = {
                "to": token,
                "title": title[:200],
                "body": body[:500],
                "sound": "default",
                "data": {},
            }
            if instance_id:
                payload["data"] = {"instance_id": str(instance_id)}
            if actionable and instance_id:
                payload["categoryId"] = "approval_actions"
            messages.append(payload)

    if not messages:
        return

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if settings.expo_push_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_push_access_token}"

    try:
        for i in range(0, len(messages), 100):
            chunk = messages[i : i + 100]
            resp = httpx.post(EXPO_PUSH_URL, json=chunk, headers=headers, timeout=15.0)
            if resp.status_code >= 400:
                logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:300])
                continue
            for item in (resp.json().get("data") or []):
                if item.get("status") == "error":
                    logger.info("Expo push ticket error: %s", item.get("message"))
    except Exception as exc:
        logger.warning("Expo push send failed: %s", exc)
