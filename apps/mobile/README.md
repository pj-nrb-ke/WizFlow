# WizFlow Mobile (Expo)

Native mobile app for WizFlow — **M1–M5 complete** (approvals, submit, OCR, offline sync, voice, manager KPI, templates, store release kit).

## Setup

```bash
cd apps/mobile
cp .env.example .env
npm install
npx expo start
```

| Variable | Example |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | `https://api.wizflow.biz` or LAN `http://192.168.x.x:8010` |
| `EXPO_PUBLIC_WEB_URL` | `https://app.wizflow.biz` |

## Demo login

- `admin@demo.wizflow.biz` / `changeme`
- `originator@demo.wizflow.biz` / `changeme`

## Features (M1–M5)

| Phase | Highlights |
|-------|------------|
| **M1** | Login, home, inbox, approval, notifications, push token + API delivery |
| **M2** | My requests, submit, OCR, offline queue, biometrics |
| **M3** | Inbox filters, manager KPI/anomalies, deep links, settings, tablet inbox |
| **M4** | AI narrative, voice nav/dictation, typed OCR, upload retry + tab badge, push actions |
| **M5** | Templates clone, workflows list, share (web + deep link), WhatsApp pref hook |

## EAS builds & stores

See **[store/RELEASE.md](./store/RELEASE.md)** for `eas init`, build, and submit steps.  
Listing copy: **[store/listing.md](./store/listing.md)** · Privacy: **[store/privacy-policy.md](./store/privacy-policy.md)**

```bash
eas build --profile preview --platform android
eas build --profile production --platform all
```

Replace `extra.eas.projectId` in `app.json` after `eas init`.

## Push notifications

1. User enables **Push** in Settings → token registered at `POST /api/v1/users/push-token`.
2. API sends Expo push on in-app notifications when `EXPO_PUSH_ENABLED=true`.
3. Approval notifications include **Approve / Reject** action buttons (where OS supports).

Optional API env: `EXPO_PUSH_ACCESS_TOKEN` for Expo push API auth.

## Deep links

- `wizflow://approval/{requestId}`
- `wizflow://request/{requestId}`
- `wizflow://public-approve/{token}`
