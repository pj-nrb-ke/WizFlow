# WizCRM QA-004: Mandatory Real Frontend Human-Interaction Test Instructions

## Purpose

The previous human-centric QA cycle showed that Cursor understood the testing philosophy, but did not execute a real frontend destructive QA cycle deeply enough.

The next QA cycle must be a REAL browser-based human interaction test.

This QA must NOT become:
- a code audit
- a static review
- a conceptual UX review
- an API-only test
- a placeholder Excel report

This QA must be executed through the frontend like a real non-technical user using the app.

## Critical Observation From QA-003

QA-003 showed serious execution gaps:

- Total Tests = 0
- Use Cases sheet was effectively empty
- No real evidence of workflow execution
- No screenshots/videos/traces proving frontend interaction
- Findings were too few and too lightweight
- Mobile testing was weak
- Chaos testing was not sufficiently performed
- Cursor drifted into analysis mode instead of execution mode

This must not happen again.

## Non-Negotiable Instruction

Do NOT produce the QA report until at least 100 real frontend interaction tests have been executed through Playwright or Cypress.

Every test must be based on visible app usage through the frontend UI.

Backend/API/database checks may only be used to verify results after frontend interaction.

## Mandatory Testing Tool

Use one of the following:

- Playwright preferred
- Cypress acceptable
- Puppeteer acceptable only if Playwright/Cypress is not available

The QA cycle must include:

- browser automation
- real page navigation
- real button clicks
- real form entries
- real submit/save actions
- screenshots
- failure screenshots
- console logs
- network logs
- traces or videos where possible

## Minimum Required Test Volume

Execute and document at least:

- 100 total frontend interaction tests
- 30 destructive/chaotic user behavior tests
- 20 mobile viewport tests
- 20 navigation abuse tests
- 10 session interruption tests
- 10 multi-tab or duplicate action tests
- 10 long-form data entry tests
- 10 invalid upload or invalid input tests
- 10 accessibility/keyboard navigation tests

If fewer than 100 real tests are executed, the QA cycle is incomplete.

## Mandatory Excel Report

Create a new Excel report:

WizCRM-QA-Test-004.xlsx

The file must include at least the following sheets:

### Sheet 1: Test Summary

Columns/fields:
- Total Tests Executed
- Passed
- Failed
- Blocked
- Critical Issues
- High Issues
- Medium Issues
- Low Issues
- Screens Tested
- Mobile Viewports Tested
- Browser Count Tested
- Evidence Folder Path
- Overall Readiness Score

### Sheet 2: Frontend Human Interaction Tests

Columns:
- Test ID
- Screen/Page
- User Type Simulated
- Test Scenario
- Exact User Steps
- Input Data Used
- Expected Result
- Actual Result
- Status
- Severity
- Screenshot Reference
- Video/Trace Reference
- Console Error Reference
- Network Error Reference
- Notes

### Sheet 3: Destructive User Tests

Include tests such as:
- double clicking save
- clicking submit repeatedly
- refreshing during save
- browser back during workflow
- abandoning form midway
- opening modal repeatedly
- closing modal during save
- switching pages during API call
- rapid navigation
- invalid file upload
- massive pasted text
- malformed input data

### Sheet 4: Mobile Viewport Tests

Test at minimum:
- iPhone viewport
- Android viewport
- tablet viewport
- portrait mode
- landscape mode
- narrow screen
- long scrolling screens
- mobile form entry
- mobile modal behavior
- mobile menu behavior

### Sheet 5: Navigation Abuse Tests

Test:
- browser back/forward
- refresh during workflows
- opening same record in multiple tabs
- editing same record in multiple tabs
- logout/login during workflow
- deep URL access
- invalid route access
- breadcrumb/sidebar mismatch
- stale screen after navigation

### Sheet 6: UX Confusion Findings

Document:
- screens where user may get confused
- unclear buttons
- unclear form labels
- too many clicks
- weak validation messages
- missing hints
- poor empty states
- unclear success messages
- inconsistent terminology
- workflows likely to create support tickets

### Sheet 7: Visual QA Findings

Document:
- spacing issues
- alignment issues
- font inconsistencies
- button inconsistency
- overflow issues
- awkward layouts
- mobile responsiveness issues
- unprofessional visual areas
- dashboard density issues
- modal sizing issues

### Sheet 8: Evidence Index

Columns:
- Evidence ID
- Test ID
- Evidence Type
- File Path
- Description

Evidence types:
- screenshot
- video
- Playwright trace
- console log
- network log
- crash log

## Required Human Personas

Simulate the following user types:

### 1. Receptionist User

Behavior:
- enters data quickly
- makes spelling mistakes
- repeatedly saves
- opens several records
- gets interrupted
- resumes later

