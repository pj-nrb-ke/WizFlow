# ADR-003: Workflow Events as Audit and KPI Source

**Status:** Accepted  
**Date:** 2026-05-21  
**Context:** AUD-001–002, SEC-NF-004, KPI engine inputs.

## Decision

1. **`workflow_events` table is append-only.** No UPDATE or DELETE in application code; corrections are new compensating events if ever needed (post-MVP policy).
2. **Every state change** on a workflow instance emits one or more events with structured `event_type` and JSON `payload`.
3. **KPI and audit UIs** read from `workflow_events` (and materialized views later), not from mutable instance fields alone.
4. **Event types (MVP enum):**
   - `workflow.published`
   - `request.submitted`
   - `step.started`
   - `step.approved` / `step.rejected` / `step.returned`
   - `comment.added`
   - `file.uploaded`
   - `step.delegated`
   - `workflow.completed`
5. **Payload** stores actor `user_id`, optional `step_id`, comment text, file refs, and before/after status where relevant.

## Rationale

- Immutable event log satisfies compliance and debugging.
- Decouples KPI aggregation (P7) from core engine transitions (P2–P4).
- Avoids Form.io submission hooks as the source of truth.

## Consequences

- Engine writes events in the same transaction as instance updates (P2+).
- P0 migration creates table; P2 implements writers; P7 adds rollups/dashboards.
- New event types require ADR amendment or version note in OpenAPI changelog.

## Schema sketch

```
workflow_events (
  id UUID PK,
  company_id UUID NOT NULL,
  instance_id UUID NOT NULL,
  event_type VARCHAR NOT NULL,
  actor_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

Indexes: `(company_id, instance_id, created_at)`, `(company_id, event_type, created_at)`.
