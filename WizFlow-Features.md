# WizFlow — Product Features

**Document purpose:** Detailed feature reference for product brochures, sales collateral, and website copy.  
**Product:** WizFlow — multi-tenant workflow and approval platform for business requests.  
**Live demo:** https://app.wizflow.biz · **API:** https://api.wizflow.biz  
**Version context:** Features described reflect the current `main` branch (workflow engine, form designer, custom workflows, AI creator, themes, email approvals).

---

## 1. Product overview

WizFlow helps organizations **digitize approval processes**—expenses, purchases, leave, IT access, contracts, capital expenditure, and custom processes—without coding. Employees **submit structured requests**; approvers **review and act** from an inbox or email; managers get **visibility** into status, history, and reporting.

### Value proposition (brochure bullets)

- **Faster decisions** — Central inbox, email links, and clear request references replace email chains and spreadsheets.
- **Consistent policy** — Amount-based routing sends high-value items to finance automatically.
- **No-code process design** — Drag-and-drop forms, visual custom approval chains, and AI-assisted workflow drafting.
- **Enterprise-ready presentation** — Five visual themes and four form layouts tuned for finance, HR, operations, and executive audiences.
- **Audit trail** — Every submit, approve, reject, return, and claim is recorded with timestamps and actors.
- **Your brand, your domain** — Deploy on your VPS with custom hostnames (e.g. `app.wizflow.biz` / `api.wizflow.biz`).

### Typical use cases

| Domain | Example workflows (included in demo seed) |
|--------|---------------------------------------------|
| **Finance** | Petty cash, purchase request, travel expense, vendor onboarding, contract review |
| **HR / People** | Leave approval, overtime request, training request |
| **IT / Operations** | IT access request, equipment request |
| **Executive** | Multi-step capital expenditure (8-step approval chain) |
| **Custom** | Any process you define with named approvers and initiator rules |

---

## 2. User roles and access

WizFlow is **multi-tenant**: each **company** has isolated users, workflows, and data.

| Role | Capabilities |
|------|----------------|
| **Company admin** | Full org setup: departments, branches, users, user groups; access admin screens; often finance approver |
| **Manager** | Approves requests assigned to manager step; may appear in routing for standard workflows |
| **Originator** | Submits requests for workflows they are allowed to initiate |
| **Approver** | Acts on inbox items; may be assigned by role, named user, or group |

**Authentication:** Email + password login; JWT access and refresh tokens; session-aware web app with protected routes.

**Initiator control (custom workflows):** Restrict who can start a process to **everyone**, **named users**, and/or **user groups**—with deduplication so the same person is not listed twice.

---

## 3. Request and approval lifecycle

### 3.1 Submit a request

- User chooses a **published workflow** from **New request** (only workflows they are permitted to initiate).
- Dynamic **form** renders from the workflow’s `form_schema` (field types, required flags, validation).
- **Client and server validation** for required fields and **non-negative numeric** amounts.
- On submit, the system creates a **workflow instance** (request) with status `in_progress`, assigns the **first approval step**, and generates a **reference number** (e.g. `PC-2026-00042`).

### 3.2 Reference numbers

- Human-readable IDs per workflow family (configurable **serial prefix**, e.g. `PC`, `M8C`, `ECW`).
- Year-based sequencing (e.g. `PC-2026-00019`).
- Safe allocation under concurrency (database locking avoids duplicate references).

### 3.3 Approval actions

Approvers (and eligible managers) can:

| Action | Effect |
|--------|--------|
| **Approve** | Advances to the next step or completes the request (`approved`) |
| **Reject** | Terminal state; originator notified |
| **Return** | Sends back for correction (where policy allows; originators typically cannot return their own request) |
| **Claim** | For “claim” assignment mode, one approver takes ownership of a pooled task |

Optional **comment** on every action.

### 3.4 Request statuses

| Status | Meaning |
|--------|---------|
| `in_progress` | Waiting on an approval step |
| `approved` | Fully approved |
| `rejected` | Denied |
| `returned` | Sent back to originator for changes |

### 3.5 My requests

- List of all requests **submitted by the logged-in user**.
- Shows workflow name, reference, status, step, amount preview, and timestamps.
- Drill-down to **request detail**: full form data (read-only), event timeline, resubmit when returned.

### 3.6 Request detail and audit

- **Request meta bar:** reference number, workflow name, submitted time, live “current time” for context.
- **Event timeline:** chronological history (submitted, approved, rejected, returned, claimed, etc.) with human-readable labels.
- **Resubmit** on returned requests using the same validation rules as initial submit.

---

## 4. Approval inbox

The **Approval inbox** is the approver’s command center.

### Layout and UX

