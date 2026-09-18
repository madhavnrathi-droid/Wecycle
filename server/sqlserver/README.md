# The SQL Server data layer

What is here, and — just as important — what is not.

```
server/sqlserver/
├── db.ts        the connection, and the only safe way to use it
├── auth.ts      sign-in, sessions, signup, one-time codes
└── README.md    this
```

```bash
npm install mssql bcryptjs
npm install -D @types/mssql
```

```bash
MSSQL_URL="Server=host,1433;Database=Wecycle;User Id=wecycle_api;Password=…;Encrypt=true"
```

> **`server/` is excluded from `tsconfig.json` on purpose.** It is not wired
> into the app yet, and it imports `mssql` and `bcryptjs`, which are not
> installed — leaving it in would fail every `next build`. Install those two
> packages and drop `"server"` from the `exclude` list in the same commit that
> starts using it.

---

## Done

**`db.ts`** — the pool, and `withUser(userId, fn)`.

Read the comment at the top before using it. The short version: every ownership
rule in the database reads `SESSION_CONTEXT`, which lives on the *connection*,
and connections are pooled. A request that doesn't set it inherits whoever used
that connection last and runs as them, silently. `withUser` opens a transaction
to pin one connection, sets the context on it, and hands you a request bound to
it. There is no `getPool()` export and no raw query helper — the unsafe version
of this is one line shorter and invisible in review.

```ts
const rows = await withUser(session?.id ?? null, async (db) => {
  const r = await db
    .input('id', sql.UniqueIdentifier, listingId)
    .query('SELECT * FROM app.listings WHERE id = @id AND status = N\'active\'');
  return r.recordset;
});
```

Pass `null` explicitly when signed out. Don't skip the call because a query
"doesn't need" the user.

**`auth.ts`** — everything GoTrue used to do: `signIn`, `verifySession`,
`signOut`, `revokeAllSessions`, `signUp`, `issueCode`, `consumeCode`,
`setPassword`.

The thing that makes this migration survivable: **Supabase stored bcrypt, and
bcrypt is bcrypt.** The hashes carry across untouched and `bcryptjs` verifies
them as they are, so all 99 members keep the password they already have. Nobody
is asked to reset anything because the database moved.

---

## Not done — the API routes and the client

This is the honest part. The database is complete and the foundation above is
complete. Wiring the application to it is not, and it is the larger half.

The app currently talks to Supabase **from the browser**: 118 call sites across
41 files, using `supabase.from(...)` and `supabase.rpc(...)`. That worked because
Supabase gives the browser a database connection guarded by Row Level Security.
**SQL Server cannot be exposed to a browser and must never be.** So each of those
call sites becomes an HTTP call to a route on this server.

The work, roughly in the order worth doing it:

| | Where | Notes |
|---|---|---|
| 1 | `app/api/v1/auth/*` | sign-in, sign-up, verify, sign-out. `auth.ts` does the work; these are thin. |
| 2 | `lib/supabase.ts` → a fetch client | One module, so the call sites below change shape but not shape *again*. |
| 3 | `app/api/v1/listings`, `requests`, `events`, `lostfound` | ~63 of the 118 call sites. The bulk. |
| 4 | `app/api/v1/rpc/*` | 11 RPCs, already written as `app.usp_*`. Near-mechanical. |
| 5 | `lib/liveData.ts` (2,197 lines) | The biggest single file. Change the transport, keep the shapes. |
| 6 | Storage | Supabase Storage buckets → the server's filesystem or S3. Not started. |
| 7 | Realtime | Supabase subscriptions have no SQL Server equivalent. Polling, or SSE from this server. |

Two rules to carry into that work, because the database no longer enforces them:

- **Every route filters by the caller.** RLS used to be the backstop; now a
  missing `WHERE user_id = @me` is a data leak. The narrow `wecycle_app` grants
  and the three `DENY`s are what is left, and they are not a substitute.
- **Deletes go through `app.usp_delete_*`.** `DELETE FROM app.listings` fails on
  foreign keys by design. See `db/README.md`.

The RPC names map one to one, which is what makes step 4 quick:

```ts
supabase.rpc('rpc_toggle_save', { _listing_id: id })
// becomes
withUser(me, db => db.input('listing_id', sql.UniqueIdentifier, id)
                     .execute('app.usp_toggle_save'))
```

| Postgres RPC | SQL Server |
|---|---|
| `rpc_toggle_save` / `rpc_toggle_event_save` / `rpc_toggle_like` / `rpc_toggle_rsvp` | `app.usp_toggle_*` |
| `rpc_increment_listing_view` / `rpc_increment_event_view` | `app.usp_increment_*_view` |
| `rpc_mark_notifications_read` | `app.usp_mark_notifications_read` (JSON array, not `uuid[]`) |
| `rpc_my_impact_summary` | `app.usp_my_impact_summary` |
| `rpc_community_feed` | `app.usp_community_feed` |
| `get_contact` | `app.usp_get_contact` |
| `admin_set_suspension` | `app.usp_admin_set_suspension` |
| `claim_sigchi_offer` | `app.usp_claim_sigchi_offer` |
| `get_or_create_conversation` | `app.usp_get_or_create_conversation` |
| `upsert_push_subscription` | `app.usp_upsert_push_subscription` |
| `delete_my_account` | `app.usp_delete_my_account` |

## One job to schedule

`pg_cron` ran this; SQL Agent (or any cron that can call sqlcmd) should now:

```sql
EXEC app.usp_mark_expired_alerts;   -- every 10 minutes
```

Without it, alerts never expire and members never get told they lapsed.
