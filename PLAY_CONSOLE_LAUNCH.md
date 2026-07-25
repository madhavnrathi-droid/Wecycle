# Wecycle — Google Play launch pack

Everything needed to submit `page.wecycle.app` to Google Play. Copy-paste the answers below into each Console section.

---

## 0. The build (DONE — ready to upload)

| Field | Value |
|---|---|
| **AAB file** | `android-twa/wecycle-release-v3-1.0.0.aab` (signed + verified) |
| Package name | `page.wecycle.app` |
| Version code | `3` |
| Version name | `1.0.0` |
| Min / Target SDK | 21 / 35 (Play-compliant) |
| Signed with | upload key, alias `wecycle` (self-signed cert — Play re-signs; this is expected) |
| Upload-key SHA-256 | `90:6D:E3:42:66:44:94:69:AC:64:18:D6:D0:A0:BF:10:1F:56:04:2C:15:D7:CD:FF:10:D0:CA:99:C0:CE:29:01` |

This SHA is **already published** in `https://wecycle.page/.well-known/assetlinks.json`.

---

## 1. ⚠️ THE #1 thing that breaks TWAs — do this right after the first upload

When you upload the AAB, Google enrolls you in **Play App Signing** and generates **its own** app-signing key (different from the upload key). The TWA shows an ugly browser URL bar unless that key's SHA-256 is also in `assetlinks.json`.

1. After uploading, go to **Play Console → Test and release → Setup → App signing**.
2. Copy the **"App signing key certificate" SHA-256 fingerprint**.
3. Add it as a **second** fingerprint in `public/.well-known/assetlinks.json` (keep the existing one too):
   ```json
   "sha256_cert_fingerprints": [
     "90:6D:E3:42:...:01",
     "<PASTE THE PLAY APP-SIGNING SHA-256 HERE>"
   ]
   ```
4. Redeploy the web (`vercel --prod`). Verify `https://wecycle.page/.well-known/assetlinks.json` now lists both.

Until this is done the app still installs and runs — it just shows the address bar. Do it before public launch.

---

## 2. App access (reviewer login) — REQUIRED, or it gets rejected

The app requires sign-in, so Google's reviewer needs a working test account.

- Console → **App access** → choose **"All or some functionality is restricted"**.
- Add an instruction set:
  - **Username:** `playreview@wecycle.page`
  - **Password:** `<the reviewer password you set>`
  - **Instructions:** "Enter the email and password on the sign-in screen, tap Sign in. This is a campus reuse marketplace; browse the feed, open a listing, tap a category."

