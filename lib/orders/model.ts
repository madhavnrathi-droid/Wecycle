/* ── Orders: the rules both ends agree on ───────────────────────────────────
 *
 * Pure functions, no browser or server imports — the API route that changes
 * orders and the screens that draw them share ONE definition of what an order
 * can do next and what each step says.
 *
 * ── WHAT AN ORDER IS HERE ──────────────────────────────────────────────────
 *
 * A student seller is one person with a phone, not a shop with a back office.
 * So an order is not a checkout. It is a small agreement pinned to the chat
 * between two people: what was asked for, where it has got to, and how it
 * ends. Everything else — price changes, colours, "can we do Friday?" — is
 * just the conversation, which carries on underneath as it always has.
 *
 * ── LOOSE ON PURPOSE ───────────────────────────────────────────────────────
 *
 * Real handovers do not follow a funnel. People meet before anything is
 * "confirmed", make the thing faster than they said, change their minds, and
 * come back. A strict machine turns each of those into a dead end, so this
 * one has very few rules:
 *
 *   - the seller can put an open order at any stage, forwards or back
 *   - either side can finish it, at any stage: the seller hands it over, or
 *     the buyer taps "Got it"
 *   - either side can cancel an open order
 *   - the seller can reopen a finished or cancelled one
 *   - the pickup code is proof, never a gate: entering it marks the handover
 *     as checked; skipping it still finishes the order
 *
 * The only hard lines are about who is who — a buyer cannot mark their own
 * order "ready" — because those are the lines that make the record mean
 * something.
 */

export type OrderStatus = 'requested' | 'confirmed' | 'making' | 'ready' | 'done' | 'cancelled';
export type Role = 'buyer' | 'seller';

/** Everything an order can be asked to do. `details` edits the ready-by date
 *  or the pickup place without moving the order. */
export type OrderAction =
  | 'confirm' | 'making' | 'ready' | 'done' | 'received' | 'cancel' | 'reopen' | 'details';

export const OPEN_STATUSES: readonly OrderStatus[] = ['requested', 'confirmed', 'making', 'ready'];
export const isOpen = (s: OrderStatus): boolean => OPEN_STATUSES.includes(s);

/** The stages shown as a progress strip. Cancelled is not a stage. */
export const STAGES: readonly OrderStatus[] = ['requested', 'confirmed', 'making', 'ready', 'done'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  making: 'Making',
  ready: 'Ready',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** Caps, shared so the screen stops typing where the server would refuse. */
export const NOTE_MAX = 500;
export const PICKUP_MAX = 120;
export const REASON_MAX = 200;
export const QTY_MAX = 20;
/** History is a log for the two people, not an audit trail; past this the
 *  oldest steps fall off. */
export const HISTORY_MAX = 60;

/* ── Who can do what ─────────────────────────────────────────────────────── */

const SELLER_OPEN: OrderAction[] = ['confirm', 'making', 'ready', 'done', 'cancel', 'details'];
const BUYER_OPEN: OrderAction[] = ['received', 'cancel', 'details'];

export function actionsFor(status: OrderStatus, role: Role): OrderAction[] {
  if (isOpen(status)) {
    /* Moving to the stage you are already at is a no-op, not an option. */
    const stageOf: Partial<Record<OrderAction, OrderStatus>> = { confirm: 'confirmed', making: 'making', ready: 'ready' };
    return (role === 'seller' ? SELLER_OPEN : BUYER_OPEN).filter(a => stageOf[a] !== status);
  }
  return role === 'seller' ? ['reopen'] : [];
}

export const canDo = (status: OrderStatus, role: Role, action: OrderAction): boolean =>
  actionsFor(status, role).includes(action);

/** Where an action leaves the order. `details` stays put. */
export function nextStatus(current: OrderStatus, action: OrderAction): OrderStatus {
  switch (action) {
    case 'confirm':  return 'confirmed';
    case 'making':   return 'making';
    case 'ready':    return 'ready';
    case 'done':
    case 'received': return 'done';
    case 'cancel':   return 'cancelled';
    case 'reopen':   return 'confirmed';
    default:         return current;
  }
}

/** The one thing each side is most likely to do next — the button on the
 *  card. Everything else lives one tap away under "More". */
export function primaryAction(status: OrderStatus, role: Role): OrderAction | null {
  if (role === 'seller') {
    switch (status) {
      case 'requested': return 'confirm';
      case 'confirmed':
      case 'making':    return 'ready';
      case 'ready':     return 'done';
      default:          return null;
    }
  }
  return status === 'ready' ? 'received' : null;
}

export const ACTION_LABEL: Record<OrderAction, string> = {
  confirm: 'Confirm',
  making: 'Started making',
  ready: 'Mark ready',
  done: 'Handed over',
  received: 'Got it',
  cancel: 'Cancel order',
  reopen: 'Reopen',
  details: 'Edit pickup',
};

/** What the card says under the title, from the reader's side. */
export function statusLine(o: { status: OrderStatus; ready_by?: string | null; pickup?: string | null; verified?: boolean },
  role: Role, peerFirst: string, cancelledByMe?: boolean): string {
  const when = o.ready_by ? ` · by ${shortDate(o.ready_by)}` : '';
  const where = o.pickup ? ` · ${o.pickup}` : '';
  switch (o.status) {
    case 'requested':
      return role === 'seller' ? `New order · reply when you can` : `Sent to ${peerFirst}`;
    case 'confirmed':
      return role === 'seller' ? `Confirmed${when}` : `${peerFirst} confirmed${when}`;
    case 'making':
      return role === 'seller' ? `Making${when}` : `${peerFirst} is making it${when}`;
    case 'ready':
      return `Ready for pickup${where}`;
    case 'done':
      return o.verified ? 'Handed over · code checked' : 'Handed over';
    case 'cancelled':
      return cancelledByMe ? 'You cancelled this order' : `${peerFirst} cancelled this order`;
  }
}

/* ── The words that go into the chat ────────────────────────────────────────
 *
 * Every step also posts a short message from whoever took it. It is what the
 * other person gets a badge and a preview for, it is the order's history, and
 * it reads as plain sense in an app version that has never heard of orders.
 * Written the way a person would say it, because it goes out under their
 * name. */

export interface OrderTextInput {
  title: string;
  quantity?: number | null;
  price?: number | null;
  note?: string | null;
  sellerFirst?: string;
  ready_by?: string | null;
  pickup?: string | null;
  verified?: boolean;
  reason?: string | null;
  /** For `cancel`: the status the order was in, since a seller declining a
   *  fresh request is said differently from one calling off a confirmed one. */
  from?: OrderStatus;
}

export const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function orderTotal(price?: number | null, quantity?: number | null): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return price * Math.max(1, quantity ?? 1);
}

