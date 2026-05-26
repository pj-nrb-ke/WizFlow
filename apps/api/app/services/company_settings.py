"""Company settings helpers (branding, etc.)."""

from __future__ import annotations

DEFAULT_NOTIFICATION_PREFERENCES = {"email": True, "in_app": True, "push": True, "whatsapp": False}


def branding_from_settings(settings: dict | None) -> dict:
    raw = (settings or {}).get("branding") or {}
    if not isinstance(raw, dict):
        raw = {}
    return {
        "logo_url": raw.get("logo_url"),
        "brand_color": raw.get("brand_color"),
        "display_name": raw.get("display_name"),
    }


def merge_branding(settings: dict | None, update: dict) -> dict:
    merged = dict(settings or {})
    branding = dict(merged.get("branding") or {})
    for key in ("logo_url", "brand_color", "display_name"):
        if key in update and update[key] is not None:
            branding[key] = update[key]
    merged["branding"] = branding
    return merged


def user_notification_preferences(user) -> dict:
    prefs = getattr(user, "notification_preferences", None)
    if not prefs:
        return dict(DEFAULT_NOTIFICATION_PREFERENCES)
    return {
        "email": bool(prefs.get("email", True)),
        "in_app": bool(prefs.get("in_app", True)),
        "push": bool(prefs.get("push", True)),
        "whatsapp": bool(prefs.get("whatsapp", False)),
    }