- **Split view:** scrollable list of pending items + detail panel for the selected request.
- Each list item shows: **reference**, workflow name, **originator**, **current step**, **submitted time**, **amount preview** (when applicable).
- **Claim badge** when a pooled task must be claimed first.
- After **approve / reject / return:** automatically opens the **next** pending item; if inbox is empty, shows an **“Inbox cleared”** success state (not a blank screen).

### Permissions

- Users only see inbox items for steps where they are in the **assignee pool** (or have **claimed** the task).
- **Can approve** flag on request detail drives which buttons appear.

---

## 5. Workflow design and management

**Workflows** page for process owners and admins.

### Draft vs published

- Workflows start as **draft**; only **published** workflows accept live submissions.
- **Publish** flow includes preview, validation, and safeguards (e.g. simulation encouraged before publish).

### Workflow definition includes

- **Name** (unique per company, case-insensitive check).
- **Form schema** (fields and types) — inline or attached from Form Designer.
- **Steps** — ordered approval steps with assignees.
- **Routing rules** — conditional skip/jump based on form data (e.g. amount thresholds).
- **Settings** — SLA hours, serial prefix, UI theme, form layout, custom workflow metadata.

### Versioning

- **Version history** per workflow family.
- **Create new version** from a published workflow.
- **Rollback** to a prior version number.
- Published instances remain tied to the definition version in use at submit time.

### Simulation (test before go-live)

- **Simulate** with sample form data (e.g. test amount).
- Shows which steps would run and routing outcome **without** creating a real request.
- Supports brochure message: *“Test your process before employees use it.”*

### Preview

- **Workflow preview** — visual summary of steps and routing.
- **Publish preview** — diff-style summary before confirming go-live.

---

## 6. Conditional routing (business rules)

Route requests dynamically without separate workflows.

### Supported conditions

- Field comparisons: **equals**, **not equals**, **greater than**, **greater-or-equal**, **less than**, **less-or-equal**.
- Typical pattern: **if amount > threshold → skip to finance step**.

### Examples in demo data

| Workflow | Rule |
|----------|------|
| Petty cash | Amount > 5,000 → skip to finance approval |
| Purchase request | Amount > 10,000 → finance |
| Travel expense | Amount > 8,000 → finance |
| Vendor onboarding | Amount > 50,000 → finance |
| Contract review | Amount > 25,000 → finance |
| Training | Cost > 3,000 → finance |
| Equipment | Cost > 15,000 → finance |

### Robustness

- Numeric strings (e.g. `"6000"`) coerced safely for routing.
- Invalid or negative amounts rejected at API on submit.

---

## 7. Form designer

**Form Designer** (`/form-designer`) — build request forms without JSON editing.

### Drag-and-drop builder

- Powered by **@dnd-kit** (sortable field list, drag overlay).
- **Palette controls** map to form field types:

| Palette control | Field type | Purpose |
|-----------------|------------|---------|
| Textbox | `text` / `number` | Single-line input |
| Listbox | `dropdown` | Select one option |
| Combobox | `combobox` | Type or pick from suggestions |
| Option control | `radio` | Radio button group |
| Date picker | `date` | Date |
| Time picker | `time` | Time |
| Label | `label` | Static help or section text |
| Button | `button` | Display-only action placeholder |

### Field configuration

- Label, key, required flag, placeholder, options (for lists/radios).
- **Live preview** of the form as end users will see it.
- Save as **draft workflow** or attach schema to custom workflow creation.

### Validation

- Required field enforcement on submit.
- **Amount fields:** positive numbers only; no browser spinner clutter; accessible input handling.

---

## 8. Custom workflows

**Custom workflow** builder (`/custom-workflow`) for approval chains that don’t fit simple role-based steps.

### Build a custom process in one flow

1. **Unique workflow name** — real-time availability check (`/workflows/check-name`).
2. **Attach a form** — pick from Form Designer templates or existing form workflows.
3. **Define initiators** — everyone, and/or specific users, and/or user groups.
4. **Build approver chain** — ordered list of **users** and **user groups** (drag to reorder).
5. **Publish** — creates a published workflow with N approval steps (2-step expense, **8-step capital expenditure**, etc.).

### Approver chain features

- **Unlimited steps** in sequence (demo includes **8-step** capex: individuals + finance group + executive committee).
- **Groups expand** to all active members; steps use **claim** mode when multiple users share a step.
- **Org directory** API — pick users and groups from company directory.

### Custom workflow settings (stored in workflow)

- Attached form workflow ID.
- Initiator configuration (deduped).
- Approver chain definition.
- Optional **serial prefix** (e.g. `M8C`, `ECW`).

### Separation of duties

- **Initiators** submit; **approvers** approve/reject/return — originators do not approve their own requests on custom flows.
- **Originator notifications** on final approve/reject (email + in-app).

