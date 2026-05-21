# WizFlow — Agent Handover Note

**Purpose:** Start development in a **fresh repository** (greenfield). Do **not** depend on Form.io server or this `formio` repo for runtime.

**Source SRS:** `Wiz Flow Srs Draft.docx` (Draft 1.0)  
**Decision date context:** Product owner chose **from-scratch** build aligned to SRS stack, not Form.io conversion.

---

## 1. Executive summary

**WizFlow** is an AI-first workflow and approval platform for non-technical managers. Core promise (MVP):

> A manager describes a workflow in plain English → system creates draft (form + steps + rules) → manager reviews/tests/publishes → users submit requests → approvers act → originators track status → management sees KPIs.

**Not in MVP:** native mobile apps, parallel approvals, full OCR/voice, ERP integrations, WhatsApp, scheduler, full drag-and-drop form builder, marketplace.

**Target MVP timeline:** ~10–12 weeks with multi-agent parallelism (SRS cited 4–5 weeks internal MVP — treat that as aggressive; plan for 10–12).

**Hosting:** Dev/UAT on Contabo VPS (`dev.wizflow.biz`, `uat.wizflow.biz`); production on Azure later.

---

## 2. Strategic decisions (do not re-litigate without owner approval)

| Decision | Choice |
|----------|--------|
| Form.io as platform | **No** — reference only; no runtime dependency |
| Stack | React + Vite + Tailwind, **FastAPI**, **PostgreSQL**, **Redis**, Docker, Nginx |
| Workflow engine | **Custom** — Form.io Actions are not a BPM substitute |
| Forms (MVP) | JSON schema + React renderer + AI-generated schemas; **not** full visual builder |
| Audit & KPI source | Append-only **`workflow_events`** table |
| Multi-tenant | `company_id` on all tenant data from day one |
| AI | OpenAI or Claude API; **mandatory** preview + test before publish |
| License | Product-owned (not OSL Form.io) |

---

## 3. Relationship to Form.io repo (this workspace)

The `formio` repository was analyzed for context only:

- **Useful patterns to study:** JWT auth, role/permission middleware concepts, condition operators, submission lifecycle, email/webhook side effects, hook/extension model.
- **Do not fork** this repo as WizFlow production base (MongoDB, single-project OSS model, OSL-3.0, wrong center of gravity for approvals).

Optional later: embed **`@formio/js`** in browser only for complex form rendering — **not required for MVP**.

---

## 4. Recommended monorepo layout (new repo)

```
wizflow/
  apps/
    api/                 # FastAPI — workflow, org, auth, inbox, files
    web/                 # React + Vite + Tailwind — all user-facing UI
    ai-worker/           # Optional: async AI jobs (can live inside api initially)
  packages/
    shared/              # TypeScript/Python shared types, constants
    openapi/             # wizflow.yaml — API contract (source of truth)
    schemas/             # workflow-definition.json, form-schema.json
  infra/
    docker/              # compose, nginx, env examples
  tests/
    e2e/                 # Playwright
    api/                 # pytest
  docs/
    adr/                 # architecture decision records
    PHASES.md            # copy phase plan from this handover §7
```

**Branches:** `main` (protected), `develop`, `uat`, `feature/<agent>-<ticket>`.

---

## 5. Core domain model

### Entities

| Entity | Purpose |
|--------|---------|
| `companies` | Tenant boundary |
| `users` | Login identity; scoped to company |
| `roles` / `user_roles` | RBAC (Super Admin, Company Admin, Manager, Originator, Approver, Auditor, KPI Viewer, …) |
| `departments`, `branches`, `designations` | Org structure (ORG-001–004) |
| `employees` / reporting lines | ORG-005–006 |
| `approval_limits` | ORG-007, APR-010 |
| `workflow_definitions` | Versioned; draft \| published; steps + routing + form schema |
| `workflow_instances` | One running request; status; current_step; assignees |
| `workflow_events` | Append-only audit + KPI source (AUD-001–002) |
| `request_data` | Form payload JSON (or embedded on instance) |
| `attachments` | File metadata + storage path |
| `notifications` | In-app (+ email queue) |
| `kpi_snapshots` / materialized views | Optional; derived from events |

### Workflow definition (conceptual JSON)

