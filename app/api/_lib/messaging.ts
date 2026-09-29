/**
 * Direct messages — the half that has to run on the server.
 *
 * ── WHY SENDING IS HERE ─────────────────────────────────────────────────────
 *
 * A message must be readable by exactly two people. Appwrite lets a browser
 * grant permissions only to roles it holds itself, so a browser can write a
 * row that it can read, or that everyone can read, but never one that one
 * other member can read. The server can, so the server writes every
 * conversation and message, each with exactly `read("user:A")` and
 * `read("user:B")` and nothing else. Nobody can edit or delete a message —
 * not even its sender — which is what makes a reported message evidence.
 *
 * That permission set is also the authenticity check. The tables still grant
 * `create("users")` (changing that needs a console key), so a client can put
 * rows in them — but never rows carrying another member's read permission.
 * The screens and this file both ignore anything without the exact pair; see
 * isGenuine in lib/messaging/format.ts.
 *
 * ── WHAT IS CHECKED BEFORE A MESSAGE IS WRITTEN ────────────────────────────
 *
 *   - the body: not empty, not over MESSAGE_MAX, passes the content filter
 *   - the sender is not suspended
 *   - neither member has blocked the other (and the reply never says which)
 *   - the recipient accepts DMs, or has already written in this conversation
 *   - the sender is not flooding: 20 messages a minute, 20 new chats an hour
 *   - any post the message is "about" belongs to one of the two members
 *
 * One conversation per pair of people, like every social messenger: the id is
 * derived from the pair, so two first messages racing each other land in the
 * same conversation instead of creating two.
 */

import { createHash } from 'node:crypto';
import { DB, aw, q, json, rowsOf, type Args, type Row } from './appwrite';
import { findObjectionable, objectionableMessage } from '../../../lib/contentFilter';
import {
  MESSAGE_MAX, normalizeBody, previewOf, encodeSubject, isGenuine, readPerm,
  orderedPair, isValidRowId, isContextType, CONTEXT_SOURCE, type ContextType,
} from '../../../lib/messaging/format';

const T = (table: string) => `/tablesdb/${DB}/tables/${table}/rows`;

const RATE_PER_MINUTE = 20;
const NEW_CHATS_PER_HOUR = 20;

/** One conversation per pair. md5 of the ordered pair — 32 hex characters,
 *  inside Appwrite's 36-character id limit. */
export function conversationIdFor(x: string, y: string): string {
  const [a, b] = orderedPair(x, y);
  return createHash('md5').update(`dm|${a}|${b}`).digest('hex');
}

const firstName = (p: Row | null): string =>
  String(p?.full_name ?? '').trim().split(/\s+/)[0] || 'This member';

type Refusal = { ok: false; status: number; code: string; message: string };
type Allowed = { ok: true; peer: Row };

async function getRow(table: string, id: string): Promise<Row | null> {
  if (!isValidRowId(id)) return null;
  const r = await aw('GET', `${T(table)}/${encodeURIComponent(id)}`);
  return r.ok ? r.json : null;
}

/** Rows the server wrote: exactly two read permissions, for two different
 *  members. A client can only grant itself, so it cannot make one of these —
 *  which is what stops someone padding another member's rate limit, or faking
 *  a reply to get past "DMs off", with rows they created themselves. */
