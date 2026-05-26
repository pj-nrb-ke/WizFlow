# WizFlow Features Ver 1

## Purpose

This document lists the features required to transform WizFlow into a highly user-friendly, manager-friendly, office-ready workflow, approval, KPI, reporting, and analytics platform.

The focus is on three goals:

| Goal | Meaning |
|---|---|
| Ease of Use | Managers and office users should work without technical knowledge |
| Power-Packed Performance | The app should handle workflows, approvals, tracking, reminders, and automation reliably |
| Reports & Analytics | Every workflow should generate useful KPI, SLA, audit, and management insights |

## Current Foundation

WizFlow already has a strong base, including multi-tenancy, role-based access, dynamic form designer, custom workflows, approval inbox, AI workflow drafting, versioning, simulation, email approval links, attachments, notifications, audit trail, and basic MIS export.

The next transformation should focus on making the product easier to adopt, easier to configure, easier to use daily, and much stronger in reporting and analytics.

## Phase 1 — Office-Ready User Experience & Core Productivity

Phase 1 should make WizFlow immediately usable by offices with minimum training.

| Feature | Description |
|---|---|
| Guided Company Setup Wizard | A simple step-by-step setup to create company profile, departments, branches, users, reporting managers, roles, and approval groups. This reduces setup confusion for new companies. |
| Manager-Friendly AI Workflow Wizard | Managers describe the workflow in plain English. The system asks missing questions and creates the workflow, form fields, approval chain, routing, notifications, and basic KPI tracking. |
| Plain-English Workflow Fine-Tuning | Managers can edit workflows using simple commands such as “Add Finance approval above 50,000” or “Send rejected requests back to the originator.” |
| Workflow Health Checker | Before publishing, the system checks for missing approvers, broken routing, duplicate steps, missing initiators, missing required fields, and risky approval gaps. |
| Simplified Workflow Publishing Flow | A clean Draft → Preview → Test → Publish flow so managers understand exactly when a workflow becomes live. |
| Improved Originator Status Tracking | The request originator should clearly see current status, current pending person/role, timeline, comments, expected next action, and overdue indicators. |
| Enhanced My Requests Page | A user-friendly page showing submitted requests, drafts, returned requests, approved items, rejected items, and requests requiring correction. |
| Mobile-Friendly Approval Screen | A clean phone-friendly approval page for approvers to review, comment, approve, reject, return, or upload supporting files. |
| Better Approval Inbox UX | Improve the inbox with filters by workflow, status, date, originator, amount, overdue items, department, and priority. |
| Smart Notification Center | A central place for pending approvals, returned requests, overdue alerts, system messages, and decision updates. |
| Notification Preferences | Users can choose how they want to be notified: in-app, email, WhatsApp later, and push notifications later. |
| Prebuilt Office Workflow Templates | Ready-to-use templates for petty cash, purchase request, leave, overtime, travel expense, vendor onboarding, cheque collection, contract approval, IT access, equipment request, and month-end reports. |
| Template Marketplace Foundation | A simple internal library where admins can copy, customize, and reuse workflow templates. |
| Business-Friendly Form Controls | Add practical form fields such as currency amount, attachment with category, approval comment, employee selector, vendor selector, department selector, branch selector, yes/no control, calculated field, and section header. |
| Smart Dropdown Sources | Dropdowns should support fixed values, internal master data, API values, and SQL query values, while hiding technical setup from normal managers. |
| Master Data Library | A central admin area for reusable lists such as departments, branches, cost centers, vendors, projects, expense types, request categories, and approval limits. |
| Field-Level Permissions | Control which fields can be viewed, edited, or filled by originators, approvers, finance, HR, or admins. |
| Returned Request Correction Flow | When a request is returned, the originator should see what must be corrected, edit allowed fields, and resubmit easily. |
| Quick Search Across Requests | Search by reference number, workflow name, originator, approver, department, amount, date, or status. |
| Simple User Help Panels | Add small help notes, tooltips, and examples in workflow creation, form design, request submission, approval inbox, and reports. |
| Demo Mode / Sample Company | Maintain a rich demo company with sample workflows, users, approvals, reports, and KPI data for sales demonstrations and onboarding. |
| Basic Audit Export | Export request timeline and approval history to Excel/PDF for management or audit review. |
| Excel Export Enhancements | Improve exports for My Requests, Approval Inbox, Workflow List, Actions Report, and Audit Trail. |
| Admin Control Panel Cleanup | Make admin screens easier for non-technical company admins with guided actions and clear labels. |
| Workspace Branding | Allow company logo, theme, colors, and basic branding for a professional office experience. |

