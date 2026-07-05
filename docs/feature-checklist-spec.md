# WizFlow Feature Spec — **Checklists**

_Refined 2026-07-05 from your 8-point brief, expanded with recommended options and mapped onto WizFlow's existing building blocks._

A **Checklist** is a named, time-boxed set of **tasks** assigned to people, optionally **recurring**, with **multi-channel reminders**, **no-login task links**, and **on-time-vs-due analytics**. Much of the plumbing already exists in WizFlow (Reminders engine, notification delivery, public token links, file uploads, compliance reporting) — this spec calls out what we **reuse** vs **build new**.

---

## 1. Concept model (data structure)

Three layers keep recurrence and analytics clean:

| Entity | What it is |
|--------|-----------|
| **Checklist definition** (a "series") | The blueprint: name, tasks, window rule, recurrence, default assignees, reminder config. Edited by the owner. |
| **Checklist instance** (an "occurrence") | One concrete run of the definition for a specific period (e.g. "Store Opening — 5 Jul"). Recurring definitions spawn one instance per period; a one-off = a single instance. All completion state and analytics live here. |
| **Task** | A single to-do inside an instance: title, assignee, due date, status, attachments, completion record. |

> This mirrors how **Reminders** already work in WizFlow (a *rule* generates *occurrences*) — we extend that engine rather than invent a new one.

### Per-checklist settings (chosen at creation)

Your answers converged on one principle: these are **per-checklist options set when the checklist is created**, not global defaults —

| Setting | Options |
|---------|---------|
| **Timezone** | Any IANA zone; drives due dates, reminder times, overdue calculations. |
| **Verification** | None (self-mark-done) · **Manager approval required on every task** (+ named approver, default = owner). |
| **Recurring carry-over** | Reset fresh each occurrence · Carry overdue tasks forward · Block next occurrence until prior closed. |
| **Completion rule** | All tasks · All required tasks · ≥ X% by weight. |
| **Reminder channels & lead times** | Which channels + when to nudge (see R6). |

(Plus name, description, category, recurrence, window, and default reminder config.)

---

## 2. Your 8 requirements — refined

