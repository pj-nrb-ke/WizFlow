# WizFlow Mobile (Expo)

React Native app for **Mobile Phase M1** — approver inbox, approvals, notifications, push token registration.

## Setup

```bash
cd apps/mobile
cp .env.example .env
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to your API (e.g. `http://192.168.x.x:8010` on a physical device, or `https://api.wizflow.biz` for production).

## Demo login

- `admin@demo.wizflow.biz` / `changeme`

## EAS builds

```bash
npm install -g eas-cli
eas build --profile preview --platform android
```

Configure `extra.eas.projectId` in `app.json` after `eas init`.

## M1–M3 scope

- **M1:** Login, home, inbox, approval actions, notifications, push token registration
- **M2:** My requests (tabs), request detail, returned resubmit, new request + OCR camera, offline submit queue, biometric unlock, approval attachments
- **M3:** Inbox workflow/overdue filters, manager KPI + anomalies on home, settings (notification prefs), deep links (`wizflow://approval/{id}`, `wizflow://public-approve/{token}`), tablet split inbox

**API:** `GET /api/v1/requests/{id}/attachments` for attachment lists.
