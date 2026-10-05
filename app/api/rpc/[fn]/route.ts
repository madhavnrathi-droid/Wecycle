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
import { createHash, randomInt } from 'node:crypto';
import { emailGateProblem } from '../../../../lib/emailDomain';
import {
  DB, aw, q, json, cors, callerId, serverConfigured, type Args, type Row,
} from '../../_lib/appwrite';
import { sendMessage, markConversationRead, canMessage } from '../../_lib/messaging';
import { roomForNewMember, syncRoomLabels, roomReadPerm } from '../../_lib/rooms';
import { deletePost, deleteComment } from '../../_lib/deletion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* CORS, the JWT check and the server-key helper live in app/api/_lib/appwrite.ts
   so a new route gets all three by importing them. The preflight below is not
   optional: X-Appwrite-JWT is not a CORS-simple header, so every call from the
   native apps is preflighted. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
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


/* ── A new member's profile ────────────────────────────────────────────────
 *
 * Postgres had a trigger, auth.tr_users_make_profile, that created a profile the
 * moment an account existed. Appwrite has no triggers, and nothing replaced it:
 * from the cutover on 23 September every new member got an account and no
 * profile. Three real people signed up into that gap.
 *
 * This is the replacement, and it is the same trigger's logic: username from
 * the email's local part, the default community, the default notification
 * preferences, and a membership row. It runs here rather than in the browser
 * for two reasons — a profile must exist even if someone signs up without going
 * through the app's form, and the Manipal rule the old trigger ALSO enforced has
 * to be checked somewhere a client cannot skip.
 */
const DEFAULT_NOTIFICATION_PREFS = JSON.stringify({
  channels: { inApp: true, sound: true, email: true, sms: false },
  categories: {
    messages: true, matches: true, events: true, marketplace: true,
    lostFound: true, community: true, digest: true,
  },
  emailFrequency: 'realtime',
  quietHours: { enabled: false, from: '22:00', to: '07:00' },
});
const COLLEGES = new Set(['SMI', 'MIT', 'TAPMI', 'MLHS', 'MIRM', 'MLS', 'DOC']);

const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

/** The email's local part, as the old trigger derived it, kept to characters a
 *  handle can hold. */
const usernameBase = (email: string, uid: string): string => {
  const local = (email.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30);
  return local || `user_${uid.slice(0, 8)}`;
};