```json
{
  "id": "uuid",
  "company_id": "uuid",
  "name": "Petty Cash Approval",
  "version": 3,
  "status": "published",
  "form_schema": { "fields": [] },
  "steps": [
    {
      "id": "step_1",
      "name": "Manager Approval",
      "type": "approval",
      "assignee": { "type": "role", "value": "manager" },
      "conditions": [],
      "fallback_assignee": null
    }
  ],
  "routing_rules": [
    { "when": { "field": "amount", "op": "gt", "value": 5000 }, "skip_to": "step_finance" }
  ],
  "settings": { "sla_hours": 48, "allow_delegate": false }
}
```

### Instance statuses (MVP)

`draft` → `submitted` → `in_progress` → `approved` | `rejected` | `returned` → (resubmit) → …

### Event types (enum — extend via ADR)

- `workflow.published`
- `request.submitted`
- `step.started`
- `step.approved` / `step.rejected` / `step.returned`
- `comment.added`
- `file.uploaded`
- `step.delegated`
- `workflow.completed`

---

## 6. API surface (MVP — implement under OpenAPI)

**Auth:** `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`

**Admin / org:** CRUD companies (super admin), users, roles, departments, branches, employees, approval limits

**Workflows:** CRUD definitions, `POST .../publish`, `POST .../simulate`, version list, rollback

**Requests:** `POST /workflows/{id}/submit`, `GET /requests` (my requests), `GET /requests/{id}`, `PATCH` (returned only)

**Inbox:** `GET /inbox`, `POST /requests/{id}/approve|reject|return`, comment, upload

**Timeline:** `GET /requests/{id}/events`

**AI:** `POST /ai/workflow/draft`, `POST /ai/workflow/refine`, `GET /ai/workflow/explain`

**KPI:** `GET /kpi/dashboard`, `GET /reports/...`, `GET /export/excel`

**Notifications:** `GET /notifications`, mark read

Contract owner: **Product Architect agent** — no breaking changes without version bump.

---

## 7. Phases (execution order)

| Phase | Name | Weeks (indicative) | Exit gate |
|-------|------|-------------------|-----------|
| **P0** | Foundation & contracts | 1–1.5 | Repo, Docker, OpenAPI, DB migrations, CI |
| **P1** | Tenant, auth, org | 1.5–2 | Login, company isolation, admin setup APIs |
| **P2** | Workflow engine (headless) | 2 | Publish workflow, simulate, events |
| **P3** | Requests & forms | 1.5–2 | Submit petty cash with files |
| **P4** | Approval loop | 2 | Inbox, approve/reject/return, timeline, email |
| **P5** | Manager UI & publish | 1.5–2 | Preview, draft/test/publish, versioning |
| **P6** | AI workflow creator | 2 | NL → draft → publish with guardrails |
| **P7** | KPI & reporting | 1.5–2 | Dashboard + Excel export |
| **P8** | MVP hardening & UAT | 1.5–2 | SRS §21 criteria on uat.wizflow.biz |

**Clickable prototype (no AI):** end of **P4** or mid-**P5**.

**Post-MVP:** P9 Pilot+ (escalations, PWA, data sources API/SQL), P10 Production (Azure, scheduler, OCR, ERP, native mobile).

### MVP screens (SRS §13)

Login, Dashboard, AI Workflow Creator, Workflow Preview, Form Submission, Approval Inbox, My Requests, Request Timeline, KPI Dashboard, Admin Setup. Mobile-responsive approval (not native app).

### MVP demo workflows (SRS §22)

1. **Petty Cash Approval** (required)  
2. **Purchase Request** (approval limits + finance routing)  
3. Optional third: Leave Approval

### MVP success criteria (SRS §21)

- [ ] Manager creates workflow via AI  
- [ ] Visual review before publish  
- [ ] User submits; approvers act (approve/reject/return/comment/file)  
- [ ] Originator sees My Requests + timeline  
- [ ] Audit trail for every action  
- [ ] KPI: pending, overdue, avg approval time, bottlenecks  
- [ ] UAT on Contabo usable for demo  

---

## 8. Multi-agent model

| Agent | ID | Owns | Primary phases |
|-------|-----|------|----------------|
| Product Architect | A0 | OpenAPI, JSON schemas, ADRs, phase gates | P0, P1, P2, P6, P8 |
| Backend | A1 | `apps/api`, engine, migrations | P0–P8 |
| Web Frontend | A2 | `apps/web` | P1–P8 |
| AI | A3 | prompts, draft validation, `ai-worker` | P6, P8 tuning |
| Reporting/KPI | A4 | aggregates, dashboards, export | P7–P8 |
| Integration | A5 | webhook stubs; ERP later | P0 doc, P10 |
| QA | A6 | pytest, Playwright, fixtures | continuous |
| DevOps | A7 | Docker, CI, Contabo UAT | P0, P1, P4, P8 |