---

## 9. AI workflow creator

**AI creator** (`/ai`) — describe a process in plain language; get a draft workflow.

### Capabilities

| Feature | Description |
|---------|-------------|
| **Draft** | Generate initial workflow name, form fields, steps, routing from description |
| **Refine** | Iterate on draft with follow-up instructions |
| **Explain** | Natural-language explanation of an existing workflow |
| **Save** | Persist AI output as a draft workflow in the library |

### Intelligent defaults

- **Template detection** — keywords map to petty cash, purchase, leave, or generic templates when no LLM key is configured.
- **UI suggestions** — auto-assigns theme and form layout (e.g. finance + highlight-amount for expenses).

### Deployment note

- With **AI API key** configured: uses external LLM for richer drafts.
- Without key: **deterministic templates** still produce usable workflows (brochure: *“Works offline; AI optional”*).

---

## 10. Visual themes and form layouts

WizFlow is designed to **look different per department** without separate products.

### Five application themes

| Theme | Personality | Best for |
|-------|-------------|----------|
| **Corporate** | Balanced SaaS, Inter font | General enterprise |
| **Executive** | Editorial serif, dark command bar | Board / leadership |
| **Operations** | Compact grid, mono metrics | Control room / IT ops |
| **People (HR)** | Rounded, warm cards | Leave, training, HR |
| **Finance** | Ledger-style, numbers-first | Expense and procurement |

Each theme changes colors, typography, home layout, cards, and header styling.

### Four form layouts

| Layout | Description |
|--------|-------------|
| **Stacked** | Single column, standard spacing |
| **Sectioned** | Fields grouped under section titles |
| **Two column** | Wider desktop forms |
| **Highlight amount** | Large purple hero panel for amount (expense workflows) |

Themes and layouts are set per workflow in **settings** and apply on submit, inbox review, and request detail.

### User preference

- **Settings** page — users can preview and switch **workspace theme** (persists for their session experience on dashboard and chrome).

---

## 11. Notifications

### In-app notifications

- Bell / user menu integration with **unread count**.
- Notification list with read/unread state.
- Titles and body text for approvals, decisions, and demo notices.
- **Mark as read** per notification.

### Inbox count badge

- Combined **unread notifications + inbox pending** count on navigation (where configured).

### Email notifications (Brevo)

- **Approval needed** emails to current step assignees with:
  - Workflow and step name
  - Originator
  - Request preview (key fields)
  - **Magic approval link** (secure token URL)
- **Decision emails** to originator on approve/reject with outcome and comment.
- Configurable via server-side Brevo integration (not stored in git).

---

## 12. Email approval (magic links)

Approvers can act **without logging in** via one-time links.

- **Public approve page** (`/approve/:token`) — view request summary and approve/reject.
- Tokens are **scoped** to company, instance, user, and step.
- Complements full inbox experience for mobile and email-first users.

**Brochure line:** *“Approve from your inbox in Outlook—one click.”*

---

## 13. Organization administration

**Admin setup** (`/admin`) for `company_admin` role.

### Departments

- Create and list **departments** (name, code).
- Used for org structure and future reporting dimensions.

### Branches

- **Branch** records (e.g. head office, regional offices) for distributed organizations.

### Users

- View company **users** with roles.
- Create users (email, name, role assignment) — demo seed includes admin, originators, approvers, operations user.

### User groups

- Create **named groups** (e.g. “Finance approvers”, “Executive committee”).
- Assign multiple users to a group.
- Groups used in **custom workflow** approver chains and initiator lists.

### Roles API

- Standard roles: `company_admin`, `manager`, `originator`, `approver`.

---

## 14. Attachments

- Upload **attachments** on a request (inbox actions).
- Files stored on server filesystem (configurable uploads path in deployment).
- Linked to request instance for audit and review.

---

## 15. Reporting and exports

### MIS / actions report

- **Actions report** — tabular view of approval actions for management information.
- **CSV export** (`/reports/mis/actions.csv`) for Excel and BI tools.

**Brochure line:** *“Export who approved what, and when.”*

---

## 16. Dashboard (home)

Personalized **home** after login:

- Welcome hero themed to selected workspace personality.
- **Stats:** pending approvals, open requests, approved count, live workflow count.
- **Quick actions:** submit, inbox, workflows, custom workflow, AI creator, settings.
- Recent activity snippets (inbox and requests).

---

## 17. Security and platform

| Area | Detail |
|------|--------|
| **Multi-tenancy** | Company-scoped data; users belong to one company |
| **Auth** | JWT; password hashing; protected API routes |
| **CORS** | Configurable allowed origins for web app |
| **Validation** | Server-side form validation; positive amount rules |
| **Secrets** | JWT, database, Brevo keys via environment / local secret files (never in git) |
| **HTTPS** | Production served via Caddy with TLS (e.g. Let’s Encrypt) |

