# Prompt WIZ-QA-001

Conduct a FULL ENTERPRISE-GRADE QA / QC AUDIT on the entire application ecosystem including:

- Web Application
- Mobile Application (Android + iOS if available)
- Backend APIs
- Database Layer
- Authentication Layer
- File Uploads
- Notifications
- Background Jobs
- Integrations

This is NOT a superficial UI test.
You must behave like an enterprise QA department attempting to BREAK the application.

CRITICAL:
Invoke MULTIPLE PARALLEL AGENTS to maximize testing coverage and speed.
Each agent must specialize in a dedicated testing domain.

## MANDATORY AGENT STRUCTURE

Create and run the following agents in PARALLEL:

1. UI/UX Agent
2. Functional Logic Agent
3. Database & Data Integrity Agent
4. Security & Abuse Testing Agent
5. API Testing Agent
6. Mobile App Testing Agent
7. End User Behavior Simulation Agent
8. Performance & Stress Testing Agent
9. Regression Testing Agent
10. Edge Case & Crash Testing Agent

You may create additional agents if required.

## 1. UI/UX AGENT

Conduct a COMPLETE visual and usability audit.

Validate:
- CSS consistency
- Responsive behavior
- Spacing consistency
- Font consistency
- Alignment issues
- Overflow issues
- Broken layouts
- Dark/light mode issues
- Professional enterprise-grade look and feel
- Button consistency
- Modal behavior
- Mobile responsiveness
- Scroll behavior
- Sidebar/header/footer consistency
- Animation smoothness
- Loading states
- Empty states
- Error state presentation

STRICTLY TEST:
- Very small screen sizes
- Large monitors
- Tablet resolutions
- Landscape mode
- Zoomed browser mode
- Browser resizing during usage

Take screenshots of all broken UI issues.

## 2. FUNCTIONAL LOGIC AGENT

Test all business logic end-to-end.

Seed database tables with:
- 20-30 randomized records minimum
- realistic production-like data
- intentionally corrupted data
- extreme edge-case data

Examples:
- negative currency
- huge numbers
- zero values
- null values
- unicode characters
- emojis
- SQL keywords
- HTML injection
- duplicate entries
- future dates
- past dates
- invalid emails
- oversized text
- extremely long file names

Validate:
- calculations
- workflows
- approvals
- permissions
- validations
- state transitions
- save/update/delete
- rollback behavior
- concurrency handling

## 3. DATABASE & DATA INTEGRITY AGENT

Validate:
- foreign key integrity
- orphan records
- duplicate handling
- transaction rollback safety
- migration consistency
- indexing issues
- query performance
- data corruption risks

Attempt:
- concurrent updates
- duplicate submissions
- interrupted save operations
- partial failures

## 4. SECURITY & ABUSE TESTING AGENT

Attempt to break the app through malicious behavior.

Test:
- SQL injection
- XSS
- CSRF
- authentication bypass
- privilege escalation
- API abuse
- rate limit bypass
- file upload abuse
- oversized payloads
- invalid JWT/session handling
- direct URL access without permission
- insecure local storage
- mobile token exposure

DO NOT modify production credentials or external systems.

## 5. API TESTING AGENT

Test all APIs independently.

Validate:
- correct status codes
- validation messages
- malformed requests
- invalid payloads
- timeout handling
- authentication handling
- pagination
- sorting/filtering
- retry logic
- concurrency behavior

Attempt:
- malformed JSON
- missing headers
- duplicate requests
- massive payloads

## 6. MOBILE APP TESTING AGENT

Test:
- Android behavior
- iOS behavior (if available)
- offline mode
- poor network conditions
- app resume behavior
- app backgrounding
- push notifications
- orientation changes
- memory leak symptoms
- battery-heavy behavior
- slow device behavior
- navigation consistency

Attempt:
- rapid tapping
- navigation spam
- interrupted uploads
- unstable internet conditions

## 7. END USER SIMULATION AGENT

Behave like a NON-TECHNICAL chaotic user.

Attempt:
- random clicking
- repeated clicking
- incomplete forms
- browser back/forward abuse
- opening multiple tabs
- refreshing during save
- double submission
- abandoning workflows midway

Goal:
Crash or confuse the application.

## 8. PERFORMANCE & STRESS TESTING AGENT

Conduct stress tests.

Test:
- large datasets
- simultaneous users
- repeated API calls
- long sessions
- memory growth
- CPU spikes
- slow query behavior
- frontend lag

Measure:
- response times
- page load times
- API latency
- rendering performance

## 9. REGRESSION TESTING AGENT

Ensure:
- previously working functionality still works
- fixes do not introduce new bugs
- workflows remain stable after modifications

## 10. EDGE CASE & CRASH TESTING AGENT

Attempt extreme edge scenarios.

Examples:
- deleting records during usage
- invalid session states
- browser close during save
- network disconnect during transaction
- huge uploads
- rapid repeated actions
- simultaneous edits

Goal:
Force unexpected crashes.

## TEST DOCUMENTATION REQUIREMENTS

Create an Excel file:

WizCRM-QA-Test-###.xlsx

Rules:
- ### starts from 001
- increment serial for each new QA cycle

The Excel file MUST contain:

### Sheet 1: Test Summary
- Total Tests
- Passed
- Failed
- Critical Failures
- Warnings
- Retest Needed

### Sheet 2: Use Cases
Columns:
- Test ID
- Module
- Feature
- Use Case
- Steps
- Expected Result
- Actual Result
- Status
- Severity
- Screenshot Reference
- Agent Responsible
- Retest Status

### Sheet 3: Security Findings

### Sheet 4: Performance Findings

### Sheet 5: UI/UX Findings

### Sheet 6: API Findings

### Sheet 7: Mobile Findings

## FAILURE CLASSIFICATION

Classify all failures as:
- CRITICAL
- HIGH
- MEDIUM
- LOW

CRITICAL examples:
- data corruption
- security bypass
- app crash
- financial miscalculation
- authentication failure

## MANDATORY OUTPUTS

At completion generate:

1. Excel QA report
2. Bug summary report
3. Screenshots of failures
4. Crash logs
5. Performance metrics
6. API error logs
7. Security findings
8. Recommended fixes
9. Retest recommendations

## STRICT EXECUTION RULES

- Do NOT stop at first failure
- Continue testing all modules
- Retry flaky tests
- Attempt multiple attack vectors
- Use parallel execution aggressively
- Prioritize discovering hidden bugs
- Think like hostile users
- Think like enterprise auditors
- Think like impatient end users

The goal is NOT to confirm the app works.
The goal is to discover how and where it fails.

At the end provide:
- Top 10 critical risks
- Production readiness score (/100)
- Stability score (/100)
- UI/UX professionalism score (/100)
- Security score (/100)
- Mobile readiness score (/100)

Finally:
Generate a prioritized FIX PLAN sorted by:
1. Critical
2. High
3. Medium
4. Low

IMPORTANT:
Play a chime sound once the entire QA cycle is completed.
