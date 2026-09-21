# Wecycle on Appwrite

The destination, on the **Education plan** — Pro-equivalent per project, free
while you're in GitHub Student Developer Pack, 2 projects.

```
db/appwrite/
├── README.md
├── appwrite.json               the schema — 36 tables, 339 columns, 70 indexes
└── tools/
    ├── generate-schema.mjs     regenerates appwrite.json from the SQL schema
    ├── import-data.mjs         pg_dump  -> users + rows
    └── upload-media.mjs        images   -> Storage, and repoints the URLs
```

## Why Appwrite and not SQL Server

SQL Server meant rebuilding authentication from nothing and building a whole
REST API first, because a browser cannot talk to SQL Server. Appwrite gives you
auth, storage, functions, realtime and a browser SDK with per-row permissions —
the same shape Supabase had, so the app's 118 data calls become SDK rewrites
rather than "build a backend, then rewrite the app against it".

Two specifics that decided it:

**Passwords survive.** Appwrite has `POST /v1/users/bcrypt`, an endpoint whose
entire purpose is importing accounts from another system with their hashes
intact. Supabase stored bcrypt. All 99 members keep the password they have.
For an app where people signed up once at a stall, a forced reset would have
quietly lost a large share of them.

**The bandwidth problem goes away.** Supabase went down on
`exceed_cached_egress_quota` — CDN bandwidth, driven by 119 listing photos.
Education gives **2TB of bandwidth** and 150GB of storage per project, against
the ~5GB that broke it. Roughly 400× the headroom on the exact axis that failed.

## The order of operations

```bash
# 1. the schema
appwrite push settings          # or: appwrite deploy collection
appwrite push tables

# 2. accounts and rows, straight from the dump — no live Supabase needed
export APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
export APPWRITE_PROJECT="<project id>"
export APPWRITE_KEY="<server API key>"
node db/appwrite/tools/import-data.mjs ~/wecycle_backup.sql --dry-run
node db/appwrite/tools/import-data.mjs ~/wecycle_backup.sql

# 3. the images — ONLY after the Supabase quota is lifted
node db/sqlserver/tools/fetch-storage.mjs ~/wecycle_backup.sql --out ~/wecycle-media
node db/appwrite/tools/upload-media.mjs ~/wecycle-media
```

Steps 1–2 work right now. **Step 3 cannot**, and not because of anything here:
the 141 images are not in a `pg_dump` — they are object storage — and every one
of them currently answers `402` behind the same quota wall. Lift it first.

Everything is **safe to run twice**: rows are written with deterministic ids and
a 409 is counted as success, so a run that dies halfway can just be repeated.

## What the numbers should be

| | |
|---|---|
| 99 | Appwrite users, with their original UUIDs and bcrypt hashes |
| 451 | rows across 19 tables |
| **550** | total, matching the Supabase database exactly |
| 141 | images, pending the quota |

`--dry-run` prints all of this and sends nothing.

## What actually ran, 18 September 2026

Against project `6aacfd62003de774675c` on `sgp.cloud.appwrite.io`, which was
verified empty first (0 users, 0 databases, 0 buckets).

| | |
|---|---|
| Schema | 36 tables, 339 columns (all `available`), 76 indexes |
| Accounts | **99**, original UUIDs and bcrypt hashes |
| Rows | **451** across 19 tables |
| Verified | `verify.mjs` — 35 checks, **0 mismatches** |
| Spot-checked | 3 listings field-by-field; 187 values across all 99 profiles |
| Images | **141 of 141**, verified byte-identical (21 Sep, after the Pro upgrade) |

Two faults surfaced by running it that reading would not have caught, both
fixed and both worth knowing about if this is ever repeated:

**`ix_profiles_email` was rejected** — MySQL underneath indexes at most 767
bytes, 191 utf8mb4 characters, against a 320-character column. See INDEX_SKIP
in `generate-schema.mjs` for why each affected column got a different answer
rather than a blanket shrink.

**The importer guessed types from values.** Anything matching `/^\d+$/` became
a Number, so a phone number and a college id went as numbers into string
columns and 22 of 99 profiles were refused. Rejection was the lucky outcome —
the dangerous one is `"0123"` silently becoming `123`. Coercion now reads the
declared type out of `appwrite.json`.

### The images, 21 September

The Supabase Pro upgrade lifted the egress block and the remaining half ran:

| | |
|---|---|
| Downloaded | 141 files, 70.7 MB — 109 JPEG, 16 PNG, 9 WebP, **7 MP4** |
| Uploaded | 141 to Appwrite Storage across 3 buckets |
| URLs rewritten | 51 rows; **0** still point at `supabase.co` |
| Checksums | **141 of 141 byte-identical**, fetched with no credentials |

Checked for drift first: every table's live Supabase count still equalled the
18 September dump, so the snapshot was exact and nothing had to be re-exported.

