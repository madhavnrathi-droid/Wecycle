# Wecycle Backend — Supabase

Complete reference for the Supabase backend powering Wecycle.

## Project

| | |
|---|---|
| **Project ref** | `oxqnwqaumrqdiwrlvfel` |
| **Region** | `ap-south-1` (Mumbai) |
| **URL** | `https://oxqnwqaumrqdiwrlvfel.supabase.co` |
| **Dashboard** | https://supabase.com/dashboard/project/oxqnwqaumrqdiwrlvfel |
| **Plan** | Free tier |

## Environment

Copy `.env.local.example` → `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://oxqnwqaumrqdiwrlvfel.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_71Pg6dAe_KToAKCA7YDUYg_Owvvl4Nl
```

`.env.local` is in `.gitignore` — the publishable key is safe to ship in the client bundle because RLS enforces every access boundary server-side.

## Schema overview

19 tables across 6 domains:

| Domain | Tables |
|---|---|
| **Identity** | `profiles`, `communities`, `community_members` |
| **Marketplace** | `listings`, `saves`, `listing_responses`, `categories` |
| **Requests** | `requests`, `request_offers` |
| **Events** | `events`, `event_rsvps` |
| **Lost & Found** | `lost_found_reports` |
| **Inventory** | `inventory_items` |
| **Social / impact** | `reactions`, `comments`, `notifications`, `community_milestones`, `announcements`, `impact_log` |

### Custom types (enums)
`community_type`, `listing_type`, `item_condition`, `listing_status`, `request_urgency`, `request_status`, `event_type`, `event_status`, `rsvp_status`, `lost_found_status`, `inventory_status`, `member_role`, `notification_type`, `reaction_kind`, `feed_entity_type`.

### Views
- **`feed_view`** — Unified, chronological feed across listings, requests, events, lost & found, milestones, announcements.
- **`leaderboard_view`** — Per-community and global rank by impact score.

### RPCs (callable via `supabase.rpc(...)`)
| RPC | Purpose |
|---|---|
| `rpc_community_feed(_community_id, _limit, _before)` | Cursor-paginated feed query |
| `rpc_my_impact_summary()` | Profile + community/global rank + member count |
| `rpc_toggle_save(_listing_id)` | Idempotent bookmark toggle |
| `rpc_toggle_like(_entity_type, _entity_id)` | Polymorphic like toggle |
| `rpc_toggle_rsvp(_event_id)` | RSVP toggle |
| `rpc_mark_notifications_read(_ids)` | Mark notifications read (all or by id) |

## Row Level Security

Every table has RLS **enabled**. Highlights:

- **Profiles** — anyone can read profiles (public-facing app); only self can edit/delete own profile.
- **Listings** — `active` listings are public-readable; owners see all their own. Insert requires community membership; updates/deletes restricted to owner.
- **Saves** — strictly per-user (other users can't see what you've saved).
- **Listing responses** — visible only to the responder and the listing owner. Mirrors a private inbox.
- **Requests / Events** — open requests and published events are public; only owner/organizer can edit.
- **Lost & Found** — public read (the whole point), owner-only edit.
- **Inventory** — community-scoped: only members can read or write; owner or admin can edit.
- **Reactions / Comments** — public read, self-only write.
- **Notifications** — strictly per-recipient.
- **Impact log** — read your own (or admin reads community); writes only by `SECURITY DEFINER` server functions.

### Helper functions used in RLS
- `is_community_member(uuid)` → `boolean`
- `is_community_admin(uuid)`  → `boolean`

## Storage buckets

All public-read, authenticated-write to `{userId}/...` paths only.

| Bucket | Use | Limit |
|---|---|---|
| `avatars` | Profile photos | 5 MB |
| `listings` | Marketplace + inventory photos | 10 MB |
| `lost-found` | Lost & Found photos | 10 MB |
| `events` | Event covers | 10 MB |
| `community` | Community covers | 10 MB |

Allowed mime types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

## Triggers (business logic)