### R1 — Create a checklist (a set of tasks)
- Checklist has: **name, description, category/tags, owner**, and an **ordered list of tasks**.
- **Task fields**: title, description/instructions, assignee, due date, priority (Low/Normal/High/Urgent), optional **weight** (so % complete reflects importance), attachments, notes.
- **Save as template** → pre-built libraries like *Store Opening*, *Month-End Close*, *New-Hire Onboarding*, *Compliance Audit* (reuses WizFlow's template pattern).
- **Compose from existing checklists** — build a new checklist by cherry-picking individual tasks from *multiple* existing checklists, then adding manual tasks (full flow in **R1a** below).
- _Optional/advanced:_ task **dependencies** (Task B unlocks only after Task A is done) and **sub-tasks**.

### R1a — Build a checklist by cloning tasks from multiple checklists

1. In the new-checklist builder, choose **"Add tasks from existing checklists."**
2. A picker lists tasks from **all existing checklist _definitions_** — one row per task showing **Checklist name · Task title · Task description**. Only base definitions appear; recurring runs are collapsed to their series, so each task shows **once**, not once per cycle.
3. **Search/filter** by checklist name or task text, and **multi-select tasks across as many source checklists as you want**.
4. Click **Clone selected** → chosen tasks are copied into the new checklist as **fresh tasks**. Carried over: title, description, and reusable config (priority, weight, attachment-required flag). **Reset/blank:** assignee and due date (you set these for the new checklist's own window), plus status and any past evidence/attachments.
5. Then **add manual tasks**, reorder, and edit any cloned task freely. The picker can be reopened to pull in more.

> Net effect: a new checklist = *tasks cherry-picked from any number of existing checklists* **＋** *manually added tasks* — all independently editable.

### R2 — Start & stop dates (the completion window)
- Instance has a **start** and **due (stop)** datetime; all task due dates must fall inside it (validated).
- Derived status: **Not started → In progress → Completed / Partially complete / Overdue**.
- **Completion definition** (what counts as "the checklist is done") — configurable: *all tasks* · *all **required** tasks* · *≥ X% by weight*.
- **On-stop behaviour**: auto-lock the instance, or allow late completion (still recorded, flagged "late"). Recommend: allow late + flag.
- **Timezone: per-checklist** ✅ (confirmed feasible). Each checklist stores its own IANA timezone; all due dates, reminder send-times and overdue calculations resolve in that zone. (Upgrades today's fixed-UTC Reminders.)

### R3 — Recurrence + completion options
- **Repeat pattern**: None (one-off) · Daily · Weekly (pick weekdays) · Monthly (day-of-month **or** "nth weekday") · Quarterly · Yearly · Custom ("every N days/weeks").
- **Series end condition** (your "number of times / by date"): **Never** · **After N occurrences** · **Until a set date**.
- **Per-occurrence window**: how long each instance stays open (e.g. daily checklist due end-of-day; monthly due last working day).
- **Carry-over policy — chosen at checklist creation**: *reset fresh* · *carry forward overdue tasks* · *block new occurrence until the prior one is closed*. (Per-checklist setting, not global.)

### R4 — File attachments per task
- Multiple files per task as **evidence of completion**; reuses existing upload infra (MIME allow-list — PDF/JPG/PNG/…, size cap, sanitised, virus-safe path).
- Option: **attachment required to close** a task (can't mark done without evidence).
- Uploadable from **both** the app **and** the no-login email link (see R7).

### R5 — Per-task completion date
- Each task gets its **own due date**, constrained to the checklist window.
- **Exactly one assignee per task** (different tasks → different people); each task also has its **own reminder lead time**.
- **Reassignment**: if the assignee becomes unavailable (e.g. on leave), an **admin/owner reassigns the task** to another user mid-flight. The new assignee inherits pending reminders and gets a **fresh no-login link** (the old token is revoked); the change is written to the audit trail with a reason.

### R6 — Multi-channel reminders
Reminders fire on a schedule (e.g. *X days before*, *on due date*, *when overdue*) to the assignee, with **escalation to the owner/manager** on overdue.

| Channel | WizFlow status today | Work needed |
|---------|----------------------|-------------|
| On-screen (in-app) | ✅ exists | Wire checklist events into notification centre |
| Mobile app push | ✅ exists (Android APK) | Add checklist payloads + deep link |
| Email | ✅ exists | Template + task link |
| WhatsApp | ⚠️ toggle only, not wired | **Build** delivery integration |
| SMS | ❌ missing | **Build** SMS channel |

- **Digest vs per-task**: send one "here are your N tasks due today" message, or one per task (user preference).
- **Quiet hours / do-not-disturb** and **snooze** on an individual task.

### R7 — Open a task from the app **or** a no-login email link
- Email/WhatsApp/SMS contains a **tokenised deep link** that opens **only the specific task(s)** for that person — **no login** (reuses the public-token pattern already used by public forms `/p/:token` and email approvals `/approve/:token`).
- The no-login page lets the user: **mark complete, upload attachment(s), add a note** — nothing else is exposed.
- A link can bundle **all of that user's tasks due that day** ("today's tasks" magic link) or target a single task.
- **Security**: token is unguessable, **scoped to the exact task(s) + person**, **expires** (after due date / completion), **revocable**, single-purpose; every action logged with IP + timestamp; honeypot/anti-abuse like public forms. _Optional:_ require the recipient's email to match for sensitive checklists.

### R8 — Completion-vs-due analytics (efficiency / productivity)
- On close, capture **completed_at**, **who**, and **which channel** they used.
- Compare to the task's due date → **on-time / early / late** + **days variance**.
- **Reports** (reuse Analytics + CSV/Excel export patterns):
  - **On-time completion %**, average delay, early/late distribution.
  - **Productivity**: tasks completed per person per period; throughput trend.
  - **Efficiency score** per user / team / checklist; **streaks** & **leaderboard**.
  - **Bottleneck tasks** (which tasks are chronically late) and **at-risk instances**.
  - Breakdowns by user, checklist, category, department; period-over-period trend.
  - _Interesting signal:_ which **channel** drives the fastest completions.

---

## 3. Options I'd add (beyond the brief)

| # | Addition | Why it matters |
|---|----------|----------------|
| A1 | **Task verification / sign-off** — **per-checklist setting** (e.g. *Tender Submission* → every task needs manager approval). When on: assignee marks done → *Awaiting approval* → manager approves (→ Completed) or rejects with reason (→ back to assignee). Analytics capture both *submitted-by-assignee* and *approved-by-manager* times. | Makes efficiency data *trustworthy*; reuses WizFlow's approval concept. |
| A2 | **Single-owner tasks + admin reassignment** (resolved — see R5) | One accountable person per task; admin can hand off on leave without losing history. |
| A3 | **Task states**: Not started · In progress · **Blocked** · Done · **Skipped (reason)** · N/A | Real work isn't binary; also improves analytics. |
| A4 | **Progress indicator** (X/Y tasks, % by weight) on list + dashboard | At-a-glance status. |
| A5 | **Comments/notes per task** + full **audit trail** of state changes | Traceability (reuses the event log). |
| A6 | **Owner/manager completion alerts** + **overdue escalation** | Closes the accountability loop. |
| A7 | **Views**: list · **Kanban** (by status) · **Calendar** (by due date) | Different roles want different lenses. |
| A8 | **Bulk ops**: assign many, remind all, close/skip with reason | Scales to large checklists. |
| A9 | **Webhook on checklist/task events** (submitted, completed, overdue) | Reuses the Integrations webhook system for external systems. |
| A10 | **Roles & permissions**: who can create checklists (manager/admin-gated, like Reminders), who sees which reports | Governance. |
| A11 | **Dashboard tile + Notifications badge** for "my open tasks" | Discoverability; matches existing dashboard quick-actions. |
| A12 | _Advanced:_ conditional tasks, mobile **offline** completion for field staff | Field-ops use cases. |

---

## 4. Reuse map — what's already built vs net-new

**Reuse (extend existing WizFlow code):** recurrence engine (Reminders), in-app + email + push notifications, no-login token links (public forms / email approvals), file-upload pipeline, compliance/analytics reporting + CSV/Excel export, template/clone pattern, event/audit log, role gating.

**Build new:** the Checklist / Instance / Task data model + UI, per-task no-login task page, **WhatsApp** and **SMS** delivery channels, the efficiency/productivity report, and (if chosen) task verification & Kanban/calendar views.

---

## 5. Decisions — resolved (2026-07-05)

1. **Timezone → per-checklist.** ✅ Feasible. Each checklist carries its own IANA timezone.
2. **Assignment → one user per task.** Admin can reassign mid-flight if the assignee is on leave (see R5).
3. **Verification → per-checklist setting.** Some checklists (e.g. Tender Submission) require **manager approval on every task**; others allow self-mark-done. Configured at creation.
4. **Carry-over → chosen at checklist creation** (reset / carry-forward / block-until-closed).
5. **WhatsApp & SMS → ON HOLD.** Decision parked; _not blocking_ — v1 channels (in-app + email + push) are unaffected and these can slot in later.

---

## 6. Suggested build phases

- **Phase 1 — MVP:** Checklist + tasks (one-off window), per-task due + assignee, file attach, in-app + email reminders, **no-login email link to a task**, mark-complete, and the **completion-vs-due report**.
- **Phase 2 — Recurrence & rollups:** recurrence engine + end conditions + carry-over, push notifications, overdue escalation, dashboard tile, analytics + export, templates library, Kanban/calendar views.
- **Phase 3 — Full channels & trust:** WhatsApp + SMS reminders, task verification/sign-off, weighting & dependencies, webhooks, mobile offline.

---

_Tell me what to change, which decisions you want, and which phase to start — then I'll build it._