export function requestText(t: OrderTextInput): string {
  const qty = (t.quantity ?? 1) > 1 ? ` × ${t.quantity}` : '';
  const total = orderTotal(t.price, t.quantity);
  const cost = total != null && total > 0 ? ` (${rupees(total)})` : '';
  const hello = t.sellerFirst ? `Hi ${t.sellerFirst}! ` : 'Hi! ';
  const note = t.note?.trim() ? `\n\n${t.note.trim()}` : '';
  return `${hello}I’d like to order ${t.title}${qty}${cost}.${note}`;
}

export function updateText(action: OrderAction, by: Role, t: OrderTextInput): string {
  const when = t.ready_by ? ` · ready by ${shortDate(t.ready_by)}` : '';
  const where = t.pickup ? ` · ${t.pickup}` : '';
  const why = t.reason?.trim() ? ` — ${t.reason.trim()}` : '';
  switch (action) {
    case 'confirm':  return `Order confirmed ✓${when}${where}`;
    case 'making':   return `Started making your ${t.title}${when}`;
    case 'ready':    return `Your ${t.title} is ready for pickup${where}`;
    case 'done':     return t.verified ? 'Handed over ✓ Code checked.' : 'Handed over ✓';
    case 'received': return 'Got it, thank you! ✓';
    case 'reopen':   return `Reopened the order for ${t.title}`;
    case 'details': {
      const parts = [t.ready_by ? `ready by ${shortDate(t.ready_by)}` : '', t.pickup ? `pickup: ${t.pickup}` : ''].filter(Boolean);
      return parts.length ? `Updated the order · ${parts.join(' · ')}` : 'Updated the order';
    }
    case 'cancel':
      if (by === 'seller') {
        return t.from === 'requested' ? `Sorry, I can’t take this order${why}` : `I’ve cancelled the order for ${t.title}${why}`;
      }
      return `I’ve cancelled my order for ${t.title}${why}`;
  }
}

/* ── History ─────────────────────────────────────────────────────────────── */

export interface OrderEvent {
  type: OrderAction | 'requested';
  by: string;
  at: string;
  /** The chat message this step posted, when it posted one. */
  msg?: string;
}

export function parseHistory(raw: unknown): OrderEvent[] {
  if (Array.isArray(raw)) return raw as OrderEvent[];
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(e => e && typeof e.type === 'string' && typeof e.at === 'string') : [];
  } catch {
    return [];
  }
}

export function appendHistory(history: OrderEvent[], e: OrderEvent): OrderEvent[] {
  const next = [...history, e];
  return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
}

/** Ids of the chat messages that are order steps, so the chat can draw them
 *  as quiet one-line updates instead of speech bubbles. The request itself is
 *  left out: it is a real first message, and reads as one. */
export function updateMessageIds(history: OrderEvent[]): string[] {
  return history.filter(e => e.type !== 'requested' && e.msg).map(e => e.msg!) ;
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

/** "Thu 23 Oct" — a date someone can say out loud. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Free text a person typed, kept to one tidy line or paragraph. */
export function cleanText(raw: unknown, max: number, multiline = false): string {
  let s = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g, '');
  s = multiline ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return Array.from(s.trim()).slice(0, max).join('').trim();
}

export function clampQuantity(raw: unknown): number {
  const n = Math.floor(Number(raw ?? 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, QTY_MAX);
}

/** Whether a listing can be ordered rather than only messaged about: an item
 *  for sale, still open, posted by someone else. */
export function isOrderable(l: { kind?: string | null; listing_type?: string | null; status?: string | null } | null | undefined): boolean {
  if (!l) return false;
  if (l.kind === 'opportunity') return false;
  if ((l.listing_type ?? 'sell') !== 'sell') return false;
  return !l.status || l.status === 'active';
}