### 2. Sales Rep User

Behavior:
- works quickly
- skips optional fields
- uses mobile screen
- searches frequently
- opens many records

### 3. Manager User

Behavior:
- reviews dashboards
- filters data
- exports reports
- opens summaries
- expects clean visuals
- gets frustrated by unclear navigation

### 4. Confused Non-Technical User

Behavior:
- clicks wrong buttons
- uses browser back often
- refreshes pages
- leaves forms incomplete
- misunderstands labels
- tries invalid values

### 5. Impatient Power User

Behavior:
- clicks very fast
- opens multiple tabs
- double-submits forms
- uses keyboard shortcuts
- switches pages rapidly

## Required Workflow Testing

Test full workflows from start to finish.

Do not test isolated buttons only.

Examples:

- login -> dashboard -> open module -> create record -> edit record -> search record -> delete/archive record
- create lead -> update lead -> add note -> convert/close lead -> verify dashboard count
- create customer -> edit customer -> attempt invalid save -> correct save -> refresh page -> verify persistence
- upload file -> interrupt upload -> retry upload -> verify attachment
- open same record in two tabs -> edit both -> save conflict behavior
- mobile login -> navigate menu -> create record -> save -> verify list update
- invalid form submission -> observe validation -> correct input -> save -> verify success message

## Required Chaotic Behavior Testing

Cursor must actively attempt to break the app.

Test:

- double click every save button
- click save 5-10 times rapidly
- refresh immediately after save
- press browser back while saving
- close modal while saving
- submit empty forms
- paste 10,000+ characters into text fields
- enter negative values in currency/amount fields
- enter zero where not valid
- enter future dates where not valid
- enter invalid email/phone formats
- upload unsupported files
- upload very large files
- open 5 tabs for the same app
- perform simultaneous edits
- logout during active workflow
- reconnect after network disruption

## Required Long-Duration Test

Simulate a real office worker using the app continuously.

Minimum requirement:

- 30 minutes of continuous frontend usage OR a scripted equivalent of 50+ continuous user actions

Actions must include:
- navigation
- search
- filtering
- create/edit
- save
- cancel
- modal open/close
- refresh
- invalid entries
- mobile viewport switching if feasible

Look for:
- memory growth
- UI slowdown
- stale data
- broken state
- button lock issues
- browser console errors
- inconsistent loading indicators

## Required Mobile Testing

Mobile QA must not be skipped.

Test:
- mobile login
- mobile navigation
- mobile forms
- mobile modals
- mobile scrolling
- mobile dashboard cards
- mobile tables/lists
- mobile menu
- orientation changes
- small touch targets
- overflowing text
- hidden buttons

Viewports to test:
- iPhone SE size
- iPhone 14/15 size
- Android mid-range size
- tablet size

## Required Accessibility Testing

Test:
- tab navigation
- keyboard-only operation
- focus visibility
- form label clarity
- button accessibility labels
- readable contrast
- error message clarity
- screen-reader-friendly naming where possible

## Required Browser Testing

Test at minimum:
- Chrome
- Edge

Also test Firefox if available.

If a browser cannot be tested, document why.

## Execution Rules

- Do not stop at first failure
- Do not submit an empty or near-empty Excel report
- Do not produce a QA report with 0 tests
- Do not rely primarily on code inspection
- Do not skip screenshots
- Do not skip mobile testing
- Do not skip destructive testing
- Do not skip UX confusion review
- Do not mark tests as passed without actual interaction evidence
- If few issues are found, assume testing depth is insufficient and continue testing
- Every failed test must include reproduction steps
- Every failed test must include expected result and actual result
- Every critical/high issue must include suggested fix direction

## Mandatory Final Summary

At the end of the QA cycle, provide:

1. Total frontend tests executed
2. Total screens/pages tested
3. Total workflows tested
4. Total destructive tests executed
5. Total mobile tests executed
6. Total failed tests
7. Top 10 critical/high risks
8. Most fragile screens
9. Most confusing workflows
10. Screens likely to generate support tickets
11. UI/UX professionalism score out of 100
12. Human usability score out of 100
13. Frontend stability score out of 100
14. Mobile readiness score out of 100
15. Enterprise readiness score out of 100
16. Production readiness score out of 100

## Expected Output Files

Generate:

- WizCRM-QA-Test-004.xlsx
- Screenshots folder
- Playwright/Cypress trace folder if available
- Failure evidence folder
- Short markdown summary report

## Final Reminder

The goal is not to prove the app works.

The goal is to discover how real users will break it.

Think like:
- a careless user
- a confused receptionist
- a fast sales rep
- a distracted manager
- a tired office worker
- a hostile tester

IMPORTANT:
Play a chime sound once the QA cycle is fully completed.
