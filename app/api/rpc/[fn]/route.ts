/**
 * POST /api/rpc/<fn>   { ...args }  ->  { data } | { message, code }
 *
 * The Postgres functions that cannot run in a browser.
 *
 * ── WHY THESE ARE HERE AND THE REST ARE NOT ────────────────────────────────
 *
 * Most of the app's RPCs act only on the caller's own rows, and Appwrite's
 * permissions already enforce that, so lib/appwrite/rpc.ts runs them straight
 * from the client. These cannot, for one of two reasons:
 *
 *   A COUNTER ON SOMEONE ELSE'S ROW. Saving a listing writes a row you own and
 *   increments save_count on a listing you do not. Rows are updatable only by
 *   their owner — the correct rule, and the reason a browser gets a 401 trying
 *   to bump the count. A first version did this client-side and the save row
 *   appeared while the count never moved, which is the worst outcome: it looks
 *   like it worked. Postgres did both halves in one SECURITY DEFINER function;
 *   so does this.
 *
 *   DATA THE CLIENT MUST NOT HOLD. get_contact reads profile_contacts, which
 *   no client permission touches, and decides what to return from the owner's
 *   own sharing preferences. Sending the row to the browser to be filtered
 *   there would publish exactly what the filtering exists to protect.
 *
 * ── HOW THE CALLER IS IDENTIFIED ───────────────────────────────────────────
 *
 * Not by a user id in the body — anyone can type one. The client sends a
 * short-lived Appwrite JWT and this route asks Appwrite whose it is.
 * Everything afterwards uses THAT id and ignores anything the body claimed.
 *
 * The server key never leaves this file and is used only after the caller has
 * been identified.
 *
 * ── WHY PLAIN fetch AND NOT node-appwrite ──────────────────────────────────
 *
 * The server SDK pulls in undici, which Next's webpack loader cannot parse —
 * adding it broke every page in the app, not just this route. It could be
 * excluded from bundling in next.config, but this route makes six REST calls
 * whose shapes are already proven by the migration tools in db/appwrite/tools.
 * A dependency needing a build-config workaround to do what fetch does in ten
 * lines is not worth the build-config workaround.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? '';
const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT ?? '';
const API_KEY = process.env.APPWRITE_API_KEY ?? '';
const DB = process.env.NEXT_PUBLIC_APPWRITE_DB ?? 'wecycle';

/* ── CORS ──────────────────────────────────────────────────────────────────
 *
 * The native builds are a static export served from the WebView's own origin —
 * https://localhost on Android, capacitor://localhost on iOS — so every call
 * to this route from a phone is cross-origin. Without these headers the
 * browser blocks the response and every save, like, RSVP and view count fails
 * on mobile while working perfectly on the website.
 *
 * Allow-Origin is * rather than a list because the native origins are
 * localhost, which is also every developer's machine, so a list buys nothing.
 * It is safe here because this route authorises on the Appwrite JWT in the
 * header and never on a cookie: a hostile page can make a browser send the
 * request, but cannot obtain a JWT for the user to put in it. Credentials are
 * deliberately not allowed, which is what keeps that true.
 *
 * X-Appwrite-JWT is not a CORS-simple header, so the preflight below is
 * required, not optional. */
const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Appwrite-JWT',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...cors } });

type Args = Record<string, unknown>;
type Row = Record<string, unknown>;