const serverWritten = (row: Row): boolean => {
  const p = row.$permissions;
  return Array.isArray(p) && p.length === 2 && p[0] !== p[1]
    && p.every(x => /^read\("user:[^"]+"\)$/.test(String(x)));
};

async function countSince(table: string, since: string, ...filters: unknown[]): Promise<number> {
  const r = await aw('GET', T(table) + q(
    ...filters,
    { method: 'greaterThan', attribute: 'created_at', values: [since] },
    { method: 'limit', values: [50] }));
  return rowsOf(r).filter(serverWritten).length;
}

/** Everything that decides whether `uid` may message `peerId` right now. */
async function policy(uid: string, peerId: string): Promise<Allowed | Refusal> {
  if (!peerId || peerId === uid) {
    return { ok: false, status: 400, code: 'self', message: 'You can’t message yourself.' };
  }

  const [me, peer, iBlocked, theyBlocked] = await Promise.all([
    getRow('profiles', uid),
    getRow('profiles', peerId),
    aw('GET', T('user_blocks') + q(
      { method: 'equal', attribute: 'blocker_id', values: [uid] },
      { method: 'equal', attribute: 'target_id', values: [peerId] },
      { method: 'limit', values: [1] })),
    aw('GET', T('user_blocks') + q(
      { method: 'equal', attribute: 'blocker_id', values: [peerId] },
      { method: 'equal', attribute: 'target_id', values: [uid] },
      { method: 'limit', values: [1] })),
  ]);

  if (!peer) return { ok: false, status: 404, code: 'not_found', message: 'This account isn’t on Wecycle any more.' };

  const until = me?.suspended_until ? Date.parse(String(me.suspended_until)) : 0;
  if (until && until > Date.now()) {
    return {
      ok: false, status: 403, code: 'suspended',
      message: `Your account is paused until ${new Date(until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, so you can’t send messages.`,
    };
  }

  if (rowsOf(iBlocked).length) {
    return { ok: false, status: 403, code: 'you_blocked', message: `You’ve blocked ${firstName(peer)}. Unblock them to send a message.` };
  }
  /* Deliberately vague. Telling someone they have been blocked invites the
     harassment the block exists to stop. */
  if (rowsOf(theyBlocked).length) {
    return { ok: false, status: 403, code: 'unavailable', message: 'You can’t message this account.' };
  }

  if (peer.allow_dms === false) {
    /* Someone who switched DMs off can still get a reply to a conversation
       they wrote in themselves — otherwise turning the setting off would
       silently strand every chat they had started. */
    const theirs = await aw('GET', T('messages') + q(
      { method: 'equal', attribute: 'conversation_id', values: [conversationIdFor(uid, peerId)] },
      { method: 'equal', attribute: 'sender_id', values: [peerId] },
      { method: 'limit', values: [5] }));
    if (!rowsOf(theirs).some(serverWritten)) {
      return { ok: false, status: 403, code: 'dms_off', message: `${firstName(peer)} isn’t taking messages right now.` };
    }
  }

  return { ok: true, peer };
}

/** The post a conversation is about, if it belongs to one of the two members. */
async function resolveContext(raw: unknown, uid: string, peerId: string):
  Promise<{ type: ContextType; id: string; title: string } | null | 'invalid'> {
  if (!raw || typeof raw !== 'object') return null;
  const { type, id } = raw as { type?: unknown; id?: unknown };
  if (!isContextType(type) || !isValidRowId(id)) return 'invalid';
  const src = CONTEXT_SOURCE[type];
  const row = await getRow(src.table, id);
  if (!row) return 'invalid';
  const owner = String(row[src.owner] ?? '');
  if (owner !== uid && owner !== peerId) return 'invalid';
  return { type, id, title: String(row.title ?? '') };
}

/* ── dm_can_message { to } ──────────────────────────────────────────────────
 * Asked when a new conversation opens, so the screen can say "X isn't taking
 * messages" before someone writes a paragraph, not after. */
export async function canMessage(uid: string, args: Args) {
  const peerId = String(args.to ?? '');
  const p = await policy(uid, peerId);
  if (p.ok) return json({ data: { ok: true } });
  return json({ data: { ok: false, code: p.code, message: p.message } });
}

/* ── dm_send { to | conversation_id, body, message_id, context? } ────────── */
export async function sendMessage(uid: string, args: Args) {
  const body = normalizeBody(String(args.body ?? ''));
  if (!body) return json({ message: 'Write a message first.', code: 'invalid' }, 400);
  if (Array.from(body).length > MESSAGE_MAX) {
    return json({ message: `Messages can be up to ${MESSAGE_MAX.toLocaleString('en-IN')} characters.`, code: 'too_long' }, 400);
  }
  const messageId = args.message_id;
  if (!isValidRowId(messageId)) return json({ message: 'Invalid message id', code: 'invalid' }, 400);

  const hit = findObjectionable(body);
  if (hit) return json({ message: objectionableMessage(hit), code: 'objectionable' }, 422);

  /* Who it is for. A conversation id is checked against its members; a bare
     `to` is a person. Either way, from here on the pair is what matters. */
  let peerId = String(args.to ?? '');
  if (args.conversation_id) {
    const conv = await getRow('conversations', String(args.conversation_id));
    const a = String(conv?.user_a ?? ''), b = String(conv?.user_b ?? '');
    if (!conv || !isGenuine(conv.$permissions, a, b) || (uid !== a && uid !== b)) {
      return json({ message: 'Conversation not found', code: 'not_found' }, 404);
    }
    peerId = uid === a ? b : a;
  }

  const allowed = await policy(uid, peerId);
  if (!allowed.ok) return json({ message: allowed.message, code: allowed.code }, allowed.status);

  const ctx = await resolveContext(args.context, uid, peerId);
  if (ctx === 'invalid') return json({ message: 'That post isn’t available.', code: 'bad_context' }, 400);

  const convId = conversationIdFor(uid, peerId);
  const [a, b] = orderedPair(uid, peerId);
  const perms = [readPerm(a), readPerm(b)];
  const now = new Date().toISOString();

  /* An idempotent retry: the client chose the id, so a resend after a dropped
     response finds the message it already wrote rather than writing it twice. */
  const already = await getRow('messages', messageId);
  if (already) {
    if (already.sender_id === uid && already.conversation_id === convId && isGenuine(already.$permissions, a, b)) {
      return json({ data: { conversation: await getRow('conversations', convId), message: already } });
    }
    return json({ message: 'Invalid message id', code: 'invalid' }, 409);
  }

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  if (await countSince('messages', minuteAgo, { method: 'equal', attribute: 'sender_id', values: [uid] }) >= RATE_PER_MINUTE) {
    return json({ message: 'You’re sending messages very fast. Wait a moment and try again.', code: 'rate_limited' }, 429);
  }

  const summary = {
    last_message: previewOf(body),
    last_message_at: now,
    last_sender_id: uid,
    ...(ctx ? { listing_id: ctx.id, subject: encodeSubject(ctx.type, ctx.title) } : {}),
  };

  /* Get or create the conversation. */
  let conv = await getRow('conversations', convId);
  let created = false;
  if (!conv) {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [asA, asB] = await Promise.all([
      countSince('conversations', hourAgo, { method: 'equal', attribute: 'user_a', values: [uid] }),
      countSince('conversations', hourAgo, { method: 'equal', attribute: 'user_b', values: [uid] }),
    ]);
    if (asA + asB >= NEW_CHATS_PER_HOUR) {
      return json({ message: 'You’ve started a lot of new chats in the last hour. Try again a little later.', code: 'rate_limited' }, 429);
    }
    const r = await aw('POST', T('conversations'), {
      rowId: convId,
      data: { user_a: a, user_b: b, created_at: now, ...summary },
      permissions: perms,
    });
    if (r.ok) { conv = r.json; created = true; }
    else if (r.status === 409) conv = await getRow('conversations', convId); // a racing first message won
    else return json({ message: 'Couldn’t start this conversation. Try again.', code: 'server' }, 502);
  }
  if (!conv) return json({ message: 'Couldn’t start this conversation. Try again.', code: 'server' }, 502);

  /* A row at the pair's id that the server did not write — someone created it
     from a client to squat the id. Take it over: the server's data, the
     server's permissions, and its creator loses the rights they gave
     themselves. */
  if (!isGenuine(conv.$permissions, a, b)) {
    const r = await aw('PATCH', `${T('conversations')}/${convId}`, {
      data: { user_a: a, user_b: b, created_at: now, ...summary },
      permissions: perms,
    });
    if (!r.ok) return json({ message: 'Couldn’t start this conversation. Try again.', code: 'server' }, 502);
    conv = r.json;
    created = true;
  }

  const m = await aw('POST', T('messages'), {
    rowId: messageId,
    data: { conversation_id: convId, sender_id: uid, body, created_at: now },
    permissions: perms,
  });
  if (!m.ok) {
    /* Never leave an empty conversation in someone's inbox. */
    if (created) await aw('DELETE', `${T('conversations')}/${convId}`);
    return json({ message: 'Message not sent. Try again.', code: 'server' }, 502);
  }

  if (!created) {
    const u = await aw('PATCH', `${T('conversations')}/${convId}`, { data: summary });
    if (u.ok) conv = u.json;
  }

  return json({ data: { conversation: conv, message: m.json } }, 201);
}

/* ── dm_mark_read { conversation_id } ───────────────────────────────────────
 * Stamps read_at on everything the other member sent that the caller has not
 * read. It is here, not in the browser, because a message is read-only to
 * both members — letting the recipient write read_at would let them rewrite
 * the body too. */
export async function markConversationRead(uid: string, args: Args) {
  const conv = await getRow('conversations', String(args.conversation_id ?? ''));
  const a = String(conv?.user_a ?? ''), b = String(conv?.user_b ?? '');
  if (!conv || !isGenuine(conv.$permissions, a, b) || (uid !== a && uid !== b)) {
    return json({ message: 'Conversation not found', code: 'not_found' }, 404);
  }

  /* One row at a time rather than the bulk endpoint: each update is its own
     realtime event, which is what turns "Sent" into "Seen" on the other
     member's screen while they watch. Paged, so a long unread backlog is
     cleared in one call rather than the first hundred of it. */
  const now = new Date().toISOString();
  let marked = 0;
  for (let page = 0; page < 5; page++) {
    const unread = await aw('GET', T('messages') + q(
      { method: 'equal', attribute: 'conversation_id', values: [String(conv.$id)] },
      { method: 'notEqual', attribute: 'sender_id', values: [uid] },
      { method: 'isNull', attribute: 'read_at' },
      { method: 'limit', values: [100] }));
    const ids = rowsOf(unread).map(r => String(r.$id));
    if (!ids.length) break;
    const results = await Promise.all(ids.map(id =>
      aw('PATCH', `${T('messages')}/${id}`, { data: { read_at: now } })));
    marked += results.filter(r => r.ok).length;
    if (ids.length < 100) break;
  }
  return json({ data: marked });
}
