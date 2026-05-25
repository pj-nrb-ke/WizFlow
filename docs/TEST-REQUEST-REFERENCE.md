# Test cases: Request reference numbers & MIS timestamps

**Feature:** Per-workflow serial references (`PC-2026-00001`), request/generated/current timestamps in UI, action audit trail for MIS.

**Spec / implementation:** Migration `006`, `request_serial.py`, `RequestMetaBar` (web), `GET /api/v1/reports/mis/actions(.csv)`.

---

## Test environment

| Item | Value |
|------|--------|
| **Execution date** | 2026-05-22 (UTC ~19:50) |
| **Database** | `wizflow-postgres-1` — migrations 001→006, `scripts.seed` + rich demo data |
| **API runner** | `docker compose -p wizflow run --rm api` (FastAPI `TestClient`, no live port required) |
| **Automated script** | `python -m scripts.run_reference_test_cases` |
| **Pytest** | `pytest /tests/api/test_request_serial.py` |

**Legend:** ✅ Pass | ❌ Fail | ⏭️ Skip (manual / not automated)

---

## 1. Reference number assignment

| ID | Test case | Steps | Expected | Result | Notes |
|----|-----------|-------|----------|--------|-------|
| REF-01 | New Petty Cash request gets `PC-` prefix | Login as originator → submit Petty Cash with valid data | `reference_number` matches `PC-{YEAR}-{5 digits}`; HTTP 201 | ✅ | `PC-2026-00007` |
| REF-02 | Reference assigned at submit (not on read only) | Submit new request; inspect response body immediately | `reference_number` present in submit response | ✅ | Present in submit response |
| REF-03 | Purchase Request uses `PR-` series | Submit Purchase Request workflow | Reference starts with `PR-` | ✅ | `PR-2026-00004` |
| REF-04 | Leave Approval uses `LV-` series | Submit Leave with `leave_type`, dates, reason | Reference starts with `LV-` | ✅ | `LV-2026-00005` |
| REF-05 | Sequence increments within same family/year | Submit two Petty Cash requests in succession | Second number > first (same prefix/year) | ✅ | `PC-2026-00007` → `PC-2026-00008` |
| REF-06 | Reference unchanged after approve | Submit → admin approves one step | Same `reference_number` before/after | ✅ | Still `PC-2026-00007` after approve |
| REF-07 | Resubmit returned request keeps reference | Return request → originator resubmits | `reference_number` unchanged | ⏭️ | Manual: return → resubmit not automated in script |
| REF-08 | All submitted instances have reference | Count DB rows with `submitted_at` and null reference | Count = 0 | ✅ | `submitted without ref: 0` |

---

## 2. API: Inbox & detail

| ID | Test case | Steps | Expected | Result | Notes |
|----|-----------|-------|----------|--------|-------|
| API-01 | Inbox items include `reference_number` | `GET /api/v1/inbox` as approver | Each item has `reference_number` | ✅ | 15/15 inbox rows with ref |
| API-02 | Request detail includes reference | `GET /api/v1/requests/{id}` | `reference_number`, `submitted_at`, `created_at` | ✅ | `PC-2026-00007` |
| API-03 | My requests list includes reference | `GET /api/v1/requests` as originator | Each summary has `reference_number` | ✅ | 24 requests listed |
| API-04 | Claim records `step.claimed` event | Claim-mode task → `POST .../claim` | Event `step.claimed` with timestamp | ⏭️ | Manual: Fee Note + acc1/acc2 claim flow |

---

## 3. Event timeline & labels

| ID | Test case | Steps | Expected | Result | Notes |
|----|-----------|-------|----------|--------|-------|
| EVT-01 | Submit creates `request.submitted` | Submit → `GET .../events` | `event_label` “Request submitted” + `created_at` | ✅ | Label verified |
| EVT-02 | Approve creates `step.approved` | Approve step → events | `step.approved` present | ✅ | count=1 |
| EVT-03 | Events include human-readable labels | `GET .../events` | `event_label` set for all events | ✅ | All events labeled |
| EVT-04 | Payload includes `reference_number` | Inspect event payload after submit | `reference_number` in payload | ✅ | Present on instance events |

---

## 4. MIS reporting

| ID | Test case | Steps | Expected | Result | Notes |
|----|-----------|-------|----------|--------|-------|
| MIS-01 | MIS JSON export (admin) | `GET /api/v1/reports/mis/actions` as admin | 200; rows with ref, `action_at`, `event_label` | ✅ | 121 rows |
| MIS-02 | MIS CSV export | `GET /api/v1/reports/mis/actions.csv` | 200; CSV header + data | ✅ | ~16.6 KB |
| MIS-03 | MIS forbidden for originator | Same endpoint as originator | 403 | ✅ | status=403 |
| MIS-04 | CSV includes approved actions | Approve test request → export | Row with “Step approved” for that reference | ✅ | Row found for test ref |

---

## 5. Automated regression (pytest)

| ID | Test case | Command | Expected | Result | Notes |
|----|-----------|---------|----------|--------|-------|
| AUTO-01 | `test_submit_assigns_reference_number` | `pytest test_request_serial.py::test_submit_assigns_reference_number` | Pass | ✅ | |
| AUTO-02 | `test_inbox_includes_reference` | `pytest test_request_serial.py::test_inbox_includes_reference` | Pass | ✅ | |
| AUTO-03 | `test_mis_actions_csv` | `pytest test_request_serial.py::test_mis_actions_csv` | Pass | ✅ | 3 passed in 8.92s |

