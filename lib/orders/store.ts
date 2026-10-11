'use client';

/* ── Orders, on the device ─────────────────────────────────────────────────
 *
 * One store for every screen that shows an order: the card pinned in a chat,
 * the Orders tab, the Order button on a post. Reads come straight from
 * Appwrite — each row is readable by exactly its buyer and seller — and every
 * change goes through /api/rpc/order_*, which is the only writer (see
 * app/api/_lib/orders.ts and lib/orders/model.ts for the rules).
 *
 * Changes are optimistic: the card moves the moment it is tapped, because a
 * seller marking five orders ready should not wait five round trips. If the
 * server says no, the order snaps back and the reason is returned.
 */

import { useSyncExternalStore } from 'react';
import { Query } from 'appwrite';
import { tables, appwriteClient, APPWRITE_DB, hasAppwriteEnv } from '../appwrite/client';
import { serverRpc } from '../appwrite/rpc';
import { BACKEND } from '../supabase';
import { isDemoMode } from '../demoMode';
import { readPerm } from '../messaging/format';
import { conversationIdFor } from '../messaging/conversationId';
import { ingestServerRows, demoPostMessage, rememberPeer, type Peer } from '../messaging/store';
import { getDemoUploads } from '../demoInventory';
import { USERS } from '../mockData';
import { resolveItemMedia } from '../photos';
import {
  nextStatus, parseHistory, appendHistory, isOpen, requestText, updateText, updateMessageIds,
  type OrderAction, type OrderEvent, type OrderStatus, type Role,
} from './model';

export interface Order {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  conversationId: string;
  title: string;
  photoUrl: string | null;
  price: number | null;
  quantity: number;
  note: string | null;
  status: OrderStatus;
  readyBy: string | null;
  pickup: string | null;
  verified: boolean;
  cancelledBy: string | null;
  history: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface OrdersState {
  me: string | null;
  /** `unavailable`: the orders table isn't there yet. The feature hides
   *  itself rather than offering a button that can only fail, and appears on
   *  its own the first load after the table is created — no release needed. */
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
  orders: Record<string, Order>;
  /** Pickup codes the buyer has been told, by order id. */
  codes: Record<string, string>;
}

const EMPTY: OrdersState = { me: null, status: 'idle', orders: {}, codes: {} };
let state: OrdersState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<OrdersState> | ((s: OrdersState) => Partial<OrdersState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const l of listeners) l();
}

export const getOrdersState = (): OrdersState => state;
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useOrders(): OrdersState {
  return useSyncExternalStore(subscribe, getOrdersState, () => EMPTY);
}

/** Orders exist where their server does: on Appwrite, and in the demo. */
export function ordersAvailable(): boolean {
  return isDemoMode() || (BACKEND === 'appwrite' && hasAppwriteEnv);
}

