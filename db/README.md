# The Wecycle database

Two destinations live here. **[`appwrite/`](appwrite/README.md) is the one being
taken** — Appwrite Education, chosen because it keeps auth, storage and
browser-direct access instead of making you rebuild them, and because its 2TB
bandwidth is ~400× the cap that took Supabase down.

`sqlserver/` below is the earlier route. It is kept, complete and verified: it
is the single source of truth the Appwrite schema is generated from, and it is
the fallback if Appwrite does not work out.

---

# The SQL Server route

Everything needed to stand the whole database up on a Microsoft SQL Server:
the schema, the logic, and the tool that carries the existing data across.

```
db/
├── README.md                          you are here
├── .gitignore                         keeps the exported data OUT of this public repo
└── sqlserver/
    ├── wecycle-sqlserver.sql          THE script — run this and the database exists
    └── tools/
        ├── convert-dump.mjs           pg_dump file  -> SQL Server data load
        ├── export-data.mjs            live Postgres -> SQL Server data load
        ├── fetch-storage.mjs          downloads the images a dump cannot hold
        └── run.mjs                    runs a .sql file if sqlcmd isn't installed
```

The Postgres original it was converted from is `supabase/migrations/` — 52 files,
still the record of how the schema got its present shape. Nothing there was
deleted; this is a second target, not a replacement.

---

## Stand it up

```bash
sqlcmd -S localhost -U sa -P '<password>' -i db/sqlserver/wecycle-sqlserver.sql
```

No sqlcmd? `run.mjs` does the same thing through the `mssql` driver:

```bash
export MSSQL_URL="Server=localhost,1433;User Id=sa;Password=<password>;TrustServerCertificate=true"
node db/sqlserver/tools/run.mjs db/sqlserver/wecycle-sqlserver.sql
```

It prints what it built and what it expected to build. Every number should match.

The script is **idempotent** — running it again is safe, changes nothing, and
never drops a table or touches data. That is what makes it usable as the thing
you re-run after editing it, rather than a one-shot you are afraid of.

Requires SQL Server 2017 or newer. Azure SQL Database works; delete the
`CREATE DATABASE` batch at SECTION 0 first and connect to the database directly.

## Then the data

Two ways in, depending on what you have. **From a `pg_dump` file** — no
password, no reachable project, works when everything is down:

```bash
node db/sqlserver/tools/convert-dump.mjs ~/wecycle_backup.sql
node db/sqlserver/tools/run.mjs db/data/wecycle-data.sql
```

**Or straight from the live database:**

```bash
npm install pg                       # the exporter's only dependency
node db/sqlserver/tools/export-data.mjs "postgresql://postgres:<password>@db.oxqnwqaumrqdiwrlvfel.supabase.co:5432/postgres"
node db/sqlserver/tools/run.mjs db/data/wecycle-data.sql
```

The connection string is in the Supabase dashboard under **Settings → Database
→ Connection string → URI**. Use the direct connection on port 5432, not the
pooler. Both tools produce the same file.

Neither invents a column mapping. They read the Postgres column names from the
source and the SQL Server ones from `wecycle-sqlserver.sql`, match them, and
**report every column on either side with no partner** — so a column added to
one and not the other appears as a line of output rather than as data that
quietly did not arrive.

### What the September 2026 dump contained

`wecycle_backup.sql`, 31 MB, checked row by row against the live database —
every table matched:

| | |
|---|---|
| 99 | members (`auth.users` + `profiles`, with all 99 bcrypt hashes) |
| 46 | listings |
| 99 | community memberships |
| 57 | SIGCHI roster |
| 45 | SIGCHI claim attempts |
| 28 | moderation terms |
| 27 | notifications |
| 13 / 5 | categories / communities |
| 12 / 7 / 4 / 2 / 2 / 1 ×4 | RSVPs, saves, lost & found, events, comments, and the singletons |
| **550** | **rows migrated** |

Empty in the source and so empty here: requests, alerts, conversations,
messages, reactions, impact_log, inventory_items, announcements, and the rest.
Not a failure — nobody had used them yet.

Deliberately **not** migrated: `auth.sessions`, `refresh_tokens`, `identities`
and the `mfa_*` tables (GoTrue's own state — sessions do not survive a change
of auth system, so everyone signs in once more against the same password);
216,631 rows of `cron.job_run_details`, which is 99% of the dump's size and is
pure log noise; and Supabase's own plumbing schemas.