## Phase 2 — KPI, Reporting, Analytics & Automation Power

Phase 2 should position WizFlow as an office execution and KPI performance platform, not just an approval app.

| Feature | Description |
|---|---|
| Executive KPI Dashboard | A high-level dashboard showing total requests, pending approvals, overdue items, approval speed, rejection rate, SLA compliance, and workflow bottlenecks. |
| Department KPI Dashboard | Shows performance by department, including request volume, average approval time, overdue items, pending workload, and SLA achievement. |
| User Performance Dashboard | Shows each approver’s pending tasks, average response time, overdue approvals, approvals completed, rejections, returns, and escalation count. |
| Workflow Performance Dashboard | Shows performance of each workflow, including volume, completion time, delay points, rejection rate, returned rate, and SLA trend. |
| SLA Configuration by Workflow and Step | Define expected completion time for the full workflow and for each approval step. |
| SLA Breach Alerts | Notify users and managers when requests are close to deadline or already overdue. |
| Bottleneck Analytics | Automatically identify the slowest users, steps, departments, branches, and workflow types. |
| Workload Analytics | Show current and historical workload by user, role, department, branch, and workflow. |
| Financial Value Analytics | For amount-based workflows, track total requested value, approved value, rejected value, pending value, and department-wise spend. |
| Exception Analytics | Track rejected requests, returned requests, missing documents, overdue approvals, repeated corrections, and policy exceptions. |
| Compliance Dashboard | Shows workflows with complete audit trail, missing approvals, missing documents, overdue approvals, and policy deviations. |
| AI KPI Summary | AI generates plain-English summaries such as “Finance is the main bottleneck this week” or “Purchase approvals improved by 18%.” |
| AI Management Insights | AI highlights risks, delays, workload pressure, abnormal approval patterns, and improvement suggestions. |
| Scheduled Reports | Automatically email daily, weekly, or monthly reports to managers. |
| PDF Report Builder | Generate clean PDF reports for workflow status, SLA, approvals, audit trail, and management review. |
| Advanced Excel Reports | Export formatted Excel reports with filters, summaries, and grouped data. |
| Report Filter Builder | Allow users to filter reports by company, department, branch, workflow, status, date, amount, originator, approver, and SLA status. |
| Saved Report Views | Users can save commonly used reports such as “Pending Finance Approvals” or “Overdue Purchase Requests.” |
| Report Subscription | Managers can subscribe to reports and receive them automatically. |
| KPI Targets | Define targets such as average approval time, maximum overdue count, approval SLA percentage, and department response time. |
| Scorecards | Generate department and user scorecards based on SLA, response time, workload, and completion rate. |
| Trend Charts | Show daily, weekly, monthly, and quarterly workflow trends. |
| Drill-Down Analytics | Click a KPI card to open the detailed list behind the number. |
| Workflow Journey Analytics | Show the average path taken by requests and where they slow down. |
| Approval Heatmap | Show busy days, busy departments, and peak approval times. |
| Dashboard Personalization | Users can choose which KPI cards, charts, and reports appear on their dashboard. |
| Recurring Workflow Scheduler | Automatically initiate workflows daily, weekly, monthly, quarterly, or yearly. |
| Scheduler Use Cases | Support recurring tasks such as month-end sales reports, petty cash reconciliation, compliance filings, HR attendance verification, and branch checklists. |
| Escalation Engine | Automatically escalate overdue approvals to managers or fallback approvers. |
| Delegation and Out-of-Office Rules | Allow approvers to delegate approvals during leave or absence. |
| Workflow Priority Levels | Mark requests as normal, urgent, high-value, compliance-critical, or executive priority. |
| Bulk Approval Controls | Allow safe bulk actions for selected low-risk approvals where business policy allows. |
| Advanced Request Filters | Add powerful filters across inbox, requests, reports, and dashboards. |
| Comments and Collaboration Thread | Add structured discussions inside requests with mentions, attachments, and decision notes. |
| Attachment Categories | Classify attachments as receipt, invoice, cheque, quote, contract, supporting document, or approval evidence. |
| Document Checklist | Define required documents for each workflow and show missing document alerts. |
| Version Comparison Report | Show differences between workflow versions before publishing changes. |
| Workflow Usage Analytics | Show which workflows are used most, rarely used, abandoned, or frequently returned. |
| Internal BI Connector | Provide clean database views or API endpoints for future Power BI, Metabase, or Superset integration. |

