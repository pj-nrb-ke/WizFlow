# WizFlow — Complete Features Guide

> **App URL:** https://app.wizflow.biz  
> **Demo login:** admin@demo.wizflow.biz / changeme  
> **API docs:** https://api.wizflow.biz/docs

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Security](#2-authentication--security)
3. [Dashboard](#3-dashboard)
4. [Workflow Builder](#4-workflow-builder)
5. [Submitting Requests](#5-submitting-requests)
6. [My Requests](#6-my-requests)
7. [Inbox (Approvals)](#7-inbox-approvals)
8. [Notifications](#8-notifications)
9. [Recurring Reminders](#9-recurring-reminders)
10. [Analytics](#10-analytics)
11. [Reports (MIS)](#11-reports-mis)
12. [Admin Panel](#12-admin-panel)
13. [User Groups](#13-user-groups)
14. [Master Data](#14-master-data)
15. [Integrations](#15-integrations)
16. [Settings](#16-settings)
17. [Mobile App](#17-mobile-app)
18. [API Access](#18-api-access)

---

## 1. Overview

WizFlow is a single-tenant approval workflow platform. It lets you define multi-step approval processes (workflows), submit requests that flow through those steps, and track everything end to end. Key concepts:

| Concept | What it means |
|---|---|
| **Workflow Definition** | A template: form fields + approval steps + routing rules |
| **Request / Instance** | One submission of a workflow by a staff member |
| **Step** | A single approval/action stage within a request |
| **Assignee** | The person or group responsible for a step |
| **Reminder Rule** | A recurring task that staff must acknowledge on a schedule |

---

## 2. Authentication & Security

### Login
Navigate to **https://app.wizflow.biz/login**. Enter your email and password.

### Two-Factor Authentication (2FA / TOTP)
- Go to **Settings → Security** to enable 2FA
- Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.)
- Once enabled, every login requires your 6-digit OTP after the password
- Lost access? An admin can disable your 2FA from the Admin panel

### Roles
Every user has one or more roles that control what they can see and do:

| Role | What they can do |
|---|---|
| **Originator** | Submit requests; view their own submissions |
| **Approver** | Action items in their inbox; approve or reject |
| **Manager** | Everything an Approver can do + analytics, reports, reminders compliance |
| **Company Admin** | Full access: admin panel, workflow builder, reminders rules, integrations |

### Approval Delegation
If you are going on leave, go to **Settings → Delegation**. Set a delegate who will receive your approval items during the period you specify. Delegations expire automatically.

### Audit Logging
Every login, approval action, and admin change is recorded in the security audit log (visible to Admins via the API at `/api/v1/admin/security-audit`).

---

## 3. Dashboard

The dashboard gives an at-a-glance summary of:
- **Pending inbox items** — requests waiting for your action
- **Your recent requests** — things you submitted
- **Setup wizard** — guides new companies through initial configuration

Admins and Managers see broader summaries. The setup wizard disappears once all steps (org structure, users, groups, workflows) are complete.

---

## 4. Workflow Builder

This is where you define the approval processes your company uses. Only **Company Admins** can create and publish workflows.

### 4.1 Workflow List (`/workflows`)
Shows all workflow definitions: draft, published, and archived. You can:
- Create a new workflow (manually or via AI)
- Clone an existing workflow
- View version history
- Archive unused workflows

### 4.2 Form Designer (`/form-designer`)
A drag-and-drop visual editor for the request form (the data submitted by the originator). Available field types:

| Type | Use case |
|---|---|
| Text | Single-line input |
| Textarea | Multi-line notes |
| Number | Amounts, quantities |
| Date | Start/end dates |
| Dropdown | Fixed option list |
| Checkbox | Yes/No toggle |
| Attachment | File upload |
| Calculated | Formula field (e.g. `{amount} * 0.16` for tax) |
| Label / Section | Visual separators and headings |
| Button | Custom action trigger |

**Option sources:** Dropdown options can come from a static list, Master Data categories, the org user directory, or an external API endpoint.

**Visibility and editability:** Each field can be restricted to show only to certain roles, or be editable only at certain steps.

### 4.3 Custom Workflow Builder (`/custom-workflow`)
Step-by-step visual builder for the approval chain:
1. **Add steps** — drag in approval steps, conditions, or parallel steps
2. **Set assignees** — by role, by specific user, by user group, or round-robin
3. **Add routing rules** — conditional branching (e.g. if amount > 50,000 go to Finance Director)
4. **Configure SLA** — set how many hours each step has before it is flagged as overdue
5. **Set escalation** — who gets notified when a step breaches its SLA

### 4.4 AI Workflow Creator (`/ai`)
Describe a workflow in plain English and the AI will generate the form schema, steps, and routing rules automatically. Example prompts:
- *"Create a leave approval workflow with manager and HR steps"*
- *"Build a purchase request workflow for amounts up to KES 500,000 requiring two finance approvals"*

You can then fine-tune the result with follow-up instructions ("add an attachment field for receipts").

### 4.5 Templates (`/templates`)
Pre-built workflow templates you can import as a starting point:
- Petty Cash Approval
- Leave Approval
- Travel Expense Claim
- Purchase Request
- IT Access Request
- And more

### 4.6 Publishing
A workflow must be **published** before staff can submit requests against it. Publishing creates a version snapshot. You can roll back to a previous version from the version history panel.

---

## 5. Submitting Requests

**Route:** `/submit`

Any user with the **Originator** role (or higher) can submit a request.

1. Select the workflow from the list
2. Fill in the form fields
3. Click **Submit** — the request enters the approval chain immediately

### Drafts
If you are mid-way through filling a form, WizFlow auto-saves a draft. You can return to it from the Drafts section (visible from the submit page).

### Reference Numbers
Every submitted request gets a unique reference number (e.g. `PC-2025-001`) that can be used to search and track it.

---

## 6. My Requests

**Route:** `/requests`

A list of every request you have submitted. Filter by:
- **Status** — Draft, In Progress, Approved, Rejected, Returned
- **Workflow type**
- **Date range**
- **Amount range**

Click any request to open the full detail view, which shows:
- Current step and assignee
- Full audit trail of every action taken
- All form data and attachments
- Comment history

---

## 7. Inbox (Approvals)

**Route:** `/inbox`

All pending approval items assigned to you or your group appear here. For each item you can:

| Action | Meaning |
|---|---|
| **Approve** | Move to the next step |
| **Reject** | End the workflow with a rejected outcome |
| **Return** | Send back to the originator for corrections |
| **Claim** | For pool assignments — take ownership before acting |

### Email Approvals
For every inbox item, the assignee also receives an email with a one-click **Approve / Reject** link. Clicking the link opens a token-authenticated approval page — no login required. Token expires after 7 days.

### SLA & Overdue Alerts
If a step is not actioned within the configured SLA hours:
- A **warning** notification fires at 80% of the SLA window
- A **breach** notification fires when SLA is exceeded
- **Escalation** to the manager role fires after breach (if enabled in workflow settings)

---

## 8. Notifications

**Route:** `/notifications` (bell icon in the header)

In-app notifications for:
- New inbox items assigned to you
- SLA warnings and breaches
- Request status changes (your submissions approved/rejected)
- Reminder tasks due
- Report subscriptions delivered

**Channels:** In-app, email, and mobile push (if the mobile app is installed). Manage your preferred channels in **Settings → Notifications**.

---

## 9. Recurring Reminders

**Route:** `/reminders`

This feature lets managers assign recurring tasks to staff and track whether they are being completed. It replaces manual follow-up chasing.

### 9.1 How It Works

1. An admin creates a **Reminder Rule** specifying what the task is, who must do it, and when
2. The system automatically sends a notification (in-app + email) to each assigned person on the scheduled day
3. Staff open the "My Reminders" tab and click **Mark Done** when the task is complete
4. The system logs every occurrence as **Done**, **Missed**, or **Pending**
5. Admins can run a **Compliance Report** to see who has been completing tasks and who has not

### 9.2 Creating a Reminder Rule (Admin only)

Go to **Reminders → Rules → New rule** and fill in:

| Field | Description |
|---|---|
| **Task name** | e.g. "Timesheet Submission" |
| **Message to staff** | The instruction they receive in the notification |
| **Send on** | Select days of the week (Mon–Sun, multiple allowed) |
| **Send at hour (UTC)** | The UTC hour the reminder fires (0–23) |
| **Assign to users** | Individual staff members |
| **Assign to groups** | User groups (all members receive the reminder) |

**When does the system fire?** The background scheduler runs every 5 minutes and checks whether the current UTC hour has reached the configured hour. Once it has, it creates one occurrence record per assigned user and sends the notification. Occurrences are idempotent — even if the scheduler runs multiple times, each person only gets one notification per day.

**Missed detection:** Any occurrence still marked Pending from a previous day is automatically flipped to Missed at the next scheduler run.

### 9.3 My Reminders (All staff)

The **My Reminders** tab shows:
- **Pending reminders** — tasks due today that you haven't acknowledged yet. Click **Mark Done** to acknowledge.
- **History** — past reminders showing whether you completed them or missed them.

### 9.4 Compliance Report (Admin / Manager)

The **Compliance Report** tab lets you analyse team task completion. Filters:

| Filter | Options |
|---|---|
| **Rule** | Filter to one specific reminder rule |
| **Status** | All / Pending / Done / Missed |
| **From date / To date** | Date range for due dates |

**Summary cards** show:
- Total occurrences in the filtered range
- Done count (green)
- Missed count (red)
- **Compliance rate %** — `done / (done + missed) × 100`

The compliance rate turns red below 50%, amber below 80%, and green at 80%+.

**Export to CSV** — download the full filtered dataset for use in performance reviews or HR records.

### 9.5 Example Use Cases

| Rule | Schedule | Purpose |
|---|---|---|
| Daily Attendance Check-In | Mon–Fri at 8:00 | Track who is marking attendance |
| Timesheet Submission | Mon & Thu at 9:00 | Ensure timesheets are submitted twice a week |
| Weekly Status Report | Friday at 8:00 | Ensure managers receive weekly updates |
| Petty Cash Reconciliation | Mon–Fri at 15:00 | Daily cash accountability |
| Expense Claims Submission | Every Monday at 9:00 | Keep expense claims current |

---

## 10. Analytics

**Route:** `/analytics` (Manager / Admin only)

A multi-tab analytics hub covering the full picture of workflow activity.

### Executive Summary
High-level KPIs:
- Total requests, in-progress, approved, rejected, returned
- Average cycle time (hours)
- SLA compliance rate (%)
- Rejection rate (%)

### Workflow Performance
Per-workflow breakdown: volumes, approval rates, overdue counts, average cycle time.

### User Performance
Per-user breakdown: approvals actioned, rejections, average response time, current pending inbox size.

### Bottlenecks
- Slowest steps (by average hours spent)
- Slowest approvers (by average response time)

### Trends
Line chart of request volumes over time — useful for spotting seasonal patterns.

### Approval Heatmap
Day-of-week × hour-of-day grid showing when approvals are most active.

### Department Performance
Breakdown by department (where department field exists in form data).

### Journey Analytics
Step-by-step flow showing average time between each workflow step.

### Workload
Who has the most items in their inbox right now, and who has been most active.

### Scorecards
Actual vs target comparison for custom KPIs you define in the Admin panel.

---

## 11. Reports (MIS)

**Route:** `/reports` (Manager / Admin only)

Pre-built MIS reports:

| Report | Description |
|---|---|
| **Executive Summary** | High-level approval statistics for a period |
| **Exceptions** | Rejected, returned, and overdue requests |
| **Financial Summary** | Total values of approved/rejected/in-progress requests |
| **Compliance** | Open items, missing documents, policy gaps |
| **MIS Action Log** | Every approval action with actor, timestamp, comment |

### Report Subscriptions
Schedule any report to be emailed to you automatically (daily, weekly, or monthly). Set up from the Reports page.

### Saved Views
Save a filtered report configuration (date range, workflow filter) and reuse it without re-entering filters.

---

## 12. Admin Panel

**Route:** `/admin` (Company Admin only)

Tabbed administration for the entire company workspace.

### Organization Tab
- **Departments** — Create and manage departments (Finance, HR, IT, etc.)
- **Branches** — Create location branches (Head Office, Regional offices)

### Users Tab
- View all staff with their roles and active status
- **Invite new user** — sends an email invitation with a link to set their own password
- **Edit roles** — assign or remove role(s) from any user
- **Deactivate** — disable a user without deleting their history

### Groups Tab
See [Section 13 — User Groups](#13-user-groups).

### Branding Tab
- Upload your company logo
- Set a display name shown in the header and emails
- Choose a colour theme for the workspace

### Company Settings
- **Data retention** — set how long request data is kept before auto-deletion

---

## 13. User Groups

**Route:** `/user-groups` (visible from Admin → Groups tab)

Groups are collections of users used for workflow assignment. For example, a "Finance Approvers" group can be set as the assignee of a workflow step — all members receive the inbox item, and any one of them can action it.

| Group feature | Detail |
|---|---|
| Create / rename groups | Admin only |
| Add / remove members | Admin only |
| Assign to workflow step | In the workflow builder, pick "Group" as assignee type |
| Assign to reminder rule | In the Reminder Rules form, pick one or more groups |

---

## 14. Master Data

**Route:** `/master-data` (Manager / Admin)

Centralised lookup lists used as dropdown options in workflow forms. Examples:
- Cost centres
- Expense categories
- Project codes
- Vendor names

Each entry has:
- **Category** — the list name (e.g. `cost_centre`)
- **Code** — short identifier
- **Label** — display text shown in the form
- **Meta** — optional JSON for extra attributes
- **Active / Inactive** — deactivated entries stop appearing in forms

In a form field, set the option source to **Master Data** and pick the category. The dropdown auto-populates from active entries.

---

## 15. Integrations

**Route:** `/integrations` (Admin only)

### Webhooks
Push real-time events to external systems (Slack, Zapier, ERP, HR system, etc.).

**Events you can subscribe to:**
- `request.submitted`
- `step.approved`
- `step.rejected`
- `step.returned`
- `request.completed`
- `step.escalated`

Each webhook delivery includes a signed payload (HMAC-SHA256). You can test a webhook endpoint from the UI and view delivery history.

### API Keys
Generate API keys for external systems to call WizFlow's API programmatically. Each key has:
- A **name** and **scope list** (what the key is allowed to do)
- A **prefix** shown in the key list (the full key is shown only once at creation)
- Active / revoked status

---

## 16. Settings

**Route:** `/settings`

### Notification Preferences
Toggle which channels you receive notifications on:
- **Email** — sent to your registered email address
- **In-app** — appears in the notification bell
- **Push** — mobile push (requires the mobile app)
- **WhatsApp** — if configured by your admin

### Security
- Enable / disable Two-Factor Authentication (TOTP)
- View active sessions

### Approval Delegation
- Set a delegate to cover your inbox while you are away
- Set the delegation period (start and end date/time)
- Active delegations are shown in your settings; you can revoke them early

### Theme
Switch the workspace between light and dark mode, and choose an accent colour theme.

---

## 17. Mobile App

An Expo-based React Native app is available for Android.

**Key features:**
- Submit requests from your phone
- Action inbox approvals on the go
- Receive push notifications for new items
- Acknowledge recurring reminders
- Login with the same credentials as the web app

**Android APK:** Available for sideloading — contact your admin.  
**iOS:** Pending Apple Developer account enrolment.

---

## 18. API Access

WizFlow exposes a full REST API used by the web and mobile frontends. External systems can integrate via API keys.

**Base URL:** `https://api.wizflow.biz/api/v1`  
**Interactive docs:** `https://api.wizflow.biz/docs`

### Key endpoint groups

| Group | Base path |
|---|---|
| Authentication | `/auth/...` |
| Workflows | `/workflows/...` |
| Requests | `/requests/...` |
| Inbox | `/inbox` |
| Notifications | `/notifications/...` |
| **Reminders** | `/reminders/...` |
| Analytics | `/analytics/...` |
| Reports | `/reports/...` |
| Admin | `/admin/...` |
| User groups | `/user-groups/...` |
| Master data | `/master-data/...` |
| Integrations | `/admin/integrations/...` |
| Automation (scheduler) | `/automation/run` |

### Authentication
Pass the JWT access token in the `Authorization: Bearer <token>` header.  
For API key access, pass `X-API-Key: <key>` instead.

---

*Last updated: June 2026*
