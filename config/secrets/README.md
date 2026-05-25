# Email secrets (Brevo)

Full integration guide for agents and other apps: [docs/email-integration.md](../../docs/email-integration.md).

1. Copy `brevo.local.example.txt` to `brevo.local.txt` in this folder.
2. From [Brevo](https://app.brevo.com) → **Transactional** → **SMTP & API**:
   - **`BREVO_API_KEY`**: copy the **API key** (`xkeysib-…`) — WizFlow uses this first.
   - **`SMTP_PASS`**: copy the **SMTP key** (`xsmtpsib-…`), not the API key or account password.
   - **`SMTP_USER`**: your SMTP login email shown on that page.
3. Set `MAIL_FROM` to a **verified sender** email in Brevo (same domain you authenticated).
4. Test: `docker compose exec api python -m scripts.test_brevo_smtp` (from `infra/docker`).
5. Ensure `APP_URL` in `infra/docker/.env` points to your web app (e.g. `http://localhost:8090`) so approval links work.

`brevo.local.txt` is gitignored. Docker mounts `config/` at `/config` for the API container.
