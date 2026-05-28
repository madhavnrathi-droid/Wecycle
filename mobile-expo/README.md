# Wecycle Mobile (Expo Go shell)

A thin Expo / React-Native shell that loads the Wecycle PWA inside a native
WebView so you can run / test the app through **Expo Go** on iOS or Android.

The web app (in `../`) is already responsive — this wrapper just gives it a
native chrome (status bar, safe-area insets, pull-to-refresh, camera/file
permissions) and a real bundle ID so you can install it on a device.

## Quick start

```bash
cd mobile-expo
npm install
npx expo start
```

Then open **Expo Go** on your phone and scan the QR code in the terminal /
browser tab. The app will pop up on your device.

> First-time only: install Expo Go from the App Store (iOS) or Play Store
> (Android). Make sure your phone is on the same Wi-Fi as your laptop.

## Pointing at local dev instead of production

By default the wrapper loads the live deployment at
`https://wecycle-seven.vercel.app` (configured in `app.json` under
`expo.extra.webUrl`).

To run the Next.js dev server locally and have Expo Go load *that* instead:

```bash
# 1. From the repo root, start Next.js so it binds to your LAN IP:
npm run dev -- -H 0.0.0.0

# 2. Find your laptop's LAN IP (Mac: System Settings → Wi-Fi → Details → IP)
#    e.g. 192.168.1.42

# 3. Run Expo with the override:
cd mobile-expo
EXPO_PUBLIC_WECYCLE_URL="http://192.168.1.42:3000" npx expo start --tunnel
```

The `--tunnel` flag lets Expo Go reach your dev box even on flaky campus Wi-Fi
(it routes through ngrok).

## What works

- **Auth** — Supabase OTP login flows through fine. Magic-link emails arrive
  in your normal inbox; tap the link on your phone, it opens the browser, and
  Supabase redirects back into the WebView session.
- **Photo upload** — the system file picker + native camera picker both
  trigger when the user taps "Take photo" or "Upload from gallery". Camera /
  photo library / mic permissions are declared in `app.json`.
- **Contact buttons** — `mailto:`, `tel:`, `sms:`, `whatsapp:` are handed off
  to the OS so they open Mail / Phone / WhatsApp natively.
- **Pull to refresh** (Android only — iOS uses the in-page UI).
- **Dark mode** — follows the OS appearance; the WebView background matches
  so you don't get a white flash on rubber-band scroll.

## Known caveats

- This is a WebView wrapper, **not** a port. You don't get push notifications
  or App Store-grade animations until we migrate to native — but Expo Go
  testing works end to end today.
- iOS Simulator can't open camera; test camera flows on a physical phone.

## Building a standalone .ipa / .apk

When you're ready to ship outside Expo Go:

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform ios     # or android
```

You'll need an Apple Developer account for iOS builds.
