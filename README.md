# Wecycle

**The campus circular economy, in one app.** Share what you don't use, ask for what you need, and keep good stuff out of landfills — built for the Manipal (MAHE) community.

**Live:** [wecycle.page](https://wecycle.page) · **Android:** Capacitor shell (`page.wecycle.app`)

> **Engineers: start with [HANDOFF.md](HANDOFF.md).** The backend moved from
> Supabase to Appwrite in September 2026, and the code still *looks* like it
> talks to Supabase. The handoff explains why, and how to add APIs safely.

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

Everything runs in two modes: **live** (Appwrite in production, Supabase as the rollback path) and **demo** (local, no backend needed) — so the app is fully explorable without any configuration.

## Tech stack

- **Web:** [Next.js 13 App Router](https://nextjs.org) (client-first SPA), React 18, TypeScript
- **Backend:** [Appwrite](https://appwrite.io) Cloud — TablesDB, Accounts, Storage, Realtime. Reached through an adapter that keeps the Supabase client's API, so `supabase.from(...)` in the code is Appwrite underneath. Supabase remains configured as the rollback path — see [HANDOFF.md](HANDOFF.md)
- **Native:** [Capacitor 8](https://capacitorjs.com) Android and iOS shells wrapping a static export
- **Hosting:** Vercel, custom domain `wecycle.page`

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. With no environment configured the app runs in **demo mode** — every screen works against local fixture data, so you can explore the whole product immediately.

To run against a real backend, copy the template — it is pre-filled for the production Appwrite project, whose endpoint and project id are public by design:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for live mode | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | for live mode | Publishable API key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also honored). Safe to ship — RLS enforces every boundary server-side |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical origin (defaults to `https://wecycle.page`) |
| `REMOVE_BG_API_KEY` | optional | Server-only key for the background-removal proxy (`/api/remove-background`) |

The full variable list, and which are secret, is in [HANDOFF.md](HANDOFF.md#environment-variables). To stand up the schema on a **fresh** Appwrite project, see [db/appwrite/README.md](db/appwrite/README.md). The Supabase migrations in [`supabase/migrations/`](supabase/migrations/) are kept as history.

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
- **Auth** is password-based (Appwrite Accounts). Every migrated member kept their password — their bcrypt hashes were imported directly. Accounts are **Manipal-only**: checked in the sign-up form, and on the server by `ensure_profile`, which refuses a profile to anyone else. Account creation itself is not yet gated server-side — see [HANDOFF.md](HANDOFF.md#the-manipal-gate--partly-open).
- **Permissions replace RLS.** Tables grant `create` to members; ownership is stamped per row; counters and anything touching another member's row go through `/api/rpc`, which holds the server key. Details: [HANDOFF.md](HANDOFF.md#permissions--what-replaced-row-level-security).
- **The native app is the same web app**, statically exported and bundled into a Capacitor WebView — data comes from the backend at runtime, and server routes are reached through `apiBase()`. Details: [docs/android.md](docs/android.md).

## Documentation

| Doc | Covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | App structure, screen model, data layers, design language |
| [docs/auth.md](docs/auth.md) | The full auth model: passwords, OTP confirmation, the Manipal gate, reset flow, anti-enumeration |
| [HANDOFF.md](HANDOFF.md) | **Start here.** Current architecture, the backend adapter, how to add an API, permissions, keys, known gaps |
| [docs/backend.md](docs/backend.md) | *Historical* — the Supabase backend as it was before the September 2026 move |
| [docs/android.md](docs/android.md) | Building the native Android app, signing, Play readiness |
| [docs/deploying.md](docs/deploying.md) | Web deploys, domain/DNS, auth email (SMTP) operations |
| [docs/play-console-launch.md](docs/play-console-launch.md) | Play Console launch runbook (closed testing) |
| [docs/app-update-flow.md](docs/app-update-flow.md) | Which changes reach the installed apps on their own, and which need a release |
| [db/appwrite/README.md](db/appwrite/README.md) | **Where the backend is going** — Appwrite Education: the schema, the account/data import, and the media move |
| [db/README.md](db/README.md) | The database routes side by side, and what changed in each translation |

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
