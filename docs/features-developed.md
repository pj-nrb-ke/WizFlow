# WizFlow — Developed Features

_A reference of every module and feature currently built in WizFlow. Generated 2026-09-30 from a code + session audit._

**WizFlow** is a single-tenant SaaS approval-workflow platform: FastAPI + PostgreSQL backend, React (Vite + Tailwind) web app, and an Expo/React Native mobile app. Prod: `app.wizflow.biz` / `api.wizflow.biz`.

## Module index
1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Form Designer](#2-form-designer)
3. [Public / Guest Forms](#3-public--guest-forms)
4. [Workflows (Approval Builder)](#4-workflows-approval-builder)
5. [Process Designer (BPMN)](#5-process-designer-bpmn)
6. [Requests (Originator)](#6-requests-originator)
7. [Inbox & Approvals](#7-inbox--approvals)
8. [Voice Notes](#8-voice-notes)
9. [Document Intelligence (OCR)](#9-document-intelligence-ocr)
10. [Recurring Schedules & Obligations](#10-recurring-schedules--obligations)
11. [Reminders & Compliance](#11-reminders--compliance)
12. [Checklists](#12-checklists)
13. [Analytics & Dashboard](#13-analytics--dashboard)
14. [Reports (MIS)](#14-reports-mis)
15. [AI Assistance](#15-ai-assistance)
16. [Notifications](#16-notifications)
17. [Admin & Organization](#17-admin--organization)
18. [User Groups](#18-user-groups)
19. [Master Data](#19-master-data)
20. [Settings & Account Security](#20-settings--account-security)
21. [Integrations & API](#21-integrations--api)
22. [Mobile App](#22-mobile-app)

---

## 1. Authentication & Onboarding
- **Email/password login** — standard credential sign-in with JWT access + refresh tokens.
- **Two-factor authentication (TOTP)** — optional Google-Authenticator-style 2FA prompt at login.
- **Show/hide password toggle** — reveal control on the login form.
- **Self-service password reset** — "forgot password" flow that emails a time-limited reset link.
- **Invite-based onboarding** — users join via an emailed invite link (72 h expiry) and set their name + password.
- **Setup wizard** — first-run guide (departments → users → groups → first published workflow) with a progress bar.

## 2. Form Designer
- **Drag-and-drop builder** — visually assemble forms from ~15 field types.
- **Field types** — text, date, dropdown, combobox, radio, checkbox, currency, yes/no, label, section, table/grid, button, master-data list, employee selector, calculated field.
- **Per-field configuration** — label, key, required flag, placeholder, and role-based visibility/editability.
- **Option sources** — dropdown values from static lists, the master-data library, org users, or an external API.
- **Calculated fields** — derived values from a formula (e.g. `{amount} * 0.15`).
- **Table / grid fields** — repeatable row data within a form.
- **Save-as-draft & JSON export** — persist work-in-progress and export the schema.

## 3. Public / Guest Forms
- **Tokenized public links** — share a form externally via a revocable link with optional expiry.
- **Guest capture** — collects guest name + email on submission.
- **Spam & abuse guards** — honeypot field, HTML sanitisation, and IP tracking.
- **File upload** — PDF/JPG/PNG up to 10 MB, MIME-checked.
- **Guest-submission portal** — reviewers accept (auto-creates the user account + welcome email) or reject with a reason.

## 4. Workflows (Approval Builder)
- **Create blank, custom, or AI-generated** — start from scratch, hand-build, or describe it in plain English.
- **Approval chain** — sequential steps with drag-to-reorder ordering.
- **Per-step assignees** — assign to a role or a specific list of users, each with SLA hours.
- **Conditional routing** — skip steps based on numeric thresholds (`skip_to`).
- **Draft → publish pipeline** — preview, health-check, and simulation before going live.
- **Visual workflow preview** — rendered form + step flowchart (the app's core flow visualization).
- **Plain-English "tune"** — adjust a workflow with a natural-language instruction.
- **Template library** — Purchase / Leave / Petty Cash templates, cloneable.
- **Versioning** — version history with rollback; clone any workflow.
- **Send form to staff** — dispatch a form to chosen users, now or on a schedule (once/weekly/monthly).
- **Submission report** — per-field aggregation across responses; Excel export.
- **Per-workflow theming** — UI theme and form layout per workflow.

## 5. Process Designer (BPMN)
_A standalone BPMN 2.0 modelling module — separate from, and not affecting, the approval engine above._
- **Drag-and-drop BPMN 2.0 canvas** — full modeler (tasks, gateways, events, pools/lanes, sequence flows) via bpmn-js.
- **Diagram management** — create, name, list, edit, and delete diagrams, saved as BPMN XML.
- **Export** — download a diagram as standard BPMN XML or as SVG.
- **Workflow → BPMN bridge** — one-way "visualize as BPMN": generate an editable BPMN diagram from an existing workflow's flow (read-only snapshot of the approval path).

## 6. Requests (Originator)
- **Submit a request** — fill a published workflow's form and submit it into the approval chain.
- **My Requests** — status tabs, search, and filters (date / amount / department) with saved filter sets.
- **Drafts** — resume or delete in-progress requests (auto-saved on device).
- **SLA / overdue indicators** — visual cues for timing.
- **Export** — CSV / Excel of the request list.
- **Request detail** — approval-chain visualisation, full audit timeline, and resubmit for returned requests.
- **Audit export** — per-request audit trail as CSV or PDF.

## 7. Inbox & Approvals
- **Approver inbox** — split list/detail view of pending approvals.
- **Filters** — by workflow, priority, and overdue-only, with saved filters.
- **Bulk actions** — multi-select approve / reject.
- **Productivity aids** — comment templates, task claiming, keyboard shortcuts (A/R/↑/↓), and auto-advance to the next item.
- **Approve / reject / return** — act on a step with an optional comment; return sends it back to the originator.
- **Public approval** — single-use email-link approval with no login required.

## 8. Voice Notes
- **Record before submit** — attach a spoken note to a request from the web or mobile app.
- **Transcription** — self-hosted Whisper on the web (audio kept), on-device speech on mobile.
- **AI grammar cleanup** — the raw transcript is tidied into a clean comment (editable before sending).
- **Timeline comment** — the note is saved as a comment on the request and shown in its timeline; on web the original audio plays back inline.

## 9. Document Intelligence (OCR)
- **Scan to auto-fill** — upload/photograph a receipt, invoice, or document and auto-extract fields to prefill the form.
- **Confidence + review** — extracted values are surfaced for review before submit.

## 10. Recurring Schedules & Obligations
- **Calendar recurrence rules** — weekly, monthly (by day-of-month, month-end clamped), or yearly, with an interval (e.g. quarterly), timezone, and send-hour.
- **Multiple targets per schedule** — each schedule can drive several actions.
- **Target kinds** — submit a workflow, an acknowledge task, or (re)open a checklist.
- **Recipients** — by individual user and/or user group.
- **Obligations & compliance** — one tracked obligation per recipient, with outstanding/submitted/missed status.
- **Nagging & escalation** — automatic reminder cadence for stragglers, escalating to a supervisor after N reminders.
- **Run-now & reporting** — manual fire for catch-up/demos; per-target compliance report with CSV export.

## 11. Reminders & Compliance
- **Recurring reminder rules** — admin/manager rules by weekday + send-hour, assigned to users/groups (edit, toggle, delete).
- **Personal occurrences** — each user sees and acknowledges their own due reminders.
- **Compliance report** — filter by rule/date/status with total/done/missed/pending metrics and CSV export.

## 12. Checklists
- **Task checklists** — create checklists of ordered tasks with assignee, priority, weight, and attachment-required flags.
- **Recurring periods** — new checklist periods spawned by recurring schedules, with carry-over rules.
- **Completion rules** — complete-all or threshold-%, with an optional verification step.
- **Per-task tracking** — status, attachments (camera on mobile), and history.
- **Public task completion** — complete a single task via a tokenized link, no login.
- **Reporting** — on-time / late / variance reporting by user.

## 13. Analytics & Dashboard
- **Executive KPIs** — volume, in-progress, approved, overdue, cycle time, SLA %, rejection %, returned.
- **Workflow performance** — per-workflow table + volume chart.
- **Approver performance** — throughput and responsiveness per approver.
- **Financial breakdown** — totals by status.
- **Bottlenecks** — slowest steps and slowest approvers.
- **Exceptions & compliance gaps** — rejected/returned/overdue summaries and regulatory gap flags.
- **Anomaly detection** — automatic surfacing of unusual patterns.
- **Dashboard** — stat cards, recent requests, inbox preview, and quick actions.

## 14. Reports (MIS)
- **MIS Actions report** — full audit trail of actions across the company.
- **Export** — CSV and Excel.
- **Saved views** — save and reuse report filter sets.

## 15. AI Assistance
- **AI workflow generation** — build a workflow from a plain-language description.
- **Refine / tune** — adjust a draft or a live workflow with a natural-language instruction.
- **AI narrative** — plain-English executive summary of analytics.
- **Setup wizard Q&A** — guided workflow creation via questions.
- **Voice-note cleanup** — grammar/spelling tidy of dictated notes (see Voice Notes).
- _(Powered by an OpenAI-compatible model; gracefully degrades when no key is set.)_

## 16. Notifications
- **In-app centre** — 50 most recent, grouped by type, with unread badge and unread filter.
- **Read management** — mark-read and mark-all-read; each links to its source request.
- **Multi-channel delivery** — email and push notifications from the backend; unread-count endpoint.

## 17. Admin & Organization
- **Departments** — create and list company departments.
- **Users** — list users with their roles.
- **Email invites** — invite users (72 h expiry) with resend and revoke.
- **Built-in roles** — originator, approver, manager, company_admin; multiple roles assignable per user at invite.
- **Company branding** — logo and brand colour.
- **Security audit log** — recent admin actions with IP + timestamp.

## 18. User Groups
- **Groups for routing** — define user groups used as approval-step assignees and schedule recipients.
- **Membership management** — add/remove members.

## 19. Master Data
- **Company lookup tables** — CRUD across 7 categories: department, vendor, cost_center, project, expense_type, category, approval_limit (code + label pairs).
- **Soft vs hard delete** — deactivate or permanently remove entries.
- **Gated** — manager/admin only.

## 20. Settings & Account Security
- **Notification preferences** — per-channel toggles (email / in-app / push / WhatsApp).
- **Two-factor (TOTP)** — set up, confirm, and disable 2FA.
- **Password change & reset** — self-service change and forgot-password.
- **Approval delegation** — delegate approvals to another user for a date range.
- **Data-retention policy** — admin-set retention (≥30 days).
- **Theming** — light/dark and brand themes; workspace branding.
- **Profile** — view account details.

## 21. Integrations & API
- **API keys** — per-user, scoped (`requests:read` / `requests:write`), shown once.
- **Webhooks** — 6 events (submitted / approved / rejected / returned / completed / file-uploaded), signed, with the secret shown once.
- **Webhook test delivery** — send a test event and see the delivery status.
- **REST API** — programmatic access to requests and related resources.

## 22. Mobile App
_Expo / React Native app (Android released; iOS code-ready pending build setup). Talks to the same prod API._
- **Login & security** — email/password, 2FA prompt, biometric (fingerprint/face) approval, forgot-password.
- **Home dashboard** — pending-approval and unread counts, manager KPI snapshot, recent inbox, voice command bar.
- **Inbox & approvals** — filterable approvals list; approve/reject; public-approval link handling.
- **My requests** — list + detail with the request timeline (including voice-note comments).
- **Submit a request** — fill a workflow form, scan a receipt (camera OCR), voice-to-form fill, and record a **voice note** comment.
- **Tasks** — my checklist tasks (complete + photo attach) and my recurring-schedule obligations (submit / acknowledge).
- **Guest-submission review** — accept/reject public-form submissions.
- **Workflow preview** — read-only view of a workflow's form + approval steps.
- **Notifications** — push notifications with deep-linking.
- **Offline support** — offline submit queue + background sync; share requests.
- **Settings** — profile, notification preferences, theme.

---

_This document reflects features already developed. For candidate/future features and gap analysis (e.g. vs Bonita), see the parity analysis and build plan._
