# Public Forms, Guest Submissions & Internal Invites — Feature Tracker

**Status key:** `[ ]` Not started · `[~]` In progress · `[x]` Done

**Last updated:** 2026-06-25

---

## Progress Summary

| # | Feature | Status |
|---|---|---|
| 1 | Send form to internal users | `[ ]` Not started |
| 2 | Scheduled form dispatch | `[ ]` Not started |
| 3 | Public form link (anonymous users) | `[ ]` Not started |
| 4 | Auto-injected system fields on public forms | `[ ]` Not started |
| 5 | Guest submission storage & inbox | `[ ]` Not started |
| 6 | Accept → auto-create user account | `[ ]` Not started |
| 7 | Reject → notify applicant | `[ ]` Not started |
| 8 | Submission reports & charts | `[ ]` Not started |
| 9 | Security — SQL injection | `[x]` Done |
| 10 | Security — input validation | `[ ]` Not started |
| 11 | Security — rate limiting & spam | `[ ]` Not started |
| 12 | Security — token safety | `[ ]` Not started |
| 13 | Security — file uploads | `[ ]` Not started |
| 14 | Security — XSS prevention | `[ ]` Not started |
| 15 | Internal user invites — fix & extend | `[x]` Done |

**Overall: 2 of 15 features complete.**

---

## 1. Send Form to Internal Users

Send a published workflow form to existing WizFlow team members by email.

- [ ] "Send form" button on published workflow detail panel
- [ ] Recipient picker — select from company user directory (multi-select)
- [ ] Email sent to each recipient with "Open form" button linking to `/requests/new/{workflow_id}`
- [ ] Confirmation message shown after send

---

## 2. Scheduled Form Dispatch

Extend the Send Form feature to support recurring scheduled sends.

- [ ] "Send now / Schedule" toggle in the send form UI
- [ ] Schedule options: Once (pick date + time), Weekly (pick day + time), Monthly (pick day + time)
- [ ] Scheduled sends stored in `workflow_schedules` table (already exists)
- [ ] Background job fires email to selected recipients at scheduled time
- [ ] "Active schedules" list visible on the workflow — shows next run time, recipients, recurrence
- [ ] Ability to pause or delete a schedule

---

## 3. Public Form Link (Anonymous / External Users)

Allow anyone with a link to fill and submit a workflow form without a WizFlow account.

- [ ] "Get public link" button on published workflow
- [ ] Generates a public token (`secrets.token_urlsafe(32)`) stored hashed in new `public_form_tokens` table
- [ ] Public URL format: `https://app.wizflow.biz/p/{token}`
- [ ] New unauthenticated route in the web app renders the form with no login wall
- [ ] Token has optional expiry date (configurable by admin)
- [ ] Token can be revoked by admin at any time
- [ ] Revoked/expired token shows a "This link is no longer active" page

---

## 4. Auto-Injected System Fields on Public Forms

When public submissions are enabled, the system automatically adds locked identity fields at the top of the form — no manual field mapping needed.

- [ ] When "Enable public submissions" is toggled on a workflow, prepend two locked fields:
  - `__guest_name` — Full Name (text, required, locked)
  - `__guest_email` — Email Address (email, required, locked)
- [ ] Fields shown with a lock icon in the Form Designer — cannot be deleted or reordered
- [ ] Fields always rendered at position 1 and 2 on the public form
- [ ] System reads these fixed keys on submission — zero configuration needed

---

## 5. Guest Submission Storage & Inbox

Submissions from anonymous users land in a review queue rather than becoming live workflow instances.

