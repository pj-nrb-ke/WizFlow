"""Validate brevo.local.txt key formats (no secret values printed).

Run: docker compose exec api python -m scripts.validate_brevo_config
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.brevo_config import load_brevo_secrets

def main() -> None:
    s = load_brevo_secrets()
    ok = True

    def check(name: str, value: str, *, prefix: str | None = None, min_len: int = 8) -> None:
        nonlocal ok
        if not value:
            print(f"  {name}: MISSING")
            ok = False
            return
        if value != value.strip():
            print(f"  {name}: remove leading/trailing spaces")
            ok = False
        if len(value) < min_len:
            print(f"  {name}: too short (len={len(value)})")
            ok = False
        if prefix and not value.startswith(prefix):
            print(f"  {name}: should start with '{prefix}' (got '{value[:min(12, len(value))]}…')")
            ok = False
        if prefix and value.startswith(prefix):
            print(f"  {name}: OK (len={len(value)})")

    print("Brevo config check:")
    if not s:
        print("  No secrets loaded. Create config/secrets/brevo.local.txt")
        sys.exit(1)

    check("SMTP_HOST", s.get("SMTP_HOST", ""), min_len=5)
    check("SMTP_USER", s.get("SMTP_USER", ""), min_len=5)
    check("MAIL_FROM", s.get("MAIL_FROM", ""), min_len=5)
    check("BREVO_API_KEY", s.get("BREVO_API_KEY", ""), prefix="xkeysib-", min_len=60)
    check("SMTP_PASS", s.get("SMTP_PASS", ""), prefix="xsmtpsib-", min_len=40)

    if ok:
        print("\nFormats look good. Run: python -m scripts.test_brevo_smtp")
        sys.exit(0)
    print("\nFix brevo.local.txt using keys from Brevo → Transactional → SMTP & API.")
    print("  API key tab → BREVO_API_KEY (xkeysib-…)")
    print("  SMTP tab → SMTP_USER + SMTP_PASS (xsmtpsib-…, not account password)")
    sys.exit(1)


if __name__ == "__main__":
    main()