Three things worth knowing:

**48 of the 141 files are orphans** (37.7 MB) — uploads whose post was deleted
or whose photo was replaced. They were copied anyway. They are a faithful copy
of what Supabase held, and deciding to delete them is a separate decision from
migrating them.

**One file is a 22-byte JPEG** — a valid header with no image in it, someone's
`test.jpg`, and it is referenced by a live listing. It was 22 bytes in Supabase
too. That listing's photo was already blank; this did not break it.

**`verify-media.mjs` downloads with no API key on purpose**, as an anonymous
visitor would. A file that verifies with a server key but 401s for a real user
has not migrated in any sense that matters.

**Supabase still has not been touched.** Every byte is now in two places, which
is the only state in which deleting the source is a decision rather than a
gamble — and even then, not until the app is actually running on Appwrite.

## Permissions — the one thing that is NOT generated

`appwrite.json` ships every table with `"$permissions": []` and
`documentSecurity: true`. That is deliberate, and it is not an oversight to fix
by copying something in: **Appwrite permissions are what replaced Row Level
Security**, and a permission model generated from a SQL schema would be a guess
wearing the costume of a decision.

Postgres had 40 policies. The shape they need to become:

| Tables | Read | Write |
|---|---|---|
| `categories`, `communities` | `any` | server key only |
| `listings`, `requests`, `events`, `lost_found_reports` | `any` | `users` create; update/delete by the owner, set per row at creation |
| `profiles` | `users` | owner only |
| `saves`, `alerts`, `notifications`, `saved_searches`, `push_subscriptions` | owner only | owner only |
| `conversations`, `messages` | the two participants | the two participants |
| `comments`, `reactions`, `event_rsvps`, `event_saves` | `any` | `users` create; delete by the owner |
| `sigchi_members`, `sigchi_offer_config`, `moderation_terms`, `content_reports`, `push_queue` | **nobody** — server key only | server key only |

That last row matters most. `sigchi_members` is 57 real students' personal email
addresses; in SQL Server it was a `DENY`, in Postgres it was reachable only
through a `SECURITY DEFINER` function. Here it must be a table no client
permission touches at all, read only by a Function holding the server key.
Getting that wrong publishes the list.

Set these in the console or in `appwrite.json` before the project holds anyone's
data, not after.

## What changed in the mapping

`generate-schema.mjs` reads `db/sqlserver/wecycle-sqlserver.sql`, so there is
one description of Wecycle's data and the other two are outputs of it. Change a
column there and re-run.

| | |
|---|---|
| **Enums come back.** | Postgres had 19 enum types; SQL Server could only express them as `CHECK` constraints; Appwrite has real enum columns. 33 of them, parsed back out of the CHECKs. Closer to the original than the SQL Server version was. |
| **Arrays come back.** | `photo_urls`, `video_urls`, `tags`, `badges` were `text[]`, became JSON-in-a-string, and are native array columns here. |
| **`decimal` becomes `double`.** | The one lossy step. Fine for CO2 estimates and a running "money saved" total, which are estimates anyway. **Not** fine if Wecycle ever charges for something — that would want integer paise. |
| **Foreign keys stay plain strings.** | Appwrite can model these as real relationships and this does not: the app already reads ids and fetches by id, and relationship loading has depth and count limits that bite exactly on the screens listing many rows. |
| **Filtered indexes flatten.** | `WHERE status = 'active'` has no equivalent; the index remains on the same columns, just without skipping dead rows. |
| **Arrays are optional.** | Appwrite allows neither a default nor a sensible `required` on an array. In SQL Server `photo_urls` was `NOT NULL DEFAULT '[]'`. So the read side must treat a missing array as empty — `photo_urls ?? []`. **This is the one rule the mapping asks of the app code.** |

## What is still ahead

The schema, the data and the accounts are handled. The app is not.

- **29 triggers → Appwrite Functions.** Counters (`save_count`, `attendee_count`), the notification fan-out, impact accrual, the blocked-word check. Appwrite Functions subscribe to row events, so these port — but they run **asynchronously**, so a counter is eventually consistent rather than updated inside the transaction. For a save count that is fine; it is worth knowing before something depends on it being exact.
- **No aggregation.** Appwrite has no `COUNT`/`SUM`/`GROUP BY`. Mostly this does not bite, because the counters are already denormalised columns. What does bite: `leaderboard_view` used `RANK()`, and `founder_metrics` was 15 counts — both become a Function, or a computed row refreshed on a schedule. At 99 profiles either is trivial.
- **118 call sites.** `supabase.from(...)` → the Appwrite SDK. Mechanical, but it is the bulk of the remaining work.
- **`feed_view`** was a `UNION` across six tables. There is no view here — compose it client-side, which `lib/feed/` already half does.