/** A privileged call. Only ever made after the caller has been identified. */
async function aw(method: string, path: string, body?: unknown) {
  try {
    const res = await fetch(ENDPOINT + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT,
        'X-Appwrite-Key': API_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return { ok: res.ok, status: res.status, json: (await res.json().catch(() => null)) as Row | null };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

const q = (...items: unknown[]): string =>
  '?' + items.map(i => `queries[]=${encodeURIComponent(JSON.stringify(i))}`).join('&');

/** Who is calling, according to Appwrite — not according to the request body. */
async function callerId(jwt: string | null): Promise<string | null> {
  if (!jwt) return null;
  try {
    const res = await fetch(`${ENDPOINT}/account`, {
      headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-JWT': jwt },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { $id?: string };
    return u?.$id ?? null;
  } catch {
    return null;
  }
}

/* Postgres filled these with DEFAULT now(). This route creates rows without
   going through the client adapter, so it supplies them itself. */
const TS: Record<string, string[]> = {
  saves: ['saved_at'], event_saves: ['saved_at'],
  event_rsvps: ['rsvped_at'], reactions: ['created_at'],
};
const timestampsFor = (t: string): Record<string, string> =>
  Object.fromEntries((TS[t] ?? []).map(c => [c, new Date().toISOString()]));

/** One row per (user, thing), with the counter kept here where it is allowed. */
async function toggle(
  uid: string, tableId: string, keys: Record<string, string>,
  counter?: { table: string; rowId: string; column: string },
): Promise<boolean> {
  const found = await aw('GET', `/tablesdb/${DB}/tables/${tableId}/rows`
    + q(...Object.entries(keys).map(([k, v]) => ({ method: 'equal', attribute: k, values: [v] })),
        { method: 'limit', values: [1] }));
  const existing = ((found.json?.rows as Array<{ $id: string }> | undefined) ?? [])[0];

  if (existing) {
    await aw('DELETE', `/tablesdb/${DB}/tables/${tableId}/rows/${existing.$id}`);
    /* min 0, so a double-untoggle cannot drive a count negative and leave a
       card reading "-1 saved" permanently. */
    if (counter) {
      await aw('PATCH',
        `/tablesdb/${DB}/tables/${counter.table}/rows/${counter.rowId}/${counter.column}/decrement`,
        { value: 1, min: 0 });
    }
    return false;
  }

  await aw('POST', `/tablesdb/${DB}/tables/${tableId}/rows`, {
    rowId: 'unique()',
    data: { ...keys, ...timestampsFor(tableId) },
    permissions: [`read("user:${uid}")`, `update("user:${uid}")`, `delete("user:${uid}")`],
  });
  if (counter) {
    await aw('PATCH',
      `/tablesdb/${DB}/tables/${counter.table}/rows/${counter.rowId}/${counter.column}/increment`,
      { value: 1 });
  }
  return true;
}

export async function POST(req: Request, ctx: { params: Promise<{ fn: string }> }) {
  if (!ENDPOINT || !PROJECT || !API_KEY) {
    return json({ message: 'Server is not configured for Appwrite' }, 503);
  }

  const { fn } = await ctx.params;
  const uid = await callerId(req.headers.get('x-appwrite-jwt'));
  if (!uid) return json({ message: 'Not signed in', code: 'unauthorized' }, 401);

  let args: Args = {};
  try { args = (await req.json()) as Args; } catch { /* no body is fine */ }

  try {
    switch (fn) {
      case 'rpc_toggle_save':
        return json({ data: await toggle(uid, 'saves',
          { user_id: uid, listing_id: String(args._listing_id) },
          { table: 'listings', rowId: String(args._listing_id), column: 'save_count' }) });

      case 'rpc_toggle_rsvp':
        return json({ data: await toggle(uid, 'event_rsvps',
          { user_id: uid, event_id: String(args._event_id) },
          { table: 'events', rowId: String(args._event_id), column: 'attendee_count' }) });

      case 'rpc_toggle_event_save':
        return json({ data: await toggle(uid, 'event_saves',
          { user_id: uid, event_id: String(args._event_id) }) });

      case 'rpc_toggle_like':
        return json({ data: await toggle(uid, 'reactions', {
          user_id: uid, entity_type: String(args._entity_type),
          entity_id: String(args._entity_id), kind: 'like',
        }) });

      case 'rpc_increment_listing_view':
        await aw('PATCH', `/tablesdb/${DB}/tables/listings/rows/${String(args._listing_id)}/view_count/increment`, { value: 1 });
        return json({ data: null });

      case 'rpc_increment_event_view':
        await aw('PATCH', `/tablesdb/${DB}/tables/events/rows/${String(args._event_id)}/view_count/increment`, { value: 1 });
        return json({ data: null });

      /* The decision belongs here. An address comes back only if that member
         switched the relevant sharing preference on — and their own row is
         always visible to themselves. */
      case 'get_contact': {
        const target = String(args.target ?? '');
        if (!target) return json({ data: [] });

        const pr = await aw('GET', `/tablesdb/${DB}/tables/profiles/rows/${target}`);
        if (!pr.ok || !pr.json) return json({ data: [] });
        const profile = pr.json;

        const cr = await aw('GET', `/tablesdb/${DB}/tables/profile_contacts/rows/${target}`);
        if (!cr.ok || !cr.json) return json({ data: [{ email: null, phone: null }] });
        const contacts = cr.json;

        const isSelf = target === uid;
        const email = isSelf || profile.contact_email_enabled ? (contacts.email ?? null) : null;
        const phone = isSelf || (profile.contact_whatsapp_enabled && profile.show_phone_on_profile)
          ? (contacts.phone ?? null) : null;
        return json({ data: [{ email, phone }] });
      }

      /* Deleting an account touches a dozen tables, most of them holding rows
         the member does not own — a comment on someone else's listing, a
         counter on a post they saved. Postgres did it in one SECURITY DEFINER
         function; the same reasoning puts it here rather than in the browser. */
      case 'delete_my_account': {
        const owned: Array<[string, string]> = [
          ['saves', 'user_id'], ['event_saves', 'user_id'], ['event_rsvps', 'user_id'],
          ['reactions', 'user_id'], ['notifications', 'user_id'], ['alerts', 'user_id'],
          ['saved_searches', 'user_id'], ['push_subscriptions', 'user_id'],
          ['user_blocks', 'blocker_id'], ['comments', 'user_id'],
          ['listings', 'user_id'], ['requests', 'user_id'], ['lost_found_reports', 'user_id'],
          ['inventory_items', 'user_id'], ['community_members', 'user_id'],
        ];
        for (const [table, col] of owned) {
          for (;;) {
            const page = await aw('GET', `/tablesdb/${DB}/tables/${table}/rows`
              + q({ method: 'equal', attribute: col, values: [uid] }, { method: 'limit', values: [100] }));
            const rows = (page.json?.rows as Array<{ $id: string }> | undefined) ?? [];
            if (!rows.length) break;
            for (const r of rows) await aw('DELETE', `/tablesdb/${DB}/tables/${table}/rows/${r.$id}`);
            if (rows.length < 100) break;
          }
        }
        await aw('DELETE', `/tablesdb/${DB}/tables/profile_contacts/rows/${uid}`);
        await aw('DELETE', `/tablesdb/${DB}/tables/profiles/rows/${uid}`);
        /* The account last: while it exists the member can still sign in and
           see what has gone, which is better than a live session against rows
           that are already deleted. */
        await aw('DELETE', `/users/${uid}`);
        return json({ data: true });
      }

      /* Admin-only, and the check has to be here — a browser deciding whether
         it is allowed to suspend people is not a check. */
      case 'admin_set_suspension': {
        const meRow = await aw('GET', `/tablesdb/${DB}/tables/profiles/rows/${uid}`);
        const role = String(meRow.json?.role ?? '');
        if (role !== 'admin' && role !== 'owner') {
          return json({ message: 'Not permitted', code: '42501' }, 403);
        }
        /* The app sends { target, days, reason } — the Postgres function's own
           parameter names. Reading _user_id/_until here suspended nobody and
           reported success, which is the worst possible outcome for a
           moderation action. */
        const target = String(args.target ?? '');
        if (!target) return json({ message: 'No user given' }, 400);
        const days = Number(args.days ?? 0);
        /* days of 0 or less lifts a suspension, which is how the app unbans. */
        const until = days > 0
          ? new Date(Date.now() + days * 86400000).toISOString()
          : null;
        const r = await aw('PATCH', `/tablesdb/${DB}/tables/profiles/rows/${target}`, {
          data: {
            suspended_until: until,
            suspended_reason: until ? (args.reason ?? null) : null,
          },
        });
        if (!r.ok) return json({ message: r.json?.message ?? 'Could not update', code: String(r.status) }, 500);
        return json({ data: until });
      }

      default:
        return json({ message: `Unknown function ${fn}`, code: '42883' }, 404);
    }
  } catch (e) {
    const a = e as { message?: string; type?: string };
    return json({ message: a?.message ?? 'Request failed', code: a?.type }, 500);
  }
}
