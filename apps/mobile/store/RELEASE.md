# Mobile release checklist (M1.2 / M4.8)

## One-time EAS setup

```bash
cd apps/mobile
npm install -g eas-cli
eas login
eas init
```

After `eas init`, copy the real **project ID** into `app.json` → `extra.eas.projectId` (replace `wizflow-mobile-placeholder`).

> **Required before cloud builds:** `eas login` then `eas init` in `apps/mobile`. Local APK builds via `expo prebuild` + Gradle do not need a real project ID.

## Build binaries

```bash
# Internal APK for testing
eas build --profile preview --platform android

# Store builds
eas build --profile production --platform all
```

## Submit to stores

```bash
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

## Store assets (manual)

1. Screenshots: Home, Inbox, Approval detail, Submit + OCR (6.7" and 5.5" iOS; phone + tablet Android).
2. App icon 1024×1024 (use brand indigo #4f46e5).
3. Upload `store/privacy-policy.md` to your website and paste the URL in store consoles.

## Push (M1.9)

- API sends Expo push when `EXPO_PUSH_ENABLED=true` (default).
- Optional: set `EXPO_PUSH_ACCESS_TOKEN` on the API for production rate limits.
- Users enable **Push notifications** in app Settings; device registers via `POST /api/v1/users/push-token`.

## Environment

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | API base (e.g. https://api.wizflow.biz) |
| `EXPO_PUBLIC_WEB_URL` | Web app for share links (e.g. https://app.wizflow.biz) |
