# Wecycle — Android (TWA) build

This folder turns the Wecycle PWA into an Android app using a **Trusted Web
Activity (TWA)** via Bubblewrap. A TWA is Google's blessed way to ship a PWA
to Play — it launches your live site full-screen (no browser chrome) and
passes review, unlike a bare WebView wrapper.

The app opens: **https://wecycle-seven.vercel.app**
Package id: **`page.wecycle.app`**  (permanent once published — change before first publish if you want a different id)

---

## What's already done (by the build)

- ✅ TWA Gradle project generated (`app/`, `gradlew`, `twa-manifest.json`)
- ✅ Upload keystore created → `android.keystore` (password in `.keystore-password`)
- ✅ Signed **AAB** built → `app/build/outputs/bundle/release/app-release.aab`
- ✅ Real app icons generated (`../public/icons/`) — the manifest previously 404'd on icons
- ✅ Digital Asset Links file deployed → `https://wecycle-seven.vercel.app/.well-known/assetlinks.json` (contains the upload-key fingerprint)

## 🔑 CRITICAL — back these up, never commit them
- **`android.keystore`** + **`.keystore-password`** — this is your upload key.
  Lose it and you can never update the app. Copy both somewhere safe (password
  manager / encrypted backup). They are gitignored on purpose.
- The **service-account JSON** (Play API key) — keep it out of the repo too.

Upload key SHA-256:
`90:6D:E3:42:66:44:94:69:AC:64:18:D6:D0:A0:BF:10:1F:56:04:2C:15:D7:CD:FF:10:D0:CA:99:C0:CE:29:01`

---

## Remaining steps to get it live (console-only — only you can do these)

1. **Create the app** in Play Console → package `page.wecycle.app`.
2. **Enable the Android Publisher API** in GCP project `inductive-folio-474604-m5`
   (console.cloud.google.com → APIs & Services → Enable).
3. **Invite the service account** (`wecycle@inductive-folio-474604-m5.iam.gserviceaccount.com`)
   in Play Console → Users & permissions → grant "Release to testing tracks".
4. **Upload the AAB** — either drag it into the console's Internal testing track,
   or run the script:
   ```bash
   pip install -r requirements.txt
   python3 upload_to_play.py --key /path/to/service-account.json \
       --aab app/build/outputs/bundle/release/app-release.aab
   ```
5. **Fill the console declarations** the API can't: content rating, Data Safety,
   target audience, privacy policy URL, store listing (use `../public/icons/icon-512.png`).
6. **Fix Digital Asset Links for production.** Play re-signs your app with its
   own key (Play App Signing). After the first upload, copy the **SHA-256 from
   Play Console → App integrity → App signing key** and **add it** to
   `../public/.well-known/assetlinks.json` (alongside the upload-key one), then
   redeploy the PWA. Until this matches, the TWA will show a URL bar instead of
   running full-screen.

---

## Rebuilding the AAB after a change

Bump `appVersionCode` in `twa-manifest.json` (must increase every upload), then:

```bash
export JAVA_HOME=~/.bubblewrap/jdk/jdk-17.0.11+9/Contents/Home
export ANDROID_HOME=~/.bubblewrap/android_sdk
PW=$(cat .keystore-password)
./gradlew bundleRelease --no-daemon \
  -Pandroid.injected.signing.store.file="$(pwd)/android.keystore" \
  -Pandroid.injected.signing.store.password="$PW" \
  -Pandroid.injected.signing.key.alias=wecycle \
  -Pandroid.injected.signing.key.password="$PW"
```

> Note: the TWA always opens the **live** site, so most app updates don't need
> a new AAB at all — just deploy the PWA. You only rebuild the AAB to change
> the icon, name, package, colors, or Android-level config.
