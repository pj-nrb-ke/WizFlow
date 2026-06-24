# WizFlow — Getting Started Guide

> **URL:** https://app.wizflow.biz  
> **Demo credentials:** admin@demo.wizflow.biz / changeme

This guide takes you from zero to running your first approval request in under 15 minutes. Follow the steps in order.

---

## Step 1 — Log In

1. Open https://app.wizflow.biz in your browser
2. Enter `admin@demo.wizflow.biz` and password `changeme`
3. Click **Sign in**

You land on the **Dashboard**. The setup wizard at the top shows your workspace completion progress.

---

## Step 2 — Set Up Your Organisation

Before workflows work properly, you need departments and users.

### 2a. Add departments
1. Go to **Admin → Organization tab**
2. Click **+ Add department**
3. Add at least: Finance, HR, Operations (or whatever fits your company)

### 2b. Invite your team
1. Go to **Admin → Users tab**
2. Click **Invite user**
3. Enter their email and select their role(s):
   - Give staff **Originator** (they submit requests)
   - Give line managers **Manager** (they approve + see analytics)
   - Give approvers **Approver**
   - Give the system owner **Company Admin**
4. They receive an email with a link to set their own password

### 2c. Create approval groups (optional but recommended)
1. Go to **Admin → Groups tab**
2. Click **+ New group** — e.g. "Finance Approvers"
3. Add the relevant users as members

Groups let you assign a whole team to an approval step — any member can action it.

---

## Step 3 — Create Your First Workflow

A workflow is the approval process template. Let's create a simple **Leave Approval** workflow.

### Option A — Use a template (quickest)
1. Go to **Templates** in the sidebar
2. Find **Leave Approval** and click **Use template**
3. The workflow is created as a draft — click **Publish** to activate it

### Option B — Use the AI creator
1. Go to **AI creator** in the sidebar
2. Type: *"Create a leave approval workflow with manager approval"*
3. The AI generates the form and steps — review and click **Publish**

### Option C — Build manually
1. Go to **Workflows → + New workflow**
2. Name it and choose **Custom workflow**
3. Use the **Form designer** to add fields (start date, end date, leave type, reason)
4. Add a **Manager Approval** step with assignee type = Role → Manager
5. Set SLA to 24 hours
6. Click **Publish**

---

## Step 4 — Submit a Request

Now test the workflow end-to-end.

1. Click **New request** in the sidebar
2. Select **Leave Approval** (or the workflow you just created)
3. Fill in the form fields
4. Click **Submit**

The request is now live and waiting for approval.

---

## Step 5 — Approve the Request

1. Click **Inbox** in the sidebar
2. You'll see the leave request you just submitted (since you're the admin and also hold the manager role)
3. Click the request to open it
4. Review the details and click **Approve**

The request is now approved. The originator gets a notification.

> **Tip:** In a real setup, the originator and approver are different people. The approver also receives an email with a one-click approve link — they don't need to log in.

---

## Step 6 — Check Analytics

Now that you have at least one completed request:

1. Go to **Analytics** in the sidebar
2. The **Executive Summary** tab shows your request count, approval rates, and SLA compliance
3. Click through the other tabs: **Workflow Performance**, **User Performance**, **Bottlenecks**

Analytics update in real time as more requests are processed.

---

## Step 7 — Set Up Recurring Reminders

Reminders let you track recurring staff duties (timesheets, attendance, reports, etc.).

1. Go to **Reminders** in the sidebar
2. Click the **Rules tab** (admin/manager only)
3. Click **+ New rule**
4. Fill in:
   - **Task name:** Timesheet Submission
   - **Message:** Please submit your timesheet via the HR portal before 5 PM.
   - **Send on:** Monday, Thursday
   - **Send at hour (UTC):** 9
   - **Assign to users:** select your staff
5. Click **Create**

From that point, every Monday and Thursday at 09:00 UTC, each assigned person receives a notification. They click **Mark Done** in their **My Reminders** tab. You can see who has and hasn't complied in the **Compliance Report** tab.

---

## Step 8 — Explore the Reports

1. Go to **Reports** in the sidebar
2. Try the **Executive Summary** report — set a date range and click Apply
3. Try the **MIS Action Log** to see every approval action taken

To receive a report by email automatically:
- Click **Subscribe** on any report
- Choose the frequency (daily / weekly / monthly)

---

## What to Do Next

| Goal | Where to go |
|---|---|
| Add more workflows | Workflows → New workflow (or AI creator) |
| Add more users | Admin → Users → Invite user |
| Set up webhook to Slack/Zapier | Integrations → Webhooks |
| Create dropdown lists for forms | Master data |
| Set your delegate for leave coverage | Settings → Delegation |
| Enable 2FA for your account | Settings → Security |
| Install the mobile app | Ask your admin for the APK |
| Track staff task compliance | Reminders → Compliance Report |
| Run the compliance report as CSV | Reminders → Compliance Report → Export CSV |

---

## Common Questions

**Q: A staff member can't see a workflow in the submit page.**  
A: Make sure the workflow is **Published** (not in Draft). Also check the workflow's initiator settings — some workflows restrict who can submit.

**Q: An approver says they aren't getting email notifications.**  
A: Check **Settings → Notifications** on their account — email must be toggled on. Also check their spam folder; add `noreply@wizflow.biz` to their safe senders.

**Q: How do I set a deadline on an approval step?**  
A: In the workflow builder, find the step and set the **SLA (hours)** field. When the deadline is exceeded, the assignee and originator get an overdue alert automatically.

**Q: Can I approve a request without logging in?**  
A: Yes. The approval email contains a one-click link that works for 7 days without requiring a login. Useful for external or occasional approvers.

**Q: How do I see who missed their timesheet reminder?**  
A: Go to **Reminders → Compliance Report**, filter by the Timesheet rule and set Status = Missed. Export to CSV for HR records.

**Q: Can I bulk-invite users?**  
A: Currently invitations are one at a time from the Admin panel. The invited users set their own password via email link.

---

*For the full feature reference, see [wizflow-features-guide.md](./wizflow-features-guide.md)*
