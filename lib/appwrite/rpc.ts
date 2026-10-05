'use client';

/* ── The Postgres functions, re-answered ───────────────────────────────────
 *
 * The app calls 14 RPCs. In Postgres each was one SECURITY DEFINER function
 * doing its work in a single transaction. Appwrite has no stored procedures,
 * so each becomes either a few calls from here or a server endpoint.
 *
 * The split is not arbitrary. A function goes to the SERVER when it needs data
 * or authority the client must not have:
 *
 *   get_contact          reads profile_contacts, which no client may read, and
 *                        applies the owner's sharing preferences to decide
 *                        what comes back.
 *   delete_my_account    deletes across a dozen tables; a client with that
 *                        power over its own rows would also have it over the
 *                        counters on other people's.
 *   admin_set_suspension is an admin action and cannot be gated in the client.
 *   claim_sigchi_offer   already has /api/sigchi, built during the outage.
 *
 * Everything else acts only on the caller's own rows, under permissions the
 * database already enforces, so it runs here.
 *
 * ── WHY THE TOGGLES ARE NOT HERE ───────────────────────────────────────────
 *
 * Saving a listing writes a row you own and increments save_count on a listing
 * you do not. Rows are updatable only by their owner, so the browser gets a
 * 401 on the counter — correctly. A first version of this file did the toggle
 * client-side and the save row appeared while the count never moved, which is
 * the worst of both: it looks like it worked.
 *
 * So every toggle goes to /api/rpc, which holds the server key and does both
 * halves. That is also what Postgres did — one SECURITY DEFINER function — so
 * the two halves cannot drift apart.
 */

import { ID, Query } from 'appwrite';
import { tables, account, fillServerDefaults, APPWRITE_DB, toRows, type AnyRow } from './client';
import { apiBase } from '../platform';
import { getActiveRoom } from '../rooms';

interface RpcResult<T> { data: T | null; error: { message: string; code?: string } | null; }

const ok = <T>(data: T): RpcResult<T> => ({ data, error: null });
const fail = (e: unknown): RpcResult<never> => ({
  data: null,
  error: { message: (e as { message?: string })?.message ?? 'Request failed', code: (e as { type?: string })?.type },
});

async function me(): Promise<string | null> {
  try { return (await account().get()).$id; } catch { return null; }
}

const list = (tableId: string, queries: string[]) =>
  tables().listRows({ databaseId: APPWRITE_DB, tableId, queries });

