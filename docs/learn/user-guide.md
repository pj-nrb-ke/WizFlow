# WizFlow User Guide

The complete reference to WizFlow — the no-code approvals and workflow platform. New here? Start with the **Quick Start**. Need a quick recipe? See the **How-Tos**. Prefer video? See the **chapters** in Learning Resources.

WizFlow has three kinds of users, and this guide is organised so each can jump to what they need:
- **Everyone** submits and tracks requests, and approves what's assigned to them.
- **Managers / builders** create forms, workflows, applications and processes — all without code.
- **Administrators** manage people, roles, company data, branding, security and integrations.

---

## 1. Getting around

After you sign in you land on **Home**, your daily dashboard: a welcome summary, key counts (pending approvals, open requests, live workflows), recent requests, an inbox preview, and **Quick actions**. The left **sidebar** is grouped into:
- **Core** — Home, Apps, New request, My requests, Inbox.
- **Build** — Workflows, Suites, App builder, AI creator, Form designer, Custom workflow, Process Designer, Data, Knowledge, Templates.
- **Insights** — Analytics, Process Intel, Reports (managers/admins).
- **Manage** — Checklists, Reminders, Recurring Schedules, Master data, Integrations, AI Controls, Admin, Settings.
- **Help** and **Learning Resources**.

What you see depends on your role; everyday users see Core and Help.

---

## 2. For everyone

### Apps
**Apps** is the launcher. Processes are grouped into **applications** (Suites) — for example an *Expense Management* app holding petty cash, purchases and travel. Open an app, then pick the process you need. Anything not yet grouped appears under **Other requests**.

![The Apps launcher — applications your team opens from one place](videos/ch5/shots/apps.jpg)

### Submitting a request
Opening a process shows a **guided form**. Forms are designed to ask only for what matters, with dropdowns, dates, amounts and calculated totals handled for you. You can:
- **Attach** a receipt, PDF, photo or CSV.
- **Record a voice note** — WizFlow transcribes and tidies it, and keeps the audio with the request.
- Add a **note** for the approver.

![A clean, guided request form](videos/ch2/shots/form.jpg)

Press **Submit request**. WizFlow routes it down the approval chain automatically and gives it a **reference number**. Your progress auto-saves as a **draft** on the device until you submit.

### My requests
Everything you've submitted lives here, filterable by status (All, Drafts, In progress, Returned, Approved, Rejected) and searchable by reference or workflow. Open any request to see:
- **Request data** — everything you entered.
- **Approval chain** — the steps and who's responsible.
- **Status** — the current step, who it's pending with, and what happens next.
- **Timeline** — a full, exportable audit trail (CSV or PDF).

If an approver **returns** a request for a change, it appears under *Returned* with their reason; edit and resubmit. If they **request more info**, answer their question right on the request without starting over.

### Inbox (approving)
Requests waiting on you appear in your **Approval inbox**, newest first, with amount and originator at a glance; filter by workflow, date, amount, department or priority.

![The approval inbox, with the AI copilot panel](videos/ch3/shots/inbox.jpg)

Select one to see the full request on the right, plus:
- **AI copilot** — click *Analyze request* for a plain-language summary, missing-info and policy flags, similar past cases, and a recommended decision. It's advisory — you decide.
- **Approve** to pass it on, **Reject/Return** to send it back with a reason, or **Request info** to ask a question while keeping it in progress.

When you approve, the request advances to the next approver automatically. Some steps are **parallel** (several people must approve) or **claimable** (first to claim handles it).

---

## 3. Building (no code)