async function ensureProfile(uid: string, args: Args) {
  const me = await aw('GET', `/users/${uid}`);
  if (!me.ok || !me.json) return json({ message: 'Account not found' }, 404);
  const email = String(me.json.email ?? '');
  const accountName = String(me.json.name ?? '');

  /* 'signin' semantics, deliberately, not 'signup': this decides who may HAVE a
     profile, and grandfathered members and provisioned partners may, even
     though neither may create a new account through the public form. */
  const problem = emailGateProblem(email, 'signin');
  if (problem) return json({ message: problem, code: 'email_not_allowed' }, 403);

  const existing = await aw('GET', `/tablesdb/${DB}/tables/profiles/rows/${uid}`);
  if (existing.ok) {
    await syncRoomLabels(uid, me.json, existing.json);
    return json({ data: existing.json });
  }

  /* Which room — see lib/rooms.ts. Manipal by email; NMIMS by email plus the
     campus the member chose. An NMIMS member with no campus gets no profile
     until they choose one, rather than a profile in the wrong room. */
  const room = await roomForNewMember(uid, email, args.campus);
  if (!room) return json({ message: 'Choose your NMIMS campus to finish signing up.', code: 'campus_required' }, 409);

  const fullName = String(args.full_name ?? accountName ?? '').trim();
  /* College codes are Manipal's schools; NMIMS members are identified by room. */
  const college = room.university === 'MAHE' && typeof args.college === 'string' && COLLEGES.has(args.college)
    ? args.college : undefined;
  const now = new Date().toISOString();
  /* Readable by the member's room only — everyone, for the public Manipal
     room; the room's label for a private one. */
  const perms = [roomReadPerm(room), `update("user:${uid}")`, `delete("user:${uid}")`];

  /* usernames are unique; a collision gets a short numeric suffix. Tried a few
     times rather than once, because two people called Aryan at one college is
     the ordinary case, not the edge case. */
  const base = usernameBase(email, uid);
  let created: Row | null = null;
  let lastError = '';
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 26)}${randomInt(100, 9999)}`;
    const r = await aw('POST', `/tablesdb/${DB}/tables/profiles/rows`, {
      rowId: uid,
      data: {
        username,
        full_name: fullName || null,
        initials: initialsOf(fullName || username),
        avatar_color: '#6C63FF',
        community_id: room.id,
        ...(college ? { college } : {}),
        notification_prefs: DEFAULT_NOTIFICATION_PREFS,
        joined_at: now,
        updated_at: now,
      },
      permissions: perms,
    });
    if (r.ok) { created = r.json; break; }
    lastError = String(r.json?.message ?? r.status);
    /* A 409 on the ROW id means a concurrent call already made it — fine. */
    if (r.status === 409 && !/username/i.test(lastError)) {
      const again = await aw('GET', `/tablesdb/${DB}/tables/profiles/rows/${uid}`);
      if (again.ok) return json({ data: again.json });
    }
  }
  if (!created) return json({ message: `Could not create profile: ${lastError}` }, 500);

  /* The label is what opens a private room's rows to its member. Set before
     the response, so the app's very first feed fetch can already see them. */
  await syncRoomLabels(uid, me.json, created);

  /* Contact details live apart from the public profile — see split-contacts.mjs.
     The profile row is readable by anyone; this one by nobody but the server. */
  const phone = typeof args.phone === 'string' && args.phone.trim() ? args.phone.trim() : null;
  await aw('POST', `/tablesdb/${DB}/tables/profile_contacts/rows`, {
    rowId: uid, data: { email, phone }, permissions: [],
  });

  /* The membership the old tr_profiles_biz trigger added whenever a profile had
     a community. Hashed id, same convention as the migration, so a retry is a
     no-op instead of a duplicate. */
  const memberId = createHash('md5').update(`${room.id}|${uid}`).digest('hex').slice(0, 32);
  await aw('POST', `/tablesdb/${DB}/tables/community_members/rows`, {
    rowId: memberId,
    data: { community_id: room.id, user_id: uid, role: 'member', joined_at: now },
    permissions: perms,
  });

  return json({ data: created }, 201);
}

export async function POST(req: Request, ctx: { params: Promise<{ fn: string }> }) {
  if (!serverConfigured()) {
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
        /* Conversations go whole — both sides of every thread. Settings has
           always promised that deleting an account removes its messages, and
           a thread with one member's half cut out is not a record of
           anything; it is a stranger's replies to nobody. */
        for (const col of ['user_a', 'user_b']) {
          for (;;) {
            const page = await aw('GET', `/tablesdb/${DB}/tables/conversations/rows`
              + q({ method: 'equal', attribute: col, values: [uid] }, { method: 'limit', values: [100] }));
            const convs = (page.json?.rows as Array<{ $id: string }> | undefined) ?? [];
            if (!convs.length) break;
            for (const c of convs) {
              for (;;) {
                const msgs = await aw('GET', `/tablesdb/${DB}/tables/messages/rows`
                  + q({ method: 'equal', attribute: 'conversation_id', values: [c.$id] }, { method: 'limit', values: [100] }));
                const rows = (msgs.json?.rows as Array<{ $id: string }> | undefined) ?? [];
                if (!rows.length) break;
                for (const m of rows) await aw('DELETE', `/tablesdb/${DB}/tables/messages/rows/${m.$id}`);
                if (rows.length < 100) break;
              }
              await aw('DELETE', `/tablesdb/${DB}/tables/conversations/rows/${c.$id}`);
            }
            if (convs.length < 100) break;
          }
        }
        /* Anything left that they sent, in rows outside a conversation. */
        for (;;) {
          const page = await aw('GET', `/tablesdb/${DB}/tables/messages/rows`
            + q({ method: 'equal', attribute: 'sender_id', values: [uid] }, { method: 'limit', values: [100] }));
          const rows = (page.json?.rows as Array<{ $id: string }> | undefined) ?? [];
          if (!rows.length) break;
          for (const r of rows) await aw('DELETE', `/tablesdb/${DB}/tables/messages/rows/${r.$id}`);
          if (rows.length < 100) break;
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

      case 'ensure_profile':
        return await ensureProfile(uid, args);

      /* Deleting a post or a comment — by its author, or by an admin — with
         everything that hung off it. See _lib/deletion.ts. */
      case 'delete_post':
        return await deletePost(uid, args);

      case 'delete_comment':
        return await deleteComment(uid, args);

      /* Labels follow the member's room (and admin standing) — and the
         response is the rooms this account may view, which is what the
         admin room switcher lists. Called once per session. */
      case 'sync_rooms': {
        const user = await aw('GET', `/users/${uid}`);
        if (!user.ok || !user.json) return json({ message: 'Account not found' }, 404);
        const profile = await aw('GET', `/tablesdb/${DB}/tables/profiles/rows/${uid}`);
        const rooms = await syncRoomLabels(uid, user.json, profile.ok ? profile.json : null);
        return json({ data: { home: profile.ok ? profile.json?.community_id ?? null : null, rooms: rooms.map(r => r.id) } });
      }

      /* Direct messages. Sending is server-side for the same reason as the
         toggles: a message must be readable by exactly two people, and a
         browser can only grant permissions to itself. See _lib/messaging.ts. */
      case 'dm_send':
        return await sendMessage(uid, args);

      case 'dm_mark_read':
        return await markConversationRead(uid, args);

      case 'dm_can_message':
        return await canMessage(uid, args);

      default:
        return json({ message: `Unknown function ${fn}`, code: '42883' }, 404);
    }
  } catch (e) {
    const a = e as { message?: string; type?: string };
    return json({ message: a?.message ?? 'Request failed', code: a?.type }, 500);
  }
}
