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

## M1 scope

- Login with secure token storage
- Home dashboard (pending counts)
- Inbox list + search
- Approval detail (claim, approve, reject, return, timeline)
- Notifications list
- Expo push token registration (`POST /api/v1/users/push-token`)
