"""Send a one-off test approval email (verifies brevo.local.txt + SMTP).

Run: docker compose exec api python -m scripts.test_brevo_smtp
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.services.brevo_config import load_brevo_secrets
from app.services.brevo_mail import send_approval_email

TO = "admin@demo.wizflow.biz"


def main() -> None:
    secrets = load_brevo_secrets(reload=True)
    if not secrets.get("SMTP_HOST") and not settings.smtp_host:
        print("FAIL: No SMTP_HOST in brevo.local.txt or .env")
        sys.exit(1)
    print(f"SMTP host: {secrets.get('SMTP_HOST') or settings.smtp_host}")
    print(f"APP_URL: {settings.app_url}")
    print(f"Sending test approval email to {TO} ...")
    ok = send_approval_email(
        to_email=TO,
        to_name="Demo Admin",
        subject="WizFlow — Brevo test",
        workflow_name="SMTP connectivity test",
        step_name="Test step",
        originator_name="WizFlow",
        request_preview={"status": "ok", "note": "If you received this, Brevo is configured."},
        approval_url=f"{settings.app_url.rstrip('/')}/approve/test-token-placeholder",
    )
    if ok:
        print("SUCCESS. Check inbox and Brevo → Transactional → Email logs.")
    else:
        print("FAIL. Fix BREVO_API_KEY or SMTP_PASS in config/secrets/brevo.local.txt")
        sys.exit(1)


if __name__ == "__main__":
    main()
