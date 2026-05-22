# ADR-001: Technology Stack

**Status:** Accepted  
**Date:** 2026-05-21  
**Context:** WizFlow greenfield MVP per SRS Draft 1.0 and handover decisions.

## Decision

| Layer | Technology |
|-------|------------|
| Web UI | React 18, Vite, TypeScript, Tailwind CSS, React Router |
| API | Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.x |
| Database | PostgreSQL 16 |
| Cache / queue | Redis 7 |
| Migrations | Alembic |
| API contract | OpenAPI 3.0 (`packages/openapi/wizflow.yaml`) |
| Containers | Docker, Docker Compose |
| Edge | Nginx (reverse proxy, static web in prod-like compose) |
| CI | GitHub Actions (lint + API smoke tests) |

## Rationale

- Aligns with SRS §11 and handover §2.
- FastAPI + PostgreSQL suit relational workflow/audit data and multi-tenant queries.
- React + Vite matches manager-facing SPA needs and agent ownership split (A1/A2).
- Redis reserved for email queue and async jobs (SCALE-003); wired in P0 compose, used from P4+.
- Form.io is **not** a runtime dependency; optional future browser-only `@formio/js` embed is out of MVP scope.

## Consequences

- Monorepo under `apps/` and `packages/` per handover §4.
- Production target Azure later; Dev/UAT on Contabo with same container layout.
- AI provider (OpenAI/Claude) configured via env; no AI implementation until P6.

## Alternatives considered

- **Node backend:** Rejected — SRS and team direction favor Python/FastAPI for workflow engine.
- **MongoDB (Form.io):** Rejected — wrong fit for tenant-scoped relational approvals and KPI aggregates.