## Phase 3 — Intelligent Automation, Mobile Apps & Enterprise Integrations

Phase 3 should make WizFlow a powerful intelligent automation platform for larger customers and enterprise use.

| Feature | Description |
|---|---|
| Android Mobile App | Native-style Android app using React Native/Expo for approvals, request tracking, comments, uploads, notifications, and simple submissions. |
| iOS Mobile App | Native-style iOS app using the same React Native/Expo codebase. |
| Push Notifications | Send approval, return, overdue, escalation, and status alerts directly to mobile devices. |
| Mobile Document Capture | Allow users to take photos of receipts, invoices, cheques, delivery notes, and supporting documents from the phone. |
| Offline Draft Mode | Allow users to prepare requests offline and submit when internet is available. |
| OCR Document Reading | Extract text and key values from uploaded documents such as invoices, receipts, cheques, delivery notes, contracts, certificates, and IDs. |
| OCR-Assisted Form Filling | Automatically fill form fields from uploaded documents, with user review before submission. |
| Cheque Collection Intelligence | Extract cheque number, bank, date, amount, payer/payee, and supporting reference where possible. |
| Invoice Intelligence | Extract supplier, invoice number, invoice date, tax amount, total amount, currency, and line summary. |
| Receipt Intelligence | Extract vendor, date, amount, tax, payment method, and category. |
| Document Confidence Score | Show confidence level for OCR-extracted values so users know what to verify. |
| Human Review for OCR | Users can correct extracted document values before submission. |
| Voice Commands | Users can speak commands such as “Show my pending approvals” or “Create a petty cash request for 10,000.” |
| Voice-Based Approval | Allow approve/reject/comment by voice, with confirmation before final action. |
| Voice-to-Form Creation | Convert spoken request details into structured form data. |
| AI Workflow Policy Reader | Upload a company policy document and let AI suggest workflows, approval limits, forms, and rules. |
| AI Workflow Optimizer | AI reviews workflow performance and suggests simplification, extra approvers, SLA changes, or bottleneck fixes. |
| AI Report Narratives | AI adds management commentary to reports, explaining trends, risks, and recommended actions. |
| AI Anomaly Detection | Detect unusual requests such as abnormal amounts, repeated claims, suspicious patterns, missing documents, or unusual approval behavior. |
| ERP Integration Framework | A connector framework to integrate WizFlow with accounting and ERP systems after final approval. |
| QuickBooks Integration | Push approved expenses, vendors, bills, or purchase-related data into QuickBooks where applicable. |
| Zoho Integration | Push approved workflow data into Zoho Books or Zoho apps where applicable. |
| Odoo Integration | Create purchase orders, expenses, vendor records, or tasks in Odoo after approval. |
| Tally Integration | Support Tally integration through a local connector/XML-based approach where required. |
| Sage 200 Evolution Integration | Integrate with Sage 200 Evolution using SDK/API/local connector approach for approved transactions. |
| SAP Business One Integration | Integrate using SAP B1 Service Layer or suitable connector for approved business documents. |
| Integration Mapping Screen | Allow admins to map WizFlow form fields to ERP/accounting fields. |
| Integration Posting Rules | Define when data should be pushed, such as after final approval only or after finance verification. |
| Integration Logs | Show successful postings, failed postings, retry attempts, error messages, and reference numbers. |
| Manual Retry for Failed Posting | Allow authorized users to retry failed ERP/accounting postings after correction. |
| Webhook Support | Allow external systems to trigger workflows or receive workflow status updates. |
| Public API | Provide secure APIs for creating requests, checking status, pulling approvals, and reading reports. |
| Advanced Role and Permission Model | Add granular permissions for workflow ownership, report access, integration access, admin rights, and field visibility. |
| Enterprise Multi-Tenant Hardening | Strengthen company isolation, tenant settings, tenant-level branding, tenant-level limits, and audit controls. |
| Advanced Security Logs | Track login events, failed login attempts, admin changes, permission changes, and integration activity. |
| Data Retention Policies | Allow companies to define how long documents, logs, reports, and workflows are retained. |
| Backup and Restore Controls | Provide safer backup, restore, and export options for enterprise customers. |
| Azure Production Migration Readiness | Prepare infrastructure, storage, database, secrets, monitoring, scaling, and security for Azure production. |
| Advanced BI Integration | Connect WizFlow data to Power BI, Metabase, or Apache Superset for enterprise analytics. |
| Customer Portal / External Approvals | Allow selected external parties such as vendors, auditors, or clients to participate in specific workflows securely. |
| eSignature Integration | Add digital signature support for contracts, approvals, board resolutions, and formal sign-offs. |
| Marketplace for Workflow Packs | Offer ready-made workflow packs by industry such as finance, HR, manufacturing, construction, NGOs, schools, healthcare, and professional services. |