(There's a reviewer bypass wired for this exact email in the auth screen.)

---

## 3. Store listing (copy-paste)

- **App name (≤30):** `Wecycle`
- **Short description (≤80):** `Share, lend and find what you need on campus. Less waste, more reuse.`
- **Full description (≤4000):**
```
Wecycle is your campus circular-economy hub — a place to share what you don't need, find what you do, and keep good stuff out of landfills.

• Share or sell — list things you no longer use (free, swap, lend, or sell) in seconds. Snap a photo, set a price or give it away.
• Ask for what you need — post a request and let your community come to you. Books, tools, a kettle, anything.
• Lost & Found — report and reunite lost items on campus.
• Events — swap meets, repair cafés, cleanups and drives.
• Reach people directly — connect over email or WhatsApp; no middlemen, no fees.

Built for students, by students. Reduce waste, save money, and build a more resourceful campus — one shared item at a time.
```
- **App category:** `Shopping` (alternatives: Lifestyle, Social)
- **Tags:** marketplace, community, reuse, students, sustainability
- **Contact email:** `madhav.n.rathi@gmail.com`
- **Website:** `https://wecycle.page`
- **Privacy policy URL:** `https://wecycle.page/privacy` ✅ live (200)

### Graphics you must upload (Play needs these as separate uploads)
| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | available at `/icons/icon-512.png` — reuse it |
| Feature graphic | 1024×500 PNG/JPG | **NEEDED** — ask me to generate one |
| Phone screenshots | 2–8, PNG/JPG, 16:9 or 9:16, min 320px side | **NEEDED** — use your own screen captures (feed, a listing, lost & found, events) |
| (optional) 7"/10" tablet shots | — | skip |

---

## 4. Content rating questionnaire

- Category: **Social / Communication** (has user interaction).
- Violence / sexual / profanity / drugs / gambling: **No** to all.
- **Users can interact / share content + user-generated content: Yes** (listings, comments). Note moderation exists: report + block + admin delete.
- Shares user's current physical location: **No** (locations are free-text neighbourhoods, not GPS).
- Digital purchases: **No**.
- Expected result: **Everyone / Teen** (the UGC + user communication usually lands it at Teen / PEGI 12). That's fine.

---

## 5. Data safety form (answer exactly)

**Does your app collect or share user data?** → **Yes.**
**Is all data encrypted in transit?** → **Yes** (HTTPS everywhere).
**Do you provide a way to request data deletion?** → **Yes** → deletion URL: `https://wecycle.page/delete-account` (also in-app: Settings → Delete account).

**Data collected** (mark *Collected*; none is *Shared* for sale — analytics providers are processors):

| Data type | Collected | Purpose | Required? |
|---|---|---|---|
| Name | Yes | Account, app functionality (shown on posts) | Required |
| Email address | Yes | Account, contacting between users | Required |
| Phone number | Yes | Contacting (WhatsApp), optional | Optional |
| User IDs | Yes | Account | Required |
| Photos | Yes | App functionality (listing photos) | Optional |
| Other user content (comments, listings) | Yes | App functionality | Optional |
| App interactions / in-app actions | Yes | Analytics | Optional |
| Crash logs / diagnostics | Yes | Analytics (Microsoft Clarity, Google Analytics) | Optional |
| Approximate location | **No** — neighbourhood text only, user-typed | — | — |
| Precise location, financial info, health, contacts, SMS | **No** | — | — |

- **Third parties:** Google Analytics, Microsoft Clarity, Google Tag Manager (analytics/diagnostics, acting as processors), Supabase (your backend), remove.bg (only when a user taps "remove background" on a photo). Declare analytics under *Collected → Analytics*; you are **not selling** data → mark "shared" = No (these are service providers).

---

## 6. Other declarations

| Question | Answer |
|---|---|
| Contains ads? | **No** |
| In-app purchases? | **No** (contact happens off-platform; no payments processed in-app) |
| Target age group | **18+** (college students). Do NOT include under-13 (avoids Families policy). |
| Is it a news app? | No |
| COVID-19 contact tracing/status? | No |
| Government app? | No |
| Financial features (loans/crypto/etc.)? | No |
| Health app? | No |

---

## 7. ⚠️ Closed-testing requirement (most likely thing to delay you)

If your Play **developer account is a personal/individual account created recently**, Google requires you to run a **closed test with ≥12 testers, opted-in for ≥14 days**, before you can apply for production access. This is the single most common reason a first app stalls.

- Set up **Testing → Closed testing**, add ≥12 testers (emails), share the opt-in link, wait 14 days, then "Apply for production."
- If your account is older / an organisation account, you can publish straight to Production.

Plan for this — it's a 2-week clock, not a content problem.

---

## 8. Final pre-submit checklist

- [x] Signed AAB v3 / 1.0.0 ready (`android-twa/wecycle-release-v3-1.0.0.aab`)
- [x] Upload-key SHA in assetlinks (live, 200)
- [x] Privacy policy live (200), Terms live, Delete-account page live
- [x] Target SDK 35, light theme colors, valid icons/maskable
- [ ] Upload AAB → copy **Play app-signing SHA** → add to assetlinks → redeploy  ← do post-upload
- [ ] App access: reviewer login (`playreview@wecycle.page` + password)
- [ ] Store listing text + icon + feature graphic + 2–8 screenshots
- [ ] Content rating questionnaire
- [ ] Data safety form
- [ ] (if new personal account) Closed test, 12+ testers, 14 days

---

## Rebuild command (for next time, on a machine with the bubblewrap JDK)
```bash
cd android-twa
JAVA_HOME=~/.bubblewrap/jdk/jdk-17.0.11+9/Contents/Home \
ANDROID_HOME=~/.bubblewrap/android_sdk \
PATH="$JAVA_HOME/bin:$PATH" ./gradlew bundleRelease --no-daemon
# then sign:
"$JAVA_HOME/bin/jarsigner" -keystore android.keystore -storepass "$(cat .keystore-password)" \
  -keypass "$(cat .keystore-password)" -sigalg SHA256withRSA -digestalg SHA-256 \
  app/build/outputs/bundle/release/app-release.aab wecycle
```
