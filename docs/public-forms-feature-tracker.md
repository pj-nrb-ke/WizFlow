# Public Forms, Guest Submissions & Internal Invites — Feature Tracker

**Status key:** `[ ]` Not started · `[~]` In progress · `[x]` Done

**Last updated:** 2026-06-25 (Features 3–7, 10–14 complete)

---

## Progress Summary

| # | Feature | Status |
|---|---|---|
| 1 | Send form to internal users | `[ ]` Not started |
| 2 | Scheduled form dispatch | `[ ]` Not started |
| 3 | Public form link (anonymous users) | `[x]` Done |
| 4 | Auto-injected system fields on public forms | `[x]` Done |
| 5 | Guest submission storage & inbox | `[x]` Done |
| 6 | Accept → auto-create user account | `[x]` Done |
| 7 | Reject → notify applicant | `[x]` Done |
| 8 | Submission reports & charts | `[ ]` Not started |
| 9 | Security — SQL injection | `[x]` Done |
| 10 | Security — input validation | `[x]` Done |
| 11 | Security — rate limiting & spam | `[x]` Done |
| 12 | Security — token safety | `[x]` Done |
| 13 | Security — file uploads | `[ ]` Not started (no file fields on public forms yet) |
| 14 | Security — XSS prevention | `[x]` Done |
| 15 | Internal user invites — fix & extend | `[x]` Done |

**Overall: 11 of 15 features complete.**

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

- [x] "Get public link" button on published workflow
- [x] Generates a public token (`secrets.token_urlsafe(32)`) stored in new `public_form_tokens` table (raw token stored — token grants form submission only, not account access)
- [x] Public URL format: `https://app.wizflow.biz/p/{token}`
- [x] New unauthenticated route `/p/:token` renders the form with no login wall
- [x] Token can be revoked by admin at any time (also regenerated, which revokes the old one)
- [x] Revoked/expired token shows a "This link is no longer active" page
- [ ] Token expiry date configurable by admin (not yet implemented — tokens don't expire by default)

---

## 4. Auto-Injected System Fields on Public Forms

When public submissions are enabled, the system automatically adds locked identity fields at the top of the form — no manual field mapping needed.

- [x] Two locked identity fields auto-injected at the top of every public form:
  - `__guest_name` — Full Name (text, required, locked)
  - `__guest_email` — Email Address (email, required, locked)
- [x] Fields shown with a lock icon in the public form UI — styled separately from the rest of the form
- [x] Fields always rendered at position 1 and 2 on the public form
- [x] System reads these fixed keys on submission — zero configuration needed
- [ ] Lock icon in Form Designer (cosmetic — not blocking)

---

## 5. Guest Submission Storage & Inbox

Submissions from anonymous users land in a review queue rather than becoming live workflow instances.

- [x] New `guest_submissions` table: `id`, `workflow_id`, `token_id`, `data` (JSON), `status` (pending/accepted/rejected), `guest_name`, `guest_email`, `ip_address`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_note`
- [x] New "Guest Submissions" section on the workflow detail panel
- [x] List view: name, email, submitted date, status badge
- [x] Detail view: all submitted key-value pairs rendered read-only
- [x] Filter by status (Pending / All)
- [x] Pending count badge on the section header

---

## 6. Accept → Auto-Create User Account

When a manager accepts a guest submission, a WizFlow user account is created automatically.

- [x] Accept button on guest submission detail
- [x] System reads `guest_name` and `guest_email` from submission record
- [x] Duplicate check: if email already exists, 409 error blocks duplicate creation
- [x] Creates user with role `originator` by default
- [x] Generates a secure temporary password (`secrets.token_urlsafe(12)`)
- [x] Sends welcome email to the new user with login credentials and a link to the app
- [x] Guest submission status updated to `accepted`
- [ ] Submission converted to a regular workflow instance (deferred — out of scope for this phase)

---

## 7. Reject → Notify Applicant

When a manager rejects a guest submission, the applicant is notified by email.

- [x] Reject button on guest submission detail
- [x] Optional rejection reason text field
- [x] System sends rejection email to guest email with the reason (if provided)
- [x] Guest submission status updated to `rejected`

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

- [x] Pydantic schema on the guest submission endpoint — types enforced, email validated, size limit on data payload (100 KB)
- [x] Max payload size enforced at Caddy level (already configured)
- [x] Server-side HTML/script tag stripping on all text field values before saving (`_strip_html` function using regex)

---

## 11. Security — Rate Limiting & Spam

- [x] IP-based rate limit on public form endpoints: 30 requests per IP per minute (via existing `RateLimitMiddleware`, no new dependency needed)
- [x] Rate limit on invite accept endpoint: 10 requests per IP per minute
- [x] Honeypot hidden field in public form — if filled, submission is silently discarded server-side
- [x] Public token revocation available to admin at any time

---

## 12. Security — Token Safety

- [x] Invite tokens generated with `secrets.token_urlsafe(32)` (256-bit entropy) — pattern established in Feature 15
- [x] Invite tokens stored as SHA-256 hash in DB — raw token never persisted
- [x] Invite tokens expire after 72 hours
- [x] Invite tokens can be revoked instantly by admin
- [x] Public form tokens use `secrets.token_urlsafe(32)` (256-bit entropy); raw token stored as the URL slug (token grants form submit access only, not account access — no hash needed)

---

## 13. Security — File Uploads (KYC / Attachments)

Applies when public forms include attachment fields (e.g. vendor KYC documents).

- [ ] MIME type whitelist enforced server-side: PDF, JPG, PNG only (not just extension check)
- [ ] Per-file size limit: 10 MB maximum
- [ ] Uploaded files stored with randomised UUIDs as filenames — original name never used as a path
- [ ] Files served as static assets only — never executed by the server

---

## 14. Security — XSS Prevention

- [x] Guest submission viewer renders all values via React text nodes — no `innerHTML` / `dangerouslySetInnerHTML` (standard React behaviour)
- [x] Server strips HTML tags from text fields before saving to DB

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
| `public_form_tokens` | New — token (raw), workflow link, expiry, revoked flag (migration 018) | `[x]` Done |
| `guest_submissions` | New — anonymous form responses and review status (migration 018) | `[x]` Done |

---

## Build Order

1. `[x]` **Internal invites fix** — DB migration, replace in-memory store, resend/revoke UI (Feature 15)
2. `[x]` DB migrations for `public_form_tokens` and `guest_submissions` (migration 018)
3. `[x]` Public form token API + public form web route `/p/:token` (Feature 3)
4. `[x]` Auto-injected system fields `__guest_name` / `__guest_email` on public forms (Feature 4)
5. `[x]` Guest submission endpoint + security hardening — Pydantic validation, HTML strip, honeypot, rate limiting (Features 5, 10, 11, 12, 14)
6. `[x]` Guest submissions inbox UI with detail panel (Feature 5 UI)
7. `[x]` Accept / Reject flows with welcome & rejection emails (Features 6, 7)
8. `[ ]` Send form to internal users (Feature 1)
9. `[ ]` Scheduled dispatch (Feature 2)
10. `[ ]` Reports & charts (Feature 8)