### Form designer
Build a form visually: drag controls onto the canvas and set their properties. Controls include text, button, dropdown (listbox), combobox, radio, date, time, label, currency, yes/no, section, attachment, **master-data list**, **employee selector**, **calculated (formula)** and **table/grid**. For each field set its key, options (static, from master data, from your org's users, or an external API), whether it's required, and **per-role visibility and editability**. Save as a draft workflow or copy the JSON.

### Custom workflow
Assemble who starts a request and who approves it, in order. Name the workflow, attach a published form, choose **initiators** (everyone, specific users, or groups), then drag an ordered **approver chain** of users, groups, or the dynamic **"originator's manager"** step. Save as a draft, then publish.

### Workflows (publish, test, version)
The **Workflows** console lists your processes. For a selected workflow you can set its **appearance** (theme and form layout) and per-step **SLA + escalation**, make plain-English **tune** edits ("add finance approval above 5,000"), **simulate** with sample data (a health check gates publishing), **publish**, **duplicate**, **create a new version**, or **roll back**. Publishing a new version archives the old one and keeps it for audit.

### AI creator
Describe a process in plain English and WizFlow drafts the form and approval steps for you to review, adjust and publish. Degrades gracefully to templates when AI is unavailable.

### App builder
Paste or upload a requirements pack and WizFlow generates a reviewable plan — data entities, a form, steps and routing with traceability — then creates the data objects and a draft workflow for you to publish.

### Suites (applications)
Group several **published** processes into one branded application your team launches from **Apps**. Start from a ready-made suite (Expense Management, Procurement, HR & People, IT & Facilities) or build your own: name it, set an icon and accent colour, drag processes in and order them, then publish. Only published processes appear to end users. Suites group and launch — each process keeps its own form, approvers and versioning.

![Building a Suite — drag processes in, brand it, publish](videos/ch5/shots/suites-builder.jpg)

### Process Designer (BPMN)
A full BPMN 2.0 canvas for anything beyond a straight line of approvals. Start blank, from a template, or **Draft with AI**; drag tasks, approvals and decision **gateways** and connect them; set each task's **assignee** and mode, the request **form fields**, **service steps** (notify, webhook, AI, document, record), and **branch conditions** in the binding panel; use the **Copilot** to rewrite the diagram from a sentence. Then **Publish as app** (compiles to a normal workflow) or **Run as native app** for parallel/event/loop processes.

### Data & Knowledge
**Data** is a low-code store of typed business objects (customers, vehicles, invoices…) that workflows can write to via a *record* step and reference from forms. **Knowledge** lets you attach policies and SOPs that ground the AI copilot's answers, with sources cited.

### Templates
A gallery of ready-made workflows by category (Finance, HR, Operations, Procurement, Legal, IT). **Use template** copies one into your company as a draft to customise and publish.

---

## 4. Automation & operations

- **Recurring Schedules** — launch a workflow (or checklist) automatically on a calendar rule, to chosen people or groups.
- **Reminders** — recurring task nudges with compliance tracking and CSV export.
- **Checklists** — reusable checklists for routine, repeatable work.

---

## 5. Insights (managers & admins)

- **Analytics** — executive summary, workflow performance, financial totals, SLA and bottlenecks, workload and scorecards, with date and workflow filters.
- **Process Intel** — mines your request history for cycle time, rework rate, variants and bottlenecks, with an AI narrative and a suggested improvement.
- **Reports** — operational report views and exports.

---

## 6. Integrations

**Integrations** (admins) connects WizFlow to outside systems:
- **WizGate** — push approved requests into on-premise accounting systems (Sage, QuickBooks, Tally). Configure the connection, then add a **Post-to-WizGate** step on a workflow; after final approval the approved data is posted automatically, with the result recorded on the request.
- **Webhooks & API keys** — send request data to your own endpoints, or let external systems submit requests.
- **AI Controls** — a governed gateway for all AI: per-feature toggles, a global and per-company kill switch, model routing and a monthly budget cap.

---

## 7. Administration

- **Users & roles** — invite people, set built-in roles (company admin, manager, approver, originator) or custom roles with specific permissions, and set each user's **manager** (used by dynamic approval steps).
- **Master data** — the shared lookup lists forms draw on: departments, branches, cost centres, vendors, projects, expense types and approval limits.
- **Branding** — your logo and brand colour, applied across the web app, public forms, PDFs and emails (two-level branding keeps "Powered by WizFlow" at the foot).
- **Company setup** — a guided onboarding wizard for new companies.

---

## 8. Security & your account

- **Settings** — choose a **theme** and default **form layout**, change your **password**, manage **two-factor authentication (2FA)**, and set **notification preferences** (email, in-app, push).
- **Sessions** — resetting your password or "log out everywhere" revokes all active sessions.
- Accounts can be **locked** after repeated failed sign-ins (with the IP rate limiter) for protection.

---

## 9. Public & guest forms
Share a workflow as a **public form** via a tokenised link so people without an account can submit (for example, external vendors or customers). Guests can upload attachments, and dropdowns resolve to real options server-side. Approvers can also act on a request from a secure **approval link** in their email.

---

## 10. On mobile
The WizFlow mobile app mirrors the everyday experience — submit requests (including voice notes and photos), track them, and approve from your inbox with push notifications. **Learning Resources** are available in the app too; the video chapters stream from the server so they don't bloat the app.

---

Need more? Use **Help** in the sidebar, the **How-Tos** for step-by-step recipes, or the **video chapters** — all in Learning Resources.
