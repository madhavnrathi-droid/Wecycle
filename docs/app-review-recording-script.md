# Screen recording for App Review — shot list

Apple asked for a recording **captured on a physical device running the latest
OS**, starting from app launch and covering the core flows. This is the shot
list. Follow it in order and it comes to roughly 2–3 minutes in one take.

A simulator capture will not do: there is no real status bar and no touch
indicator, and a reviewer who asked for a device recording can see the
difference. Record on your iPhone.

## How to capture

Best quality, and what I would use: plug the iPhone into the Mac, open
**QuickTime Player → File → New Movie Recording**, and set the camera source to
the iPhone. Records at full resolution with no on-screen recording banner.

Or entirely on the phone: **Settings → Control Centre → add Screen Recording**,
then swipe down and tap the record button. Leave the microphone off.

Before you start:
- Update the iPhone to the latest iOS.
- Install **build 3** (the IPA on your Desktop) via TestFlight or Xcode.
- **Delete and reinstall the app first.** The recording must show a first-run
  state, and a leftover session would skip the sign-in you need on camera.
- Turn on Do Not Disturb so no notification banner lands mid-take.

## The shot list

Order matters. Account deletion is last because it signs you out.

**1. Launch (required first shot)**
Start recording on the iPhone home screen with the Wecycle icon visible. Tap the
icon. Let the splash and first screen load fully. Do not cut this — Apple asked
that the recording begin with launching the app.

**2. Browse the core content**
Scroll the home screen slowly past the banners, categories and the item rails.
Tap a category chip. Tap the search field, type a word, let results appear.
Pause a beat on each so it is readable at normal speed.

**3. Open a listing**
Tap any card. Show photos, price, condition, location, the poster, and the
Contact button. Scroll down to the comments.

**4. User-generated content: report and block (required)**
On that listing, open the **⋯ menu**. Tap **Report**, show the reason list, pick
one and submit. Reopen the ⋯ menu and tap **Block**, and show the confirmation.
This is the bullet Apple most often re-asks for, so do not rush it.

**5. Registration and login (required)**
Sign out if you are signed in (Menu → Sign out). Tap **+** in the bottom bar to
open the sheet.
- Tap **Sign up**, show the fields, and enter a personal (non-university) email
  so the domain restriction message appears. This shows the registration flow
  and explains on camera why the review account exists.
- Switch to **Sign in** and sign in with `playreview@wecycle.page` /
  `WecycleReview2026`. Show the app loading in a signed-in state.

**6. Sensitive-data prompt (required)**
Tap **+** in the bottom bar → post an item → tap to add a photo. **Let the iOS
photo library / camera permission prompt appear on camera** and tap Allow. Show
the picker opening. You can cancel the post afterwards.

There is no App Tracking Transparency prompt in this app — it does no tracking,
so none will appear. Nothing to film for that sub-bullet.

**7. Events and RSVP**
Tap the calendar icon in the bottom bar, open an event, and tap RSVP.

**8. Share card**
Open any listing or event and tap the share icon. Show the generated card and
the iOS share sheet opening with the image attached, then dismiss.

**9. Account deletion (required, and last)**
Menu → **Settings** → scroll to **Delete account**. Show the warning dialog, tap
through it, type **DELETE** at the typed-confirmation prompt, and show the
"Your account has been deleted" confirmation and the sign-out that follows.

The review account is a demonstration session, so this runs the full deletion
interface end to end and then clears the local session — you can sign back in
afterwards to record again if a take goes wrong.

## Before you send it

- Watch it once through. Every required bullet above must be visible.
- Trim any dead air at the start and end (QuickTime: Edit → Trim).
- Keep it under about 5 minutes and export as `.mov` or `.mp4`.

## What is not in the recording, and why

**Paid content, purchases and subscriptions.** There are none anywhere in the
app: no payment processor, no in-app purchases, no subscriptions, no paid tier.
Members arrange payment between themselves in person, off the platform. There is
no flow to film. Say this in the reply so Apple does not read the omission as an
oversight — it is already stated in section 5 of the notes.
