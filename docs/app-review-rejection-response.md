# App Store rejection — what to change, and where

Submission `641e239a-e87d-4e54-b112-10bdafa5ef6e` · reviewed 22 Aug 2026 on iPad Air 11-inch (M3)

Three issues. **One is a labelling mistake, one was a real defect (fixed), one is
mostly evidence you have to record.** Code changes are deployed; the rest is
App Store Connect work only you can do.

---

## 1 · Guideline 5.1.2(i) — ATT · **your labels are wrong, not your app**

Apple's own definition: tracking is *"linking user or device data collected from
your app with user or device data collected from other companies' apps,
websites, or offline properties for targeted advertising or advertising
measurement"*, or *"sharing user or device data with data brokers"*.

Wecycle does none of that. It uses Google Analytics 4, Microsoft Clarity and
Vercel Analytics — **product analytics**. There is no ad network, no data broker,
no IDFA access, and the AppTrackingTransparency framework is not linked. So the
correct fix is Apple's **first** suggested route: correct the privacy labels.

**Done in code (so the claim is enforced, not asserted):** GA4 can *become*
tracking if Google Signals is on, because that is Google joining your property
to its cross-property ads graph. `allow_google_signals` and
`allow_ad_personalization_signals` are now explicitly `false`.

### What you must click
**App Store Connect → your app → App Privacy → Edit.** Requires Account Holder,
Admin, or App Manager.

For every data type currently declared, answer the tracking question **"No"** —
the one worded *"Is this data used for tracking purposes?"*. Name is the one
Apple called out, but check every type; one "Yes" anywhere sets the whole label.
Then **Publish**.

Keep declaring what you genuinely collect (Name, Email, User Content, Usage
Data) — that stays accurate. The only thing changing is *used to track*.

### Reply to paste into Resolution Center
> Wecycle does not track users as defined in Apple's User Privacy and Data Use
> policy. The app links no data with data from other companies' apps or websites
> for advertising or advertising measurement, and shares no data with data
> brokers. It contains no advertising SDK or ad network, does not access the
> IDFA, and does not link AppTrackingTransparency. The third-party services used
> are Google Analytics 4, Microsoft Clarity and Vercel Analytics, all for
> first-party product analytics only; Google Signals and ad-personalization
> signals are explicitly disabled in our analytics configuration. The App Privacy
> information has been corrected to indicate that no collected data is used to
> track, and this applies to every platform and region the app ships on.

---

## 2 · Guideline 2.3.8 — placeholder icons · **fixed in code**

Apple was right, and it was worse than "placeholder": the iOS asset catalog
shipped **the stock Capacitor logo** — a blue chevron on a grid — never replaced
since the platform was added. Android was unaffected; its launcher icons were
already the real mark, which is why this only appeared on iOS.

The iOS icon is now generated from the same artwork users see when they install
the PWA, at 1024×1024 with the alpha channel stripped (the App Store rejects
transparency). All Wecycle icons are now the same mark on the same background,
which is what 2.3.8's "similar enough to each other" asks for.

**Nothing for you to click** — it ships in the next build. Do check it looks
right on the home screen after installing.

---

## 3 · Guideline 1.2 — user-generated content

Two precautions were already present and good. Two things were genuinely
missing, both now fixed.

| requirement | before | now |
| --- | --- | --- |
| Filter objectionable content | **missing** | refuses slurs/explicit terms at post time |
| Flag objectionable content | present (8 surfaces) | unchanged |
| Block abusive users | present, instant feed removal | unchanged |
| Blocking notifies the developer | **missing** | every admin notified, with a running block count |
| EULA before registering | present (sign-up checkbox) | unchanged |

The filter folds text before matching — undoing leetspeak, separators and padded
repeats — so `sh1t`, `f.u.c.k` and `fuuuuck` are caught, while `class`,
`Scunthorpe` and `Bass guitar` stay clean. 13 cases tested including the
false-positive ones.

### What you must do: the screen recording
Apple will not clear 1.2 without it, and it must be **on a physical device**.
Record these four things in one take, then attach it in **App Review
Information → Notes**:

1. **The terms agreement before registering** — the sign-up sheet, showing the
   "I agree to Wecycle's Terms and Privacy Policy" checkbox being ticked.
2. **Flagging** — open any listing → ⋯ menu → Report → pick a reason → submit.
3. **Blocking** — ⋯ menu → Block → show the confirmation, and that the person's
   posts are gone from the feed immediately afterwards.
4. **The filter** (not asked for, but it is the precaution they said was
   missing) — start a post, type an objectionable word in the title, and show it
   being refused.

`docs/app-review-recording-script.md` has the fuller shot list.

---

## Before you resubmit

- Rebuild the IPA — **the current binary has none of this**, including the icon.
- Bump the build number past the rejected `1.0 (1)`.
- Publish the corrected App Privacy answers **before** submitting, as Apple asks.
- Attach the recording in App Review Information → Notes.
- Reply in Resolution Center with the 5.1.2(i) text above.