/* ── Rows ────────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown> & { $id?: string; $permissions?: string[] };

function toOrder(row: Row): Order | null {
  const buyer = String(row.buyer_id ?? ''), seller = String(row.seller_id ?? '');
  if (!row.$id || !buyer || !seller) return null;
  /* Only rows the server wrote: exactly the buyer's and the seller's read. */
  const p = row.$permissions;
  if (Array.isArray(p)) {
    const want = new Set([readPerm(buyer), readPerm(seller)]);
    if (p.length !== 2 || !p.every(x => want.has(String(x)))) return null;
  }
  return {
    id: String(row.$id),
    listingId: String(row.listing_id ?? ''),
    sellerId: seller,
    buyerId: buyer,
    conversationId: String(row.conversation_id ?? conversationIdFor(buyer, seller)),
    title: String(row.title ?? 'Item'),
    photoUrl: (row.photo_url as string | null) ?? null,
    price: typeof row.price === 'number' ? row.price : null,
    quantity: Number(row.quantity ?? 1) || 1,
    note: (row.note as string | null) ?? null,
    status: (row.status as OrderStatus) ?? 'requested',
    readyBy: (row.ready_by as string | null) ?? null,
    pickup: (row.pickup as string | null) ?? null,
    verified: !!row.verified,
    cancelledBy: (row.cancelled_by as string | null) ?? null,
    history: parseHistory(row.history),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function upsert(orders: Order[]): void {
  if (!orders.length) return;
  set(s => {
    const next = { ...s.orders };
    for (const o of orders) {
      const prev = next[o.id];
      /* An older realtime echo must not undo a newer local step. */
      if (prev && Date.parse(prev.updatedAt) > Date.parse(o.updatedAt)) continue;
      next[o.id] = o;
    }
    return { orders: next };
  });
}

/* ── Lifecycle ───────────────────────────────────────────────────────────── */

let stopFns: Array<() => void> = [];
let startedFor: string | null = null;

export function startOrders(uid: string | null): void {
  if (uid === startedFor) return;
  stopOrders();
  if (!uid || !ordersAvailable()) return;
  startedFor = uid;
  set({ ...EMPTY, me: uid, status: 'loading' });

  if (isDemoMode()) { demo.seed(uid); return; }

  void loadOrders();
  try {
    const off = appwriteClient().subscribe(`databases.${APPWRITE_DB}.tables.orders.rows`, (msg: { events?: string[]; payload?: unknown }) => {
      if ((msg.events ?? []).some(e => e.endsWith('.delete'))) return;
      const o = toOrder(msg.payload as Row);
      if (o && (o.buyerId === state.me || o.sellerId === state.me)) upsert([o]);
    });
    stopFns.push(() => { try { off(); } catch { /* closed */ } });
  } catch { /* realtime unavailable — focus refreshes carry it */ }

  const onVisible = () => { if (document.visibilityState === 'visible') void loadOrders(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  stopFns.push(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  });
}

export function stopOrders(): void {
  for (const f of stopFns) { try { f(); } catch { /* gone */ } }
  stopFns = [];
  startedFor = null;
  demo.seeded = false;
  if (state !== EMPTY) set(EMPTY);
}

export async function loadOrders(): Promise<void> {
  const me = state.me;
  if (!me || isDemoMode()) return;
  try {
    const [asBuyer, asSeller] = await Promise.all(['buyer_id', 'seller_id'].map(col =>
      tables().listRows({
        databaseId: APPWRITE_DB, tableId: 'orders',
        queries: [Query.equal(col, me), Query.orderDesc('updated_at'), Query.limit(100)],
      })));
    if (state.me !== me) return;
    const rows = [...asBuyer.rows, ...asSeller.rows] as unknown as Row[];
    const orders = rows.map(toOrder).filter((o): o is Order => !!o);
    set(s => ({ status: 'ready', orders: Object.fromEntries([...Object.values(s.orders), ...orders].map(o => [o.id, o])) }));
    upsert(orders);
  } catch (e) {
    /* A dropped connection: no orders to show is the honest state, and
       nothing else on screen depends on it. A missing table is different —
       see `unavailable`. */
    if (state.me !== me) return;
    const err = e as { code?: number; type?: string };
    if (err?.code === 404 || /not_found/.test(String(err?.type ?? ''))) set({ status: 'unavailable' });
    else set({ status: state.status === 'loading' ? 'error' : state.status });
  }
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

export const roleIn = (o: Order, me: string | null): Role => (o.sellerId === me ? 'seller' : 'buyer');

const byRecent = (a: Order, b: Order) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

/** The orders a chat shows: every open one between the two, newest first,
 *  plus the latest closed one for a few days so a finished order doesn't
 *  vanish the moment it's done. */
export function ordersInConversation(s: OrdersState, conversationId: string): Order[] {
  const all = Object.values(s.orders).filter(o => o.conversationId === conversationId).sort(byRecent);
  const open = all.filter(o => isOpen(o.status));
  if (open.length) return open;
  const recent = all[0];
  return recent && Date.now() - Date.parse(recent.updatedAt) < 3 * 86_400_000 ? [recent] : [];
}

/** The member's own open order for a listing, if they already placed one. */
export function openOrderFor(s: OrdersState, listingId: string): Order | null {
  return Object.values(s.orders).find(o => o.listingId === listingId && o.buyerId === s.me && isOpen(o.status)) ?? null;
}

export function ordersAs(s: OrdersState, role: Role): Order[] {
  return Object.values(s.orders)
    .filter(o => (role === 'seller' ? o.sellerId : o.buyerId) === s.me)
    .sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)) || byRecent(a, b));
}

/** Orders waiting on this member: new requests for a seller, ready ones for
 *  a buyer. What the Orders tab counts. */
export function waitingOnMe(s: OrdersState): number {
  return Object.values(s.orders).filter(o =>
    (o.sellerId === s.me && o.status === 'requested') || (o.buyerId === s.me && o.status === 'ready')).length;
}

