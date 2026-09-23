'use client';

/* ── The Appwrite client, and the one translation everything else rests on ──
 *
 * Wecycle is moving off Supabase. Rather than rewrite 117 call sites — every
 * one of which is a working, tested query — this directory implements the
 * slice of the Supabase client API that the app actually uses, backed by
 * Appwrite. `getSupabase()` returns this instead, and the call sites do not
 * know anything changed.
 *
 * That is a real trade and worth naming. An adapter means the app keeps
 * speaking a vocabulary its backend no longer natively speaks, and some
 * PostgREST behaviour has no Appwrite equivalent (see queryBuilder.ts). The
 * alternative was 117 simultaneous edits across auth, feed, posting, saving
 * and moderation, with no way to ship or verify any part of it alone. This way
 * each piece can be proven against the real database before the next.
 *
 * ── id VERSUS $id ──────────────────────────────────────────────────────────
 *
 * The single most pervasive difference. Postgres rows carry `id`; Appwrite
 * rows carry `$id`. The app asks for `id` everywhere — in filters, in returned
 * objects, in foreign keys pointing at other rows.
 *
 * So the translation happens in exactly two places and nowhere else: filters
 * rewrite `id` to `$id` on the way down (queryBuilder), and rows gain an `id`
 * alias on the way back up (toRow, here). Anything that skips one of those
 * halves produces a query that silently matches nothing, which is the failure
 * mode this whole file is arranged to avoid.
 */

import { Client, Account, TablesDB, Storage, Functions } from 'appwrite';
import { SERVER_FILLED_TIMESTAMPS } from './generatedDefaults';

export const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? '';
export const APPWRITE_PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT ?? '';
export const APPWRITE_DB = process.env.NEXT_PUBLIC_APPWRITE_DB ?? 'wecycle';

/** True when the endpoint and project are both configured. */
export const hasAppwriteEnv = !!(APPWRITE_ENDPOINT && APPWRITE_PROJECT);

let _client: Client | null = null;

export function appwriteClient(): Client {
  if (_client) return _client;
  _client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT);
  return _client;
}

let _account: Account | null = null;
let _tables: TablesDB | null = null;
let _storage: Storage | null = null;
let _functions: Functions | null = null;

export const account = (): Account => (_account ??= new Account(appwriteClient()));
export const tables = (): TablesDB => (_tables ??= new TablesDB(appwriteClient()));
export const storage = (): Storage => (_storage ??= new Storage(appwriteClient()));
export const functions = (): Functions => (_functions ??= new Functions(appwriteClient()));

/* ── Row shape ───────────────────────────────────────────────────────────── */

export type AnyRow = Record<string, unknown>;

/**
 * An Appwrite row as the app expects a Postgres row to look.
 *
 * `$id` becomes `id`, and the `$`-prefixed metadata is dropped rather than
 * passed through: leaving it in means a later `insert(row)` round-trips
 * Appwrite's own fields back as if they were columns, which Appwrite rejects
 * with a message about unknown attributes that names none of them.
 *
 * $createdAt is kept as `created_at` ONLY when the table has no column of its
 * own by that name — several do (posted_at, joined_at, saved_at), and those
 * carry meaning the system field does not.
 */
export function toRow<T = AnyRow>(row: AnyRow | null | undefined): T | null {
  if (!row) return null;
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('$')) continue;
    out[k] = v;
  }
  out.id = row.$id;
  if (!('created_at' in out) && row.$createdAt) out.created_at = row.$createdAt;
  return out as T;
}

export const toRows = <T = AnyRow>(rows: AnyRow[] | undefined | null): T[] =>
  (rows ?? []).map(r => toRow<T>(r)).filter((r): r is T => r !== null);

/**
 * The inverse, for writes: strip anything Appwrite owns, and move `id` out of
 * the payload — it is the row id, passed separately, and Appwrite refuses a
 * payload containing a column it does not have.
 */
export function toPayload(data: AnyRow): { rowId?: string; data: AnyRow } {
  const out: AnyRow = {};
  let rowId: string | undefined;
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id') { rowId = typeof v === 'string' ? v : undefined; continue; }
    if (k.startsWith('$')) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return { rowId, data: out };
}

/**
 * Supply the timestamps the database used to.
 *
 * Postgres had DEFAULT now() on posted_at, created_at, saved_at and forty
 * others, so the app has never sent them and should not have to start.
 * Appwrite has no server-side default and reports them as required.
 *
 * This lives here rather than in the query builder because it is not the query
 * builder's rule — it is the schema's. The RPC layer creates rows directly
 * (a save, an RSVP, a like) without going through the builder, and when this
 * logic lived only there, every toggle failed with "Missing required attribute
 * saved_at" while ordinary inserts worked. One rule, one place.
 *
 * Only columns the generator recorded as HAVING had a default are filled.
 * events.starts_at is required with no default because an event's start time
 * is genuinely the user's to give, so it stays absent and a missing one still
 * fails loudly instead of silently becoming "now".
 *
 * The clock is the browser's where Postgres used the server's; a device with a
 * wrong clock posts with a wrong timestamp, affecting only that row's ordering.
 */
export function fillServerDefaults(tableId: string, data: AnyRow): AnyRow {
  const cols = SERVER_FILLED_TIMESTAMPS[tableId];
  if (!cols) return data;
  const now = new Date().toISOString();
  for (const c of cols) if (data[c] === undefined || data[c] === null) data[c] = now;
  return data;
}
