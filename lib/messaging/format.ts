/* ── Direct messages: the rules both ends agree on ──────────────────────────
 *
 * Pure functions, no browser or server imports, so the API route that writes
 * messages and the screens that draw them share ONE definition of what a
 * message may contain, how a conversation's subject is encoded, and which rows
 * are genuine. Two copies of any of these is how the server and the client end
 * up disagreeing about a message the user can see.
 */

/** Longest message a member can send. The column holds 4000; the cap is lower
 *  because a DM that long is a document, and a limit that is never reached is
 *  a limit nobody tested. */
export const MESSAGE_MAX = 2000;

/** Where the counter appears — close enough to the cap to matter, far enough
 *  that it is not noise on every message. */
export const MESSAGE_WARN_AT = 1800;

/** conversations.last_message is varchar(200). */
export const PREVIEW_MAX = 200;

/** What a conversation can be about. Each maps to the table it lives in and
 *  the column that says who posted it — a conversation may only be about
 *  something one of its two members posted. */
export type ContextType = 'listing' | 'request' | 'lost_found' | 'event';

export const CONTEXT_SOURCE: Record<ContextType, { table: string; owner: string }> = {
  listing:    { table: 'listings',           owner: 'user_id' },
  request:    { table: 'requests',           owner: 'user_id' },
  lost_found: { table: 'lost_found_reports', owner: 'user_id' },
  event:      { table: 'events',             owner: 'organizer_id' },
};

export const isContextType = (v: unknown): v is ContextType =>
  typeof v === 'string' && v in CONTEXT_SOURCE;

/* ── The body ────────────────────────────────────────────────────────────── */

/** What is stored. Line breaks are kept — people write addresses and lists —
 *  but runs of blank lines are not, and neither are control characters, which
 *  render as nothing and can hide text from the person reading. */
export function normalizeBody(raw: string): string {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One line for the inbox: whitespace folded, cut on a character boundary. */
export function previewOf(body: string, max = PREVIEW_MAX): string {
  const flat = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return Array.from(flat).slice(0, max - 1).join('').trimEnd() + '…';
}

/* ── The subject ────────────────────────────────────────────────────────────
 *
 * A conversation remembers the most recent thing it was about in two existing
 * columns: listing_id holds the id, and subject holds "<type>:<title>". The
 * type is in the subject because listing_id may point at a request, an event
 * or a lost-and-found report as well — a column per type would be tidier and
 * needs a schema change (see HANDOFF.md → Messaging). */
export function encodeSubject(type: ContextType, title: string): string {
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim();
  return `${type}:${Array.from(clean).slice(0, 280).join('')}`;
}

export function decodeSubject(subject: string | null | undefined): { type: ContextType; title: string } | null {
  if (!subject) return null;
  const i = subject.indexOf(':');
  if (i < 0) return null;
  const type = subject.slice(0, i);
  if (!isContextType(type)) return null;
  return { type, title: subject.slice(i + 1) };
}

/* ── Who can read a row ─────────────────────────────────────────────────────
 *
 * The server writes every conversation and message with exactly two
 * permissions: read for each member. A browser cannot grant read to another
 * member — Appwrite only lets a client grant permissions to roles it holds —
 * so a row carrying both is one the server wrote. Anything else in these
 * tables was made by a client and is ignored, whatever it claims in sender_id.
 */
export const readPerm = (uid: string) => `read("user:${uid}")`;

export function isGenuine(perms: unknown, a: string, b: string): boolean {
  if (!Array.isArray(perms) || !a || !b || a === b) return false;
  const want = new Set([readPerm(a), readPerm(b)]);
  if (perms.length !== want.size) return false;
  return perms.every(p => want.has(String(p)));
}

/** A pair in a fixed order, so one pair of people is one conversation. */
export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Row ids Appwrite accepts: up to 36 chars, alphanumerics plus . - _, not
 *  starting with a special character. Checked because the client chooses the
 *  message id — that is what makes a retry idempotent. */
export const isValidRowId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id);

/* ── Time ────────────────────────────────────────────────────────────────── */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const startOfDay = (t: number): number => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The inbox's compact age: now, 5m, 3h, 2d, 3w, then a date. */
export function inboxTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = Math.max(0, now - t);
  if (d < MIN) return 'now';
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  if (d < 5 * 7 * DAY) return `${Math.floor(d / (7 * DAY))}w`;
  return new Date(t).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
    ...(new Date(t).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** A day heading in a thread: Today, Yesterday, a weekday this week, else a date. */
export function dayLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(t);
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' });
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
    ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
  });
}

