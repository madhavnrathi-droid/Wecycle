/**
 * Orders — the half that has to run on the server.
 *
 * ── WHY HERE ───────────────────────────────────────────────────────────────
 *
 * Same reason as direct messages (_lib/messaging.ts): an order must be
 * readable by exactly two people, and only a server can write a row another
 * member can read. Every order row carries exactly `read("user:buyer")` and
 * `read("user:seller")`, the table grants nothing to clients, and every change
 * comes through here, where the caller is identified by JWT and the move is
 * checked against lib/orders/model.ts — the same rules the screen used to
 * decide which buttons to show.
 *
 * ── ORDERING IS MESSAGING ──────────────────────────────────────────────────
 *
 * Placing an order sends the seller a first message; every later step posts a
 * one-line update from whoever took it. All of them go through postMessage,
 * so a block, a room, a suspension or "not taking messages" stops an order
 * exactly as it stops a chat, and the rate limits are shared. The chat is the
 * order's notification, its history and its fallback for old app versions.
 *
 * ── THE PICKUP CODE ────────────────────────────────────────────────────────
 *
 * Four digits derived from the order id with a server secret, so nothing has
 * to be stored and nothing in the order row reveals it. Only the buyer is
 * ever told it. The seller entering it at the handover marks the order as
 * checked; it never blocks finishing without it.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DB, aw, q, json, rowsOf, type Args, type Row } from './appwrite';
import { conversationIdFor, getRow, policy, postMessage } from './messaging';
import { findObjectionable, objectionableMessage } from '../../../lib/contentFilter';
import { isValidRowId, readPerm } from '../../../lib/messaging/format';
import {
  canDo, nextStatus, requestText, updateText, parseHistory, appendHistory, cleanText, clampQuantity,
  isOrderable, isOpen, NOTE_MAX, PICKUP_MAX, REASON_MAX,
  type OrderAction, type OrderStatus, type Role,
} from '../../../lib/orders/model';

const T = (table: string) => `/tablesdb/${DB}/tables/${table}/rows`;

/** Orders one member can place in an hour. Generous for a real buyer, a wall
 *  for a script. */
const ORDERS_PER_HOUR = 12;

const firstName = (p: Row | null): string => String(p?.full_name ?? '').trim().split(/\s+/)[0] || '';

/** A row this route wrote: exactly the buyer's and the seller's read. */
function genuine(o: Row): boolean {
  const p = o.$permissions;
  const want = new Set([readPerm(String(o.buyer_id)), readPerm(String(o.seller_id))]);
  return Array.isArray(p) && p.length === 2 && p.every(x => want.has(String(x)));
}

function roleOf(o: Row, uid: string): Role | null {
  if (o.seller_id === uid) return 'seller';
  if (o.buyer_id === uid) return 'buyer';
  return null;
}

/* ── The pickup code ── */

const CODE_SECRET = process.env.ORDER_CODE_SECRET || process.env.APPWRITE_API_KEY || '';

export function pickupCode(orderId: string): string {
  const h = createHmac('sha256', `wecycle-order-code|${CODE_SECRET}`).update(orderId).digest();
  return String(h.readUInt32BE(0) % 10000).padStart(4, '0');
}

function codeMatches(orderId: string, typed: string): boolean {
  const a = Buffer.from(pickupCode(orderId));
  const b = Buffer.from(String(typed).replace(/\D/g, '').slice(0, 4).padEnd(4, 'x'));
  return a.length === b.length && timingSafeEqual(a, b);
}

/* A wrong code is cheap to guess at 1 in 10,000 — unless it can be guessed
   10,000 times. Five tries per order per ten minutes, held in memory: a cold
   start forgets, which only ever helps an honest seller who mistyped. */
const codeTries = new Map<string, { n: number; since: number }>();
function tooManyTries(orderId: string): boolean {
  const now = Date.now();
  const t = codeTries.get(orderId);
  if (!t || now - t.since > 10 * 60_000) { codeTries.set(orderId, { n: 1, since: now }); return false; }
  t.n += 1;
  return t.n > 5;
}

/** Message ids for an order's steps: derived, so a retried step cannot post
 *  its update twice. */
const stepMessageId = (orderId: string, step: number): string =>
  createHash('md5').update(`order|${orderId}|${step}`).digest('hex');

