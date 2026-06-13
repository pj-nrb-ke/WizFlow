# WizFlow — Testing Checklist

Reusable QA/security checklist for agents working on WizFlow. Covers what has been
done, how to run it, and what remains. Tick items as you verify them.

## How to run (local dev)

- API runs in Docker: `docker compose -p wizflow -f infra/docker/docker-compose.yml up -d`
- **Dev DB gotcha:** a native Windows PostgreSQL squats on `5433`; the container DB is mapped to **`5466`**. Always pass `DATABASE_URL=postgresql://wizflow:wizflow@127.0.0.1:5466/wizflow_dev`.
- Test runner: the API venv at `apps/api/.venv` (`python -m pytest ...` / `python -m scripts.<name>`). Prefix script runs with `PYTHONUTF8=1` on Windows.
- Demo creds: `admin@demo.wizflow.biz` / `changeme` (admin), `originator@demo.wizflow.biz` / `changeme` (non-admin).
- **Rate-limit note:** the security/pentest suites fire login bursts that trip the 429 limiter. Run auth-heavy suites with a ~65s gap between them, or re-run any that report a spurious `429 / admin login failed`.

## Automated suites (run these every change)

- [ ] **Unit** — `pytest tests/api -q` (expected: 19 passed, 3 skipped)
- [ ] **Functional E2E** — `python -m scripts.test_full_e2e` (53 checks): auth, AI/manual/custom workflow, preview→simulate→publish, routing, versioning, submit→approve/reject, negative validation, inbox, notifications, analytics, reports, exports, master data, admin, integrations, clone, webhook test
- [ ] **2FA** — `python -m scripts.test_2fa` (12 checks): TOTP setup/enable/login-gating/disable, encrypted-at-rest secret
- [ ] **Route coverage** — `python -m scripts.test_route_coverage`: auto-hits every GET route, flags any 5xx
- [ ] **Security** — `python -m scripts.test_security` (27 checks)
- [ ] **Penetration (deep)** — `python -m scripts.test_pentest` (16 checks)
- [ ] **Web build** — `cd apps/web && npm run build` (tsc + vite, no errors)
- [ ] **Mobile typecheck** — `cd apps/mobile && npx tsc --noEmit`

## 1. Logical flow / IA

- [ ] Navigation is grouped and uncluttered (no wrapping all-caps grid); daily actions visible, rest grouped
- [ ] Core flows are coherent and have no dead ends: design → preview → simulate → publish; submit → inbox → approve/reject/return
- [ ] Detail pages have a back link / breadcrumb
- [ ] No redundant/overlapping ways to do the same thing without clear distinction

## 2. Unit / regression (nothing breaking)

- [ ] All automated suites above pass
- [ ] No 5xx on any GET route (route-coverage)
- [ ] Web build + mobile typecheck pass

## 3. UI/UX — wasted space

- [ ] No page shows large empty/blank regions in its with-data state
- [ ] Wide pages use the horizontal space (two-column / sidebar) instead of one narrow column
- [ ] Every empty state has structure (icon, message, CTA), not a single line
- [ ] No raw/unstyled controls (bare file inputs, default selects) or debug-looking labels

## 4. Feature value (per page)

- [ ] Each major page surfaces the useful actions/data the API already supports
- [ ] No API endpoint exists that the UI never calls (or it's intentional)
- [ ] High-value patterns present where relevant: bulk actions, saved filters, templates, keyboard shortcuts, clone, inline results

## Security / penetration checklist

- [ ] **AuthN** — every protected endpoint returns 401 without a token
- [ ] **JWT** — tampered signature, garbage token, `alg=none` forgery, and refresh-token-as-access all rejected (401)
- [ ] **RBAC** — non-privileged role (originator) gets 403 on manager/admin actions (create/clone workflow, admin/*, AI draft)
- [ ] **Multi-tenant isolation (IDOR)** — a second tenant cannot read/preview/clone/approve another tenant's workflows or requests (404); lists are company-scoped
- [ ] **Cross-user IDOR** — a user cannot act on another user's object (e.g. mark another user's notification) → 404
- [ ] **SQL injection** — payloads in search/filters/path/body/numeric/date/enum params never cause 5xx; `DROP`/`DELETE`/`OR 1=1` treated as literals; tables intact
- [ ] **Path-param injection** — non-UUID path → 422, not 500
- [ ] **Mass assignment** — injected `status`/`company_id`/`id` in create bodies are ignored
- [ ] **Spreadsheet formula injection** — CSV/XLSX exports neutralize cells starting with `= + - @` tab/CR
- [ ] **SSRF** — webhook URLs resolving to private/loopback/link-local (incl. 169.254.169.254) reserved IPs are blocked on create and at delivery
- [ ] **Secrets at rest** — TOTP secrets stored encrypted (Fernet)
- [ ] **Body-size limit** — oversized request body → 413
- [ ] **Rate limiting** — login burst → 429
- [ ] **Public token / API key** — invalid public approval token → 4xx (not 5xx); external API without key → 401/403
- [ ] **Cookies / CSRF** — auth cookies HttpOnly + SameSite=Lax; `AUTH_COOKIE_SECURE=true` in production
- [ ] **Dependency CVEs** — `pip-audit -r apps/api/requirements.txt` and `npm audit --omit=dev` (web/mobile) reviewed; runtime advisories patched

## Not yet automated (future / on request)

- [ ] **Browser UI E2E** (Playwright, headless) — visit every page, assert no console errors / no 5xx
- [ ] **Accessibility** (WCAG) + responsive / cross-browser
- [ ] **API fuzzing** — Schemathesis against the OpenAPI spec
- [ ] **Concurrency / race** — double-approve same request; parallel submits → unique reference numbers
- [ ] **Load / stress** — concurrent users, latency under volume
- [ ] **Migration round-trip** — alembic upgrade → downgrade → upgrade integrity
- [ ] **Email** — Brevo approval emails send & render
- [ ] **Scheduler/automation** — SLA alerts & recurring workflows fire (note: scheduler disabled in prod by default)
- [ ] **Mobile** — automated tests + real-device pass; APK install/login/approve smoke
- [ ] **File-upload content** — EICAR/malware, wrong MIME, oversized, zip-bomb

## Known accepted risks (review periodically)

- `pytest` CVE-2025-71176 — test-only dependency, not in the production runtime path
- Mobile npm advisories (transitive Expo/RN) — address at the next Expo SDK upgrade, not via `audit fix --force`
