# Email integration with Brevo (`brevo.local.txt`)

This document describes how WizFlow integrates transactional email via [Brevo](https://app.brevo.com), using a **gitignored secrets file** that other agents and apps can reuse without committing credentials.

---

## Goals

- Keep SMTP/API keys **out of git** (no `.env` commits for production secrets).
- Use one **standard file format** (`brevo.local.txt`) across projects in this repo.
- Support **Brevo REST API** (preferred) and **SMTP relay** (fallback).
- Allow **Docker** and **local dev** to load the same file from known paths.

---

## File layout

| Path | Purpose |
|------|---------|
| `config/secrets/brevo.local.example.txt` | Committed template — copy and fill in |
| `config/secrets/brevo.local.txt` | **Real credentials** — gitignored, never commit |
| `config/secrets/README.md` | Short human setup notes |

Optional fallback (also gitignored):

- `secrets/brevo.local.txt` at repo root

### Example file (`brevo.local.example.txt`)

```ini
# Copy to brevo.local.txt and fill from Brevo → Transactional → SMTP & API

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-login@example.com
SMTP_PASS=your-xsmtpsib-smtp-key
MAIL_FROM=noreply@yourdomain.com
MAIL_FROM_NAME=WizFlow
BREVO_API_KEY=your-xkeysib-api-key
```

### Format rules

- One `KEY=value` per line (case-insensitive keys; stored uppercase).
- Lines starting with `#` are comments.
- Values may be wrapped in single or double quotes; quotes are stripped on load.
- No spaces around `=` required; leading/trailing whitespace on values is trimmed.

### Required keys (at least one send path)

| Key | Source in Brevo | Notes |
|-----|-----------------|--------|
| `SMTP_HOST` | SMTP tab | Usually `smtp-relay.brevo.com` |
| `SMTP_PORT` | SMTP tab | Usually `587` |
| `SMTP_USER` | SMTP tab | **SMTP login email**, not your Brevo account email unless shown |
| `SMTP_PASS` | SMTP tab | **SMTP key** (`xsmtpsib-…`), not account password |
| `MAIL_FROM` | Senders | Must be a **verified sender** in Brevo |
| `MAIL_FROM_NAME` | App branding | Display name in From header |
| `BREVO_API_KEY` | API keys tab | **API key** (`xkeysib-…`); used first if set |

### Common mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Account password in `SMTP_PASS` | SMTP `535 Authentication failed` | Use **SMTP key** from SMTP tab |
| API key in `SMTP_PASS` | SMTP auth fails | API key is `xkeysib-…`; SMTP key is `xsmtpsib-…` |
| SMTP key in `BREVO_API_KEY` | API `401 Key not found` | WizFlow auto-swaps by prefix; fix file for clarity |
| Unverified `MAIL_FROM` | API `400` / poor deliverability | Add and verify sender in Brevo |
| Wrong `APP_URL` | Broken links in emails | Set in `infra/docker/.env` (see below) |

**Key prefixes (validation):**

- `BREVO_API_KEY` → should start with `xkeysib-` (typically ~90 chars)
- `SMTP_PASS` → should start with `xsmtpsib-` (typically 40+ chars)

---

## Gitignore

Ensure these lines exist in the repo `.gitignore`:

```gitignore
config/secrets/brevo.local.txt
secrets/brevo.local.txt
```

Commit only `brevo.local.example.txt`, never `brevo.local.txt`.

---

## Docker

Mount the config folder read-only into the API container:

```yaml
# infra/docker/docker-compose.yml (api service)
volumes:
  - ../../config:/config:ro
```

Inside the container, the loader checks **`/config/secrets/brevo.local.txt` first**.

Restart after changing secrets:

```bash
cd infra/docker
docker compose up -d api
```

---

## WizFlow implementation map

| Component | Path | Role |
|-----------|------|------|
| Loader | `apps/api/app/services/brevo_config.py` | Find file, parse, normalize swapped keys, cache |
| Sender | `apps/api/app/services/brevo_mail.py` | API → SMTP → dev log fallback |
| Approval emails | `apps/api/app/services/approval_notify.py` | Builds magic link + calls `send_approval_email` |
| Env fallback | `apps/api/app/config.py` | `smtp_*`, `app_url` from `.env` if file keys missing |

### Load order (`load_brevo_secrets`)

1. `/config/secrets/brevo.local.txt` (Docker)
2. Walk parents from `brevo_config.py` for `config/secrets/brevo.local.txt` or `secrets/brevo.local.txt`
3. Stop at **first file that exists** and has at least one key
4. Apply `_normalize_secrets()` (swap `xsmtpsib-` / `xkeysib-` if pasted into wrong variable)
5. Cache until `load_brevo_secrets(reload=True)`

### Send order (`send_approval_email`)

1. If `BREVO_API_KEY` set → `POST https://api.brevo.com/v3/smtp/email` with header `api-key`
2. Else if `SMTP_HOST` set → SMTP STARTTLS on port 587 (or configured port)
3. Else → log only (dev mode): no credentials

Payload uses `MAIL_FROM` + `MAIL_FROM_NAME` as sender; HTML + plain text bodies.

### Approval link base URL

Links in emails use `settings.app_url` from `infra/docker/.env`:

```ini
APP_URL=http://localhost:8090
```

Use the URL where users open the web app (nginx on **8090** or Vite on **5200**). Path pattern: `{APP_URL}/approve/{token}`.

---

## Setup checklist (human or agent)

1. Copy `config/secrets/brevo.local.example.txt` → `config/secrets/brevo.local.txt`.
2. In Brevo: **Transactional** → **SMTP & API**.
   - Copy **API key** → `BREVO_API_KEY` (optional but preferred).
   - Copy **SMTP login** → `SMTP_USER`.
   - Copy **SMTP key** → `SMTP_PASS`.
3. Set `MAIL_FROM` to a verified sender.
4. Set `APP_URL` in `infra/docker/.env` for correct email links.
5. Restart API container.
6. Run validation and test (below).

---

## Verification commands

From `infra/docker`:

```bash
# Key presence and prefix checks (no secret values printed)
docker compose exec api python -m scripts.validate_brevo_config

# Send one test email to admin@demo.wizflow.biz
docker compose exec api python -m scripts.test_brevo_smtp

# Submit a demo request (triggers real approval email)
docker compose exec api python -m scripts.test_submit_email_e2e
```

Success: `test_brevo_smtp` prints `SUCCESS`; check inbox and Brevo → **Transactional** → **Email logs**.

---

## Integrating email in another app (agent guide)

Reuse the **same file** and conventions; adapt only the send function and templates.

### Step 1 — Add secrets file

```bash
mkdir -p config/secrets
cp config/secrets/brevo.local.example.txt config/secrets/brevo.local.txt
# Edit brevo.local.txt (gitignored)
```

### Step 2 — Copy or reimplement the loader

Minimal Python (no WizFlow dependency):

```python
from pathlib import Path

def load_brevo_secrets() -> dict[str, str]:
    candidates = [
        Path("/config/secrets/brevo.local.txt"),
        Path("config/secrets/brevo.local.txt"),
        Path("secrets/brevo.local.txt"),
    ]
    for path in candidates:
        if not path.is_file():
            continue
        out = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            out[k.strip().upper()] = v.strip().strip('"').strip("'")
        if out:
            # Optional: swap xsmtpsib/xkeysib if user pasted into wrong key
            api, smtp = out.get("BREVO_API_KEY", ""), out.get("SMTP_PASS", "")
            if api.startswith("xsmtpsib-"):
                out["SMTP_PASS"], out["BREVO_API_KEY"] = api, (
                    smtp if smtp.startswith("xkeysib-") else ""
                )
            elif smtp.startswith("xkeysib-"):
                out["BREVO_API_KEY"], out["SMTP_PASS"] = smtp, api
            return out
    return {}
```

### Step 3 — Send via Brevo API (recommended)

```python
import httpx

def send_transactional(*, secrets: dict, to_email: str, to_name: str, subject: str, html: str, text: str) -> None:
    payload = {
        "sender": {
            "name": secrets.get("MAIL_FROM_NAME", "App"),
            "email": secrets["MAIL_FROM"],
        },
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    r = httpx.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": secrets["BREVO_API_KEY"], "accept": "application/json"},
        json=payload,
        timeout=30.0,
    )
    r.raise_for_status()
```

Call only when `secrets.get("BREVO_API_KEY")` is set.

### Step 4 — SMTP fallback

Use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` with STARTTLS (port 587), same as `apps/api/app/services/brevo_mail.py` → `_send_via_smtp`.

### Step 5 — Docker / CI

- Mount `config` → `/config:ro`.
- Do **not** inject secrets in CI logs; use masked env or mounted secret volume in deployment.
- Document `validate` + `test` scripts for your service the same way WizFlow does.

### Step 6 — Environment fallback (optional)

Allow `.env` overrides for local dev without the file:

```ini
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
```

Pattern in WizFlow: `secrets.get("SMTP_HOST") or settings.smtp_host`.

---

## WizFlow-specific triggers

Approval emails are sent when:

- A request is **submitted** (`POST /api/v1/workflows/{id}/submit`)
- A step is **approved** and the next step has assignees
- A **returned** request is resubmitted

Each approver gets an in-app notification plus an email with a **magic link** (`/approve/{token}`) from `approval_notify.py` + `approval_tokens.py`.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `No secrets loaded` | File path, Docker mount `../../config:/config:ro`, filename exact `brevo.local.txt` |
| `401 Key not found` | `BREVO_API_KEY` is valid `xkeysib-` key, not SMTP key |
| `535 Authentication failed` | `SMTP_PASS` is `xsmtpsib-` SMTP key; `SMTP_USER` matches Brevo SMTP login |
| Email sent but not received | Brevo logs, spam folder, sender domain authentication (DKIM) |
| Link in email 404 | `APP_URL` matches how users access the frontend |

---

## References

- [Brevo SMTP troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-issues-with-Brevo-SMTP)
- [Brevo SMTP relay API](https://developers.brevo.com/docs/smtp-integration)
- WizFlow code: `apps/api/app/services/brevo_config.py`, `brevo_mail.py`
- Example template: `config/secrets/brevo.local.example.txt`