## The images are not in the dump, and this is the part to plan for

A `pg_dump` contains the database. Supabase Storage is not the database — it is
object storage, and the dump holds only `storage.objects`, a table of file
*names*. **141 files, and not one byte of any of them:**

| | |
|---|---|
| 119 | listing photos |
| 16 | event covers |
| 6 | lost & found photos |

Restore the dump without them and the schema is perfect, the data is perfect,
and every photo is a broken image — because `listings.photo_urls` still points
at Supabase URLs that serve nothing.

```bash
node db/sqlserver/tools/fetch-storage.mjs ~/wecycle_backup.sql --out ~/wecycle-media
```

Resumable, so a failed run costs only what it missed.

> **It cannot work while the project is restricted.** Checked 2026-09-18: all
> 141 URLs answer `402`, the same `exceed_cached_egress_quota` that took
> sign-in down — which is also the diagnosis. "Cached egress" is CDN bandwidth,
> and 119 listing photos served to every visitor is where it went. **Lift the
> quota first, then download.** There is no way around it; the files are behind
> the same wall as everything else.

Once the files are somewhere else, `photo_urls`, `cover_url` and `avatar_url`
still contain absolute Supabase URLs and need rewriting to the new host — a
find-and-replace over `db/data/wecycle-data.sql` before loading it is the
simplest moment to do that.

> **The file it writes never goes in git.** It is 99 real students' names,
> email addresses, bcrypt password hashes and phone numbers, plus the 57-address
> SIGCHI roster. This repository is public. `db/.gitignore` ignores `db/data/`
> for that reason — move the file to the server over something private, load it,
> delete it. Treat it exactly like a password file, because that is what it is.

On **Azure SQL Database**, the generated file's two `sp_MSforeachtable` calls
do not exist — replace them with the equivalent loop over `sys.tables`, or
disable and re-enable triggers per table by hand. Everything else runs as is.

The exporter **refuses to write** if any value would not fit its SQL Server
column, rather than truncating it. It reads the column widths out of
`wecycle-sqlserver.sql`, so the check follows the schema automatically.

## Then the login

Do not connect the application as `sa`.

```sql
CREATE LOGIN wecycle_api WITH PASSWORD = '<a real password>';
CREATE USER  wecycle_api FOR LOGIN wecycle_api WITH DEFAULT_SCHEMA = app;
ALTER ROLE   wecycle_app ADD MEMBER wecycle_api;
```

`wecycle_app` is created by the script with exactly the rights the application
needs and two `DENY`s that matter: nothing can select `profiles.email`,
`profiles.phone`, or `app.sigchi_members`. `sa` ignores all of that.

---

## What changed in the move, and what it costs

The database is in two schemas: **`auth`** (identity) and **`app`** (everything
else). Postgres called them `auth` and `public`.

| Postgres | SQL Server | What it costs |
|---|---|---|
| 19 enum types | `nvarchar` + `CHECK` | Nothing. Adding a value is now `ALTER TABLE`, not `ALTER TYPE`. |
| `uuid` / `gen_random_uuid()` | `uniqueidentifier` / `NEWID()` | Nothing. Keys are `NONCLUSTERED` so random GUIDs don't split pages. |
| `timestamptz` | `datetime2(3)`, always UTC | Nothing, if you never use `GETDATE()`. Use `SYSUTCDATETIME()`. |
| `text[]` | JSON in `nvarchar(max)` | Read with `OPENJSON` instead of array operators. |
| `jsonb` | `nvarchar(max)` + `ISJSON` | No JSON indexing. Nothing here needed it. |
| GIN full-text on listings | SQL Server full-text index | Nothing, *if* Full-Text Search is installed. If not, listing search falls back to `LIKE` — the script says which happened. |
| GIN trigram on names/emails | plain index | **Real.** "Contains" search on member names now scans. Invisible at 99 profiles; revisit around 50k. |
| `ON DELETE CASCADE` (~40 keys) | `app.usp_delete_*` procedures | **Real, and it changes how you write code.** See below. |
| Row Level Security (40 policies) | the API layer | **Real, and it changes where bugs bite.** See below. |
| `auth.uid()` | `app.current_user_id()` | The connection must set session context. See below. |
| GoTrue (auth service) | `auth.users` + `auth.sessions` | Sign-in, tokens and emails are now the server's job. Passwords carry over unchanged. |
| pg_cron | SQL Agent job | One job: `EXEC app.usp_mark_expired_alerts` every 10 minutes. |