| Trigger | Purpose |
|---|---|
| `trg_auth_user_created` | Auto-create `profiles` row when a user signs up. Derives username + initials from email/metadata. |
| `trg_profile_sync_member` | When `profiles.community_id` is set, auto-insert into `community_members`. |
| `trg_members_count_*` | Maintain `communities.member_count`. |
| `trg_saves_count_*` | Maintain `listings.save_count`. |
| `trg_responses_count_*` | Maintain `listings.response_count`. |
| `trg_offers_count_*` | Maintain `requests.offer_count`. |
| `trg_rsvps_count_*` | Maintain `events.attendee_count`. |
| `trg_comments_reply_count_*` | Maintain `comments.reply_count`. |
| `trg_accrue_impact` | When `impact_log` row inserted, accumulate `profiles.impact_score`, `co2_saved_kg`, money, etc. |
| `trg_notify_listing_response` | Notify owner when someone shows interest. |
| `trg_notify_request_offer` | Notify requester when someone offers to help. |
| `trg_notify_event_rsvp` | Notify organizer on RSVP. |
| `trg_notify_reaction` | Notify entity owner when liked. |
| `trg_notify_comment` | Notify entity owner on comments. |

## Frontend API layer

`lib/api/*` — typed wrappers around Supabase, grouped by domain:

```typescript
import { auth, listings, requests, events, lostFound,
         feed, impact, inventory, notifications, storage,
         communities } from '@/lib/api';

// Examples:
const { data, error } = await listings.listListings({ communityId, listingType: 'free' });
const { liked } = await feed.toggleLike('listing', listingId);
const { path, publicUrl } = await storage.uploadPhoto('listings', file);
const summary = await impact.getMyImpact();

// Realtime:
const unsubscribe = notifications.subscribeToNotifications(userId, n => console.log('new!', n));
```

## Authentication

- **Email + password** — built-in, enabled by default.
- **OAuth** — `auth.signInWithOAuth({ provider: 'google' | 'github' | 'apple' })` is wired; configure providers in the Supabase dashboard before use.
- **AuthProvider** — wraps the app in `app/layout.tsx`. Use `useAuth()` to get `{ user, session, profile, loading, refreshProfile }`.
- **Modal** — `<AuthModal>` shows sign-in / sign-up UI; opens automatically when a signed-out user tries any write action.

## Realtime

Supabase Realtime is enabled by default for INSERT/UPDATE/DELETE events.
`notifications.subscribeToNotifications(userId, cb)` shows the pattern — extend for live feed updates, RSVP counters, etc.

## Generated TypeScript types

`lib/database.types.ts` — fully typed `Database` interface auto-generated from the schema. Regenerate any time you change the schema:

```bash
npx supabase gen types typescript --project-id oxqnwqaumrqdiwrlvfel > lib/database.types.ts
```

## Security audit

`get_advisors(type: 'security')` reports **0 warnings**. Re-run after any schema change.

## Migration history (chronological)

| # | Name | What it does |
|---|---|---|
| 01 | `enums_communities_profiles` | Types, communities, profiles, member auto-create trigger |
| 02 | `categories_listings_saves` | Categories, listings (+ FTS index), saves, listing responses |
| 03 | `requests_events_rsvps` | Requests, request offers, events, RSVPs |
| 04 | `lost_found_inventory_impact` | Lost & Found, inventory, milestones, announcements, impact log |
| 05 | `reactions_comments_notifications` | Polymorphic reactions, threaded comments, notifications |
| 06 | `rls_policies` | RLS on every table |
| 07 | `storage_buckets` | 5 buckets + folder-scoped storage policies |
| 08 | `business_triggers_notifications` | Counter maintenance + auto-notification triggers |
| 09 | `views_and_rpcs` | `feed_view`, `leaderboard_view`, RPCs |
| 10 | `seed_baseline` | Categories + BITS Goa / IISc / Cyber Hub communities |
| 11 | `security_hardening` | Tightened search paths, locked down SECURITY DEFINER fns |
| 12 | `definer_to_invoker` | Final SECURITY DEFINER → INVOKER conversions; advisor clean |
| 13 | `open_signup_global_community` | Wecycle Global community + auto-join on signup |
| 14 | `add_mahe_community` | MAHE Manipal community seed |
| 15 | `profile_education_fields` | college_id, graduating_year, course, department, residence |
| 16 | `alerts_push_queue` | Enum extensions + `alerts` + `push_queue` tables + RLS |
| 17 | `alert_matching_trigger` | `match_listing_to_alerts()` AFTER INSERT trigger on `listings` |
| 18 | `alerts_cron` | `mark_expired_alerts()` + `purge_old_expired_alerts()` cron |
| 19 | `cron_invoke_send_push` | pg_cron job that hits the `send-push` Edge Function /min |
| 20 | `reinstall_pgnet_in_extensions` | Moved `pg_net` from public → `extensions` schema |

