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


def send_request_status_email(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    workflow_name: str,
    status_label: str,
    actor_name: str,
    comment: str | None,
    view_url: str,
) -> bool:
    """Email initiator when their request is approved or rejected."""
    cfg = _mail_settings()
    if not cfg["host"] and not cfg["api_key"]:
        logger.info(
            "Status email (dev): to=%s status=%s workflow=%s",
            to_email,
            status_label,
            workflow_name,
        )
        return False

    comment_line = f'\nComment: "{comment}"' if comment else ""
    text_body = f"""Hello {to_name},

Your WizFlow request was updated.

Workflow: {workflow_name}
Status: {status_label}
Updated by: {actor_name}{comment_line}

View your request:
{view_url}

— WizFlow
"""
    html_body = f"""<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#1e293b">
<p>Hello {to_name},</p>
<p>Your request <strong>{workflow_name}</strong> was <strong>{status_label}</strong> by {actor_name}.</p>
{"<p><em>" + comment + "</em></p>" if comment else ""}
<p><a href="{view_url}" style="background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">View request</a></p>
</body></html>"""

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
            return True
        except Exception as e:
            errors.append(str(e))
    if cfg["host"]:
        try:
            _send_via_smtp(
                cfg,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            return True
        except Exception as e:
            errors.append(str(e))
    if errors:
        logger.warning("Status email failed for %s: %s", to_email, errors)
    return False


def send_invite_email(
    *,
    to_email: str,
    invited_by_name: str,
    company_name: str,
    invite_url: str,
) -> bool:
    """Send a user invitation email with a secure accept link."""
    cfg = _mail_settings()
    if not cfg["api_key"] and not cfg["host"]:
        logger.info("Invite email skipped (no mail config): %s", to_email)
        return False

    subject = f"You've been invited to join {company_name} on WizFlow"
    text_body = f"""Hello,

{invited_by_name} has invited you to join {company_name} on WizFlow — a workflow approval platform.

Click the link below to set up your account (link expires in 72 hours):
{invite_url}

If you weren't expecting this invitation, you can ignore this email.

— WizFlow
"""
    html_body = f"""<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:480px;margin:0 auto;padding:24px">
<div style="text-align:center;margin-bottom:32px">
  <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#4f46e5;border-radius:14px;margin-bottom:12px">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.75" stroke-linecap="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>
  </div>
  <h1 style="font-size:20px;font-weight:700;margin:0">WizFlow</h1>
</div>
<h2 style="font-size:18px;font-weight:600;margin:0 0 8px">You've been invited</h2>
<p style="color:#475569;margin:0 0 24px"><strong>{invited_by_name}</strong> has invited you to join <strong>{company_name}</strong> on WizFlow.</p>
<a href="{invite_url}" style="display:block;background:#4f46e5;color:#fff;text-align:center;padding:14px 24px;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;margin-bottom:20px">Accept invitation &amp; set up account</a>
<p style="font-size:12px;color:#94a3b8;text-align:center">This link expires in 72 hours. If you weren't expecting this, ignore this email.</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="font-size:12px;color:#94a3b8;text-align:center">WizFlow · Workflow automation for your team</p>
</body></html>"""

    errors: list[str] = []
    if cfg["api_key"]:
        try:
            _send_via_api(cfg, to_email=to_email, to_name=to_email.split("@")[0],
                          subject=subject, text_body=text_body, html_body=html_body)
            logger.info("Sent invite email via Brevo API to %s", to_email)
            return True
        except Exception as e:
            errors.append(str(e))
    if cfg["host"]:
        try:
            _send_via_smtp(cfg, to_email=to_email, subject=subject,
                           text_body=text_body, html_body=html_body)
            logger.info("Sent invite email via SMTP to %s", to_email)
            return True
        except Exception as e:
            errors.append(str(e))
    if errors:
        logger.error("Invite email failed for %s: %s", to_email, errors)
    return False


def send_plain_email(to_email: str, subject: str, text_body: str) -> bool:
    """Simple text email for scheduled reports."""
    cfg = _mail_settings()
    if not cfg["api_key"] and not cfg["host"]:
        logger.info("Email skipped (no mail config): %s", subject)
        return False
    html_body = f"<pre style='font-family:system-ui;white-space:pre-wrap'>{text_body}</pre>"
    if cfg["api_key"]:
        try:
            _send_via_api(
                cfg,
                to_email=to_email,
                to_name=to_email.split("@")[0],
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
            return True
        except Exception as e:
            logger.warning("Plain email API failed: %s", e)
    if cfg["host"]:
        try:
            _send_via_smtp(cfg, to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)
            return True
        except Exception as e:
            logger.warning("Plain email SMTP failed: %s", e)
    return False
