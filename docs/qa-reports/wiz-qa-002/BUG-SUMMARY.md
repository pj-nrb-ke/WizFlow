# WizFlow Bug Summary — WIZ-QA-002

**Cycle:** WIZ-QA-002  
**Date:** 2026-05-27  
**Targets:** https://api.wizflow.biz · https://app.wizflow.biz  
**Excel:** `docs/qa-reports/WizCRM-QA-Test-001.xlsx`

## Executive summary

Coordinated enterprise QA per `docs/QA_v2.md` (single workflow, no excessive parallel agents). Production API probes, code audit, local regression (vitest pass; pytest blocked without PostgreSQL), and mobile/web security review completed.

| Metric | Count |
|--------|------:|
| Total test cases | 23 |
| Passed | ~18 |
| Failed | ~4 |
| Warnings | ~1 |

## Top 10 critical risks

1. **Web JWT in localStorage** — XSS could exfiltrate access/refresh tokens (`apps/web/src/lib/auth.ts`).
2. **Inbox double-submit** — Approve/reject has no in-flight guard (`InboxPage.tsx` `act()`).
3. **Unbounded list APIs** — Inbox and My Requests can return full datasets (performance/data exposure at scale).
4. **Local API regression gap** — 18 pytest cases fail without Postgres; CI may not catch API regressions.
5. **Mobile vs web parity** — Phase 2 analytics, admin setup, workflow builder not on mobile.
6. **Public approval links** — Magic-link tokens in email/URL; leakage = unauthorized action if not one-time/TTL.
7. **No rate limiting** — Auth and submit endpoints open to brute-force/abuse.
8. **Production health latency** — `/health` averaged ~640ms (ops/UX concern for monitors).
9. **EAS mobile cloud builds blocked** — `projectId` placeholder in `app.json`.
10. **No automated visual QA** — No Playwright screenshots for responsive/breakpoint failures.

## Scores (/100)

| Dimension | Score | Notes |
|-----------|------:|-------|
| Production readiness | **72** | Core flows work on prod; gaps in scale, CI, mobile parity |
| Stability | **68** | Double-submit and unbounded lists risk instability at scale |
| UI/UX professionalism | **74** | Solid themes/responsive CSS; missing skeletons, dark mode, e2e visuals |
| Security | **70** | AuthZ solid; localStorage tokens, no rate limits |
| Mobile readiness | **62** | Android APK built; iOS untested; feature gaps vs web |

## Prioritized fix plan

### Critical
- None identified as active production bypass in live tests (authZ and SQLi checks passed).

### High
1. Add loading/disabled state on inbox approve/reject/return actions.
2. Move web tokens to httpOnly cookies or harden CSP + shorten JWT lifetime.
3. Paginate `/inbox` and `/requests` list endpoints.
4. Enable PostgreSQL in CI and run full `pytest tests/api`.
5. Document and reduce public-approval token risk (TTL, one-time).

### Medium
6. Add API rate limiting (login, submit, public approval).
7. Reject oversized request bodies with HTTP 413 at gateway/middleware.
8. Encrypt or avoid PII in mobile AsyncStorage draft queue.
9. Run `eas init` and fix `projectId` for mobile release pipeline.
10. Add Playwright e2e for responsive UI (per `tests/e2e/README.md`).

### Low
11. Optional system dark mode.
12. Skeleton loaders instead of plain "Loading…".
13. Replace default `jwt_secret` in config with deploy-time validation only.

## Retest recommendations

- Re-run `python scripts/qa_wiz_qa_002.py` after inbox pagination and double-submit fixes.
- Re-run `pytest tests/api` with Docker Postgres before next release.
- Manual retest: public approval email link on mobile mail client.
- Visual retest: 375px, 768px, 1920px widths on Inbox, Submit, Analytics.

## Artifacts

| Artifact | Path |
|----------|------|
| Excel report | `docs/qa-reports/WizCRM-QA-Test-001.xlsx` |
| JSON results | `docs/qa-reports/wiz-qa-002/qa-002-results.json` |
| Performance metrics | In Excel sheet + JSON `perf_metrics` |
| Screenshots | N/A — code-audit cycle (no Playwright); refs marked N/A in Excel |
| Crash logs | None captured |

## Recommended fixes (detail)

See sheets **Security Findings**, **Performance Findings**, **UI/UX Findings**, **API Findings**, **Mobile Findings** in the Excel workbook.
