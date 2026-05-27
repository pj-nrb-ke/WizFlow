# WizCRM QA-005 Enterprise Rock-Solid Validation Instructions

## Objective

This QA cycle is intended to move WizCRM from:

"Frontend interaction testing"

to:

"Enterprise-grade rock-solid validation under real-world office abuse conditions."

The application must now be tested as though:
- it is going live tomorrow
- thousands of real users will use it
- support tickets must be minimized
- user frustration must be minimized
- data corruption must NEVER occur
- frontend/backend mismatch must NEVER occur
- duplicate actions must NEVER occur

The goal is NOT to test whether the app merely survives.

The goal IS to prove:
- data consistency
- workflow integrity
- state synchronization
- race condition safety
- duplicate prevention
- resilience under abuse
- resilience under long-duration use
- enterprise-grade operational stability

IMPORTANT:
The owner of the application (PJ) will NOT spend manual time testing the app.

The QA process must therefore behave as:
- QA department
- end users
- UAT team
- enterprise auditors
- destructive testers
- usability reviewers
- chaos testers

All at once.

--------------------------------------------------
MOST IMPORTANT NEW REQUIREMENT
--------------------------------------------------

The previous QA cycle performed:
- real interaction testing
- browser automation
- workflow navigation

However it still had a critical weakness:

Tests were interaction-heavy but NOT assertion-heavy.

This QA cycle MUST focus heavily on:

1. State validation
2. Data validation
3. Duplicate prevention validation
4. Frontend/backend synchronization validation
5. Async/race-condition validation
6. Long-duration stability validation
7. Multi-tab consistency validation
8. Partial failure recovery validation

--------------------------------------------------
MANDATORY TESTING PRINCIPLE
--------------------------------------------------

A test is NOT considered PASS simply because:
- the UI did not crash
- the page remained visible
- the browser survived

A test ONLY passes if:
- correct state is preserved
- correct data is saved
- no duplicates are created
- frontend and backend remain synchronized
- counters remain accurate
- cache/state remains correct
- loading indicators behave correctly
- user workflow remains understandable
- no hidden corruption occurs

--------------------------------------------------
MANDATORY QA TOOLING
--------------------------------------------------

Use:
- Playwright preferred
- Cypress acceptable

Playwright traces/videos/screenshots are mandatory.

--------------------------------------------------
MANDATORY EXECUTION EVIDENCE
--------------------------------------------------

Generate evidence for ALL failed tests.

Mandatory evidence:
- screenshots
- Playwright traces
- Playwright videos where feasible
- browser console logs
- failed network requests
- API response evidence
- database validation evidence where needed

--------------------------------------------------
MINIMUM REQUIRED TEST EXECUTION
--------------------------------------------------

The QA cycle is incomplete unless ALL minimums are met:

- 250+ frontend interaction tests
- 75+ assertion-heavy validation tests
- 40+ destructive chaos tests
- 25+ mobile viewport tests
- 25+ navigation abuse tests
- 20+ multi-tab concurrency tests
- 20+ session interruption tests
- 20+ duplicate-prevention tests
- 15+ async/race-condition tests
- 15+ backend/frontend synchronization tests
- 10+ long-duration degradation tests

--------------------------------------------------
MANDATORY ASSERTION-HEAVY TESTING
--------------------------------------------------

IMPORTANT:
Every action must be followed by verification.

Examples:

BAD TEST:
- Click Save
- UI did not crash
- PASS

GOOD TEST:
- Click Save
- Verify only 1 API request succeeded
- Verify only 1 record exists
- Verify list count updated correctly
- Verify dashboard counters updated
- Verify no duplicate toast messages
- Verify loading state cleared
- Verify no stale cache exists
- Verify frontend matches backend
- Verify no console errors
- THEN mark PASS

--------------------------------------------------
MANDATORY DUPLICATE PREVENTION TESTING
--------------------------------------------------

Actively attempt to create duplicates.

Examples:
- double-click save
- triple-click save
- spam buttons rapidly
- refresh during save
- save same record in two tabs
- retry after timeout
- reconnect after failure
- duplicate uploads
- repeated API calls

Validate:
- no duplicate records
- no duplicate notifications
- no duplicate API processing
- no inconsistent counters
- no stale state

--------------------------------------------------
MANDATORY RACE CONDITION TESTING
--------------------------------------------------

Simulate:
- simultaneous saves
- simultaneous edits
- rapid navigation during API calls
- tab switching during loading
- network slowdown
- delayed API responses
- interrupted requests
- stale UI state
- rapid filtering/sorting
- repeated modal open/close

Validate:
- frontend remains synchronized
- state consistency preserved
- correct record versions preserved
- no phantom data
- no stale dashboard values
- no spinner deadlocks

--------------------------------------------------
MANDATORY MULTI-TAB TESTING
--------------------------------------------------

Open multiple tabs simultaneously.

Test:
- edit same record in multiple tabs
- delete in one tab and edit in another
- logout in one tab
- refresh in another
- create duplicate workflows simultaneously

Validate:
- stale data warnings
- conflict handling
- correct session behavior
- no silent corruption

--------------------------------------------------
MANDATORY SESSION INTERRUPTION TESTING
--------------------------------------------------

