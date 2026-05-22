# ADR-002: Multi-Tenant Data Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Context:** SEC-NF-001, SCALE-001, ORG requirements.

## Decision

1. **Tenant key:** Every tenant-owned row includes `company_id` (UUID, FK to `companies`).
2. **Super Admin:** Platform role may operate across companies via explicit APIs only; never omit `company_id` in tenant CRUD paths.
3. **Query discipline:** All application queries for tenant data filter by `company_id` from the authenticated user's JWT claims.
4. **Users:** One login identity per row in `users`; `company_id` required for company-scoped users. Super admin may have `company_id` null (platform scope).
5. **Workflow artifacts:** `workflow_definitions`, `workflow_instances`, and `workflow_events` are always company-scoped.
6. **Separate databases per environment:** `wizflow_dev`, `wizflow_uat` on shared Postgres instance in non-prod; not separate schemas per tenant in MVP.

## Rationale

- Single-database multi-tenancy is sufficient for MVP SME/mid-market scale.
- `company_id` column is simple to audit and index; avoids schema-per-tenant operational cost on Contabo VPS.
- Matches handover §5 entity list and P1 exit gate (login + company isolation).

## Consequences

- JWT payload includes `sub`, `company_id`, `roles[]`.
- API middleware (P1) rejects cross-tenant resource access by ID enumeration.
- Seed data creates one demo company for local dev.

## Out of scope (MVP)

- Row-level security policies in Postgres (optional hardening in P8).
- Subdomain-based tenant routing.
