# QA-006 Targeted Retest + Anti-Stuck Execution Instructions for Cursor

## Purpose

This QA cycle must focus on the failures discovered in QA-Test-005.xlsx.

Do NOT run another broad 500+ test cycle yet.

The priority is to fix and retest the high-risk areas:

1. `/inbox` API/UI mismatch
2. workflow sync failures returning zero/incorrect counts
3. session interruption failures
4. long-duration console error accumulation
5. stale cache / frontend-backend synchronization problems

The goal is to make the app stable enough for the next full QA cycle.

## Important Observation

During the previous QA cycle, Cursor got stuck multiple times while testing.

This must be avoided.

Cursor must use controlled, chunked, timeout-based testing instead of open-ended test execution.

## Core Execution Rule

Do not run massive test batches in one go.

Break testing into smaller controlled batches:

- Batch 1: Inbox sync tests
- Batch 2: Workflow sync tests
- Batch 3: Session interruption tests
- Batch 4: Long-duration console stability tests
- Batch 5: Regression smoke test

After each batch:

- save progress
- update Excel
- document findings
- commit notes if applicable
- continue to next batch only after current batch completes

## Excel Report Requirement

Create a new Excel file:

QA-Test-006.xlsx

Do not overwrite QA-Test-005.xlsx.

The workbook must include:

1. Test Summary
2. Inbox Sync Retest
3. Workflow Sync Retest
4. Session Interruption Retest
5. Long-Duration Stability Retest
6. Regression Smoke Test
7. Remaining Issues
8. Fix Recommendations
9. Evidence Index

## Targeted Retest Scope

### 1. Inbox Sync Retest

Investigate and retest:

- `/inbox` API response count
- frontend displayed count
- filters applied on frontend
- pagination mismatch
- stale cache
- wrong endpoint usage
- incorrect query parameters
- local state not refreshing
- deleted/archived item visibility

A test only passes if:

- API count and UI count match within expected tolerance
- filters are consistent
- refreshed UI matches backend
- no stale records are shown
- dashboard/inbox badges are correct

### 2. Workflow Sync Retest

Investigate and retest workflows that returned zero or incorrect counts.

Validate:

- workflow creation
- workflow update
- workflow list refresh
- dashboard count refresh
- related module count refresh
- filter/search consistency
- backend/frontend sync

A test only passes if:

- frontend and backend agree
- counters update correctly
- no stale cache remains
- no workflow silently disappears

### 3. Session Interruption Retest

Retest:

- refresh during save
- logout during workflow
- token expiry simulation
- network disconnect during save
- reconnect after failure
- browser back during API call
- tab close/reopen
- resume after interruption

A test only passes if:

- no duplicate record is created
- no partial corruption occurs
- user receives clear messaging
- app recovers gracefully
- user can safely continue

### 4. Long-Duration Console Stability Retest

Run a controlled long-duration simulation.

Instead of one huge run, use smaller loops:

- 5-minute run
- save logs
- 5-minute run
- save logs
- 5-minute run
- save logs

Stop if console errors exceed threshold and document immediately.

Validate:

- console errors remain low
- no repeated React warnings
- no memory growth pattern
- no UI slowdown
- no stale state accumulation

### 5. Regression Smoke Test

After fixes, run a light regression test covering:

- login
- dashboard load
- primary navigation
- create/edit one record
- search/filter
- logout
- mobile viewport quick check

## Anti-Stuck Rules

Cursor must not get trapped in long-running, hanging, or infinite test sessions.

### Mandatory Timeout Rules

Apply timeouts to all automated tests:

- single test timeout: 30 seconds
- single workflow timeout: 2 minutes
- batch timeout: 15 minutes
- long-duration segment timeout: 5 minutes per segment

If timeout occurs:

1. stop the current test
2. capture screenshot
3. capture console log
4. capture network log
5. mark test as BLOCKED or FAIL
6. move to the next test

Do NOT keep retrying the same stuck test indefinitely.

### Retry Limit Rules

For failed or stuck tests:

- retry maximum 2 times
- if still failing, document and move on
- do not loop endlessly
- do not keep regenerating the same test
- do not keep waiting for a spinner forever

### Spinner / Loading Lock Rule

If a spinner, loader, or disabled button remains for more than 15 seconds:

- capture screenshot
- capture network state
- capture console errors
- mark as FAIL: Loading Lock / Spinner Deadlock
- continue to next test

### Page Navigation Stuck Rule

If page navigation does not complete within 20 seconds:

- stop waiting
- capture screenshot
- record current URL
- capture console/network logs
- mark as FAIL or BLOCKED
- continue

### Modal Stuck Rule

If a modal cannot be closed or blocks interaction:

- capture screenshot
- record modal title/content
- try Escape key once
- try close button once
- try browser refresh once
- if still stuck, mark FAIL
- continue

### Network Stuck Rule

If API call remains pending for more than 20 seconds:

- record endpoint
- record method
- record payload if safe
- record response if any
- mark FAIL: Hanging API Call
- continue

### Infinite Loop Protection

If the same failure repeats 3 times:

- stop testing that scenario
- document root pattern
- mark as repeated failure
- continue with other areas

### Context Drift Protection

Cursor must not rewrite the full QA strategy during execution.

Cursor must:

- follow this document
- complete targeted QA-006 only
- avoid expanding scope unnecessarily
- avoid starting unrelated refactoring
- avoid adding new features
- avoid running full QA-005 again

## Checkpointing Rules

After every test batch, Cursor must write a checkpoint note:

- batch name
- tests executed
- passed
- failed
- blocked
- top issue found
- next batch to run

Checkpoint format:

`QA-006 Checkpoint: [Batch Name] completed. Tests: X, Pass: X, Fail: X, Blocked: X. Main issue: [summary]. Next: [next batch].`

## Evidence Rules

For each failed or blocked test capture:

- screenshot
- console log
- network log
- URL
- exact steps
- expected result
- actual result
- probable cause
- suggested fix

Do not mark a failure without reproduction steps.

## Fixing Rules

Cursor may fix issues discovered during QA-006, but must follow these rules:

- fix only the targeted issues
- do not refactor unrelated modules
- do not change UI design unless required for the fix
- do not introduce new features
- after each fix, rerun the failed test
- update QA-Test-006.xlsx with retest result

## Priority Fix Order

Fix in this order:

1. frontend/backend synchronization
2. stale cache / refresh logic
3. session interruption recovery
4. loading/spinner deadlocks
5. long-duration console errors
6. UX messaging improvements

## Final Output Required

At the end, provide:

1. QA-Test-006.xlsx
2. screenshots/evidence folder
3. short markdown summary
4. list of fixed issues
5. list of remaining issues
6. recommendation whether to proceed to full QA-007

## Completion Criteria

QA-006 is complete only when:

- all QA-005 high issues are retested
- `/inbox` mismatch is fixed or clearly explained
- workflow sync failures are fixed or clearly explained
- session interruption failures are reduced or clearly documented
- long-duration console errors are reduced or clearly documented
- Excel report is updated
- no test batch is stuck or hanging

## Important Final Instruction

Do not get stuck.

If anything hangs, timeout, document, mark it, and move forward.

The goal is controlled progress, not infinite waiting.

Play a chime sound once QA-006 is completed.