### Four things that change how you write code

**1. `DELETE` does not cascade.** SQL Server refuses schemas where two cascade
paths reach one table, and this schema is full of them — `conversations`
references `auth.users` three times, `comments` cascades to itself. So every
foreign key is `NO ACTION` and deletion is explicit:

```sql
DELETE FROM app.listings WHERE id = @x;   -- fails on foreign keys
EXEC app.usp_delete_listing @x;           -- correct
```

There is one for listings, requests, events, lost & found, comments and users.

**2. Every connection must announce who is asking.** `auth.uid()` is now
`app.current_user_id()`, which reads `SESSION_CONTEXT`. On **every** checkout,
before anything else:

```sql
EXEC sys.sp_set_session_context @key = N'user_id', @value = <uuid or NULL>;
```

Every time, including for signed-out requests, where it is `NULL`. Connections
are pooled and session context survives being returned to the pool, so a
request that forgets inherits whoever used that connection last — which is a
privilege escalation that produces no error.

**3. The API is now the only thing enforcing access.** Postgres needed RLS
because Supabase hands the *browser* a database connection. SQL Server can't be
exposed that way, so there is always a server in front, and that server is where
authorisation lives. The honest trade: a missing `WHERE` clause used to be
caught by the database and now isn't. What's left as backstop is the `wecycle_app`
role's narrow grants and the three `DENY`s.

**4. `category_id` is normalised on the way in, by the caller.** Postgres
repaired a retired or mistyped category in a `BEFORE` trigger so a post was never
lost. SQL Server checks foreign keys *before* triggers run, so there is no
moment to repair it in. Call the function in the insert:

```sql
INSERT INTO app.listings (..., category_id, ...)
VALUES (..., app.normalize_category_id(@category), ...);
```

Skip it and the row fails loudly on the foreign key — which is the safe way to
fail. It does not silently file the post in the wrong place.

### One behaviour that is genuinely gone

The alert-matching trigger used to match an alert for "bike" against a listing
titled "bicycle", by stemming. That used `to_tsvector`/`websearch_to_tsquery`;
SQL Server's equivalent (`CONTAINS`) can't be used inside the trigger, because
full-text indexes only cover committed rows and update asynchronously — the row
being inserted isn't searchable yet. The two substring tests are kept, which
caught the overwhelming majority of matches. An alert that would only have
matched by stemming now waits for the next listing.

---

## Reading the script

It is long (3,500 lines) but it is linear, and every section says what it is for:

| | |
|---|---|
| 0 | database, schemas, `READ_COMMITTED_SNAPSHOT` |
| 1 | `auth` — users, sessions, one-time codes |
| 2 | the 34 application tables |
| 3 | indexes, including the full-text one |
| 4 | who is asking — `current_user_id`, admin and partner rosters |
| 5 | content rules — word folding, the Manipal email gate |
| 6 | **remote config and banners** (new — see below) |
| 7 | the three views |
| 8 | triggers |
| 9 | deletion |
| 10 | the RPCs |
| 11 | permissions |
| 12 | reference data — categories and communities |
| 13 | what got built |

The comments are worth reading before editing anything in section 8. SQL Server
triggers fire **once per statement**, not once per row, and the usual way to get
that wrong — pulling one row out of `inserted` — works perfectly in every hand
test and then quietly does one row's worth of work the first time real code
updates two rows at once.

---

## Sections 6 and the app-update question

`app.app_config` and `app.banners` are **new tables with no Postgres original**.
They exist because a change made on the website does not reach the installed
Android and iOS apps — those run a copy of the web build frozen at store-submit
time. The full flow is in [`docs/app-update-flow.md`](../docs/app-update-flow.md).

The short version: anything you might want to change on a Tuesday afternoon — a
banner, a promo, a discount code, whether a feature is on — should be a **row**,
not code. A row reaches web, Android and iOS at once, with no build and no store
review. Code needs a release.
