# Architecture

How the Wecycle codebase is put together, and why.

## One shell, many screens

The entire product renders through **`app/page.tsx`** — a single client component that owns navigation state. There is no per-screen routing: screens (`feed`, `marketplace`, `events`, `lostfound`, `inventory`, …) are components switched by a `Screen` value, with sub-screens (settings, account, notifications, password change, event insights, …) stacked on top.

Why: the app behaves like an app, not a website. Navigation is instant, scroll positions survive screen switches, and the same tree runs unchanged inside the Capacitor WebView. The few real routes that exist are the ones that must be URLs:

| Route | Purpose |
|---|---|
| `/` | The app |
| `/mission`, `/privacy`, `/terms` | Public policy/marketing pages (linked from stores and the auth modal) |
| `/delete-account` | Play-required account-deletion page |
| `/s/[id]` | Share pages with OG tags (force-dynamic; excluded from the native export) |
| `/api/remove-background` | Server proxy for remove.bg (keeps the API key server-side) |

## Focused tasks get full pages

Anything that deserves concentration — building a registration form, filling one in, changing a password — opens a **dedicated full page** with a back button top-left and no bottom nav, instead of a modal over a busy screen. `FormBuilderScreen` and `EventRegistrationScreen` are the clearest examples: they take over the viewport, trap focus, and return you exactly where you were.

## Two data modes, one interface

Every data operation routes through a mode switch:

- **`supabase`** — real users. `lib/liveData.ts` (+ domain modules like `lib/eventForms.ts`, `lib/alerts.ts`) talk to Postgres over RLS.
- **`demo`** — no login or no backend configured. `lib/demoAuth.ts`, `lib/demoInventory.ts`, and fixture data in `lib/mockData.ts` back the same calls with localStorage state.

`app/page.tsx` derives `storageMode = isDemo ? 'demo' : 'supabase'` once and passes it down. This is why the app is fully explorable with zero configuration, why the Play reviewer account works without touching real data, and why `npm run dev` needs no env file.

## The data layer

- **`lib/AuthContext.tsx`** — session, profile, admin flags. Sessions persist (browser storage; the same mechanism carries the native shell), so users don't re-authenticate every visit.
- **`lib/liveData.ts`** — CRUD for listings, requests, events, RSVPs, lost & found, plus purge helpers for expired content.
- **`lib/eventForms.ts`** — the registration-form system: 10 field types, validation, response CRUD, CSV export, and the private `form-uploads` storage bucket.
- **`lib/opportunity.ts`** — the compensation model for Services & Opportunities (`volunteer` / `free` / `paid` + price bands) and its mapping onto listing types.
- **`lib/emailDomain.ts` / `lib/password.ts`** — the auth gate and password rules (see [auth.md](auth.md)).
- **`lib/database.types.ts`** — generated Postgres types; regenerate with `npx supabase gen types typescript`.

Uploads go through `lib/imageCompression.ts` / `lib/mediaCompression.ts` before hitting storage buckets.

## Design language

The UI avoids bordered-box stacks entirely. The system is:

- **Soft tonal fills** (`--bg-inset`) instead of outlined cards
- **Floating pills** with soft shadows for actions and navigation
- **Hairline dividers** (`--border-subtle`) where separation is needed
- **Fill-based selection** states, not borders
- Opaque sticky headers (`--bg-card`) — content scrolls *under*, never *through*

Tokens live in `app/globals.css` with a full dark-mode set. `lib/useBreakpoint.ts` drives the mobile/desktop split: mobile gets full-page takeovers and a floating dock; desktop gets modal-theatre overlays and side rails — the two are intentionally different UIs over the same state.

## Platform layer

- **`lib/platform.ts`** — detects the Capacitor shell vs browser; `WEB_ORIGIN` (from `lib/siteUrl.ts`) keeps absolute URLs correct in both.
- **`lib/haptics.ts`** — Taptic/vibration abstraction that degrades gracefully per platform.
- **`lib/bodyLock.ts`** — ref-counted scroll locking shared by every overlay (modals, form builder, detail theatre), so nested surfaces never fight over `body`.
- **`lib/analytics.ts`** — event tracking (`track(EVT.…)`) used consistently across auth, posting, and conversion paths.

## The native shell

`android/` is a Capacitor 8 project with app id `page.wecycle.app`. `scripts/build-cap.sh` produces a static export (`CAP_EXPORT=1`), temporarily stashing the two routes that can't be exported (`/api/remove-background`, `/s/[id]`) — the native app calls the deployed origin for those. See [android.md](android.md).