## Alerts & push pipeline

End-to-end flow for the "alert me when someone posts X" feature:

```
                ┌────────────────────────────┐
   user creates │ INSERT INTO alerts         │  via lib/alerts.ts → supabase
   an alert     │   (RLS: user_id=auth.uid)  │
                └─────────────┬──────────────┘
                              │
                              ▼
                ┌────────────────────────────┐
                │ Realtime subscription      │  ActivityScreen re-fetches
                │ (postgres_changes ALL on   │  via subscribeAlerts()
                │  alerts WHERE user_id=me)  │
                └────────────────────────────┘

   somebody     ┌────────────────────────────┐
   uploads      │ INSERT INTO listings       │
   a listing    └─────────────┬──────────────┘
                              │ AFTER INSERT trigger
                              ▼
                ┌─────────────────────────────────────┐
                │ match_listing_to_alerts()           │  scans active alerts in
                │  - status='active' AND not expired  │  same community, matches
                │  - same community / category        │  on category + condition
                │  - condition compatible             │  + price ceiling + location
                │  - max_price respected              │  + fuzzy title (websearch
                │  - location substring match         │   tsquery + ILIKE)
                │  - title FTS containment            │
                │                                     │
                │  for each match:                    │
                │    • alerts.match_count++           │
                │    • INSERT notifications           │
                │      (type='alert_match',           │
                │       entity_type='listing')        │
                │    • INSERT push_queue              │
                │      (channel from alert.notify)    │
                └─────────────┬───────────────────────┘
                              │
                              ▼
            cron `* * * * *`  (every minute)
                              │
                              ▼
                ┌────────────────────────────┐
                │ invoke_send_push()         │  pg_net.http_post to
                │  → net.http_post           │  /functions/v1/send-push
                │      Edge Function URL     │  with shared secret header
                └─────────────┬──────────────┘
                              │
                              ▼
                ┌────────────────────────────┐
                │ send-push Edge Function    │  drains 20 jobs at a time
                │  - reads push_queue        │  • Resend  → email
                │    (status='pending')      │  • Twilio  → SMS
                │  - looks up profile.email  │  marks status=sent/failed/pending
                │    & .phone               │  retries up to 5 attempts
                │  - sends via Resend/Twilio │
                │  - updates push_queue      │
                └────────────────────────────┘

           cron `*/5 * * * *`  (every 5 min)
                ┌────────────────────────────┐
                │ mark_expired_alerts()      │  flips status → expired,
                │  - finds alerts past TTL   │  inserts notification
                │  - INSERT notification     │  (type='alert_expired',
                │    'Alert auto-deleted'    │   entity_type='alert')
                └────────────────────────────┘

           cron `0 * * * *`  (every hour)
                ┌────────────────────────────┐
                │ purge_old_expired_alerts() │  DELETE alerts that have
                │  - status='expired'        │  been expired for 2+ days
                │  - expires_at < now()-2d   │
                └────────────────────────────┘
```

### Required Vault secrets

Configure in **Supabase dashboard → Project Settings → Vault → Add secret**:

| Name | Example value | Used by |
|---|---|---|
| `SUPABASE_FUNCTIONS_URL` | `https://oxqnwqaumrqdiwrlvfel.supabase.co/functions/v1` | `invoke_send_push()` cron |
| `SEND_PUSH_INTERNAL_SECRET` | (random 32-byte hex) | `invoke_send_push()` + Edge Function header check |

### Required Edge Function env vars

Configure in **Supabase dashboard → Edge Functions → send-push → Secrets**:

| Name | Required for | Notes |
|---|---|---|
| `INTERNAL_SECRET` | Auth | Must match the Vault `SEND_PUSH_INTERNAL_SECRET` |
| `RESEND_API_KEY` | Email | Sign up at resend.com, create API key |
| `RESEND_FROM` | Email | Defaults to `Wecycle <alerts@wecycle.app>` |
| `TWILIO_ACCOUNT_SID` | SMS | From Twilio console |
| `TWILIO_AUTH_TOKEN` | SMS | From Twilio console |
| `TWILIO_FROM_NUMBER` | SMS | E.164 phone number you own |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

If a sender's env vars are missing, the Edge Function gracefully no-ops for that channel and marks the job with a `last_error`.

### Frontend wiring

`lib/alerts.ts` exposes a unified API that routes based on a `StorageMode`:
- `'supabase'` — real users, hits the `alerts` table over RLS, subscribes via Realtime
- `'demo'` — local-only mode (demo auth sessions), localStorage CRUD

`page.tsx` derives `storageMode = isDemo ? 'demo' : 'supabase'` from `useAuth()` and passes it to `<AlertFormModal mode={storageMode} ...>`. `ActivityScreen` does the same when calling `listAlerts(userId, mode)` / `subscribeAlerts(userId, mode, cb)`.

When you flip `DEMO_MODE = false` in `components/AuthModal.tsx` and configure real OTP, every alert call automatically becomes a real Supabase round-trip — no other code change needed.

## Files added to the repo

```
lib/
├── supabase.ts                Browser client (lazy singleton)
├── database.types.ts          Generated DB types (1,525 lines)
├── AuthContext.tsx            React auth context + provider
└── api/
    ├── index.ts               Barrel export
    ├── types.ts               Convenience type aliases
    ├── auth.ts                Sign-in / sign-up / profile updates
    ├── communities.ts         Community lookup, join/leave, categories
    ├── listings.ts            Marketplace CRUD + saves + responses
    ├── requests.ts            Request CRUD + offers
    ├── events.ts              Event CRUD + RSVPs
    ├── lostFound.ts           L&F reports + claims
    ├── inventory.ts           Inventory CRUD + borrow/return
    ├── feed.ts                Unified feed, reactions, comments
    ├── impact.ts              Impact summary + leaderboard + activity
    ├── notifications.ts       List + mark-read + realtime
    └── storage.ts             Upload/delete photos (typed buckets)

components/
└── AuthModal.tsx              Sign-in / sign-up modal

.env.local                     Project URL + publishable key
.env.local.example             Template for collaborators
```

## What's NOT wired yet (intentional)

The existing screens (`FeedScreen`, `MarketplaceScreen`, etc.) still read from `lib/mockData.ts`. To go live:

1. Replace mock imports with API calls in each screen
2. Use `useAuth()` to get the current user and their `community_id`
3. Wire form `onSubmit` callbacks to the matching API (`listings.createListing`, `requests.createRequest`, etc.)
4. Pass uploaded photo URLs from `storage.uploadPhoto` into the create calls

The data-access layer is structured to make this swap mechanical — schemas already mirror the mock shape.

## Suggested next steps

- **Edge functions** for periodic impact-score recalculation or pre-computed leaderboards
- **Push notifications** via OneSignal/Web Push (notifications table is ready)
- **Search**: full-text index already exists on `listings.title + description`; expose via PostgREST `.textSearch()`
- **Cron**: nightly job to expire stale `requests` (`status='open'` past `need_by_date`)
- **Moderation**: admin RPCs to flag/remove listings (RLS lets community admins do this already)