/** Chat message ids that are order steps, for drawing them as quiet updates. */
export function orderUpdateIds(s: OrdersState, conversationId: string): Set<string> {
  const ids = new Set<string>();
  for (const o of Object.values(s.orders)) {
    if (o.conversationId === conversationId) for (const id of updateMessageIds(o.history)) ids.add(id);
  }
  return ids;
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

export type OrderResult = { ok: true; order: Order; conversationId: string } | { ok: false; code?: string; message: string };

export interface OrderableItem {
  listingId: string;
  title: string;
  price: number | null;
  photoUrl: string | null;
  seller: Peer;
}

export async function placeOrder(item: OrderableItem, quantity: number, note: string): Promise<OrderResult> {
  const me = state.me;
  if (!me) return { ok: false, message: 'Sign in to order.' };
  rememberPeer(item.seller);
  if (isDemoMode()) return demo.place(item, quantity, note);

  const res = await serverRpc<{ order: Row; conversation?: Row; message?: Row; existing?: boolean }>('order_create', {
    listing_id: item.listingId, quantity, note,
  }, me);
  if (res.error || !res.data?.order) {
    return { ok: false, code: res.error?.code, message: res.error?.message ?? 'Couldn’t place the order. Try again.' };
  }
  const order = toOrder(res.data.order);
  if (!order) return { ok: false, message: 'Couldn’t place the order. Try again.' };
  upsert([order]);
  await ingestServerRows(res.data.conversation, res.data.message);
  return { ok: true, order, conversationId: order.conversationId };
}

export interface StepExtras { ready_by?: string | null; pickup?: string | null; code?: string; reason?: string }

export async function orderStep(orderId: string, action: OrderAction, extras: StepExtras = {}): Promise<OrderResult> {
  const me = state.me;
  const before = state.orders[orderId];
  if (!me || !before) return { ok: false, message: 'Order not found.' };

  /* Optimistic: the card moves now. */
  const optimistic: Order = {
    ...before,
    status: nextStatus(before.status, action),
    ...(extras.ready_by !== undefined ? { readyBy: extras.ready_by } : {}),
    ...(extras.pickup !== undefined ? { pickup: extras.pickup || null } : {}),
    updatedAt: new Date().toISOString(),
  };
  set(s => ({ orders: { ...s.orders, [orderId]: optimistic } }));

  if (isDemoMode()) return demo.step(before, optimistic, action, extras);

  const res = await serverRpc<{ order: Row; message?: Row | null }>('order_update', {
    order_id: orderId, action, expect: before.status, ...extras,
  }, me);
  if (res.error || !res.data?.order) {
    set(s => ({ orders: { ...s.orders, [orderId]: before } }));
    /* Moved on the other side meanwhile: show it as it is now. */
    if (res.error?.code === 'stale' || res.error?.code === 'not_allowed') void refreshOrder(orderId);
    return { ok: false, code: res.error?.code, message: res.error?.message ?? 'Couldn’t update the order. Try again.' };
  }
  const order = toOrder(res.data.order);
  if (order) set(s => ({ orders: { ...s.orders, [orderId]: order } }));
  await ingestServerRows(null, res.data.message ?? null);
  return { ok: true, order: order ?? optimistic, conversationId: before.conversationId };
}

async function refreshOrder(orderId: string): Promise<void> {
  try {
    const row = await tables().getRow({ databaseId: APPWRITE_DB, tableId: 'orders', rowId: orderId });
    const o = toOrder(row as unknown as Row);
    if (o) set(s => ({ orders: { ...s.orders, [orderId]: o } }));
  } catch { /* the next load brings it */ }
}

/** The buyer's pickup code, asked for once and then remembered. */
export async function pickupCodeFor(orderId: string): Promise<string | null> {
  if (state.codes[orderId]) return state.codes[orderId];
  let code: string | null = null;
  if (isDemoMode()) code = demo.code(orderId);
  else {
    const res = await serverRpc<{ code: string }>('order_code', { order_id: orderId }, state.me);
    code = res.data?.code ?? null;
  }
  if (code) set(s => ({ codes: { ...s.codes, [orderId]: code! } }));
  return code;
}

/* ── Demo backend ───────────────────────────────────────────────────────────
 * ?demo=1 shows the app to people and is how these screens are tested, so
 * orders work there too, in memory. The other side answers by itself a few
 * seconds later, so the whole loop can be seen from one phone. */
const demo = {
  seeded: false,
  seq: 0,
  seed(me: string) {
    if (this.seeded) return;
    this.seeded = true;
    /* One order waiting on the member as a seller, so the seller's side can
       be seen without a second phone: someone has asked for one of their
       demo uploads. */
    const mine = getDemoUploads().find(i => i.listingType === 'sell' && typeof i.price === 'number');
    const buyer = USERS[3];
    if (mine && buyer) {
      rememberPeer({ id: buyer.id, name: buyer.name, initials: buyer.initials, color: buyer.color, avatarUrl: null, college: null, allowDms: true });
      const conversationId = conversationIdFor(me, buyer.id);
      const at = new Date(Date.now() - 20 * 60_000).toISOString();
      const msg = demoPostMessage(conversationId, buyer.id, buyer.id, requestText({
        title: mine.title, price: mine.price ?? null, quantity: 1, note: 'Could I pick it up this evening?', sellerFirst: '',
      }));
      const photo = resolveItemMedia(mine).find((m): m is string => typeof m === 'string') ?? null;
      upsert([{
        id: 'demo-order-in', listingId: mine.id, sellerId: me, buyerId: buyer.id, conversationId,
        title: mine.title, photoUrl: photo, price: mine.price ?? null, quantity: 1, note: 'Could I pick it up this evening?',
        status: 'requested', readyBy: null, pickup: null, verified: false, cancelledBy: null,
        history: [{ type: 'requested', by: buyer.id, at, msg }], createdAt: at, updatedAt: at,
      }]);
    }
    set({ status: 'ready' });
  },
  code(orderId: string): string {
    let h = 0;
    for (const ch of orderId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return String(h % 10000).padStart(4, '0');
  },
  place(item: OrderableItem, quantity: number, note: string): OrderResult {
    const me = state.me!;
    const existing = openOrderFor(state, item.listingId);
    if (existing) return { ok: true, order: existing, conversationId: existing.conversationId };
    const conversationId = conversationIdFor(me, item.seller.id);
    const now = new Date().toISOString();
    const id = `demo-order-${++this.seq}`;
    const msg = demoPostMessage(conversationId, item.seller.id, me, requestText({
      title: item.title, price: item.price, quantity, note, sellerFirst: item.seller.name.split(/\s+/)[0],
    }));
    const order: Order = {
      id, listingId: item.listingId, sellerId: item.seller.id, buyerId: me, conversationId,
      title: item.title, photoUrl: item.photoUrl, price: item.price, quantity, note: note || null,
      status: 'requested', readyBy: null, pickup: null, verified: false, cancelledBy: null,
      history: [{ type: 'requested', by: me, at: now, msg }], createdAt: now, updatedAt: now,
    };
    upsert([order]);
    /* The seller confirms a moment later, the way a quick reply would. */
    window.setTimeout(() => {
      const cur = state.orders[id];
      if (!cur || cur.status !== 'requested') return;
      const readyBy = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const body = updateText('confirm', 'seller', { title: cur.title, ready_by: readyBy });
      const m = demoPostMessage(conversationId, cur.sellerId, cur.sellerId, body);
      const at = new Date().toISOString();
      set(s => ({ orders: { ...s.orders, [id]: {
        ...cur, status: 'confirmed', readyBy, updatedAt: at,
        history: appendHistory(cur.history, { type: 'confirm', by: cur.sellerId, at, msg: m }),
      } } }));
    }, 3500);
    return { ok: true, order, conversationId };
  },
  step(before: Order, after: Order, action: OrderAction, extras: StepExtras): OrderResult {
    const me = state.me!;
    if (action === 'done' && extras.code && extras.code !== this.code(before.id)) {
      set(s => ({ orders: { ...s.orders, [before.id]: before } }));
      return { ok: false, code: 'wrong_code', message: 'That code doesn’t match. Check it with the buyer, or finish without it.' };
    }
    const role = roleIn(before, me);
    const peer = role === 'seller' ? before.buyerId : before.sellerId;
    const verified = action === 'done' && !!extras.code;
    const body = updateText(action, role, {
      title: before.title, ready_by: after.readyBy, pickup: after.pickup, verified, reason: extras.reason, from: before.status,
    });
    const msg = demoPostMessage(before.conversationId, peer, me, body);
    const at = new Date().toISOString();
    const order: Order = {
      ...after, verified: verified || (action === 'reopen' ? false : after.verified),
      cancelledBy: action === 'cancel' ? me : action === 'reopen' ? null : after.cancelledBy,
      history: appendHistory(before.history, { type: action, by: me, at, msg }), updatedAt: at,
    };
    set(s => ({ orders: { ...s.orders, [before.id]: order } }));
    return { ok: true, order, conversationId: before.conversationId };
  },
};
