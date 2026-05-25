"""Transactional email via Brevo API (preferred) or SMTP."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from app.config import settings
from app.services.brevo_config import load_brevo_secrets

logger = logging.getLogger("wizflow.brevo_mail")

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def _mail_settings() -> dict[str, str]:
    secrets = load_brevo_secrets()
    return {
        "host": secrets.get("SMTP_HOST") or settings.smtp_host,
        "port": str(secrets.get("SMTP_PORT") or settings.smtp_port),
        "user": secrets.get("SMTP_USER") or settings.smtp_user,
        "password": secrets.get("SMTP_PASS") or settings.smtp_pass,
        "api_key": secrets.get("BREVO_API_KEY") or "",
        "from_addr": secrets.get("MAIL_FROM")
        or secrets.get("SMTP_USER")
        or settings.smtp_user
        or "noreply@wizflow.biz",
        "from_name": secrets.get("MAIL_FROM_NAME") or "WizFlow",
    }


def _build_bodies(
    *,
    to_name: str,
    workflow_name: str,
    step_name: str,
    originator_name: str,
    request_preview: dict,
    approval_url: str,
) -> tuple[str, str]:
    preview_lines = "\n".join(f"  • {k}: {v}" for k, v in request_preview.items())
    text_body = f"""Hello {to_name},

You have a pending approval in WizFlow.

Workflow: {workflow_name}
Step: {step_name}
Submitted by: {originator_name or "—"}

Request details:
{preview_lines or "  (no preview fields)"}

Open this secure link to approve or reject (no login required; link expires in 7 days):
{approval_url}

— WizFlow
"""
    html_preview = "".join(
        f"<tr><td style='padding:4px 8px;color:#64748b'>{k}</td>"
        f"<td style='padding:4px 8px'><strong>{v}</strong></td></tr>"
        for k, v in request_preview.items()
    )
    html_body = f"""<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#1e293b">
<p>Hello {to_name},</p>
<p>You have a pending approval in <strong>WizFlow</strong>.</p>
<table style="margin:16px 0;border-collapse:collapse">
<tr><td colspan="2" style="padding-bottom:8px"><strong>{workflow_name}</strong></td></tr>
<tr><td style="color:#64748b">Step</td><td>{step_name}</td></tr>
<tr><td style="color:#64748b">Submitted by</td><td>{originator_name or "—"}</td></tr>
</table>
<table style="margin:8px 0;border-collapse:collapse">{html_preview}</table>
<p style="margin:24px 0">
<a href="{approval_url}" style="background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Review &amp; decide</a>
</p>
<p style="font-size:12px;color:#94a3b8">This link works without logging in and expires in 7 days.</p>
</body></html>"""
    return text_body, html_body


def _send_via_api(
    cfg: dict[str, str],
    *,
    to_email: str,
    to_name: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:
    payload = {
        "sender": {"name": cfg["from_name"], "email": cfg["from_addr"]},
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body,
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            BREVO_API_URL,
            headers={"api-key": cfg["api_key"], "accept": "application/json"},
            json=payload,
        )
    if res.status_code >= 400:
        raise RuntimeError(f"Brevo API {res.status_code}: {res.text[:300]}")


def _send_via_smtp(
    cfg: dict[str, str],
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_addr']}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    port = int(cfg["port"])
    with smtplib.SMTP(cfg["host"], port, timeout=30) as server:
        server.ehlo()
        if port != 25:
            server.starttls()
            server.ehlo()
        if cfg["user"] and cfg["password"]:
            server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from_addr"], [to_email], msg.as_string())


def send_approval_email(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    workflow_name: str,
    step_name: str,
    originator_name: str,
    request_preview: dict,
    approval_url: str,
) -> bool:
    """Send approval email. Returns True if sent, False if logged-only (dev)."""
    cfg = _mail_settings()
    if not cfg["host"] and not cfg["api_key"]:
        logger.info(
            "Approval email (dev): to=%s url=%s workflow=%s",
            to_email,
            approval_url,
            workflow_name,
        )
        return False

    text_body, html_body = _build_bodies(
        to_name=to_name,
        workflow_name=workflow_name,
        step_name=step_name,
        originator_name=originator_name,
        request_preview=request_preview,
        approval_url=approval_url,
    )

    errors: list[str] = []

    if cfg["api_key"]:
        try:
            _send_via_api(
                cfg,
                to_email=to_email,
                to_name=to_name,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            logger.info("Sent approval email via Brevo API to %s", to_email)
            return True
        except Exception as e:
            errors.append(f"API: {e}")
            logger.warning("Brevo API send failed for %s: %s", to_email, e)

    if cfg["host"]:
        try:
            _send_via_smtp(
                cfg,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            logger.info("Sent approval email via SMTP to %s", to_email)
            return True
        except Exception as e:
            errors.append(f"SMTP: {e}")
            logger.warning("Brevo SMTP send failed for %s: %s", to_email, e)

    if errors:
        logger.error("All email methods failed for %s: %s", to_email, "; ".join(errors))
    return False