**Rules:** one module owner per package; feature branches; no prod deploy until P8 sign-off; secrets in env only; tracker updated per task.

### P0 parallel kickoff (week 1)

- **A0:** ERD, OpenAPI v0, workflow + form JSON schemas, ADR-001 tenant model  
- **A7:** `docker-compose up`, GitHub Actions lint/test, `.env.example`  
- **A1:** FastAPI skeleton, Alembic, health check  
- **A2:** Vite + Tailwind + router + auth shell  
- **A6:** test layout + first smoke test  
- **Sync gate:** OpenAPI + schema approved before P1 feature work  

---

## 9. Non-functional requirements (implement progressively)

- **SEC-NF-001:** company data isolation (queries always scoped)  
- **SEC-NF-002–003:** secure file storage; secrets in env  
- **SEC-NF-004:** audit via `workflow_events`  
- **SEC-NF-005:** HTTPS on UAT/prod  
- **PERF-001–002:** fast inbox/dashboard; immediate status after action  
- **SCALE-003:** Redis queue for email + future OCR/ERP jobs  
- **AVAIL-003–005:** DB backup, file backup, log retention  

---

## 10. Scope cuts if timeline slips

| Cut first | Never cut |
|-----------|-----------|
| AI plain-English edit (AI-WF-007) | Tenant isolation |
| Delegate approvals (APR-005) | Audit events |
| AI KPI summaries (KPI-012) | Approve/reject/return |
| Excel export (defer 1 week) | Preview before publish |
| API/SQL dropdown sources | Petty cash + 1 demo workflow |

---

## 11. Risks & controls (SRS §20)

| Risk | Control |
|------|---------|
| AI wrong workflow | Preview + simulation + explicit publish |
| Missing approvers | Org master + AI gap questions (AI-WF-009) |
| Scope creep | Sequential approvals only in MVP |
| Agent code conflicts | OpenAPI owner + module ownership |
| Integration failures | Log + retry + staging mode (post-MVP) |

---

## 12. Environment variables (starter list)

```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_EXPIRE_MINUTES=
FILE_STORAGE_PATH=          # or S3_* for Azure later
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS=
AI_API_KEY= AI_MODEL=
APP_URL=https://dev.wizflow.biz
CORS_ORIGINS=
```

Separate DBs: `wizflow_dev`, `wizflow_uat`. Upload paths: `uploads/dev`, `uploads/uat`.

---

## 13. First tasks for new agent (P0 checklist)

1. Initialize git repo `wizflow` with monorepo structure (§4).  
2. Add `docs/adr/001-tech-stack.md`, `002-tenant-model.md`, `003-workflow-events.md`.  
3. Publish OpenAPI v0.1 with auth + workflow + inbox stubs.  
4. PostgreSQL migrations: companies, users, roles, workflow_definitions, workflow_instances, workflow_events.  
5. Docker Compose: api + web + postgres + redis + nginx.  
6. README: how to run locally in &lt;10 commands.  
7. Seed script: one company, admin user, sample roles.  

**Do not start AI or KPI until P4 events are stable.**

---

## 14. Commercial context (informational)

SRS suggests ~$49/company/month + ~$3/user/month; plans Starter / Business / Business Plus / Enterprise. Not blocking engineering.

---

## 15. Reference documents

- SRS: `Wiz Flow Srs Draft.docx` (user Downloads)  
- Prior analysis: Form.io codebase at `c:\Users\pj\WizFlow\formio` (optional reference)  
- Phase/agent detail: conversation-derived plan (sections 7–8 above)

---

## 16. Prompt snippet for new Cursor agent

Copy into first message of new repo session:

```
You are building WizFlow from scratch per docs/WIZFLOW_HANDOVER.md and the SRS.
Stack: React+Vite+Tailwind, FastAPI, PostgreSQL, Redis, Docker.
Start Phase P0 only: monorepo, OpenAPI, DB schema, Docker Compose, ADRs.
Do not use Form.io server. Workflow engine is custom; workflow_events is audit+KPI source.
MVP: AI-assisted workflow draft, sequential approvals, inbox, timeline, KPI dashboard, petty cash + purchase request demos.
Confirm P0 exit gate before P1.
```

---

*End of handover — version 1.0*
