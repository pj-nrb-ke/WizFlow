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


def fetch_logo_bytes(url: str | None, *, max_bytes: int = 3_000_000, timeout: float = 6.0) -> bytes | None:
    """Fetch a branding logo (for embedding in a PDF) from an admin-set URL.

    This is a server-side fetch of a value a company admin controls, so it is a
    trust boundary: SSRF-guarded (no private/loopback/metadata hosts), redirects
    disabled (a public URL can't bounce to an internal one), and size-capped.
    Returns None on any problem — the caller falls back to a text letterhead."""
    if not url:
        return None
    # Lazy imports keep this module light for its many import-time consumers.
    import httpx

    from app.services.webhooks import is_safe_webhook_url

    if not is_safe_webhook_url(url):
        return None
    try:
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            resp = client.get(url)
        if resp.status_code == 200 and 0 < len(resp.content) <= max_bytes:
            return resp.content
    except Exception:
        return None
    return None


def wizgate_from_settings(settings: dict | None) -> dict:
    """Safe view of the WizGate connection (never exposes the stored key)."""
    raw = (settings or {}).get("wizgate")
    if not isinstance(raw, dict):
        raw = {}
    return {
        "site_id": raw.get("site_id"),
        "base_url": raw.get("base_url") or "https://api.wizgate.app",
        "company_db": raw.get("company_db"),
        "configured": bool(raw.get("site_id") and raw.get("api_key_enc")),
    }


def wizgate_credentials(settings: dict | None) -> dict | None:
    """Decrypted connection for server-side calls, or None if not fully configured.
    The readwrite key is stored encrypted (same Fernet as other secrets)."""
    raw = (settings or {}).get("wizgate")
    if not isinstance(raw, dict):
        return None
    from app.core.security import decrypt_secret

    api_key = decrypt_secret(raw.get("api_key_enc"))
    site_id = raw.get("site_id")
    if not (api_key and site_id):
        return None
    return {
        "base_url": raw.get("base_url") or "https://api.wizgate.app",
        "api_key": api_key,
        "site_id": site_id,
        "company_db": raw.get("company_db"),
    }


def merge_wizgate(settings: dict | None, update: dict) -> dict:
    """Merge a WizGate connection update; the api_key is encrypted and only
    (re)written when a new one is supplied, so a save never wipes the key."""
    from app.core.security import encrypt_secret

    merged = dict(settings or {})
    wg = dict(merged.get("wizgate") or {})
    for key in ("site_id", "base_url", "company_db"):
        if update.get(key) is not None:
            wg[key] = str(update[key]).strip()
    if update.get("api_key"):
        wg["api_key_enc"] = encrypt_secret(str(update["api_key"]).strip())
    merged["wizgate"] = wg
    return merged


def company_settings_from_dict(settings: dict | None) -> dict:
    raw = settings or {}
    retention = raw.get("data_retention_days")
    return {
        "data_retention_days": int(retention) if retention is not None else None,
    }


def merge_company_settings(settings: dict | None, update: dict) -> dict:
    merged = dict(settings or {})
    if "data_retention_days" in update:
        merged["data_retention_days"] = update["data_retention_days"]
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