---

## 6. Integration script (end-to-end API)

| ID | Test case | Command | Expected | Result | Notes |
|----|-----------|---------|----------|--------|-------|
| E2E-01 | Full API case runner | `python -m scripts.run_reference_test_cases` | All automated cases PASS | ✅ | See JSON log below; 0 failures |

---

## 7. UI (manual verification checklist)

| ID | Test case | Steps | Expected | Result | Notes |
|----|-----------|-------|----------|--------|-------|
| UI-01 | Inbox list shows reference | Open `/inbox` | Mono reference + submitted time on each row | ⏭️ | Confirm in browser after refresh |
| UI-02 | Detail meta bar | Select request | Bar: reference, “Request generated”, “Current time” (live) | ⏭️ | `RequestMetaBar` component shipped |
| UI-03 | Request detail timeline | Open `/requests/{id}` | Friendly labels + locale timestamps | ⏭️ | API returns `event_label` |
| UI-04 | My requests list | Open `/requests` | Reference per row | ⏭️ | API-03 passed |

---

## Execution summary

| Category | Total | Pass | Fail | Skip |
|----------|-------|------|------|------|
| Reference assignment | 8 | 7 | 0 | 1 |
| API | 4 | 3 | 0 | 1 |
| Events | 4 | 4 | 0 | 0 |
| MIS | 4 | 4 | 0 | 0 |
| Automated (pytest) | 3 | 3 | 0 | 0 |
| E2E script | 1 | 1 | 0 | 0 |
| UI (manual) | 4 | 0 | 0 | 4 |
| **Total** | **28** | **22** | **0** | **6** |

**Overall automated result:** **22 / 22 passed (100%)**  
**Manual UI:** **4 cases** — pending confirmation in browser (hard refresh on web port 5200 or 8090).

**Tester:** Cursor agent (automated)  
**Sign-off:** Automated suite **PASS**; UI checklist **pending user**.

---

## How to re-run

```bash
cd infra/docker

# One-shot DB + tests (isolated project)
docker compose -p wizflow run --rm api alembic upgrade head
docker compose -p wizflow run --rm api python -m scripts.seed
docker compose -p wizflow run --rm --no-deps api python -m scripts.run_reference_test_cases
docker compose -p wizflow run --rm api pytest /tests/api/test_request_serial.py -v
```

---

## Detailed execution log

**Run ID:** `2026-05-22T19:50:11.666957+00:00`

```json
{
  "run_at": "2026-05-22T19:50:11.666957+00:00",
  "results": {
    "REF-01": { "result": "PASS", "notes": "PC-2026-00007" },
    "REF-02": { "result": "PASS", "notes": "present in submit response" },
    "REF-05": { "result": "PASS", "notes": "PC-2026-00007 -> PC-2026-00008" },
    "REF-03": { "result": "PASS", "notes": "PR-2026-00004" },
    "REF-04": { "result": "PASS", "notes": "LV-2026-00005" },
    "REF-06": { "result": "PASS", "notes": "after approve: PC-2026-00007" },
    "REF-07": { "result": "SKIP", "notes": "Manual: return → resubmit path not automated" },
    "REF-08": { "result": "PASS", "notes": "submitted without ref: 0" },
    "API-01": { "result": "PASS", "notes": "15/15 with ref" },
    "API-02": { "result": "PASS", "notes": "PC-2026-00007" },
    "API-03": { "result": "PASS", "notes": "count=24" },
    "API-04": { "result": "SKIP", "notes": "Manual: claim flow requires Fee Note + acc1/acc2" },
    "EVT-01": { "result": "PASS", "notes": "Request submitted" },
    "EVT-02": { "result": "PASS", "notes": "count=1" },
    "EVT-03": { "result": "PASS", "notes": "" },
    "EVT-04": { "result": "PASS", "notes": "" },
    "MIS-01": { "result": "PASS", "notes": "rows=121" },
    "MIS-04": { "result": "PASS", "notes": "" },
    "MIS-02": { "result": "PASS", "notes": "bytes=16653" },
    "MIS-03": { "result": "PASS", "notes": "status=403" },
    "UI-01": { "result": "SKIP", "notes": "Manual browser verification required" },
    "UI-02": { "result": "SKIP", "notes": "Manual browser verification required" },
    "UI-03": { "result": "SKIP", "notes": "Manual browser verification required" },
    "UI-04": { "result": "SKIP", "notes": "Manual browser verification required" }
  }
}
```

### Findings & recommendations

1. **Series separation works** — Petty (`PC`), Purchase (`PR`), and Leave (`LV`) each use distinct prefixes in one run.
2. **MIS export is production-ready** for spreadsheets — CSV includes reference, workflow, status, event label, ISO `action_at`, actor, step, comment.
3. **UI cases** were not run in a browser in this session; API coverage confirms data is returned. Please confirm visually: meta bar at top of inbox detail (reference + two timestamps).
4. **Optional follow-ups:** automate REF-07 (return/resubmit), API-04 (claim + `step.claimed`), inbox search/filter by reference.

---

## Related files

| File | Purpose |
|------|---------|
| `apps/api/scripts/run_reference_test_cases.py` | Runnable case suite (TestClient) |
| `tests/api/test_request_serial.py` | Pytest regression |
| `docs/TEST-REQUEST-REFERENCE.md` | This document |