/* ── The functions ── */

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const uid = await me();
  const a = args as Record<string, string | string[] | undefined>;

  switch (fn) {
    /* Every toggle writes a row the caller owns AND a counter on a row they do
       not — a listing's save_count, an event's attendee_count. Rows are
       updatable only by their owner, which is correct and is why the browser
       gets a 401 on the counter. Postgres did both halves in one SECURITY
       DEFINER function; here the whole toggle goes to the server so the two
       halves cannot drift apart. */
    case 'rpc_toggle_save':
    case 'rpc_toggle_event_save':
    case 'rpc_toggle_rsvp':
    case 'rpc_toggle_like':
    case 'rpc_increment_listing_view':
    case 'rpc_increment_event_view':
      return await serverRpc<T>(fn, args);

    case 'rpc_mark_notifications_read': {
      if (!uid) return { data: null, error: { message: 'Not signed in' } };
      try {
        const ids = a._ids as string[] | undefined;
        const rows = ids?.length
          ? ids.map(id => ({ $id: id }))
          : (await list('notifications', [
              Query.equal('user_id', [uid]), Query.isNull('read_at'), Query.limit(100),
            ])).rows as AnyRow[];
        const read_at = new Date().toISOString();
        for (const r of rows) {
          await tables().updateRow({
            databaseId: APPWRITE_DB, tableId: 'notifications',
            rowId: String(r.$id), data: { read_at },
          });
        }
        return ok(rows.length) as RpcResult<T>;
      } catch (e) { return fail(e); }
    }

    case 'rpc_my_impact_summary': {
      if (!uid) return { data: null, error: { message: 'Not signed in' } };
      try {
        /* The profile already carries these as maintained columns, so this is
           a read rather than the aggregate the Postgres function computed. */
        const p = await tables().getRow({ databaseId: APPWRITE_DB, tableId: 'profiles', rowId: uid }) as AnyRow;
        return ok({
          items_shared: p.items_shared_count ?? 0,
          items_received: p.items_received_count ?? 0,
          repairs_helped: p.repairs_helped_count ?? 0,
          co2_saved_kg: p.co2_saved_kg ?? 0,
          money_saved: p.money_saved ?? 0,
          impact_score: p.impact_score ?? 0,
          community_members: null,
        }) as RpcResult<T>;
      } catch (e) { return fail(e); }
    }

    case 'rpc_community_feed': {
      try {
        /* _limit and _before are how the feed pages. Ignoring them returned the
           same newest 50 rows every time, so scrolling for more silently showed
           what was already on screen. */
        const limit = Number(a._limit ?? 20);
        const q = [
          Query.equal('status', ['active']),
          Query.orderDesc('posted_at'),
          Query.limit(Math.max(1, Math.min(limit, 100))),
        ];
        if (a._before) q.push(Query.lessThan('posted_at', a._before as string));
        /* Always the room on screen — see lib/rooms.ts. A caller-supplied
           community id is ignored rather than trusted to agree. */
        q.unshift(Query.equal('community_id', [getActiveRoom().id]));
        const res = await list('listings', q);
        return ok(toRows(res.rows as AnyRow[])) as RpcResult<T>;
      } catch (e) { return fail(e); }
    }

    case 'upsert_push_subscription': {
      if (!uid) return { data: null, error: { message: 'Not signed in' } };
      try {
        /* The app calls this with the Postgres function's parameter names —
           _endpoint, _p256dh, _auth, _user_agent — because that is what the
           RPC took. They are NOT column names, and spreading them into the row
           sent four attributes the table does not have while leaving the four
           it requires empty. Push registration failed outright with "Missing
           required attribute p256dh". Map them explicitly; a spread cannot
           know the difference. */
        const endpoint = (a._endpoint ?? a.endpoint) as string;
        if (!endpoint) return { data: null, error: { message: 'No push endpoint given' } };
        const data: AnyRow = {
          user_id: uid,
          endpoint,
          p256dh: (a._p256dh ?? '') as string,
          auth: (a._auth ?? '') as string,
          user_agent: (a._user_agent ?? null) as string | null,
          last_seen_at: new Date().toISOString(),
        };
        const found = await list('push_subscriptions', [Query.equal('endpoint', [endpoint]), Query.limit(1)]);
        const existing = (found.rows as AnyRow[])[0];
        const perms = [`read("user:${uid}")`, `update("user:${uid}")`, `delete("user:${uid}")`];
        if (existing) {
          await tables().updateRow({
            databaseId: APPWRITE_DB, tableId: 'push_subscriptions',
            rowId: String(existing.$id), data,
          });
        } else {
          await tables().createRow({
            databaseId: APPWRITE_DB, tableId: 'push_subscriptions',
            rowId: ID.unique(), data: fillServerDefaults('push_subscriptions', data), permissions: perms,
          });
        }
        return ok(true) as RpcResult<T>;
      } catch (e) { return fail(e); }
    }

    /* ── Server side ── */
    case 'get_contact':
    case 'delete_my_account':
    case 'admin_set_suspension':
    case 'ensure_profile':
    case 'sync_rooms':
    case 'delete_post':
    case 'delete_comment':
      return await serverRpc<T>(fn, args);

    /* This one already had a server endpoint before the migration — written
       during the outage, when the SIGCHI roster had to be answered with no
       database at all. Reusing it keeps ONE copy of the roster and one
       throttle, rather than a second implementation that could disagree with
       the first about who is a member. The two shapes differ by one field
       name, mapped here. */
    case 'claim_sigchi_offer': {
      try {
        /* apiBase(), not a bare path. The native builds are a STATIC EXPORT
           served from the WebView's own origin — https://localhost on Android,
           capacitor://localhost on iOS — where /api/sigchi does not exist. A
           relative URL works perfectly on the website and fails on every
           phone, which is the worst place for it to fail. */
        const res = await fetch(`${apiBase()}/api/sigchi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: a.p_email }),
        });
        const body = (await res.json().catch(() => null)) as
          { matched?: boolean; code?: string; name?: string | null; error?: string } | null;
        if (!res.ok) {
          return { data: null, error: {
            message: body?.error ?? 'Could not check right now',
            /* the throttle's SQLSTATE, so lib/sigchi.ts maps it as before */
            code: res.status === 429 ? '54000' : undefined,
          } };
        }
        return ok([{
          matched: !!body?.matched,
          code: body?.code ?? null,
          member_name: body?.name ?? null,
        }]) as RpcResult<T>;
      } catch (e) { return fail(e); }
    }

    default:
      return { data: null, error: { message: `Unknown function ${fn}`, code: '42883' } };
  }
}

/* ── The JWT, reused ────────────────────────────────────────────────────────
 *
 * Every server call proves who is calling with a short-lived Appwrite JWT.
 * Minting one per call looked harmless until messaging: Appwrite allows a
 * member 100 new JWTs an hour, and a conversation — sends, read receipts —
 * plus the saves, likes and view counts around it would run through that and
 * start failing mid-chat. A JWT lives 15 minutes; this reuses one for 10 and
 * drops it on sign-out (a different member must never inherit it). */
let cachedJwt: { token: string; uid: string; at: number } | null = null;
const JWT_REUSE_MS = 10 * 60_000;

async function jwtFor(uid: string | null): Promise<string> {
  if (!uid) { cachedJwt = null; return ''; }
  if (cachedJwt && cachedJwt.uid === uid && Date.now() - cachedJwt.at < JWT_REUSE_MS) return cachedJwt.token;
  try {
    const token = (await account().createJWT()).jwt;
    cachedJwt = { token, uid, at: Date.now() };
    return token;
  } catch {
    cachedJwt = null;
    return '';
  }
}

/** Forget the cached JWT — called on sign-out. */
export function clearServerAuth(): void { cachedJwt = null; }

/* These need data or authority a browser must not hold. See the note at the
   top of this file for why each one is on this list. Exported for features
   that live outside the RPC vocabulary (messaging). */
export async function serverRpc<T>(fn: string, args: Record<string, unknown>, uid?: string | null): Promise<RpcResult<T>> {
  try {
    /* A short-lived JWT, not a user id in the body — anyone can type a user id.
       The route asks Appwrite who this token belongs to and uses that, so a
       forged body cannot make the server act as someone else. */
    const who = uid === undefined ? await me() : uid;
    const call = async (jwt: string) => fetch(`${apiBase()}/api/rpc/${fn}`, {
      /* Same reason as /api/sigchi above: the native app has no server of its
         own, so this has to be absolute there. Every save, like, RSVP and view
         count goes through here. */
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(jwt ? { 'X-Appwrite-JWT': jwt } : {}) },
      body: JSON.stringify(args),
    });
    let res = await call(await jwtFor(who));
    /* A cached token can be revoked early (password change, session ended
       elsewhere). One retry with a fresh one, then report the failure. */
    if (res.status === 401 && cachedJwt) {
      cachedJwt = null;
      res = await call(await jwtFor(who));
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { data: null, error: { message: body?.message ?? `Request failed (${res.status})`, code: body?.code } };
    }
    return ok(body?.data ?? null) as RpcResult<T>;
  } catch (e) { return fail(e); }
}
