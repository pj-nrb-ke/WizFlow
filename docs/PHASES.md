# WizFlow — Phase Plan

See [WIZFLOW_HANDOVER.md](./WIZFLOW_HANDOVER.md) for full context. This file tracks execution gates.

| Phase | Name | Weeks (indicative) | Exit gate |
|-------|------|-------------------|-----------|
| **P0** | Foundation & contracts | 1–1.5 | ✅ Repo, Docker, OpenAPI, DB migrations, CI |
| **P1** | Tenant, auth, org | 1.5–2 | ✅ Login, company isolation, admin setup APIs |
| **P2** | Workflow engine (headless) | 2 | ✅ Publish workflow, simulate, events |
| **P3** | Requests & forms | 1.5–2 | Submit petty cash with files |
| **P4** | Approval loop | 2 | Inbox, approve/reject/return, timeline, email |
| **P5** | Manager UI & publish | 1.5–2 | Preview, draft/test/publish, versioning |
| **P6** | AI workflow creator | 2 | NL → draft → publish with guardrails |
| **P7** | KPI & reporting | 1.5–2 | Dashboard + Excel export |
| **P8** | MVP hardening & UAT | 1.5–2 | SRS §21 criteria on uat.wizflow.biz |

**P0 checklist:** monorepo layout, ADRs, OpenAPI v0.1, core migrations, Docker Compose, seed script, CI smoke test.

**Sync gate before P1:** OpenAPI + JSON schemas reviewed; no breaking contract changes without version bump.

**Do not start AI or KPI until P4 events are stable.**
