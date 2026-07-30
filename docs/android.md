# Android (Capacitor)

The native app is the web app, statically exported and bundled into a Capacitor 8 WebView. Same code, same Supabase backend at runtime — the bundle just makes the shell open instantly and work offline.

| | |
|---|---|
| App id | `page.wecycle.app` |
| Shell | Capacitor 8, `webDir: out/` |
| Java | 17 (pinned in `android/build.gradle`) |
| Config | `capacitor.config.ts` |

## Building

```bash
npm run cap:sync     # = build:cap + npx cap sync android
```

`scripts/build-cap.sh` runs the export with `CAP_EXPORT=1`. Two routes can't be statically exported and are stashed for the duration of the build (a trap restores them even on failure):

- `app/api/remove-background` — server route; the native app calls the deployed origin instead
- `app/s/[id]` — force-dynamic OG share page; shares open externally

Then open `android/` in Android Studio (or `npx cap open android`) to run on an emulator/device, and **Build → Generate Signed App Bundle** for a release AAB.

## Signing

The release keystore and its password live **only on the build machine** — they are gitignored (`*.keystore`, `.keystore-password`) and must never be committed. Losing them means losing the ability to update the Play listing, so keep an offline backup. Play App Signing holds the final signing key; the local keystore is the upload key.

## Status bar

The web layer paints an opaque strip behind the system status bar (`.app-container::before`, sized by `env(safe-area-inset-top)`), so app content never shows through behind the clock. Android must agree on icon color:

- `values/styles.xml` sets `windowLightStatusBar=true` (dark clock on the light strip)
- `values-night/styles.xml` overrides it back to light icons for dark mode

These are native resources — changes here only take effect in the **next AAB build**, not on the web.

## Release checklist

1. `npm run cap:sync` on the current `main`
2. Generate a signed AAB in Android Studio
3. Upload to Play Console → closed testing (see [play-console-launch.md](play-console-launch.md) for the full runbook: listing copy, data-safety answers, reviewer credentials, tester requirements)
4. Verify on a physical device: status-bar icons, safe-area strip, deep links, the mailto: help link, and a full sign-up round-trip
