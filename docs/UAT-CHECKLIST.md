# WizFlow — UAT checklist (P0–P4)

Use this to verify the current build before starting P5+. Local URLs assume default ports (WizInvest uses **5174** — use **5200** for WizFlow).

**Test logins (after seed):**

| Role | Email | Password |
|------|--------|----------|
| Admin / approver | `admin@demo.wizflow.biz` | `changeme` |
| Originator | `originator@demo.wizflow.biz` | `changeme` |

---

## Before you start

| # | Check | Pass? |
|---|--------|-------|
| 1 | Docker stack is up (`api`, `web`, `postgres`, `redis`, `nginx` if you use it) | ☐ |
| 2 | API health: http://localhost:8010/api/v1/health → `status: ok`, `database: ok` | ☐ |
| 3 | Web loads: http://localhost:5200 (not 5174 — that's WizInvest) | ☐ |
| 4 | Seed ran: both test logins work | ☐ |

---

## Login & session (P1)

| # | Check | Pass? |
|---|--------|-------|
| 5 | Login with `admin@demo.wizflow.biz` / `changeme` → lands on Dashboard | ☐ |
| 6 | Dashboard shows your name and **Demo Company** | ☐ |
| 7 | Wrong password → error (not silent success) | ☐ |
| 8 | Log out → back to login; protected routes redirect to `/login` | ☐ |
| 9 | Refresh while logged in → still logged in | ☐ |

---

## Dashboard (P4 UI)

| # | Check | Pass? |
|---|--------|-------|
| 10 | **Pending approvals** shows a number (not `—`) when inbox has items | ☐ |
| 11 | **My open requests** updates after you submit a request | ☐ |
| 12 | Quick links open Submit, Inbox, Workflows | ☐ |

---

## Workflows — manager (P2)

| # | Check | Pass? |
|---|--------|-------|
| 13 | **Workflows** lists **Petty Cash Approval** (published) | ☐ |
| 14 | Select workflow → steps listed | ☐ |
| 15 | **Simulate** with amount `3000` → shows steps traversed | ☐ |
| 16 | **Simulate** with amount `8000` → routing differs (finance path) | ☐ |
| 17 | Draft workflow can **Publish** (if you create a new draft) | ☐ |

---

## Submit request (P3)

Log in as **originator@demo.wizflow.biz**.

| # | Check | Pass? |
|---|--------|-------|
| 18 | **New request** → published workflows in dropdown | ☐ |
| 19 | Submit petty cash: amount, purpose, department → success | ☐ |
| 20 | Optional **file attachment** uploads without error | ☐ |
| 21 | Redirected to request detail or appears under **My Requests** | ☐ |
| 22 | Status is **in progress** (or equivalent) | ☐ |

---

## My requests & timeline (P3–P4)

Still as **originator**.

| # | Check | Pass? |
|---|--------|-------|
| 23 | **My Requests** lists the new submission | ☐ |
| 24 | Open request → **Request data** shows submitted fields | ☐ |
| 25 | **Timeline** shows `request.submitted` and `step.started` (and later events) | ☐ |

---

## Approval inbox (P4)

Log in as **admin@demo.wizflow.biz** (has manager + company_admin roles).

| # | Check | Pass? |
|---|--------|-------|
| 26 | **Inbox** shows the originator's request | ☐ |
| 27 | Open item → request fields visible | ☐ |
| 28 | **Approve** with comment → success message | ☐ |
| 29 | If second step applies → item may reappear in inbox for finance step; approve again | ☐ |
| 30 | **Return** on another test request → originator sees **returned** | ☐ |
| 31 | **Reject** on another test request → status **rejected** | ☐ |
| 32 | Originator **resubmit** on returned request → back to **in progress** | ☐ |

---

## Timeline & audit (P4)

| # | Check | Pass? |
|---|--------|-------|
| 33 | After approve/reject/return, timeline shows matching events | ☐ |
| 34 | Events show actor name and timestamp | ☐ |
| 35 | Comment appears in timeline when provided on approve/return/reject | ☐ |

---

## Admin (P1)

As **admin@demo.wizflow.biz**.

| # | Check | Pass? |
|---|--------|-------|
| 36 | **Admin** → departments list loads | ☐ |
| 37 | Add a department → appears in list | ☐ |
| 38 | Users list shows admin (and originator if seeded) | ☐ |

---

## API / Git (optional)

| # | Check | Pass? |
|---|--------|-------|
| 39 | http://localhost:8010/docs — auth, workflows, requests, inbox endpoints present | ☐ |
| 40 | GitHub `main` has latest commits: https://github.com/pj-nrb-ke/WizFlow | ☐ |

---

## Not in scope yet (P5–P8)

Do **not** treat these as failures for P0–P4:

| Item | Phase |
|------|--------|
| AI workflow creator | P6 |
| Visual workflow diagram preview | P5 |
| Workflow versioning / rollback | P5 |
| Real KPI numbers / Excel export | P7 |
| Purchase Request / Leave demo workflows | P5+ seed |
| Real email delivery (inbox) | P4+ SMTP config |
| UAT on `uat.wizflow.biz` | P8 |

---

## Short happy path (~5 min)

1. **Originator** → New request → Petty Cash → submit.
2. **Admin** → Inbox → approve (twice if manager + finance steps).
3. **Originator** → My Requests → open → timeline shows full trail.

If that passes, **P0–P4 is validated** for demo purposes. Then proceed to **P5**.

---

See also: [PHASES.md](./PHASES.md), [PARALLEL-AGENT-NOTE.md](./PARALLEL-AGENT-NOTE.md).
