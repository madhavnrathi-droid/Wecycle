# App Review Information — Notes field

Paste the block below into **App Store Connect → your app → App Review Information → Notes**.
It answers the six items Apple asked for, in their order.

Every claim in it is checked against the shipping build. Do not add anything you
have not verified: the fastest way back to a rejection is a note the reviewer
can disprove in one tap.

Before pasting, fill the one bracketed line in section 2 with any physical
device you have run the build on. If you have not run it on a physical iPhone,
delete that line rather than inventing one.

---

## 2. Devices and operating systems tested

Wecycle 1.1.0 (build 1) was tested on:

- iPhone 17 — iOS 26.5
- iPad Air 13-inch (M4) — iPadOS 26.5
- [Physical device, if any: e.g. "iPhone 14 — iOS 26.4 (physical device)"]

Minimum supported version is iOS 15.0. The app is portrait-only on iPhone and
supports portrait and landscape on iPad.

Flows exercised on both devices before submission: cold launch, sign-in with the
review account below, browsing the marketplace and category filters, search,
opening a listing, opening an event and its RSVP screen, the lost-and-found
board, generating and sharing a share card through the iOS share sheet, and
session persistence across an app relaunch.

## 3. What the app does, who it is for, and the problem it solves

Wecycle is a free, non-commercial marketplace and noticeboard for a university
campus community.

**The problem.** Every term, students throw away or leave behind furniture,
appliances, textbooks and equipment that the next intake then buys new. Items
that could circulate within walking distance instead go to landfill, and
students pay full price for things a classmate two buildings away is discarding.
Campus notices — lost property, events, small paid gigs — are scattered across
dozens of WhatsApp groups where they are unsearchable and expire quickly.

**What the app does.** Five things, all in one place:

1. **Marketplace** — list an item to sell, lend or give away free. Browse by
   category, search, save favourites, and contact the seller directly.
2. **Requests** — post what you need ("looking for a scientific calculator")
   so someone holding one can offer it.
3. **Lost and found** — report something lost or found on campus with a photo
   and last-seen location.
4. **Events** — post campus events with date, time, venue and poster, and RSVP.
5. **Jobs and gigs** — post or find small paid campus work, such as design or
   tutoring.

**Target audience.** Students and staff at the university campuses Wecycle
serves. Sign-up is restricted to university email addresses so that members are
verified classmates rather than anonymous strangers; see section 4 for how the
review account bypasses this.

**Value.** It is free, takes no commission, carries no advertising, and handles
no money. Wecycle introduces two people who then meet in person on campus and
complete the exchange themselves.

## 4. Setting up and accessing the main features

**Review account** (works immediately, no email verification needed):

- Email: `playreview@wecycle.page`
- Password: `WecycleReview2026`

Sign-in: launch the app, tap **+** in the bottom bar (or the avatar, top right)
to open the sign-in sheet, enter the credentials above and tap **Sign in**.

Important: normal sign-up is restricted to university email addresses, so a
personal address will be refused at the sign-up step. The account above is
allow-listed specifically for App Review and bypasses that restriction. It opens
a demonstration session populated with sample content, so nothing the reviewer
does affects real members' data. No sample files or attachments are needed.

**Walkthrough of the main features**

- **Browse the marketplace** — the home screen opens on it. Tap a category chip
  (Electronics, Furniture, Books…) to filter, or use the search field.
- **Open a listing** — tap any card. The detail view shows photos, price,
  condition, location, the poster's profile, comments, and a Contact button.
- **Lost and found** — scroll to "Lost on campus" on the home screen and tap
  **All lost**, or use the bottom bar.
- **Events** — tap the calendar icon in the bottom bar. Open any event to see
  the date, venue, poster and RSVP button.
- **Share card** — open any listing or event and tap the share icon in the top
  right. The app generates a branded image of the post and offers it through the
  iOS share sheet.
- **Post something** — tap **+** in the bottom bar and choose what to post.
  Adding a photo will ask for camera or photo library permission.
- **Report or block** — the ⋯ menu on any listing, comment or profile.
- **Delete the account** — Menu → Settings → Delete account, or
  https://wecycle.page/delete-account

## 5. External services the app relies on

| Service | Purpose |
| --- | --- |
| Supabase | Hosted PostgreSQL database, user authentication, and image storage. All listings, events, comments and profiles are stored here. Authentication emails are sent by Supabase. |
| Vercel | Hosts wecycle.page, which serves the shared-link pages and the one server endpoint listed below. |
| remove.bg | Optional, user-initiated background removal on a photo the member is uploading. It runs only when the member taps the background-removal control, and only on that image. |
| Google Analytics 4 and Google Tag Manager | Product analytics — which screens and features are used. |
| Microsoft Clarity | Product analytics. |
| DiceBear | Generates a placeholder avatar illustration for members who have not uploaded a profile photo. |

The app does **not** use any payment processor, advertising network, or
generative AI service. No purchases, subscriptions or in-app payments exist
anywhere in the app. Members arrange payment between themselves in person, off
the platform, and Wecycle takes no fee or commission.

## 6. Regional differences

There are none. Every feature, screen and piece of functionality behaves
identically in every region and App Store storefront. Nothing is geo-restricted,
geo-gated or varies by country, and the app requests no location permission and
collects no device location.

Two points that are about eligibility rather than region, noted for clarity:

- Sign-up requires a university email address, which limits who can create an
  account. This is not regional — it applies identically everywhere. The review
  account in section 4 bypasses it.
- Listings are priced in Indian rupees because the campuses served are in India.
  This is display formatting only; no payment is taken in the app, in any
  currency.

## 7. Regulated industry and third-party material

Wecycle does not operate in a regulated industry. It is not a financial,
medical, legal, gambling, dating or education-provider service. It processes no
payments, holds no funds, ships nothing, and gives no regulated advice.

**On third-party material.** Wecycle is an independent student project. It is
not affiliated with, endorsed by, sponsored by, or operated on behalf of any
university, college or institution. The app contains no university logo,
trademark, crest or other institutional branding. University and department
names appear in two places only, both descriptive: members select their own
college from a list when creating a profile, and the sign-up rule names the
email domain that is accepted. This is a factual reference to which institution
a person belongs, not a claim of association. That position is stated publicly
at https://wecycle.page/copyright

**Other content in the app** is created by members: their own photographs and
descriptions of their own possessions. Our Terms require members to post only
images they own or have the right to use. Rights holders can report infringing
material at https://wecycle.page/copyright and we remove confirmed infringements
and close repeat infringers' accounts.

**Supporting pages**

- Support: https://wecycle.page/support
- Privacy Policy: https://wecycle.page/privacy
- Terms of Service: https://wecycle.page/terms
- Copyright and IP, including the infringement-report route:
  https://wecycle.page/copyright
- Account deletion: https://wecycle.page/delete-account