/* ── order_create { listing_id, quantity?, note? } ───────────────────────── */
export async function createOrder(uid: string, args: Args) {
  const listingId = String(args.listing_id ?? '');
  if (!isValidRowId(listingId)) return json({ message: 'That item isn’t available.', code: 'invalid' }, 400);
  const quantity = clampQuantity(args.quantity);
  const note = cleanText(args.note, NOTE_MAX, true);
  if (note) {
    const hit = findObjectionable(note);
    if (hit) return json({ message: objectionableMessage(hit), code: 'objectionable' }, 422);
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [listing, mineAlready, placedLastHour] = await Promise.all([
    getRow('listings', listingId),
    aw('GET', T('orders') + q(
      { method: 'equal', attribute: 'listing_id', values: [listingId] },
      { method: 'equal', attribute: 'buyer_id', values: [uid] },
      { method: 'orderDesc', attribute: 'updated_at' },
      { method: 'limit', values: [5] })),
    aw('GET', T('orders') + q(
      { method: 'equal', attribute: 'buyer_id', values: [uid] },
      { method: 'greaterThan', attribute: 'created_at', values: [hourAgo] },
      { method: 'limit', values: [ORDERS_PER_HOUR + 1] })),
  ]);

  if (!listing || !isOrderable(listing as { kind?: string; listing_type?: string; status?: string })) {
    return json({ message: 'This item can’t be ordered right now.', code: 'unavailable' }, 409);
  }
  const sellerId = String(listing.user_id ?? '');
  if (!sellerId || sellerId === uid) return json({ message: 'You can’t order your own item.', code: 'self' }, 400);

  /* Ordering again while an order is still open just returns that order —
     a double tap, or forgetting, should land on the order, not start a
     second one. */
  const open = rowsOf(mineAlready).find(o => genuine(o) && isOpen(o.status as OrderStatus));
  if (open) return json({ data: { order: open, existing: true } });

  if (rowsOf(placedLastHour).filter(genuine).length >= ORDERS_PER_HOUR) {
    return json({ message: 'You’ve placed a lot of orders in the last hour. Try again a little later.', code: 'rate_limited' }, 429);
  }

  /* The same rules as a chat, checked before anything is written. */
  const allowed = await policy(uid, sellerId);
  if (!allowed.ok) {
    /* "Sanvi isn't taking messages right now" — said about orders here. */
    const message = allowed.code === 'dms_off' ? allowed.message.replace('taking messages', 'taking orders') : allowed.message;
    return json({ message, code: allowed.code }, allowed.status);
  }
  const seller = allowed.peer;

  const id = randomBytes(10).toString('hex');
  const now = new Date().toISOString();
  const photos = Array.isArray(listing.photo_urls) ? listing.photo_urls as string[] : [];
  const price = typeof listing.price === 'number' ? listing.price : null;
  const messageId = stepMessageId(id, 0);
  const history = [{ type: 'requested', by: uid, at: now, msg: messageId }];

  const created = await aw('POST', T('orders'), {
    rowId: id,
    data: {
      listing_id: listingId,
      seller_id: sellerId,
      buyer_id: uid,
      community_id: String(listing.community_id ?? seller.community_id ?? ''),
      conversation_id: conversationIdFor(uid, sellerId),
      title: String(listing.title ?? 'Item').slice(0, 200),
      photo_url: photos[0] ?? null,
      price,
      quantity,
      note: note || null,
      status: 'requested',
      history: JSON.stringify(history),
      created_at: now,
      updated_at: now,
    },
    permissions: [readPerm(uid), readPerm(sellerId)],
  });
  if (!created.ok || !created.json) {
    return json({ message: 'Couldn’t place the order. Try again.', code: 'server' }, 502);
  }

  const body = requestText({
    title: String(listing.title ?? 'this'), price, quantity, note, sellerFirst: firstName(seller),
  });
  const sent = await postMessage(uid, sellerId, body, messageId, { type: 'listing', id: listingId });
  if (!sent.ok) {
    /* No message, no order: the seller would never hear about it. */
    await aw('DELETE', `${T('orders')}/${id}`);
    return json({ message: sent.message, code: sent.code }, sent.status);
  }

  return json({ data: { order: created.json, conversation: sent.conversation, message: sent.message } }, 201);
}

/* ── order_update { order_id, action, expect?, ready_by?, pickup?, code?, reason? } ── */
export async function updateOrder(uid: string, args: Args) {
  const orderId = String(args.order_id ?? '');
  const action = String(args.action ?? '') as OrderAction;
  if (!isValidRowId(orderId)) return json({ message: 'Order not found', code: 'not_found' }, 404);

  const order = await getRow('orders', orderId);
  if (!order || !genuine(order)) return json({ message: 'Order not found', code: 'not_found' }, 404);
  const role = roleOf(order, uid);
  if (!role) return json({ message: 'Order not found', code: 'not_found' }, 404);

  const status = order.status as OrderStatus;
  /* The screen says which state it was looking at. If the other person moved
     the order meanwhile, answer with the order as it is now instead of acting
     on a picture that is out of date. */
  if (args.expect && args.expect !== status) {
    return json({ message: 'This order just changed.', code: 'stale', data: { order } }, 409);
  }
  if (!canDo(status, role, action)) {
    return json({ message: 'That isn’t possible for this order any more.', code: 'not_allowed', data: { order } }, 409);
  }

  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();

  /* Ready-by is the seller's promise; pickup is agreed between both. */
  if (args.ready_by !== undefined && role === 'seller') {
    if (args.ready_by === null || args.ready_by === '') patch.ready_by = null;
    else {
      const t = Date.parse(String(args.ready_by));
      if (Number.isNaN(t)) return json({ message: 'That date didn’t make sense.', code: 'invalid' }, 400);
      patch.ready_by = new Date(t).toISOString();
    }
  }
  if (args.pickup !== undefined) {
    const pickup = cleanText(args.pickup, PICKUP_MAX);
    if (pickup) {
      const hit = findObjectionable(pickup);
      if (hit) return json({ message: objectionableMessage(hit), code: 'objectionable' }, 422);
    }
    patch.pickup = pickup || null;
  }
  const reason = cleanText(args.reason, REASON_MAX);
  if (reason) {
    const hit = findObjectionable(reason);
    if (hit) return json({ message: objectionableMessage(hit), code: 'objectionable' }, 422);
  }

  let verified = false;
  if (action === 'done' && args.code) {
    if (tooManyTries(orderId)) {
      return json({ message: 'Too many tries. Finish without the code, or try again in a few minutes.', code: 'too_many_tries' }, 429);
    }
    if (!codeMatches(orderId, String(args.code))) {
      return json({ message: 'That code doesn’t match. Check it with the buyer, or finish without it.', code: 'wrong_code' }, 422);
    }
    verified = true;
  }

  const next = nextStatus(status, action);
  if (action === 'details' && patch.ready_by === undefined && patch.pickup === undefined) {
    return json({ data: { order } });
  }
  patch.status = next;
  patch.updated_at = now;
  if (next === 'done' || next === 'cancelled') patch.closed_at = now;
  if (action === 'reopen') { patch.closed_at = null; patch.cancelled_by = null; patch.verified = false; }
  if (action === 'cancel') patch.cancelled_by = uid;
  if (verified) patch.verified = true;

  const history = parseHistory(order.history);
  const step = history.length;
  const messageId = stepMessageId(orderId, step);
  const peerId = role === 'seller' ? String(order.buyer_id) : String(order.seller_id);

  const merged = { ...order, ...patch } as Row;
  const body = updateText(action, role, {
    title: String(order.title ?? 'your order'),
    ready_by: (action === 'confirm' || action === 'making' || action === 'details') ? (merged.ready_by as string | null) : null,
    pickup: (action === 'confirm' || action === 'ready' || action === 'details') ? (merged.pickup as string | null) : null,
    verified,
    reason,
    from: status,
  });

  /* The update message first, so the history can point at it. A refusal
     (they blocked each other since, say) does not stop the order changing —
     the step is still real; there is just no one to tell. */
  const sent = await postMessage(uid, peerId, body, messageId, { type: 'listing', id: String(order.listing_id) });
  const event = { type: action, by: uid, at: now, ...(sent.ok ? { msg: messageId } : {}) };
  patch.history = JSON.stringify(appendHistory(history, event));

  const r = await aw('PATCH', `${T('orders')}/${orderId}`, { data: patch });
  if (!r.ok || !r.json) return json({ message: 'Couldn’t update the order. Try again.', code: 'server' }, 502);

  return json({ data: { order: r.json, message: sent.ok ? sent.message : null } });
}

/* ── order_code { order_id } — the buyer's pickup code ─────────────────── */
export async function orderCode(uid: string, args: Args) {
  const orderId = String(args.order_id ?? '');
  const order = isValidRowId(orderId) ? await getRow('orders', orderId) : null;
  if (!order || !genuine(order) || order.buyer_id !== uid) {
    return json({ message: 'Order not found', code: 'not_found' }, 404);
  }
  return json({ data: { code: pickupCode(orderId) } });
}
