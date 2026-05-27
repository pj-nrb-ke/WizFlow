# QA fixes applied (WIZ-QA-002)

## API
- HttpOnly auth cookies (`wizflow_access_token`, `wizflow_refresh_token`) + `POST /auth/logout`
- `get_current_user` accepts cookie or Bearer (mobile unchanged)
- Rate limiting middleware (login, refresh, public approval, submit)
- Max body size middleware (1MB → HTTP 413)
- Production `jwt_secret` validation on startup
- Inbox & requests: `limit` (default 100, max 200) + `offset`
- Public approval token TTL: 7 → 3 days

## Web
- `credentials: "include"` on all API calls
- Cookie-based auth (no localStorage when `VITE_AUTH_COOKIES` not `false`)
- Inbox: double-submit guard, loading skeletons
- Settings: system / light / dark color scheme
- CSP meta tag in `index.html`

## Mobile
- Offline submit queue migrated to SecureStore
- EAS init note in `store/RELEASE.md`

## Tests
- `tests/api/conftest.py`: skip when PostgreSQL unavailable
- `tests/e2e/`: Playwright smoke config + login test

## Excel
- Updated report: `docs/qa-reports/WizCRM-QA-Test-002.xlsx`

**Deploy API + web to production** to verify cookie auth, 413, and rate limits on `api.wizflow.biz`.