- [ ] New `guest_submissions` table: `id`, `workflow_id`, `token_id`, `data` (JSON), `status` (pending/accepted/rejected), `guest_name`, `guest_email`, `ip_address`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_note`
- [ ] New "Guest Submissions" tab on the workflow detail panel
- [ ] List view: name, email, submitted date, status badge
- [ ] Detail view: full form rendered read-only, all submitted values visible
- [ ] Filter by status (Pending / Accepted / Rejected)
- [ ] Submission count badge on the tab

---

## 6. Accept → Auto-Create User Account

When a manager accepts a guest submission, a WizFlow user account is created automatically.

- [ ] Accept button on guest submission detail
- [ ] System reads `__guest_name` and `__guest_email` from submission data
- [ ] Duplicate check: if email already exists, warn manager and block duplicate creation
- [ ] Creates user with role `originator` by default (configurable)
- [ ] Generates a secure temporary password
- [ ] Sends welcome email to the new user with login credentials and a link to the app
- [ ] Guest submission status updated to `accepted`
- [ ] Submission converted to a regular workflow instance (visible in Requests)

---

## 7. Reject → Notify Applicant

When a manager rejects a guest submission, the applicant is notified by email.

- [ ] Reject button on guest submission detail
- [ ] Optional rejection reason text field
- [ ] System sends rejection email to `__guest_email` with the reason (if provided)
- [ ] Guest submission status updated to `rejected`

---

## 8. Submission Reports & Charts

A reports tab on every published workflow showing response analytics — works for both internal and guest submissions.

- [ ] New "Reports" tab on the workflow detail panel
- [ ] Summary row: total responses, date of first/last response
- [ ] Date range filter
- [ ] Per-field visualisation:
  - Radio / Dropdown / Yes-No → bar or pie chart with counts and percentages
  - Text / Textarea → paginated list of responses
  - Number / Currency → average, min, max, count
  - Checkbox (table column) → count of checked per row
  - Date → response timeline
- [ ] Export all responses to Excel (extends existing export infrastructure)

---

## 9. Security — SQL Injection

- [x] All queries use SQLAlchemy ORM or parameterised `text("... :param")` — no string concatenation
- [x] Invite endpoints reviewed — no raw SQL with user input
- [ ] Code review of new public form endpoints when built (Features 3, 5)

---

## 10. Security — Input Validation

- [ ] Pydantic schema on the guest submission endpoint — unknown fields rejected, types enforced
- [ ] Max payload size enforced at Caddy level (already configured — verify limit is appropriate)
- [ ] Server-side HTML/script tag stripping on all text field values before saving

---

## 11. Security — Rate Limiting & Spam

- [ ] IP-based rate limit on public submission endpoint: 5 submissions per IP per hour (using `slowapi`, already a project dependency)
- [ ] Rate limit on invite accept endpoint to prevent brute-force token guessing
- [ ] Honeypot hidden field added to public form — submissions where honeypot is filled are silently discarded
- [ ] Public token revocation available to admin as an emergency stop

---

## 12. Security — Token Safety

- [x] Invite tokens generated with `secrets.token_urlsafe(32)` (256-bit entropy) — pattern established in Feature 15
- [x] Invite tokens stored as SHA-256 hash in DB — raw token never persisted
- [x] Invite tokens expire after 72 hours
- [x] Invite tokens can be revoked instantly by admin
- [ ] Same pattern to be applied to public form tokens (Feature 3)

---

## 13. Security — File Uploads (KYC / Attachments)

Applies when public forms include attachment fields (e.g. vendor KYC documents).

- [ ] MIME type whitelist enforced server-side: PDF, JPG, PNG only (not just extension check)
- [ ] Per-file size limit: 10 MB maximum
- [ ] Uploaded files stored with randomised UUIDs as filenames — original name never used as a path
- [ ] Files served as static assets only — never executed by the server

---

## 14. Security — XSS Prevention

- [ ] Guest submission viewer renders all values via React text nodes — no `innerHTML` / `dangerouslySetInnerHTML`
- [ ] Server strips HTML tags from text fields before saving to DB

---

## 15. Internal User Invites — Fix & Extend ✓

Allow admins to invite staff by email so they can create their own WizFlow accounts.

### 15a. Fix: Move invite tokens to the database

- [x] `invitations` table extended: added `token_hash`, `invited_by_name`, `company_name`, `revoked` columns (migration 017)
- [x] Replaced the in-memory `_invites` dict with full DB reads/writes
- [x] Invite tokens expire after 72 hours
- [x] Expired/revoked token shows clear error message to the recipient

### 15b. Admin — Send invite

- [x] Invite form in Admin → Users section: enter email + select roles
- [x] Token generated with `secrets.token_urlsafe(32)`, stored as SHA-256 hash in DB
- [x] Invite email sent via Brevo with "Set up your account" button → `https://app.wizflow.biz/invite/{token}`
- [x] Pending invites list visible below the user list — shows email, who invited, expiry, roles, status badge
- [x] Resend button — generates fresh token, resets expiry, sends new email
- [x] Revoke button — immediately cancels the invite

### 15c. Employee — Accept invite

- [x] `/invite/{token}` page loads with email pre-filled (read-only)
- [x] Employee enters Full name and chooses a password
- [x] On submit: account created with correct roles, invite marked accepted
- [x] Clear error messages for: invalid token, expired, revoked, already used

### 15d. Security

- [x] Token stored as SHA-256 hash — raw token never in the DB
- [x] One-time use — token marked accepted immediately on use
- [x] No open self-registration — invite must always come from an admin
- [ ] Rate limit on the accept endpoint (to be added with Feature 11)

---

## DB Schema Changes

| Table | Action | Status |
|---|---|---|
| `invitations` | Extended — added `token_hash`, `invited_by_name`, `company_name`, `revoked` (migration 017) | `[x]` Done |
| `public_form_tokens` | New — hashed tokens, workflow link, expiry, revoked flag | `[ ]` Pending |
| `guest_submissions` | New — anonymous form responses and review status | `[ ]` Pending |

---

## Build Order

1. `[x]` **Internal invites fix** — DB migration, replace in-memory store, resend/revoke UI (Feature 15)
2. `[ ]` DB migrations for `public_form_tokens` and `guest_submissions`
3. `[ ]` Public form token API + public form web route (Feature 3)
4. `[ ]` Auto-injected system fields (Feature 4)
5. `[ ]` Guest submission endpoint + security hardening (Features 5, 10, 11, 12, 13, 14)
6. `[ ]` Guest submissions inbox UI (Feature 5 UI)
7. `[ ]` Accept / Reject flows (Features 6, 7)
8. `[ ]` Send form to internal users (Feature 1)
9. `[ ]` Scheduled dispatch (Feature 2)
10. `[ ]` Reports & charts (Feature 8)
