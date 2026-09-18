# Getting a change onto the phones

**The question:** something changes on wecycle.page — a banner, an ad, an icon.
Does it reach the Play Store app and the App Store app on its own?

**Today: partly.** Data does, instantly. Code does not, ever, until a new build
is reviewed and shipped. This is how to tell which is which, and how to move
more things into the first group.

---

## Why it works this way now

`capacitor.config.ts` sets `webDir: 'out'` and does **not** set `server.url`.
So the native app carries its *own copy* of the web build, frozen at the moment
the store build was made. Right now that is `versionCode 16 / 1.2.3`.

```
                        ┌─────────────────────────────┐
  deploy to Vercel ────►│  wecycle.page (live)        │  new code, instantly
                        └─────────────────────────────┘
                        ┌─────────────────────────────┐
  build 16 (frozen) ───►│  Android + iOS app bundle   │  the web build as it
                        └──────────────┬──────────────┘  was at submit time
                                       │ every launch
                                       ▼
                        ┌─────────────────────────────┐
                        │  the database               │  ◄── reaches every
                        └─────────────────────────────┘      install at once
```

Both the website and the apps read the same database at runtime. So:

**Reaches every installed app on the next launch, no build, no review:**
listings, events, the event page, discount codes, categories, and now anything
in `app.app_config` and `app.banners`.

**Needs a new store build:** every line of JavaScript, CSS and HTML, every
bundled SVG icon component, the launcher icon, the splash screen, the app name,
and anything native.

Worth saying plainly: **build 16 contains none of the work from this session.**
Everything shipped to wecycle.page since it was submitted — the UXINDIA banner,
the sold stamp, the category fixes, the owner edit button, the outage notice —
is on the web only. The apps need a build 17.

---

## The status message — the one thing that must never live in the database

`/api/status` is the channel the September 2026 outage did not have. The
website could say sign-in was down, because that notice shipped with the web
deploy. The apps could not be told anything: they bundle a frozen web build and
get everything else from Supabase, which *was the thing that was down*.

So the rule it is built around:

> A "we're having problems" banner served from the thing that is having the
> problems is not a status page. It is a second thing to explain.

`app/api/status/route.ts` reads one environment variable and touches nothing
else — no database, no other service. To put a message on **every install, web
and native, without an app release**, set `APP_STATUS` in Vercel and redeploy
(about a minute):

```json
{"id":"2026-09-egress","severity":"warn",
 "title":"We're having some technical difficulties",
 "body":"Signing in is unavailable right now. Your UXINDIA code is below.",
 "platforms":["ios","android"],"dismissible":true}
```

Clear it by deleting the variable. `severity` is `info`, `warn` or `critical`.
`platforms` and `minBuild`/`maxBuild` are optional and filtered server-side, so
a targeting rule invented later still works on a build shipped today.

**Give every incident a new `id`.** Dismissals are remembered against it, so
reusing an id means everyone who dismissed the last one never sees the new one.

This only helps builds that carry `lib/appStatus.ts` — **build 16 does not**.
It is one of the reasons build 17 matters.

## Option A — make it data (already done, use this first)

The best answer to "can I change the ad without shipping an app" is to stop
making the ad code. `db/sqlserver/wecycle-sqlserver.sql` SECTION 6 adds two
tables for exactly this:

**`app.banners`** — the home banner as a row: title, subtitle, image URL,
background colour, where tapping goes, when it starts and ends, which platforms
it targets.

```sql
INSERT INTO app.banners (slot, eyebrow, title, subtitle, image_url,
                         action_kind, action_value, starts_at, ends_at)
VALUES (N'home_top', N'Exclusive for members', N'25% off UXINDIA',
        N'Rising Leaders Forum · 23–27 Sept',
        N'https://wecycle.page/brand/uxindia-white.png',
        N'screen', N'event:uxindia',
        N'2026-09-18', N'2026-09-27');
```

