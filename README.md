# Wecycle

**The campus circular economy, in one app.** Share what you don't use, ask for what you need, and keep good stuff out of landfills — built for the Manipal (MAHE) community.

**Live:** [wecycle.page](https://wecycle.page) · **Android:** Capacitor shell (`page.wecycle.app`), Play closed testing in progress

---

## What's inside

| Surface | What it does |
|---|---|
| **Marketplace** | Share items (free / swap / borrow / sell) and post requests, with categories, photos, saves, and per-listing response threads |
| **Services & Opportunities** | Offer or find services and opportunities across a compensation spectrum — volunteer, free, or paid with price bands |
| **Events** | Community events with RSVP, custom **registration forms** (a full Google-Forms-style builder: MCQ, checkboxes, file/PDF upload, and more), and **organizer insights** (views, saves, RSVPs, per-question response breakdowns, CSV export) |
| **Lost & Found** | Report lost or found items, claim and return flows |
| **Inventory** | Community-owned items members can borrow |
| **Storefronts** | Every member has a public storefront collecting their listings |
| **Alerts** | "Tell me when someone posts X" — matched server-side, delivered in-app and via a push queue |
| **Impact** | Per-user and per-community impact scores, CO₂ and money saved, leaderboards |

Everything runs in two modes: **live** (Supabase) and **demo** (local, no backend needed) — so the app is fully explorable without any configuration.

## Tech stack

- **Web:** [Next.js 13 App Router](https://nextjs.org) (client-first SPA), React 18, TypeScript
- **Backend:** [Supabase](https://supabase.com) — Postgres with row-level security on every table, GoTrue auth, Storage, Realtime, pg_cron
- **Native:** [Capacitor 8](https://capacitorjs.com) Android shell wrapping a static export
- **Hosting:** Vercel, custom domain `wecycle.page`

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. With no environment configured the app runs in **demo mode** — every screen works against local fixture data, so you can explore the whole product immediately.

To run against a real backend, copy the template and fill in your Supabase project:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for live mode | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | for live mode | Publishable API key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also honored). Safe to ship — RLS enforces every boundary server-side |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical origin (defaults to `https://wecycle.page`) |
| `REMOVE_BG_API_KEY` | optional | Server-only key for the background-removal proxy (`/api/remove-background`) |

To stand up a **fresh** Supabase project, apply [`supabase/migrations/`](supabase/migrations/) in order — the complete, exported schema history (47 migrations: tables, RLS, triggers, storage buckets, cron jobs). See [docs/backend.md](docs/backend.md).

## Repository map

```
app/                    Routes: the SPA shell (page.tsx), mission, privacy, terms,
                        delete-account, s/[id] share pages, api/remove-background
components/             42 screen & UI components (screens are full-page surfaces)
components/forms/       Post/submit modals + the event form builder
lib/                    Data & domain logic — auth context, live data layer,
                        demo stores, email gate, password rules, event forms,
                        opportunities, analytics, platform helpers
supabase/migrations/    Complete schema history, exported from the live project
supabase/functions/     Edge functions (push-fanout)
android/                Capacitor Android project (the shipped native shell)
scripts/                build-cap.sh (static export for native), helpers
docs/                   Architecture, auth, backend, Android, deployment docs
public/                 Brand assets, banners, icons
play-assets/            Play Store listing assets
```

## How it fits together

- **One shell, many screens.** `app/page.tsx` hosts the whole product as client-side screens (feed, marketplace, events, …) with dedicated full pages for focused tasks — form building, form filling, password changes — rather than stacked modals.
- **Auth** is password-based with a one-time emailed code only to confirm the address at sign-up (and for resets). Accounts are **Manipal-only**, enforced twice: in the client before any email is spent, and by a Postgres trigger that can't be bypassed. Details: [docs/auth.md](docs/auth.md).
- **Every table has RLS.** The client ships only the publishable key; SECURITY DEFINER functions and triggers own the writes that counters and notifications need. Details: [docs/backend.md](docs/backend.md).
- **The native app is the same web app**, statically exported and bundled into a Capacitor WebView — data still comes from Supabase at runtime. Details: [docs/android.md](docs/android.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | App structure, screen model, data layers, design language |
| [docs/auth.md](docs/auth.md) | The full auth model: passwords, OTP confirmation, the Manipal gate, reset flow, anti-enumeration |
| [docs/backend.md](docs/backend.md) | Supabase reference: schema, RLS, triggers, buckets, alerts pipeline, edge functions |
| [docs/android.md](docs/android.md) | Building the native Android app, signing, Play readiness |
| [docs/deploying.md](docs/deploying.md) | Web deploys, domain/DNS, auth email (SMTP) operations |
| [docs/play-console-launch.md](docs/play-console-launch.md) | Play Console launch runbook (closed testing) |

## Development

```bash
npm run dev        # dev server on :3000
npm run build      # production build (what Vercel runs)
npm run build:cap  # static export for the native shell (CAP_EXPORT=1)
npm run cap:sync   # export + sync into android/
```

TypeScript is strict; there are no generated-code exceptions in `app/`, `components/`, or `lib/`.

## License

All rights reserved for now — this repository is public for transparency and review. If you want to build on it, open an issue and ask.
