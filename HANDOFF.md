# Wecycle — engineering handoff

Start here. This is the current state of the system, the one thing about the
backend you must understand before writing code, and how to add an API without
walking into the traps that have already been found.

**Live:** [wecycle.page](https://wecycle.page) · **Android:** `page.wecycle.app`
build 17 (1.2.4) · **iOS:** same codebase, built separately

---

## Current state, in one paragraph

A campus marketplace for Manipal (MAHE) students — share, borrow, sell, swap,
request, events, lost & found. Next.js 13 web app, wrapped by Capacitor for
Android and iOS. **The backend is Appwrite** (Cloud, Singapore region, Education
plan). It was Supabase until 23 September 2026; the Supabase project still exists
and is the rollback path. The web app is fully on Appwrite. **The phone apps are
not until build 17 is published** — build 16 on the stores still talks to
Supabase.

---

## Read this before anything else: the backend adapter

The app code says `supabase.from(...)` in 117 places. **It is not talking to
Supabase.**

When `NEXT_PUBLIC_BACKEND=appwrite`, `getSupabase()` in
[`lib/supabase.ts`](lib/supabase.ts) returns an Appwrite-backed object that
implements the slice of the Supabase client API the app actually uses. It lives
in [`lib/appwrite/`](lib/appwrite/):

| File | What it does |
|---|---|
| `client.ts` | Appwrite SDK singletons; the `id` ↔ `$id` translation; `fillServerDefaults`; `ownerPermissions` |
| `queryBuilder.ts` | `.from().select().eq().order().limit()` etc. over Appwrite TablesDB |
| `authAdapter.ts` | `supabase.auth.*` over Appwrite Accounts |
| `storageAdapter.ts` | `supabase.storage.*` over Appwrite Storage |
| `rpc.ts` | the 14 former Postgres functions, client-side or forwarded to the server |
| `index.ts` | assembles the above into one Supabase-shaped client |

Why an adapter rather than a rewrite: 117 call sites across auth, feed, posting,
saving and moderation could not be migrated and verified in one change. The
adapter let each piece be proven against the live database first.

**Consequence for you:** new code can keep using the `supabase` client and it
will work — but the adapter has limits, and they are real:

- **No joins.** `select('*, listing:listings(*)')` works for the four existing
  single-level embeds by doing a second batched query. Deeper embeds do not.
- **No aggregation.** No `SUM`, `GROUP BY`, window functions. `count` works.
- **Writes are per-row.** `update().eq('status', x)` becomes "list the ids, then
  update each". Not atomic across rows.
- **`ilike` is a `contains`.** No anchored or case-insensitive pattern match.

For anything the adapter cannot express, **write an API route**. That is the
supported path, and the next section is how.

The long-term direction is to replace `supabase.from(...)` calls with direct
Appwrite SDK calls or API routes, one area at a time, and then delete the
adapter. `hasSupabaseEnv` is misnamed for exactly this reason — it now means
"a backend is configured" and is renamed once Supabase is gone.

---

## Adding an API

API routes live in [`app/api/`](app/api/). The one to copy is
[`app/api/rpc/[fn]/route.ts`](app/api/rpc/[fn]/route.ts), because it already
solves the four problems every new route will have.

### The four things every route must get right

**1. Identify the caller from a JWT, never from the body.** Anyone can put a
user id in a request body. The client sends a short-lived Appwrite JWT in the
`X-Appwrite-JWT` header; the route asks Appwrite who it belongs to:

```ts
const uid = await callerId(req.headers.get('x-appwrite-jwt'));
if (!uid) return json({ message: 'Not signed in' }, 401);
// from here on, use uid — ignore any user id the body claims
```

On the client, `lib/appwrite/rpc.ts` → `serverRpc()` mints and sends the JWT
for you.

**2. Send CORS headers, including the preflight.** The native apps are a
**static export** served from the WebView's own origin — `https://localhost` on
Android, `capacitor://localhost` on iOS. Every call from a phone to your route
is cross-origin, and `X-Appwrite-JWT` is not a CORS-simple header, so the browser
preflights it. Without an `OPTIONS` handler the route works perfectly on the
website and fails on every phone. Copy the `cors` block and `OPTIONS` export.

**3. Call it with `apiBase()`, not a bare path.** `fetch('/api/x')` resolves to
`https://localhost/api/x` inside the native app, where no API routes exist.
Use `` fetch(`${apiBase()}/api/x`) `` from [`lib/platform.ts`](lib/platform.ts):
it is `''` on the web and `https://wecycle.page` inside the app.

**4. Use the server key only after identifying the caller.** `APPWRITE_API_KEY`
is server-only. The `aw()` helper in the rpc route wraps it. Never prefix it
`NEXT_PUBLIC_`.

### Why these exist

Every one of those was a real bug in this codebase. The relative-path and CORS
faults would have shipped in build 17 and broken saving, liking and RSVPing on
every phone — they were caught by inspecting the bundle before release, not by
testing on the website, where both work fine.

### Plain `fetch`, not `node-appwrite`

The server SDK pulls in `undici`, which Next's webpack loader cannot parse.
Adding it broke **every page**, not just the route. The rpc route uses plain
`fetch` against the Appwrite REST API; do the same.

---

## Adding a table or a column

The schema has **one source of truth**:
[`db/sqlserver/wecycle-sqlserver.sql`](db/sqlserver/wecycle-sqlserver.sql).
Everything else is generated from it.

```bash
# 1. edit the table in db/sqlserver/wecycle-sqlserver.sql
# 2. regenerate the Appwrite schema and the generated TS maps
node db/appwrite/tools/generate-schema.mjs
# 3. push it (needs an admin key — see "Keys" below)
set -a && . db/appwrite/appwrite.env && set +a
node db/appwrite/tools/push-schema.mjs
# 4. if members own rows in the new table, add it to db/appwrite/ownership.json
# 5. set its permissions
node db/appwrite/tools/set-permissions.mjs --only <table>
```

The generator also writes two TypeScript files the app depends on —
`lib/appwrite/generatedDefaults.ts` and `lib/appwrite/generatedOwnership.ts`.
Never edit those by hand.

**The generator refuses to run if `ownership.json` names a column that does
not exist.** That check is there because three entries once did, silently, and
it meant new events and inventory items were created with no owner.

---

## Permissions — what replaced Row Level Security

Appwrite has table permissions plus per-row permissions. The rules in force:

- **Tables grant `create` to signed-in members, never `update` or `delete`.**
  Granting those table-wide would let any student edit any other student's post.
- **Ownership is per row**, stamped at creation by `ownerPermissions()` in
  `lib/appwrite/client.ts`, from the map in `db/appwrite/ownership.json`.
- **There is no column-level permission.** A row is readable or it is not. So
  sensitive fields cannot sit on a public row — they live in a separate
  server-only table. That is why `profile_contacts` exists: `profiles` must be
  public (every listing shows its seller) and email and phone must not be.
- **Server-only tables** (`sigchi_members`, `moderation_terms`,
  `profile_contacts`, `push_queue`, …) have no client permission at all.
  Appwrite returns zero rows to a client rather than an error — which is the
  safe behaviour, but means a query that "returns nothing" may be a permissions
  problem rather than an empty table.

### Traps already found

| Symptom | Cause |
|---|---|
| A new post is visible only to its author | Created with no permissions — Appwrite then defaults to owner-only **read**. Always stamp ownership. |
| `Missing required attribute "posted_at"` (or `created_at`, `saved_at`…) | Postgres filled 50 timestamps with `DEFAULT now()`; Appwrite cannot. The adapter fills them from `generatedDefaults.ts`. Rows created **outside** the adapter must fill them too. |
| `No permissions provided for action 'create'` on upload | The bucket lacks `create("users")`. |
| Everything returns `Failed to fetch` in production | The origin is not a registered Appwrite platform. Registered: `wecycle.page`, `www.wecycle.page`, `*.vercel.app`, `localhost` (which also covers the native WebViews). |
| A counter will not move | The row belongs to someone else. Counter updates go through `/api/rpc`, which holds the server key. |

---

## Auth

Appwrite Accounts. The 99 migrated members were imported with their original
Supabase bcrypt hashes (`POST /users/bcrypt`), so **everyone kept their
password** and every `user_id` in every table still resolves.

New members get a profile from `ensure_profile` in the rpc route — Appwrite has
no triggers, so this replaces the Postgres trigger that used to do it. Sign-up
calls it; `AuthContext` also calls it if a signed-in member has no profile.

### The Manipal gate — partly open

Postgres enforced "Manipal emails only" with a trigger that could not be
bypassed. On Appwrite:

- The sign-up form checks it (client-side, bypassable).
- `ensure_profile` checks it server-side and **refuses a profile** to anyone
  else, so an outsider account cannot post, message or appear anywhere.
- **Account creation itself is not gated.** Someone calling the Appwrite API
  directly can still create a non-Manipal account; it is just useless to them.

Closing that needs an **Appwrite Function** on the `users.*.create` event that
deletes non-Manipal accounts. The rule to use is `emailGateProblem()` in
[`lib/emailDomain.ts`](lib/emailDomain.ts), which is now server-safe.

---

## Environment variables

Copy [`.env.local.example`](.env.local.example) to `.env.local`.

| Variable | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_BACKEND` | all | no — `appwrite` or `supabase` |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` / `_PROJECT` / `_DB` | all | no |
| `APPWRITE_API_KEY` | **Vercel Production only** | **yes** |
| `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` | all | no — rollback path |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | all | no |
| `REMOVE_BG_API_KEY` | server | yes |
| `SIGCHI_ROSTER` / `SIGCHI_CODE` | Vercel Production | yes — 57 real emails |
| `APP_STATUS` | Vercel Production | no — remote status banner |

### Keys

The production `APPWRITE_API_KEY` is deliberately narrow — six scopes:
`databases.read`, `tables.read`, `rows.read`, `rows.write`, `users.read`,
`users.write`. It **cannot** change schema, buckets, platforms or keys, and it
cannot widen itself. For admin work, create a short-lived key in the Appwrite
console (Overview → Integrations → API keys), use it, and delete it. Do not
widen the production key.

---

## Run, build, deploy

```bash
npm install
npm run dev              # http://localhost:3000
npm test                 # 66 tests, node:test
npm run build            # production build — run before every deploy
```

**Web:** Vercel. Deploys are **manual** — a push to `main` does not deploy.
`npx vercel --prod`. See [docs/deploying.md](docs/deploying.md).

**Android:** see [docs/android.md](docs/android.md). The short version:
`npm run build:cap && npx cap sync android`, bump `versionCode` in
`android/app/build.gradle`, build a signed bundle, and **confirm the signer**
with `keytool -printcert -jarfile` — an unsigned bundle builds successfully and
Play rejects it. The keystore is not in this repo and must not be.

**What reaches installed apps without a release:** data does, code does not.
See [docs/app-update-flow.md](docs/app-update-flow.md).

---

## Known gaps, honestly

- **Build 17 is not published.** Until it is, phone users are on Supabase.
- **The Manipal gate** on account creation needs an Appwrite Function (above).
- **Organisers cannot edit event forms from the client.** `event_forms` has no
  owner column of its own; its owner is the event's organiser, which the flat
  ownership map cannot express. Needs a server route.
- **Realtime filters client-side.** Appwrite delivers every event on a table to
  every subscriber who can read the row, and the adapter filters by user.
- **Counters are two calls, not one transaction.** A crash between the row and
  the counter can leave a count one off.
- **Not yet exercised on production:** storefront and the full realtime
  notification flow.
- **`docs/backend.md` describes Supabase** and is kept for history; the
  Supabase project is still the rollback path.

## Security notes

- A Supabase **service-role key** is readable in this repo's **git history**
  (commit `84a3638`, the original Figma Make import; untracked in `3fbb434`).
  It belongs to project `wzgalvcieeiazqqdmsrd`, which **no longer exists** — no
  DNS record — so the key opens nothing. It is not the production project. It
  is noted here so nobody finds it and assumes the worst.
- Nothing in the working tree is secret. `.env.local`, `db/appwrite/appwrite.env`,
  the migration data export and the Android keystore are all gitignored and have
  never been committed.

---

## Where things are

```
app/                   the SPA shell (page.tsx) and the API routes (app/api/)
components/            screens and UI components
lib/                   data and domain logic
lib/appwrite/          the backend adapter — read the section above
db/sqlserver/          THE schema source of truth
db/appwrite/           Appwrite schema (generated), migration + admin tools
android/  ios/         Capacitor native projects
docs/                  deeper docs, linked from the README
```

The migration from Supabase is documented in
[db/appwrite/README.md](db/appwrite/README.md), including every fault found on
the way and why each decision was made.