---

## 18. Technical architecture (for technical brochures)

| Layer | Technology |
|-------|------------|
| **Web app** | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| **API** | Python 3.12, FastAPI, SQLAlchemy, Alembic migrations |
| **Database** | PostgreSQL 16 |
| **Cache / queue** | Redis 7 |
| **Email** | Brevo (SMTP/API) |
| **Deployment** | Docker Compose on Linux VPS; Caddy reverse proxy; static web build |

### Deployment topology (typical)

- `app.<domain>` — static SPA (`/var/www/wizflow-web`)
- `api.<domain>` — API container on loopback port
- `/opt/wizflow` — application repo, Docker, uploads, secrets
- Coexists with other apps on same server (e.g. WizCRM) via separate Docker project name and ports

### Operations

- **Git-based deploy** — `git pull` + `scripts/deploy-vps-wizflow.sh`
- **Migrations** — `alembic upgrade head` on deploy
- **Seed** — demo company with rich workflows and sample transactions (optional on production)
- **Health check** — `/api/v1/health` (API + database status)

---

## 19. Demo and sample content

Production/demo environment can include a full **Demo Company** (`demo-co`):

- **14+ published workflows** (petty cash, purchase, leave, travel, IT access, vendor, contract, training, equipment, custom 2-step expense, **8-step capital expenditure**, etc.).
- **2 draft workflows** for publish testing.
- **Multiple demo users** — admin, originators, eight approvers, operations submitter.
- **User groups** — Finance approvers, Operations starters, Executive committee.
- **~15–20+ items per module** after ample seed: inbox per approver, my requests per originator/admin, notifications.
- **Varied amounts** and statuses (approved, in progress, rejected, returned).

**Demo login (when enabled):** `admin@demo.wizflow.biz` / `changeme` (and role-specific accounts documented in seed scripts).

---

## 20. Quality assurance (built-in test suites)

Automated coverage for brochure “enterprise quality” claims:

| Suite | What it verifies |
|-------|------------------|
| `test_mega_workflow` | 8-step workflow end-to-end |
| `test_custom_workflow` | Initiator filter, approve, reject |
| `test_api_logic` | Routing, amounts, reference numbers |
| `test_integration_deep` | HTTP login, inbox, submit, negative amount rejection |
| `test_ui_quality` | Admin my-requests volume, amount variety |
| `test_demo_smoke` | Workflows list, inbox, submit, approve |
| **Vitest (web)** | Form validation, positive number sanitization |

---

## 21. Feature summary matrix (brochure table)

| Capability | Included |
|------------|----------|
| Multi-tenant companies | ✓ |
| Role-based access | ✓ |
| No-code form designer (drag-and-drop) | ✓ |
| Custom multi-step approval chains | ✓ |
| User groups as approvers/initiators | ✓ |
| Conditional amount routing | ✓ |
| Workflow versioning and rollback | ✓ |
| Publish preview and simulation | ✓ |
| AI workflow drafting (optional LLM) | ✓ |
| 5 visual themes + 4 form layouts | ✓ |
| Approval inbox with claim mode | ✓ |
| My requests and audit timeline | ✓ |
| Reference numbers | ✓ |
| In-app notifications | ✓ |
| Email notifications (Brevo) | ✓ |
| Magic-link email approval | ✓ |
| Attachments | ✓ |
| CSV MIS export | ✓ |
| Admin: departments, branches, users, groups | ✓ |
| Docker/VPS deployment | ✓ |
| HTTPS / custom domain | ✓ |

---

## 22. Suggested brochure sections (copy-ready headings)

1. **Stop chasing email approvals** — Intro / problem statement  
2. **One platform for every approval** — Use case grid (finance, HR, IT, capex)  
3. **Design forms in minutes** — Form Designer screenshot callout  
4. **Route by amount automatically** — Routing rules diagram  
5. **Chains as long as your policy requires** — Custom 8-step example  
6. **AI that speaks your language** — AI creator (optional)  
7. **Looks like your department** — Theme swatches  
8. **Approve from anywhere** — Inbox + email magic link  
9. **Full audit trail** — Events timeline  
10. **Deploy on your infrastructure** — Architecture / security closing  

---

## 23. Contact and URLs

| Item | Value |
|------|--------|
| **Web application** | https://app.wizflow.biz |
| **API** | https://api.wizflow.biz |
| **Source repository** | `pj-nrb-ke/WizFlow` (GitHub) |

---

*This document is derived from the WizFlow application codebase and deployment configuration. Update when major features ship.*