## Recommended Phase Outcome

| Phase | Outcome |
|---|---|
| Phase 1 | WizFlow becomes easy enough for offices to start using with minimal training |
| Phase 2 | WizFlow becomes a KPI and management analytics platform |
| Phase 3 | WizFlow becomes an intelligent automation and enterprise integration platform |

## Final Product Direction

WizFlow should not be positioned only as a workflow approval tool.

It should be positioned as:

**An AI-powered office execution platform that helps companies create workflows easily, process approvals faster, track every request, measure team performance, detect bottlenecks, automate recurring tasks, read documents, support mobile approvals, and integrate approved data with accounting and ERP systems.**

---

## Phase 1 — Implementation Progress

**Started:** 2026-05-26  
**Last updated:** 2026-05-26  
**Phase 1 overall status:** **NOT COMPLETE** — Sprint 1 foundation shipped; pending items documented below for a later revisit.

### Executive summary

| Metric | Count |
|--------|-------|
| Phase 1 features (total) | 25 |
| Fully delivered (Sprint 1) | 20 |
| **Pending — revisit later** | **5** |
| Delivered with known gaps (see below) | several |

**Sprint 1** is **complete** and deployed-ready. **Phase 1** as written in the feature table above will be **finished in a future sprint** after revisiting the pending list.

### Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Delivered (Sprint 1 or earlier) |
| 🔶 | Partially delivered — gaps listed under [Partial deliveries](#partial-deliveries-revisit-for-polish) |
| ⏸️ | **Pending — revisit later** (not started or only stubbed) |

---

## ⏸️ Pending Phase 1 features (revisit later)

These five items are **explicitly out of scope for Sprint 1**. Do not treat Phase 1 as complete until they are implemented (or formally descoped).

| # | Feature | Why pending | Target when revisiting |
|---|---------|-------------|------------------------|
| 2 | **Manager-Friendly AI Workflow Wizard** | Current `/ai` drafts workflows but does not run a guided Q&A (missing questions → form + chain + routing + notifications + basic KPI hooks). | Phase 1 Sprint 2 |
| 3 | **Plain-English Workflow Fine-Tuning** | No command-style edits (“Add Finance above 50,000”, “Send rejected back to originator”). | Phase 1 Sprint 2 |
| 14 | **Business-Friendly Form Controls** | Missing dedicated controls: currency amount, attachment+category, employee/vendor/department/branch selectors, yes/no, calculated field, section header (beyond basic designer palette). | Phase 1 Sprint 2 |
| 15 | **Smart Dropdown Sources** | Dropdowns are fixed options only; no master-data, API, or SQL-backed sources with manager-friendly UI. | Phase 1 Sprint 2 (depends on #16) |
| 16 | **Master Data Library** | No central admin library for cost centers, vendors, projects, expense types, categories, approval limits, etc. | Phase 1 Sprint 2 |

**Dependency note:** Implement **#16 Master Data Library** before or together with **#15 Smart Dropdown Sources**.

---

## 🔶 Partial deliveries (revisit for polish)

Sprint 1 marked these ✅ but the **full spec** in the Phase 1 table above is not yet met. Revisit when polishing Phase 1.

| # | Feature | What exists now | Still missing vs full spec |
|---|---------|----------------|------------------------------|
| 1 | Guided Company Setup Wizard | `/setup` + `GET /admin/setup-status` | Inline creation of company profile, all users, reporting managers, roles in one wizard (today: guided links + progress) |
| 7 | Enhanced My Requests | Tabs, search, CSV, overdue | **Draft** requests (save draft / drafts tab) |
| 9 | Better Approval Inbox UX | Workflow, search, overdue, CSV | Filters: department, priority, date range, amount, originator |
| 11 | Notification Preferences | In-app + email toggles | WhatsApp, push (documented as “later” in spec) |
| 19 | Quick Search | `q` on reference / workflow name | Search by approver, department, amount, date on all lists |
| 20 | Simple User Help Panels | `HelpTip` on inbox, workflows, templates | Help on form designer, submit, reports, custom workflow |
| 22 | Basic Audit Export | Per-request **CSV** | **PDF** export option |
| 23 | Excel Export Enhancements | CSV for My Requests + Inbox | True **Excel** (.xlsx), Workflow List export, Actions Report export |
| 25 | Workspace Branding | Logo URL + brand color in Settings | Logo shown in app header/shell everywhere; full theme override |

---

## ✅ Sprint 1 — delivered (foundation)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Guided Company Setup Wizard | 🔶 | `/setup` wizard + `GET /admin/setup-status` |
| 2 | Manager-Friendly AI Workflow Wizard | ⏸️ | Pending — revisit later |
| 3 | Plain-English Workflow Fine-Tuning | ⏸️ | Pending — revisit later |
| 4 | Workflow Health Checker | ✅ | `GET /workflows/{id}/health-check` + publish modal |
| 5 | Simplified Workflow Publishing Flow | ✅ | Draft → Preview → Simulate → Publish steps |
| 6 | Improved Originator Status Tracking | ✅ | `RequestStatusPanel` on request detail |
| 7 | Enhanced My Requests Page | 🔶 | Tabs, search, CSV export, overdue badges |
| 8 | Mobile-Friendly Approval Screen | ✅ | Responsive inbox + `PublicApprovePage` |
| 9 | Better Approval Inbox UX | 🔶 | Workflow filter, search, overdue toggle, CSV export |
| 10 | Smart Notification Center | ✅ | `/notifications` page + nav badge |
| 11 | Notification Preferences | 🔶 | PATCH preferences + Settings (email + in-app) |
| 12 | Prebuilt Office Workflow Templates | ✅ | 11 templates in `workflow_templates.py` |
| 13 | Template Marketplace Foundation | ✅ | `/templates` + `POST .../clone` |
| 14 | Business-Friendly Form Controls | ⏸️ | Pending — revisit later |
| 15 | Smart Dropdown Sources | ⏸️ | Pending — revisit later |
| 16 | Master Data Library | ⏸️ | Pending — revisit later |
| 17 | Field-Level Permissions | ⏸️ | Pending — revisit later |
| 18 | Returned Request Correction Flow | ✅ | “Action required” banner + resubmit highlight |
| 19 | Quick Search Across Requests | 🔶 | `q` on requests + inbox APIs |
| 20 | Simple User Help Panels | 🔶 | `HelpTip` on key pages |
| 21 | Demo Mode / Sample Company | ✅ | Existing seed (maintain) |
| 22 | Basic Audit Export | 🔶 | `GET /requests/{id}/audit-export` (CSV) |
| 23 | Excel Export Enhancements | 🔶 | `requests/export.csv`, `inbox/export.csv` |
| 24 | Admin Control Panel Cleanup | ✅ | Tabbed admin + links to setup/templates |
| 25 | Workspace Branding | 🔶 | Company `settings` JSONB + Settings UI |

### Sprint 1 — technical deliverables

**API (migration `008_phase1_user_company_settings`)**
- `users.notification_preferences`, `companies.settings`
- Services: `workflow_health`, `request_filters`, `csv_export`, `company_settings`
- Routers: `templates`, `users` (preferences)
- Test script: `python -m scripts.test_phase1_api`

**Web**
- Pages: `SetupWizardPage`, `NotificationsPage`, `TemplatesPage`
- Components: `HelpTip`, `RequestStatusPanel`
- Enhanced: `MyRequestsPage`, `InboxPage`, `RequestDetailPage`, `SettingsPage`, `WorkflowsPage`, `AdminPage`, `DashboardPage`, `PublicApprovePage`

**Verify locally**
```text
http://localhost:5200  — admin@demo.wizflow.biz / changeme
/setup · /templates · /notifications · /requests · /inbox
```

### Changelog

| Date | Update |
|------|--------|
| 2026-05-26 | Progress tracker added; Sprint 1 kicked off with parallel sub-agents (API, UI/UX, templates). |
| 2026-05-26 | Sprint 1 foundation shipped: migration 008; `test_phase1_api` + web build pass. |
| 2026-05-26 | Clarified: **Phase 1 NOT complete** — 5 features ⏸️ pending; partial deliveries 🔶 documented for later polish. |

---

## Phase 2 — Implementation Progress

**Started:** 2026-05-26  
**Last updated:** 2026-05-26  
**Current sprint:** Phase 2 Sprint 1 **complete** (deployed)  
**Goal:** Enterprise-grade KPI/reporting UX — simple, clean, thorough process visibility.

### Executive summary (Phase 2)

| Metric | Count |
|--------|-------|
| Phase 2 features (total) | 39 |
| Delivered in Sprint 1 | 12 |
| Partially delivered | 5 |
| Sprint 2+ (planned) | 22 |

**Sprint 1** delivers the analytics API, executive `/analytics` hub (manager/admin), MIS `/reports` with filters + CSV, shared filter bar, KPI drill-down, and enterprise page chrome (`PageHeader`, data tables).

### Phase 2 Sprint 1 — feature status

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Executive KPI Dashboard | ✅ | Overview tab: volume, pending, overdue, avg approval time, rejection %, SLA % |
| 2 | Department KPI Dashboard | ✅ | Departments table on Overview; `GET /analytics/departments` |
| 3 | User Performance Dashboard | ✅ | People tab: pending, completed, avg response, overdue per approver |
| 4 | Workflow Performance Dashboard | ✅ | Workflows tab: volume, completion time, rejection/return rates |
| 5 | SLA Configuration by Workflow and Step | 🔶 | Workflow-level `sla_hours` in settings (default 48h); **per-step SLA** → Sprint 2 |
| 6 | SLA Breach Alerts | 🔶 | Overdue counts in KPIs + inbox/requests; **proactive alerts** → Sprint 2 |
| 7 | Bottleneck Analytics | ✅ | Slowest steps and approvers (`/analytics/bottlenecks`) |
| 8 | Workload Analytics | 🔶 | Pending-by-user on People tab; **historical workload** → Sprint 2 |
| 9 | Financial Value Analytics | ✅ | Financial tab: requested/approved/rejected/pending by amount |
| 10 | Exception Analytics | ✅ | Exceptions tab: rejected, returned, overdue, corrections |
| 11 | Compliance Dashboard | ⏳ | Sprint 2 |
| 12 | AI KPI Summary | ⏳ | Sprint 2+ |
| 13 | AI Management Insights | ⏳ | Sprint 2+ |
| 14 | Scheduled Reports | ⏳ | Sprint 2+ |
| 15 | PDF Report Builder | ⏳ | Sprint 2 |
| 16 | Advanced Excel Reports | 🔶 | MIS **CSV** export on `/reports`; true `.xlsx` → Sprint 2 |
| 17 | Report Filter Builder | ✅ | `AnalyticsFilterBar`: date range, workflow, status |
| 18 | Saved Report Views | ⏳ | Sprint 2 |
| 19 | Report Subscription | ⏳ | Sprint 2+ |
| 20 | KPI Targets | ⏳ | Sprint 2+ |
| 21 | Scorecards | ⏳ | Sprint 2+ |
| 22 | Trend Charts | ✅ | 30-day volume trend (`TrendSparkline` + `/analytics/trends`) |
| 23 | Drill-Down Analytics | ✅ | KPI cards link to filtered `/requests` or `/inbox` |
| 24–39 | Journey, heatmap, personalization, scheduler, escalation, etc. | ⏳ | Phase 2 Sprint 2+ |

### Sprint 1 — technical deliverables

**API**
- `app/services/analytics.py` — executive, workflows, users, bottlenecks, financial, exceptions, trends, departments
- `app/schemas/analytics.py`, `app/routers/analytics.py` — `GET /api/v1/analytics/{executive,workflows,users,bottlenecks,financial,exceptions,trends,departments}` (manager + company_admin)
- `app/routers/reports.py` — MIS actions filters: `workflow_id`, `status`
- Test: `python -m scripts.test_phase2_api` ✅

**Web**
- `pages/AnalyticsPage.tsx` — `/analytics` (Overview, Workflows, People, Financial, Exceptions)
- `pages/ReportsPage.tsx` — `/reports` (MIS actions table + CSV download)
- `components/analytics/` — `KpiCard`, `AnalyticsFilterBar`, `SimpleBarChart`, `TrendSparkline`
- `components/PageHeader.tsx` — shared enterprise page header
- `lib/roles.ts` — `canAccessReports` for manager/admin nav
- Styles: `.wf-analytics-*`, `.wf-data-table` in `index.css`
- Nav: Analytics + Reports in shell; dashboard promo card for managers

**Verify locally**
```text
http://localhost:5200 — admin@demo.wizflow.biz / changeme
/analytics · /reports
docker compose -p wizflow exec -T api python -m scripts.test_phase2_api
cd apps/web && npm run build
```

### Changelog (Phase 2)

| Date | Update |
|------|--------|
| 2026-05-26 | Phase 2 Sprint 1 started; parallel agents (API analytics, UI dashboards, reports UX). |
| 2026-05-26 | Sprint 1 foundation verified: `test_phase2_api` + web `npm run build` pass; feature table updated above. |

---

## Phase 3 — Implementation Progress

**Started:** 2026-05-26  
**Last updated:** 2026-05-26  
**Scope note:** **ERP integrations skipped** for now (items 24–33 in Phase 3 table). Sprint 1 focuses on public API, webhooks, security audit, OCR foundation, mobile/PWA, and AI insights.

### Executive summary (Phase 3)

| Metric | Count |
|--------|-------|
| Phase 3 features (total) | 42 |
| In scope (non-ERP) | 33 |
| **Deferred (ERP block)** | **9** |
| Delivered in Sprint 1 | 10 |
| Partially delivered | 4 |
| Sprint 2+ | 19+ |

### ⏸️ Deferred — ERP integrations (skipped per product direction)

QuickBooks, Zoho, Odoo, Tally, Sage 200, SAP B1, integration mapping, posting rules, integration logs, manual retry — **not started**; revisit when connector framework is prioritized.

### Phase 3 Sprint 1 — feature status (non-ERP)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1–2 | Android / iOS native apps | ⏳ | PWA + responsive web first; React Native/Expo → Sprint 2 |
| 3 | Push notifications | ⏳ | In-app + email exist; device push → Sprint 2 |
| 4 | Mobile document capture | ✅ | `capture="environment"` on submit attachment |
| 5 | Offline draft mode | ✅ | `localStorage` drafts on New request |
| 6–10 | OCR reading + assisted fill + cheque/invoice/receipt | 🔶 | `/documents/extract` heuristic + confidence; full OCR engine → Sprint 2 |
| 11–12 | Confidence score + human review | ✅ | `requires_review` + editable form after extract |
| 13–15 | Voice commands / approval / form | ⏳ | Sprint 2+ |
| 16–19 | AI policy reader, optimizer, narratives, anomaly | 🔶 | Narrative + rule-based anomalies on `/analytics`; full AI suite → Sprint 2 |
| 34 | Webhook support | ✅ | Admin webhooks + signed delivery on workflow events |
| 35 | Public API | ✅ | API keys + `/external/requests` (read/write) |
| 36 | Advanced role model | ⏳ | Sprint 2 |
| 37 | Multi-tenant hardening | 🔶 | Security audit log; deeper isolation → Sprint 2 |
| 38 | Advanced security logs | ✅ | Login success/fail + integration actions |
| 39–41 | Retention, backup, Azure readiness | ⏳ | Sprint 2+ |
| 42 | Advanced BI connector | ⏳ | OpenAPI/public API foundation only |
| 43–44 | Customer portal, eSignature | ⏳ | Sprint 2+ |
| 45 | Workflow packs marketplace | ⏳ | Templates exist; industry packs → later |

### Sprint 1 — technical deliverables

**API (migration `009_phase3_integrations_security`)**
- Tables: `api_keys`, `webhook_endpoints`, `webhook_deliveries`, `security_audit_logs`
- Routers: `integrations` (admin), `external_api`, `documents` (extract)
- Analytics: `GET /analytics/anomalies`, `GET /analytics/narrative`
- Webhook dispatch hooked from `record_event`
- Test: `python -m scripts.test_phase3_api`

**Web**
- `IntegrationsPage` — `/integrations` (API keys, webhooks, security log)
- PWA: `manifest.webmanifest`, mobile meta, favicon
- Submit: offline drafts, camera/file capture, OCR-assisted prefill
- Analytics: AI insight panel + anomaly count

**Verify locally**
```text
/integrations · /submit · /analytics (Generate summary)
docker compose -p wizflow exec -T api alembic upgrade head
docker compose -p wizflow exec -T api python -m scripts.test_phase3_api
```

### Changelog (Phase 3)

| Date | Update |
|------|--------|
| 2026-05-26 | Phase 3 Sprint 1 started; ERP integrations explicitly deferred. |
| 2026-05-26 | Shipped API keys, webhooks, public API, security audit, OCR extract, PWA/mobile drafts, AI narrative/anomalies foundation. |

