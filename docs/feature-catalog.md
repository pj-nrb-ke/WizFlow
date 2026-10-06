# WizFlow Feature Catalog & Candidate Additions

_Generated 2026-07-05 from a live code audit of every module (frontend pages + backend routers)._

**How to use this document:** each module below lists **what it does today** and a numbered menu of **candidate features to add**. Reply with the IDs you want (e.g. _"add FORM-3 and REQ-1"_) and I'll build them.

**Effort key (rough engineering estimate):** **S** ≈ under a day · **M** ≈ 1–3 days · **L** ≈ multi-day / spans backend + frontend.

**✅ Delivered** marks a candidate that has since been built and shipped (see the _No-code → low-code program_ note under the index). Modules 12–13 are new modules added by that program.

## Module index

| # | Module | ID prefix | Candidates |
|---|--------|-----------|-----------|
| 1 | Form Designer & Public Forms | `FORM` | 11 |
| 2 | Workflows (builder, custom, AI, templates) | `WF` | 8 |
| 3 | Requests, Inbox & Approvals | `REQ` | 10 |
| 4 | Reminders & Compliance | `REM` | 7 |
| 5 | Analytics, Reports & Dashboard | `ANL` | 8 |
| 6 | Notifications | `NOTIF` | 6 |
| 7 | Admin & Users | `ADM` | 5 |
| 8 | Settings & Account Security | `SET` | 5 |
| 9 | Master Data | `MD` | 5 |
| 10 | Integrations & API | `INT` | 6 |
| 11 | Auth & Onboarding | `AUTH` | 5 |
| 12 | Low-Code Data Platform | `DATA` | 4 |
| 13 | BPMN App Builder & Native Execution | `BPMN` | 5 |

> **No-code → low-code program (shipped).** A multi-phase program has since turned WizFlow into a platform where non-technical managers build working apps from business logic: **describe a process in plain English → AI builds it**, or **draw a BPMN diagram → publish it as a running app**. It delivered the two new modules below (12 Low-Code Data Platform, 13 BPMN App Builder) plus several candidates already listed above — **WF-1** (parallel branches), **WF-2** (advanced routing: compound AND/OR, dates, string/`IN`), **WF-4** (SLA escalation enforcement), **ADM-1** (custom roles + permission editor / RBAC), **AUTH-2** (account lockout/throttle), and **SET-3** (session management — "log out other devices") — all marked **✅ Delivered** in their tables. It also added enterprise building blocks that cut across modules: **service/automated steps** (notify / webhook / AI / generate document / write data record), **document generation** (templates → PDF), and a **multi-provider AI layer** (OpenAI-compatible or Anthropic).

---

## 1. Form Designer & Public Forms  `FORM`

