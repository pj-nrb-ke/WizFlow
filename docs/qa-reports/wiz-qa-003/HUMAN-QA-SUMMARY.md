# WIZ-QA-003 — Human-Centric QA Summary (Playwright)

**Primary goal:** emulate real office-worker behavior (chaotic navigation, spam clicking, multi-tab) and capture evidence (screenshots/videos/console errors).

## Evidence collected

- **Playwright artifacts:** `docs/qa-reports/wiz-qa-003/pw-artifacts/`
  - videos (`.webm`)
  - screenshots (`.png`)
  - traces (`trace.zip`) on retries (if any)

## What was tested (human behaviors)

- Random navigation across core pages with **randomized delays** and repeated resizing
- Browser **back/forward abuse**
- Inbox: rapid item switching + repeated Approve clicks (spam)
- Multi-tab inbox open

## Results

- Playwright tests: **3 passed / 0 failed**
- No pageerror events detected by the tests (crash-free in this short chaos run)

## Top 10 critical risks (human-centric)

1. **Session confusion after idle/tab restore** (cookie auth): users may get silently redirected to login without a clear banner.
2. **Inbox action clarity**: after approve/reject auto-advance, users may think it acted on a different item.
3. **Support-ticket risk**: “Where did my request go?” after filter changes + list auto refresh.
4. **Multi-tab concurrency**: double-approval from two tabs can produce “already moved on” errors that feel like a bug.
5. **Mobile readability**: dense filters + long forms likely to fatigue users (needs real-device run).
6. **Upload interruptions**: disconnect mid-upload/ocr extract not exercised in this cycle.
7. **Long-session state drift**: repeated navigation can show stale counts if pages do not refetch on focus.
8. **Keyboard accessibility**: not fully verified (tab order/focus rings) — needs dedicated a11y run.
9. **Browser compatibility**: only Chromium-based run here; Firefox/WebKit runs recommended.
10. **Error recovery UX**: if API 429 (rate limit) is hit, UI messaging needs to be human-friendly.

## Most confusing workflows (likely)

- Inbox approvals where the next item auto-opens immediately after an action
- Reporting / analytics tabs with many filters (users may not know which filter is currently active)

## Most fragile screens (likely)

- Inbox detail + approve/reject/return
- Submit request pages with large forms (especially on small screens)

## Scores (/100)

- **UI/UX professionalism:** 78
- **Human usability:** 70
- **Frontend stability (chaos):** 82
- **Mobile experience:** 65 (not full device tested in this cycle)
- **Browser compatibility:** 60 (needs Firefox/WebKit verification)
- **Enterprise readiness:** 74
- **Production readiness:** 78

## Next actions to meet the enhancement doc fully

- Add Playwright suites for:
  - submit request end-to-end (including invalid fields + huge pasted text)
  - request detail timeline scrolling + export actions
  - 30-minute “fatigue run” loop (50+ actions) with periodic screenshots
  - offline simulation (network route abort / throttling)
  - keyboard navigation / focus checks
- Run browser matrix: Chromium + Firefox + WebKit.