/* ── The thread timeline ────────────────────────────────────────────────────
 *
 * Messages become a list of things to draw: day headings, a quiet time marker
 * after a long pause, and bubbles that know where they sit in a run from one
 * sender, so a run reads as one block with one tail rather than a stack of
 * separate balloons. */
export type SendState = 'sending' | 'failed' | 'sent';

export interface TimelineMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  state?: SendState;
}

export type GroupPos = 'single' | 'first' | 'middle' | 'last';

export type TimelineItem<M extends TimelineMessage = TimelineMessage> =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'time'; key: string; label: string }
  | { kind: 'msg'; key: string; msg: M; mine: boolean; pos: GroupPos; receipt: 'sending' | 'failed' | 'sent' | 'seen' | null };

/** Same-sender messages closer than this join one run. */
export const GROUP_GAP = 5 * MIN;
/** A pause at least this long, inside one day, gets its own time marker. */
export const TIME_GAP = HOUR;

export function buildTimeline<M extends TimelineMessage>(messages: M[], me: string, now = Date.now()): TimelineItem<M>[] {
  const out: TimelineItem<M>[] = [];
  const sorted = [...messages].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));

  const joins = (x: M | undefined, y: M | undefined): boolean =>
    !!x && !!y && x.senderId === y.senderId
    && startOfDay(Date.parse(x.createdAt)) === startOfDay(Date.parse(y.createdAt))
    && Math.abs(Date.parse(y.createdAt) - Date.parse(x.createdAt)) < GROUP_GAP;

  /* The last message the member sent that has actually arrived — it alone
     carries Sent/Seen, the way every major messenger does it. Only shown when
     it is the newest message in the thread; once the other person has replied,
     "Seen" under an older bubble is noise. */
  const last = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const t = Date.parse(m.createdAt);

    if (!prev || startOfDay(Date.parse(prev.createdAt)) !== startOfDay(t)) {
      out.push({ kind: 'day', key: `d-${m.id}`, label: dayLabel(m.createdAt, now) });
    } else if (t - Date.parse(prev.createdAt) >= TIME_GAP) {
      out.push({ kind: 'time', key: `t-${m.id}`, label: clockTime(m.createdAt) });
    }

    const withPrev = joins(prev, m) && !(prev && t - Date.parse(prev.createdAt) >= TIME_GAP);
    const withNext = joins(m, next);
    const pos: GroupPos = withPrev ? (withNext ? 'middle' : 'last') : (withNext ? 'first' : 'single');

    const mine = m.senderId === me;
    let receipt: 'sending' | 'failed' | 'sent' | 'seen' | null = null;
    if (mine && m.state === 'sending') receipt = 'sending';
    else if (mine && m.state === 'failed') receipt = 'failed';
    else if (mine && m === last) receipt = m.readAt ? 'seen' : 'sent';

    out.push({ kind: 'msg', key: m.id, msg: m, mine, pos, receipt });
  }
  return out;
}

/* ── Conversation starters ──────────────────────────────────────────────────
 *
 * Offered on a new conversation about a post. They fill the composer rather
 * than send: the first message to a stranger is the one people most want to
 * get right, and a tap that sends on their behalf is a tap they cannot take
 * back. Worded per post type, because "Is this still available?" is the right
 * question about a kettle and the wrong one about a lost wallet. */
export interface StarterContext {
  type: ContextType;
  listingType?: 'free' | 'swap' | 'borrow' | 'sell';
  kind?: 'item' | 'opportunity';
  lostFoundStatus?: 'lost' | 'found' | 'claimed';
}

export function starterPrompts(ctx: StarterContext | null): string[] {
  if (!ctx) return [];
  switch (ctx.type) {
    case 'request':
      return ['I have this — still need it?', 'I can lend you one', 'When do you need it by?'];
    case 'lost_found':
      return ctx.lostFoundStatus === 'found'
        ? ['I think this is mine', 'Where can I collect it?']
        : ['I think I found this', 'Where did you last have it?'];
    case 'event':
      return ['Is there still space?', 'What should I bring?', 'Can I bring a friend?'];
    case 'listing':
    default:
      if (ctx.kind === 'opportunity') {
        return ['Is this still open?', 'I’d like to know more', 'What’s the time commitment?'];
      }
      switch (ctx.listingType) {
        case 'free':   return ['Is this still available?', 'Could I have it?', 'When can I pick it up?'];
        case 'borrow': return ['Is this free to borrow?', 'Could I borrow it this week?', 'How long can I keep it?'];
        case 'swap':   return ['Still up for a swap?', 'What would you swap it for?', 'Can I see it first?'];
        case 'sell':
        default:       return ['Is this still available?', 'Is the price negotiable?', 'Can I see it today?'];
      }
  }
}