That banner is live on web, Android and iOS within one launch. Take it down by
setting `is_active = 0`, or just let `ends_at` pass.

**`app.app_config`** — feature flags and settings as JSON rows. `OUTAGE_MODE`
is the obvious candidate: it is currently a constant in `lib/outage.ts`, which
means turning the outage notice off needs a deploy for web and a *release* for
the apps. As a config row it is one `UPDATE`.

Both tables carry `platform` and `min_build`. `min_build` is what makes this
safe on native: the build in someone's pocket in six months can only render
shapes it already knows about, so a new banner style gets `min_build` set to the
first build that understands it, and older installs skip it rather than
rendering something broken.

**The rule of thumb:** if you can imagine wanting to change it on a Tuesday
afternoon, it should be a row, not code.

**Cost:** nothing. No store involvement, no risk. **Limit:** it only moves
things you *designed* to be data. It cannot change the shape of a screen.

---

## Option B — over-the-air updates (for real UI changes)

Capacitor apps can download a new web bundle and use it on the next launch,
without going through the store. That covers actual code changes — a redesigned
card, a new icon component, a bug fix.

- **Capgo** — open source, and **self-hostable**, which fits putting things on
  your own server. Paid cloud tier, or run the update server yourself.
- **Ionic Appflow Live Updates** — first-party, hosted, more expensive.

Roughly: add the plugin, point it at an update channel, and `npm run build`
publishes a bundle instead of an AAB/IPA.

**What it cannot do**, and this trips people up: the launcher icon, the splash
screen, the app name, permissions, and any native plugin all live outside the
web bundle. Changing those is still a store release.

**Before committing to this, two things to check yourself**, because policy
moves and I would rather you read it than take my summary:

- Apple allows downloaded interpreted code in a WebView, provided it does not
  change the app's primary purpose (Developer Program License Agreement §3.3.2,
  and Review Guideline 2.5.2). OTA for a Capacitor app is ordinary and common —
  but the app must stay the app Apple reviewed.
- Google Play has an equivalent position for web content in a WebView.

Given Wecycle has already had one rejection, the safe posture is: use OTA for
fixes and content, submit a normal release for anything that changes what the
app *is*.

**Cost:** a plugin, a server or a subscription, and a second release channel to
keep straight. **Gain:** most UI changes stop needing Apple's review queue.

---

## Option C — point the app at the live website

Setting `server.url = 'https://wecycle.page'` in `capacitor.config.ts` makes the
app a shell around the live site. Every web deploy reaches every install instantly.

**I would not do this.** It gives up offline entirely — no network, no app, not
even the shell — the first paint gets slower on campus wifi, and it makes the
app much easier to read as a web wrapper, which is the first thing App Review
looks for under Guideline 4.2. There is a comment in `capacitor.config.ts` about
keeping the rubber-band scroll for exactly that reason. Trading that away for a
convenience Option B already provides is a bad deal.

---

## What I would actually do

1. **Ship build 17.** Not optional — the apps are months behind the website, and
   no amount of remote config fixes a stale bundle.
2. **Move the things that change often into `app_config` and `app.banners`.**
   The banner, the discount codes, `OUTAGE_MODE`. Do this as part of the
   SQL Server migration, while the data layer is being rewritten anyway.
3. **Add Capgo when a UI change becomes urgent enough to want it.** Not before —
   it is a second deployment pipeline and it needs to earn that.

---

## Where the code touches this

| | |
|---|---|
| `capacitor.config.ts` | `webDir: 'out'`, no `server.url` — why the apps are frozen |
| `next.config.js` | `CAP_EXPORT=1` makes the static export the apps bundle |
| `android/app/build.gradle` | `versionCode` / `versionName` — currently 16 / 1.2.3 |
| `db/sqlserver/wecycle-sqlserver.sql` SECTION 6 | `app_config` and `banners` |
| `lib/outage.ts` | a constant that should become a config row |
| `components/UxIndiaBanner.tsx` | a banner that should read from `app.banners` |