Simulate:
- token expiry during save
- browser refresh during workflow
- browser close during upload
- reconnect after disconnect
- internet drop during save
- laptop sleep/wake
- mobile app background/resume

Validate:
- graceful recovery
- clear messaging
- no partial corruption
- no silent failures

--------------------------------------------------
MANDATORY FRONTEND/BACKEND SYNCHRONIZATION TESTING
--------------------------------------------------

After major actions verify:
- frontend list matches backend
- dashboard counts match backend
- filters return correct data
- deleted items disappear correctly
- edited values refresh correctly
- cached state invalidates properly
- optimistic UI rollback works correctly

IMPORTANT:
This is now a major focus area.

--------------------------------------------------
MANDATORY LONG-DURATION OFFICE SIMULATION
--------------------------------------------------

Simulate realistic office usage.

Minimum:
- 60 minutes continuous automation OR equivalent scripted workload

Simulate:
- receptionist usage
- sales rep usage
- manager dashboard usage
- repeated searching/filtering
- repeated save/edit operations
- repeated uploads/downloads
- repeated navigation

Validate:
- memory stability
- UI responsiveness
- browser responsiveness
- stale state issues
- degradation over time
- React/render warnings
- console error accumulation

--------------------------------------------------
MANDATORY HUMAN FRUSTRATION ANALYSIS
--------------------------------------------------

Identify:
- frustrating workflows
- excessive clicks
- confusing navigation
- unclear forms
- poor validation wording
- unclear success/failure messaging
- screens likely to generate support tickets
- workflows likely to frustrate office staff

--------------------------------------------------
MANDATORY VISUAL ENTERPRISE REVIEW
--------------------------------------------------

Evaluate:
- enterprise professionalism
- visual hierarchy
- spacing rhythm
- typography consistency
- dashboard readability
- mobile usability
- visual fatigue
- density balance
- modal usability
- table readability
- loading state quality

--------------------------------------------------
MANDATORY MOBILE REALISM TESTING
--------------------------------------------------

Test:
- Android viewport
- iPhone viewport
- small screens
- tablet view
- portrait/landscape

Validate:
- hidden buttons
- clipped text
- scroll traps
- modal overflow
- touch target sizing
- keyboard overlap
- mobile navigation usability

--------------------------------------------------
MANDATORY ACCESSIBILITY TESTING
--------------------------------------------------

Validate:
- keyboard navigation
- tab order
- focus visibility
- accessibility labels
- color contrast
- readable forms
- screen-reader friendliness where feasible

--------------------------------------------------
MANDATORY FAILURE EXPECTATION RULE
--------------------------------------------------

IMPORTANT:

If very few issues are discovered:
ASSUME TESTING DEPTH IS INSUFFICIENT.

Continue testing deeper.

A large enterprise app under destructive testing SHOULD expose:
- UX issues
- edge-case failures
- synchronization issues
- validation gaps
- stale state problems
- race conditions
- user frustration points

If these are not being discovered, testing intensity is too low.

--------------------------------------------------
MANDATORY EXCEL REPORT
--------------------------------------------------

Create:

WizCRM-QA-Test-005.xlsx

Required sheets:

1. Test Summary
2. Assertion Validation Tests
3. Duplicate Prevention Tests
4. Race Condition Tests
5. Multi-Tab Tests
6. Session Interruption Tests
7. Frontend/Backend Sync Tests
8. Long-Duration Stability Tests
9. UX Frustration Findings
10. Mobile Findings
11. Visual QA Findings
12. Evidence Index
13. Critical/High Issues
14. Recommended Fixes

--------------------------------------------------
MANDATORY ISSUE CLASSIFICATION
--------------------------------------------------

Classify:
- CRITICAL
- HIGH
- MEDIUM
- LOW

CRITICAL examples:
- data corruption
- duplicate records
- stale state corruption
- session security issues
- wrong dashboard totals
- silent save failures
- frontend/backend mismatch
- race-condition corruption

--------------------------------------------------
MANDATORY FINAL OUTPUT
--------------------------------------------------

Generate:

- Excel QA report
- Screenshot folder
- Playwright trace folder
- Playwright video folder
- Crash evidence folder
- Short markdown executive summary

--------------------------------------------------
MANDATORY FINAL SUMMARY
--------------------------------------------------

Provide:

1. Total tests executed
2. Total assertion validations executed
3. Total destructive tests executed
4. Total failed tests
5. Total high/critical issues
6. Most fragile workflows
7. Most dangerous race conditions
8. Most likely support-ticket generators
9. Most confusing workflows
10. Most unstable screens
11. Production readiness score
12. Enterprise stability score
13. Human usability score
14. Frontend synchronization score
15. Mobile readiness score

--------------------------------------------------
FINAL QA PHILOSOPHY
--------------------------------------------------

The purpose is NOT:
"Does the app basically work?"

The purpose IS:
"Can this app survive real-world office abuse without corrupting data, frustrating users, or creating operational instability?"

Think like:
- destructive enterprise QA
- hostile users
- impatient office workers
- distracted managers
- overworked receptionists
- frustrated sales teams

IMPORTANT:
Play a chime sound once the entire QA cycle is fully completed.