**Today:** Drag-and-drop designer with ~15 field types (text, date, dropdown, combobox, radio, checkbox, currency, yes/no, label, section, table/grid, button, master-data list, employee selector, calculated field); per-field config (label, key, required, placeholder, role visibility/editability, option sources = static / master-data library / org users / external API); calculated fields (`{amount} * 0.15`); table fields; JSON export; save-as-draft workflow. Public forms: revocable tokenized links (optional expiry), guest name+email capture, honeypot spam guard, file upload (PDF/JPG/PNG, 10 MB, MIME-checked), HTML sanitisation, IP tracking; guest-submission portal with accept (auto-creates account + welcome email) / reject (with reason).

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| FORM-1 | Conditional field logic | Show/hide/require a field based on another field's value ("show *reason* if *amount* > 5000"). Schema already stores role rules but has no value-based logic. | L |
| FORM-2 | Field-level validation rules | Min/max, regex, date range, phone/URL/postcode patterns — configured in the designer, enforced client + server. Today only type + required are checked. | M |
| FORM-3 | Signature field type | Draw-or-type signature capture for designer, public, and internal forms. Not present anywhere today. | M |
| FORM-4 | Multi-page / wizard forms | Split long forms into steps with a progress indicator. Currently single-page only. | M |
| FORM-5 | Public-form field-type parity | Public renderer only handles 10 of ~15 types — table, calculated, master-dropdown, employee-selector, time, combobox are silently dropped. Close the gap. | M |
| FORM-6 | Guest submission receipt email | Email the guest an acknowledgement on submit (today they're only emailed on accept/reject). | S |
| FORM-7 | Public-form draft auto-save | Persist in-progress public submissions (already exists on the internal submit page). | S |
| FORM-8 | Stronger bot protection | Add reCAPTCHA / rate-limited challenge beyond the current honeypot. | S–M |
| FORM-9 | Render field help text/tooltips | Designer stores help text but forms don't display it. Surface it. | S |
| FORM-10 | Form analytics | Track abandonment and per-field error rates to find friction points. | M |
| FORM-11 | OCR extraction on public forms | Auto-fill fields from an uploaded document (already available on the internal submit page via `/documents/extract`). | M |

---

## 2. Workflows  `WF`

**Today:** Blank / custom / AI-generated workflow creation; drag-to-reorder approval chain; draft→publish pipeline with preview, health-check, and simulation; sequential approval steps with per-step assignee (role or user list) and SLA hours; conditional routing (`skip_to` on numeric thresholds); plain-English "tune" command; template library (Purchase / Leave / Petty Cash) with clone; version history + rollback; workflow clone; Excel export; send-form-to-staff + scheduled dispatch (weekly/monthly/once); submission report with field aggregation; guest-submission inbox; per-workflow UI theme & form layout.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| WF-1 | Parallel approval branches | Route to two approvers at once (e.g. Finance **and** Compliance) and join. _(Was strictly sequential; now built.)_ | ✅ Done |
| WF-2 | Advanced routing conditions | Date ranges, string / `IN` matching, and compound AND/OR logic. _(Was numeric-only; now built.)_ | ✅ Done |
| WF-3 | Dynamic assignees | Assign to "originator's manager", "department head", etc., instead of hardcoded roles/users. | M |
| WF-4 | SLA escalation enforcement | Auto-escalate / reassign / notify when a step breaches its SLA. _(Settings existed but were unenforced; now enforced on the scheduler loop.)_ | ✅ Done |
| WF-5 | Per-task delegation / reassignment | Wire delegation into the live approval flow so a single task can be reassigned mid-approval. | M |
| WF-6 | Bulk approve/reject in guest inbox | Multi-select accept/reject for guest submissions (currently one at a time). | S |
| WF-7 | Edit-before-clone for templates | A modal to adjust approvers/fields before a template is saved as a draft. Clone is verbatim today. | S–M |
| WF-8 | Returned-request resubmission tracking | Auto-route a returned request back to the originator and count resubmission attempts. Rejection reason is stored but no loop-back tracking exists. | M |

---

## 3. Requests, Inbox & Approvals  `REQ`

**Today:** *My Requests* — status tabs, search, date/amount/department filters, saved filter sets, CSV/Excel export, draft resume/delete, SLA/overdue indicators. *Inbox* — split list/detail, rich filters + priority + overdue-only, saved filters, export, multi-select bulk approve/reject, comment templates, task claiming, keyboard shortcuts (A/R/↑/↓), auto-advance to next, timeline. *Detail* — approval-chain visualisation, audit timeline, approve/reject, resubmit (for returned), CSV + PDF audit export. *Public approve* — single-use email-link approval, no login.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| REQ-1 | "Request more info" action | Ask the originator a question without rejecting or returning the request. Approvers can only comment while approving/rejecting today. | M |
| REQ-2 | Discussion thread | Nested comments on a request open to both originator and approvers. Comments today are single notes on an action. | M–L |
| REQ-3 | Originator cancel / withdraw | Let the submitter cancel an in-flight request. Not possible today. | S |
| REQ-4 | True bulk approve/reject endpoint | Atomic backend batch action; the Inbox currently loops per-request, which is slow for large batches. | S–M |
| REQ-5 | Reassign from the Inbox | Hand a single task to another user without a date-ranged delegation. | M |
| REQ-6 | Resubmission diff | Before/after field diff when a returned request is resubmitted. | M |
| REQ-7 | SLA-breach report | One list of everything overdue / breached across all workflows. | S–M |
| REQ-8 | Priority bump / SLA override | Change a live request's priority or due date for edge cases. Both are read-only today. | S |
| REQ-9 | Bulk actions on My Requests | Multi-select cancel / export-subset (Inbox has this; My Requests doesn't). | S |
| REQ-10 | Batch attachment download | Zip and download all files on a request (or across a filtered list). | S |

---

## 4. Reminders & Compliance  `REM`

**Today:** Admin/manager rule creation (name, weekday selection, UTC send-hour, user/group assignment, edit, toggle, delete); personal occurrence list with acknowledge; compliance report filtered by rule/date/status with total/done/missed/pending metrics and CSV export.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| REM-1 | Missed-reminder escalation | Notify a manager when a reminder is missed. No escalation exists today. | M |
| REM-2 | Snooze / defer | Push an individual occurrence to later. | S |
| REM-3 | Per-rule message templates | Custom message body with variables per rule (fixed textarea today). | S–M |
| REM-4 | Bulk acknowledge | Mark many occurrences done at once (one-at-a-time today). | S |
| REM-5 | Compliance trend chart | Week-over-week compliance trend, not just point-in-time totals. | S–M |
| REM-6 | Batch enable/disable rules | Toggle many rules together. | S |
| REM-7 | Schedule sanity check | Warn when a rule can never fire (timezone / hour mismatch). | S |

---

## 5. Analytics, Reports & Dashboard  `ANL`

**Today:** Executive KPIs (volume, in-progress, approved, overdue, cycle time, SLA %, rejection %, returned); workflow performance table + volume chart; approver performance; financial breakdown by status; exceptions summary; bottlenecks (slowest steps/approvers); daily-volume trend; regulatory compliance gaps; anomaly detection; AI narrative summary; MIS Actions report (audit trail, CSV + Excel, saved views); dashboard (stat cards, recent requests, inbox preview, quick actions).

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| ANL-1 | Finish Phase-2 tabs | Workload, Process-journey/SLA, and Scorecards tabs are backend-ready but the frontend is stubbed. Complete the visualisations. | M |
| ANL-2 | Customisable dashboard | Drag-drop widgets and per-user layout (all cards are hardcoded today). | L |
| ANL-3 | Historical KPI comparison | Month-over-month / quarter-over-quarter trend of the KPIs themselves. | M |
| ANL-4 | More chart types + cost-center view | Line / pie / stacked charts and department / cost-center breakdown (only bars + sparklines today). | M |
| ANL-5 | Scheduled report delivery | UI to email reports on a schedule (backend already supports it). | S–M |
| ANL-6 | PDF export / shareable snapshot | Export a dashboard or report as PDF and share a snapshot link. | S–M |
| ANL-7 | KPI targets + scorecard grading | Set targets and auto-grade scorecards against them. | M |
| ANL-8 | Drill-through everywhere | Click any KPI card to open the underlying request list (partial today). | S–M |

---

## 6. Notifications  `NOTIF`

**Today:** In-app centre (50 most recent, grouped by inferred type, unread badge, mark-read, mark-all-read, unread filter, link to source request); email + push delivery on the backend; unread-count endpoint.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| NOTIF-1 | Preference centre | Per-channel, per-event opt-in/out (backend hardcodes email + auto-push today). | M |
| NOTIF-2 | Digest / batching | Hourly or daily summary instead of one message per event. | M |
| NOTIF-3 | Quiet hours / DND | Suppress non-urgent notifications outside chosen hours. | S–M |
| NOTIF-4 | SMS channel | Add SMS alongside email + push. | M |
| NOTIF-5 | Editable templates | Admin-editable subject/body per channel and event. | M |
| NOTIF-6 | Archive + export | Persistent notification history with export. | S |

---

## 7. Admin & Users  `ADM`

**Today:** Department create/list; user list with roles; email invites (72 h expiry, resend, revoke); 4 built-in roles (originator, approver, manager, company_admin) multi-assignable at invite; user groups for approval routing; company branding (logo + colour).

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| ADM-1 | Custom roles + permission editor | Define roles and granular permissions. _(Was fixed built-in slugs; now a 6-permission catalog + custom roles via `require_permission`.)_ | ✅ Done |
| ADM-2 | Bulk user import | CSV upload instead of one-by-one invites. | S–M |
| ADM-3 | Deactivate / reactivate users | UI toggle for the existing `is_active` flag (no way to disable an account without deleting today). | S |
| ADM-4 | Permission matrix view | Show at a glance what each role can do. | S–M |
| ADM-5 | SSO / SAML / OAuth | Enterprise directory login (email+password only today). | L |

---

## 8. Settings & Account Security  `SET`

**Today:** Notification preference toggles (email / in-app / push / WhatsApp); TOTP 2FA setup/confirm/disable; approval delegation (date range); data-retention policy (admin, ≥30 days); workspace branding; light/dark + brand themes; read-only profile.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| SET-1 | Password change + reset | Self-service change and forgot-password flow (password is only set at invite time today). | S–M |
| SET-2 | 2FA backup codes | Recovery codes for a lost authenticator (no fallback today). | S |
| SET-3 | Session management | "Log out other devices" — invalidates all other sessions. _(Now built via token-version session invalidation; a per-session list view is still open.)_ | ✅ Done |
| SET-4 | Login history | Show where/when the account signed in. | S |
| SET-5 | Complete WhatsApp channel | Phone capture + delivery wiring behind the existing toggle. | M |

---

## 9. Master Data  `MD`

**Today:** CRUD for company lookup tables across 7 categories (department, vendor, cost_center, project, expense_type, category, approval_limit) as code+label pairs; soft-delete (deactivate) vs hard-delete; manager/admin gated.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| MD-1 | Import / export | Bulk CSV upload/download of reference data. | S–M |
| MD-2 | Hierarchical entries | Parent→child relationships (e.g. cost centre → department). | M |
| MD-3 | Default value | Mark one entry as the default choice in forms. | S |
| MD-4 | Per-category validation | Regex / length rules on entries. | S–M |
| MD-5 | Audit trail | Log who created / modified / deactivated each entry. | S |

---

## 10. Integrations & API  `INT`

**Today:** API keys (per-user, scoped `requests:read` / `requests:write`, shown once); webhooks (6 events — submitted / approved / rejected / returned / completed / file-uploaded — signed, secret shown once); webhook test delivery with status; security audit log (last 50 admin actions with IP + timestamp).

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| INT-1 | Webhook delivery log + retry | Queryable delivery history and manual retry of failures (only a live test exists today). | M |
| INT-2 | Pre-built connectors | Slack / Teams / Zapier out-of-the-box. | M–L |
| INT-3 | OAuth app registration | Let third-party apps request scopes (admin-issued keys only today). | L |
| INT-4 | IP allowlisting | Restrict API-key / webhook access by network. | S–M |
| INT-5 | ERP connectors | Currently marked "deferred" in the UI. | L |
| INT-6 | Rate-limit visibility | Surface / configure API rate limits in admin (they exist in middleware, hidden). | S |

---

## 11. Auth & Onboarding  `AUTH`

**Today:** Email/password login; optional TOTP 2FA prompt; invite-based onboarding (email link, name+password, 72 h); JWT access + refresh tokens; setup wizard (departments → users → groups → first published workflow, with progress bar).

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| AUTH-1 | SSO / SAML / OAuth | Enterprise identity-provider login. | L |
| AUTH-2 | Account lockout / throttle | Slow or lock after N failed logins. _(Was log-only; now per-account lockout counted from the security audit log.)_ | ✅ Done |
| AUTH-3 | Email verification | Verify invitee email ownership (token is the only check today). | S |
| AUTH-4 | Magic-link login | Passwordless sign-in option. | M |
| AUTH-5 | Multi-workspace | Belong to / switch between multiple companies (one org per user today). | L |

---

## 12. Low-Code Data Platform  `DATA`

**Today (new module — Build → Data):** Typed **business entities** (objects like Customer, Invoice, Asset) with fields of type text, number, date, yes/no, select (fixed option list), or **relation** (a link to records of another entity); records are stored as JSON (no dynamic schema changes), so new entities and fields are created instantly. The **Data** web page gives an entity list + field builder, a per-entity records table, and type-aware record forms (date picker, number box, dropdown, relation picker). Entities and records are **shared across every app** in the workspace, and **workflows can write records automatically** via the `record` service step (or a Process Designer task bound to an entity) — closing the loop from process to data.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| DATA-1 | Relation expansion in forms & workflows | Pull fields from a linked record (e.g. show the Customer's tier on an Invoice) instead of only the label. Backend relation resolution is minimal today. | M |
| DATA-2 | Visual page-layout designer | Compose a custom screen per entity (sections, columns, which fields show where) instead of the default stacked form/table. | L |
| DATA-3 | Record list views | Per-entity search, filters, sort, and CSV import/export over records (today it's a plain table). | M |
| DATA-4 | Field validation rules | Min/max, regex, required-unique on entity fields, enforced on save. Only type is checked today. | S–M |

---

## 13. BPMN App Builder & Native Execution  `BPMN`

**Today (new module — Build → Process Designer):** A BPMN 2.0 diagram becomes a **running app** two ways. **Publish as app** compiles a diagram into a normal linear approval workflow (appears under Workflows). **Run as native app** executes the diagram on an embedded SpiffWorkflow engine for shapes a linear flow can't express — parallel branches, intermediate events, loops — with human steps surfacing in each assignee's **Inbox** (🧩 Native process tasks → Complete), and timers/service tasks advanced by the scheduler; native instances are persisted so a run resumes across requests. Each task has a **Binding panel** (assignee / form fields / service action / gateway condition) saved as side-JSON with the diagram. Diagrams can be started by drawing, by **template gallery**, or by **plain-English description** (AI-from-requirements), and refined with a conversational **Copilot**. Service actions available on tasks: notify, webhook, AI, generate document, write data record.

| ID | Feature | What it adds & why | Effort |
|----|---------|--------------------|--------|
| BPMN-1 | Per-task native forms | Collect and validate data at each native human task; today Complete submits an empty payload. | M |
| BPMN-2 | Native run-history / instance viewer | See a native app's live state, completed path, and data — there's no run viewer yet. | M |
| BPMN-3 | Document service task in native runner | The native runner handles notify/webhook/ai/record; document generation is still deferred there. | S–M |
| BPMN-4 | Per-app theming / branding | Give each published app its own look (today apps inherit the workspace theme). | S–M |
| BPMN-5 | Record / upload intake | Build an app from a recorded walkthrough or an uploaded process document, not just a typed description. | L |

---

_85 candidates across 13 modules — 6 now **✅ delivered**, plus 2 new modules (Low-Code Data, BPMN App Builder) added by the no-code→low-code program. Tell me which ID(s) to build next and I'll take it from there._
