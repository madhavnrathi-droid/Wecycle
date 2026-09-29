'use client';

/* ── Direct messages: the client's copy of the truth ─────────────────────────
 *
 * One store for the whole app, because three places need the same numbers at
 * once: the badge on every screen's top bar, the inbox, and the open thread.
 * Separate fetches per component would disagree for a second after every
 * message — the badge saying 1 while the inbox says 0 — which is exactly the
 * kind of flicker that makes people distrust a messenger.
 *
 * WHERE THINGS COME FROM
 *   reads      straight from Appwrite. Every conversation and message row is
 *              readable by its two members only, so a list query returns the
 *              member's own chats and nothing else.
 *   writes     through /api/rpc (dm_send, dm_mark_read). See
 *              app/api/_lib/messaging.ts for why a browser cannot write them.
 *   live       Appwrite Realtime on both tables, with a slow poll underneath —
 *              a websocket that silently drops (campus wifi, a phone waking
 *              up) must cost a few seconds of lag, never a missing message.
 *
 * TRUST
 *   Rows are accepted only when they carry the exact two-member permission
 *   pair the server writes (isGenuine). The tables still let any member
 *   create rows, so without that check a crafted row could appear in someone
 *   else's inbox claiming to be from a third person.
 *
 * SENDING IS OPTIMISTIC
 *   The bubble appears the instant Send is pressed, with the id the server
 *   will use. The server's copy replaces it by that id, and the realtime echo
 *   of the same row lands on the same id, so a message is never drawn twice
 *   and a retry is never stored twice.
 */

import { Query, ID } from 'appwrite';
import { tables, appwriteClient, APPWRITE_DB, hasAppwriteEnv } from '../appwrite/client';
import { serverRpc } from '../appwrite/rpc';
import { BACKEND } from '../supabase';
import { isDemoMode } from '../demoMode';
import { getBlockedUserIds, onBlocksChange } from '../moderation';
import { USERS, MARKETPLACE_ITEMS, type User } from '../mockData';
import {
  isGenuine, decodeSubject, normalizeBody, previewOf, MESSAGE_MAX,
  type ContextType, type TimelineMessage,
} from './format';
import { conversationIdFor } from './conversationId';

/* ── Shapes ──────────────────────────────────────────────────────────────── */

export interface Peer {
  id: string;
  name: string;
  initials: string;
  color: string;
  avatarUrl: string | null;
  college: string | null;
  allowDms: boolean;
}

/** What a conversation is about — a post by one of its two members. */
export interface ChatContext {
  type: ContextType;
  id: string;
  title: string;
}

export interface Conversation {
  id: string;
  peerId: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string | null;
  context: ChatContext | null;
  /** Exists on the server. False for a thread opened from a post before the
   *  first message — it is drawn, but is nobody's inbox row yet. */
  persisted: boolean;
}

export interface ChatMessage extends TimelineMessage {
  conversationId: string;
  /** Why a send failed, in words the member can act on. */
  error?: { code?: string; message: string };
  /** The context a failed first message was carrying, so Retry sends it too. */
  context?: ChatContext | null;
}

export interface Thread {
  peerId: string;
  messages: ChatMessage[];
  status: 'loading' | 'ready' | 'error';
  hasMore: boolean;
  loadingOlder: boolean;
}

export interface MessagingState {
  me: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  conversations: Record<string, Conversation>;
  peers: Record<string, Peer>;
  unread: Record<string, number>;
  threads: Record<string, Thread>;
  blocked: ReadonlySet<string>;
  /** The thread on screen, which is what decides whether an arriving message
   *  is unread or read-on-arrival. */
  active: string | null;
  /** A post the member opened a chat from, not yet sent with a message. The
   *  thread shows it, and the next message carries it — so asking the same
   *  seller about a second item moves the conversation to that item. */
  pendingContext: Record<string, ChatContext>;
}

/** Who to message, and optionally about what — what a "Message" button on a
 *  post or profile hands to the Messages screen. */
export interface MessageTarget {
  peer: Peer;
  context?: ChatContext | null;
}

/** A post's author, as the chat needs them. */
export function peerFromUser(u: Pick<User, 'id' | 'name' | 'initials' | 'color'> & { college?: string }): Peer {
  return {
    id: u.id, name: u.name, initials: u.initials, color: u.color,
    avatarUrl: null, college: u.college ?? null, allowDms: true,
  };
}

/** Messaging runs where its server does: on Appwrite, and in the demo. */
export function messagingAvailable(): boolean {
  return isDemoMode() || (BACKEND === 'appwrite' && hasAppwriteEnv);
}

/* ── The store ───────────────────────────────────────────────────────────── */

const EMPTY: MessagingState = {
  me: null, status: 'idle', conversations: {}, peers: {}, unread: {}, threads: {},
  blocked: new Set(), active: null, pendingContext: {},
};

let state: MessagingState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<MessagingState> | ((s: MessagingState) => Partial<MessagingState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach(l => l());
}

export const getMessagingState = (): MessagingState => state;
export function subscribeMessaging(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const THREAD_PAGE = 40;
const INBOX_LIMIT = 100;
const POLL_INBOX_MS = 60_000;
const POLL_THREAD_MS = 20_000;

const table = (tableId: string, queries: string[]) =>
  tables().listRows({ databaseId: APPWRITE_DB, tableId, queries });

type Row = Record<string, unknown> & { $id: string; $permissions?: string[] };

function toConversation(row: Row, me: string): Conversation | null {
  const a = String(row.user_a ?? ''), b = String(row.user_b ?? '');
  if (me !== a && me !== b) return null;
  if (!isGenuine(row.$permissions, a, b)) return null;
  const subj = decodeSubject(row.subject as string | null);
  return {
    id: row.$id,
    peerId: me === a ? b : a,
    lastMessage: String(row.last_message ?? ''),
    lastMessageAt: String(row.last_message_at ?? row.created_at ?? ''),
    lastSenderId: (row.last_sender_id as string | null) ?? null,
    context: subj && row.listing_id ? { type: subj.type, id: String(row.listing_id), title: subj.title } : null,
    persisted: true,
  };
}

function toMessage(row: Row, pair: [string, string]): ChatMessage | null {
  if (!isGenuine(row.$permissions, pair[0], pair[1])) return null;
  const sender = String(row.sender_id ?? '');
  if (sender !== pair[0] && sender !== pair[1]) return null;
  return {
    id: row.$id,
    conversationId: String(row.conversation_id ?? ''),
    senderId: sender,
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? row.$createdAt ?? ''),
    readAt: (row.read_at as string | null) ?? null,
    state: 'sent',
  };
}

function toPeer(row: Row): Peer {
  const name = String(row.full_name ?? '').trim() || 'Wecycle member';
  return {
    id: row.$id,
    name,
    initials: String(row.initials ?? '') || name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    color: String(row.avatar_color ?? '#6C63FF'),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    college: (row.college as string | null) ?? null,
    allowDms: row.allow_dms !== false,
  };
}

/** Merge by id, oldest first. The server's copy of a message wins over the
 *  optimistic one — except that a local "failed" never overwrites a row the
 *  server confirms, since the server having it means it was sent. */
function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map(m => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m, error: undefined });
  return [...byId.values()].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
}

/* ── Demo backend ───────────────────────────────────────────────────────────
 * ?demo=1 is how the app is shown to people and how its screens are tested,
 * so messaging works there too — in memory, with the mock members. */
const demo = {
  seeded: false,
  seed(me: string) {
    if (this.seeded) return;
    this.seeded = true;
    const now = Date.now();
    const ago = (m: number) => new Date(now - m * 60_000).toISOString();
    const [u1, u2, u3] = USERS;
    const item = MARKETPLACE_ITEMS.find(i => i.user.id === u1.id) ?? MARKETPLACE_ITEMS[0];
    const peers: Record<string, Peer> = {};
    for (const u of USERS.slice(0, 5)) {
      peers[u.id] = { id: u.id, name: u.name, initials: u.initials, color: u.color, avatarUrl: null, college: null, allowDms: true };
    }
    const c1 = conversationIdFor(me, u1.id), c2 = conversationIdFor(me, u2.id), c3 = conversationIdFor(me, u3.id);
    const mk = (id: string, conv: string, sender: string, body: string, at: string, readAt: string | null): ChatMessage =>
      ({ id, conversationId: conv, senderId: sender, body, createdAt: at, readAt, state: 'sent' });
    const threads: Record<string, Thread> = {
      [c1]: { peerId: u1.id, status: 'ready', hasMore: false, loadingOlder: false, messages: [
        mk('d1', c1, me, `Hi! Is the ${item.title} still available?`, ago(64), ago(60)),
        mk('d2', c1, u1.id, 'Yes it is! Works perfectly, barely used.', ago(58), ago(50)),
        mk('d3', c1, me, 'Great — could I pick it up tomorrow after 5?', ago(50), ago(45)),
        mk('d4', c1, u1.id, 'Tomorrow works. I’m in Hostel Block 7.', ago(6), null),
        mk('d5', c1, u1.id, 'Ping me when you’re outside 🙂', ago(5), null),
      ] },
      [c2]: { peerId: u2.id, status: 'ready', hasMore: false, loadingOlder: false, messages: [
        mk('d6', c2, u2.id, 'Hey, do you still need the Arduino kit?', ago(60 * 26), ago(60 * 25)),
        mk('d7', c2, me, 'I do! Can I borrow it for the weekend?', ago(60 * 25), ago(60 * 24)),
      ] },
      [c3]: { peerId: u3.id, status: 'ready', hasMore: false, loadingOlder: false, messages: [
        mk('d8', c3, u3.id, 'Thanks for the notes, they helped a lot!', ago(60 * 24 * 4), ago(60 * 24 * 4)),
      ] },
    };
    const conv = (id: string, peer: string, ctx: ChatContext | null): Conversation => {
      const last = threads[id].messages[threads[id].messages.length - 1];
      return { id, peerId: peer, lastMessage: previewOf(last.body), lastMessageAt: last.createdAt, lastSenderId: last.senderId, context: ctx, persisted: true };
    };
    set({
      status: 'ready', peers, threads,
      conversations: {
        [c1]: conv(c1, u1.id, { type: 'listing', id: item.id, title: item.title }),
        [c2]: conv(c2, u2.id, null),
        [c3]: conv(c3, u3.id, null),
      },
      unread: { [c1]: 2 },
    });
  },
};

/* ── Lifecycle ───────────────────────────────────────────────────────────── */

let stopFns: Array<() => void> = [];
let startedFor: string | null = null;

/** Start for a signed-in member. Idempotent; a different member resets. */
export function startMessaging(uid: string | null): void {
  if (uid === startedFor) return;
  stopMessaging();
  if (!uid || !messagingAvailable()) return;
  startedFor = uid;
  set({ ...EMPTY, me: uid, status: 'loading' });

  if (isDemoMode()) { demo.seed(uid); return; }

  void refreshBlocked();
  stopFns.push(onBlocksChange(() => { void refreshBlocked(); }));
  void loadInbox();
  subscribeRealtime();

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    void loadInbox({ silent: true });
    if (state.active) void refreshThread(state.active);
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  stopFns.push(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  });

  const inboxTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void loadInbox({ silent: true });
  }, POLL_INBOX_MS);
  const threadTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && state.active) void refreshThread(state.active);
  }, POLL_THREAD_MS);
  stopFns.push(() => { window.clearInterval(inboxTimer); window.clearInterval(threadTimer); });
}

export function stopMessaging(): void {
  for (const f of stopFns) { try { f(); } catch { /* already gone */ } }
  stopFns = [];
  startedFor = null;
  demo.seeded = false;
  if (state !== EMPTY) set(EMPTY);
}

async function refreshBlocked(): Promise<void> {
  try { set({ blocked: await getBlockedUserIds() }); } catch { /* keep the last list */ }
}

/* ── Inbox ───────────────────────────────────────────────────────────────── */

let inboxInFlight: Promise<void> | null = null;

export function loadInbox(opts: { silent?: boolean } = {}): Promise<void> {
  if (isDemoMode()) return Promise.resolve();
  if (inboxInFlight) return inboxInFlight;
  const me = state.me;
  if (!me) return Promise.resolve();
  if (!opts.silent && state.status !== 'ready') set({ status: 'loading' });

  inboxInFlight = (async () => {
    try {
      const res = await table('conversations', [
        Query.or([Query.equal('user_a', me), Query.equal('user_b', me)]),
        Query.orderDesc('last_message_at'),
        Query.limit(INBOX_LIMIT),
      ]);
      if (state.me !== me) return;
      const convs: Record<string, Conversation> = {};
      for (const r of res.rows as unknown as Row[]) {
        const c = toConversation(r, me);
        if (c) convs[c.id] = c;
      }
      /* Keep drafts — threads opened from a post that have no row yet. */
      for (const c of Object.values(state.conversations)) if (!c.persisted && !convs[c.id]) convs[c.id] = c;

      await ensurePeers(Object.values(convs).map(c => c.peerId));
      const unread = await countUnread(me, Object.values(convs).filter(c => c.persisted));
      if (state.me !== me) return;
      /* An open, visible thread has nothing unread by definition. */
      if (state.active && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (unread[state.active]) void markRead(state.active);
        delete unread[state.active];
      }
      set({ conversations: convs, unread, status: 'ready' });
    } catch {
      if (state.me === me && state.status !== 'ready') set({ status: 'error' });
    } finally {
      inboxInFlight = null;
    }
  })();
  return inboxInFlight;
}

async function countUnread(me: string, convs: Conversation[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const ids = convs.filter(c => c.lastSenderId && c.lastSenderId !== me).map(c => c.id);
  /* A conversation whose last word is the member's own may still hold older
     unread messages, but the inbox treats a reply as having read the thread —
     every messenger does, and it saves a query per conversation. */
  if (!ids.length) return out;
  const pairOf = new Map(convs.map(c => [c.id, [me, c.peerId] as [string, string]]));
  for (let i = 0; i < ids.length; i += 100) {
    const res = await table('messages', [
      Query.equal('conversation_id', ids.slice(i, i + 100)),
      Query.isNull('read_at'),
      Query.notEqual('sender_id', me),
      Query.limit(500),
    ]);
    for (const r of res.rows as unknown as Row[]) {
      const conv = String(r.conversation_id);
      const pair = pairOf.get(conv);
      if (pair && toMessage(r, pair)) out[conv] = (out[conv] ?? 0) + 1;
    }
  }
  return out;
}

const peerFetches = new Map<string, Promise<void>>();

async function ensurePeers(ids: string[]): Promise<void> {
  const missing = [...new Set(ids)].filter(id => id && !state.peers[id] && !peerFetches.has(id));
  if (!missing.length) {
    await Promise.all(ids.map(id => peerFetches.get(id)).filter(Boolean));
    return;
  }
  const p = (async () => {
    try {
      const res = await table('profiles', [Query.equal('$id', missing), Query.limit(missing.length)]);
      const peers = { ...state.peers };
      for (const r of res.rows as unknown as Row[]) peers[r.$id] = toPeer(r);
      set({ peers });
    } catch { /* a missing name falls back to "Wecycle member" */ }
  })();
  for (const id of missing) peerFetches.set(id, p);
  await p;
  for (const id of missing) peerFetches.delete(id);
}

/** Register someone the member is about to message, from a post or a
 *  profile, so the thread can draw their name before any fetch returns. */
export function rememberPeer(peer: Peer): void {
  if (state.peers[peer.id]) return;
  set(s => ({ peers: { ...s.peers, [peer.id]: peer } }));
}

/* ── Threads ─────────────────────────────────────────────────────────────── */

/** Open the thread with a member, creating a local draft when none exists.
 *  Returns the conversation id — the same one the server will use. */
export function openConversationWith(peerId: string, context?: ChatContext | null): string | null {
  const me = state.me;
  if (!me || peerId === me) return null;
  const id = conversationIdFor(me, peerId);
  const existing = state.conversations[id];
  if (!existing) {
    set(s => ({
      conversations: {
        ...s.conversations,
        [id]: { id, peerId, lastMessage: '', lastMessageAt: new Date().toISOString(), lastSenderId: null, context: null, persisted: false },
      },
    }));
  }
  set(s => {
    const pendingContext = { ...s.pendingContext };
    if (context && s.conversations[id]?.context?.id !== context.id) pendingContext[id] = context;
    else delete pendingContext[id];
    return { pendingContext };
  });
  void ensurePeers([peerId]);
  return id;
}

export function setActiveConversation(id: string | null): void {
  if (state.active === id) return;
  set({ active: id });
  if (id) {
    const t = state.threads[id];
    if (!t || t.status === 'error') void loadThread(id);
    else void refreshThread(id);
    if (state.unread[id]) void markRead(id);
  }
}

export async function loadThread(id: string): Promise<void> {
  const me = state.me;
  const conv = state.conversations[id];
  if (!me || !conv) return;
  if (isDemoMode()) {
    /* The demo holds every thread in memory; one that isn't there is new. */
    if (!state.threads[id]) {
      set(s => ({ threads: { ...s.threads, [id]: { peerId: conv.peerId, messages: [], status: 'ready', hasMore: false, loadingOlder: false } } }));
    }
    return;
  }
  const pair: [string, string] = [me, conv.peerId];
  set(s => ({ threads: { ...s.threads, [id]: { peerId: conv.peerId, messages: s.threads[id]?.messages ?? [], status: 'loading', hasMore: false, loadingOlder: false } } }));
  try {
    const res = await table('messages', [
      Query.equal('conversation_id', id),
      Query.orderDesc('created_at'),
      Query.limit(THREAD_PAGE),
    ]);
    const rows = res.rows as unknown as Row[];
    const msgs = rows.map(r => toMessage(r, pair)).filter((m): m is ChatMessage => !!m);
    set(s => ({
      threads: {
        ...s.threads,
        [id]: {
          peerId: conv.peerId,
          messages: mergeMessages(s.threads[id]?.messages ?? [], msgs),
          status: 'ready', hasMore: rows.length === THREAD_PAGE, loadingOlder: false,
        },
      },
    }));
    /* Opened before the inbox had counted anything (straight from a post, on
       a cold start), so the unread count cannot be trusted to say whether
       there is something to mark — the messages themselves can. */
    if (state.active === id && msgs.some(m => m.senderId !== me && !m.readAt)) void markRead(id);
  } catch {
    set(s => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? { peerId: conv.peerId, messages: [], hasMore: false, loadingOlder: false }), status: 'error' } } }));
  }
}

/** The newest page again, merged — what the poll and a returning tab use. */
async function refreshThread(id: string): Promise<void> {
  const me = state.me;
  const conv = state.conversations[id];
  const t = state.threads[id];
  if (!me || !conv || !t || isDemoMode()) return;
  try {
    const res = await table('messages', [
      Query.equal('conversation_id', id),
      Query.orderDesc('created_at'),
      Query.limit(THREAD_PAGE),
    ]);
    const msgs = (res.rows as unknown as Row[]).map(r => toMessage(r, [me, conv.peerId])).filter((m): m is ChatMessage => !!m);
    set(s => ({ threads: { ...s.threads, [id]: { ...s.threads[id], messages: mergeMessages(s.threads[id]?.messages ?? [], msgs), status: 'ready' } } }));
    const incomingUnread = msgs.some(m => m.senderId !== me && !m.readAt);
    if (incomingUnread && state.active === id) void markRead(id);
  } catch { /* the next poll tries again */ }
}

export async function loadOlder(id: string): Promise<void> {
  const me = state.me;
  const conv = state.conversations[id];
  const t = state.threads[id];
  if (!me || !conv || !t || !t.hasMore || t.loadingOlder || isDemoMode()) return;
  const oldest = t.messages.find(m => m.state === 'sent');
  if (!oldest) return;
  set(s => ({ threads: { ...s.threads, [id]: { ...s.threads[id], loadingOlder: true } } }));
  try {
    const res = await table('messages', [
      Query.equal('conversation_id', id),
      Query.lessThan('created_at', oldest.createdAt),
      Query.orderDesc('created_at'),
      Query.limit(THREAD_PAGE),
    ]);
    const rows = res.rows as unknown as Row[];
    const msgs = rows.map(r => toMessage(r, [me, conv.peerId])).filter((m): m is ChatMessage => !!m);
    set(s => ({ threads: { ...s.threads, [id]: { ...s.threads[id], messages: mergeMessages(s.threads[id].messages, msgs), hasMore: rows.length === THREAD_PAGE, loadingOlder: false } } }));
  } catch {
    set(s => ({ threads: { ...s.threads, [id]: { ...s.threads[id], loadingOlder: false } } }));
  }
}

/* ── Read receipts ───────────────────────────────────────────────────────── */

const readInFlight = new Set<string>();
const readAgain = new Set<string>();

export async function markRead(id: string): Promise<void> {
  const me = state.me;
  if (!me) return;
  /* Locally first: the badge should drop the moment the thread opens. */
  set(s => {
    const unread = { ...s.unread };
    delete unread[id];
    return { unread };
  });
  if (isDemoMode()) return;
  if (!state.conversations[id]?.persisted) return;
  if (readInFlight.has(id)) { readAgain.add(id); return; }
  readInFlight.add(id);
  try {
    await serverRpc('dm_mark_read', { conversation_id: id }, me);
  } finally {
    readInFlight.delete(id);
    if (readAgain.delete(id)) void markRead(id);
  }
}

/* ── Sending ─────────────────────────────────────────────────────────────── */

export type SendResult = { ok: true } | { ok: false; code?: string; message: string };

/** Codes where sending the same text again cannot work — the member has to
 *  change something first, so the bubble offers Edit rather than Retry. */
export const PERMANENT_FAILURES = new Set([
  'objectionable', 'too_long', 'dms_off', 'unavailable', 'you_blocked', 'suspended', 'self', 'not_found', 'bad_context',
]);

export async function sendMessage(conversationId: string, rawBody: string, opts: { retryOf?: string } = {}): Promise<SendResult> {
  const me = state.me;
  const conv = state.conversations[conversationId];
  if (!me || !conv) return { ok: false, message: 'Sign in to send messages.' };

  const body = normalizeBody(rawBody);
  if (!body) return { ok: false, message: 'Write a message first.' };
  if (Array.from(body).length > MESSAGE_MAX) {
    return { ok: false, code: 'too_long', message: `Messages can be up to ${MESSAGE_MAX.toLocaleString('en-IN')} characters.` };
  }

  const previous = opts.retryOf ? state.threads[conversationId]?.messages.find(m => m.id === opts.retryOf) : undefined;
  /* The context goes with the first message about a post — and again whenever
     the member messages the same person about a different post, which moves
     the conversation's subject to the new one. */
  const context = previous?.context !== undefined ? previous.context : (state.pendingContext[conversationId] ?? null);

  const id = opts.retryOf ?? ID.unique();
  const now = new Date().toISOString();
  const optimistic: ChatMessage = {
    id, conversationId, senderId: me, body, createdAt: previous?.createdAt ?? now, readAt: null,
    state: 'sending', context,
  };

  set(s => ({
    threads: {
      ...s.threads,
      [conversationId]: {
        ...(s.threads[conversationId] ?? { peerId: conv.peerId, status: 'ready', hasMore: false, loadingOlder: false }),
        messages: mergeMessages((s.threads[conversationId]?.messages ?? []).filter(m => m.id !== id), [optimistic])
          .map(m => (m.id === id ? { ...m, state: 'sending' as const, error: undefined } : m)),
      },
    },
    conversations: {
      ...s.conversations,
      [conversationId]: { ...s.conversations[conversationId], lastMessage: previewOf(body), lastMessageAt: now, lastSenderId: me },
    },
  }));

  if (isDemoMode()) {
    await new Promise(r => setTimeout(r, 350));
    patchMessage(conversationId, id, { state: 'sent' });
    set(s => {
      const pendingContext = { ...s.pendingContext };
      delete pendingContext[conversationId];
      return {
        pendingContext,
        conversations: { ...s.conversations, [conversationId]: { ...s.conversations[conversationId], persisted: true, ...(context ? { context } : {}) } },
      };
    });
    window.setTimeout(() => patchMessage(conversationId, id, { readAt: new Date().toISOString() }), 1800);
    return { ok: true };
  }

  const res = await serverRpc<{ conversation: Row; message: Row }>('dm_send', {
    to: conv.peerId,
    body,
    message_id: id,
    ...(context ? { context: { type: context.type, id: context.id } } : {}),
  }, me);

  if (res.error || !res.data?.message) {
    const error = { code: res.error?.code, message: friendlyError(res.error?.code, res.error?.message) };
    patchMessage(conversationId, id, { state: 'failed', error });
    return { ok: false, ...error };
  }

  const serverMsg = toMessage(res.data.message, [me, conv.peerId]);
  const serverConv = res.data.conversation ? toConversation(res.data.conversation, me) : null;
  set(s => {
    const pendingContext = { ...s.pendingContext };
    if (context && pendingContext[conversationId]?.id === context.id) delete pendingContext[conversationId];
    return {
    pendingContext,
    threads: {
      ...s.threads,
      [conversationId]: {
        ...s.threads[conversationId],
        messages: serverMsg
          ? mergeMessages(s.threads[conversationId].messages, [serverMsg])
          : s.threads[conversationId].messages.map(m => (m.id === id ? { ...m, state: 'sent' as const } : m)),
      },
    },
    conversations: serverConv
      ? { ...s.conversations, [conversationId]: serverConv }
      : { ...s.conversations, [conversationId]: { ...s.conversations[conversationId], persisted: true } },
    };
  });
  return { ok: true };
}

export function retryMessage(conversationId: string, messageId: string): Promise<SendResult> {
  const m = state.threads[conversationId]?.messages.find(x => x.id === messageId);
  if (!m) return Promise.resolve({ ok: false, message: 'Message not found.' });
  return sendMessage(conversationId, m.body, { retryOf: messageId });
}

/** Drop a failed bubble. Returns its text, so Edit can put it back. */
export function discardMessage(conversationId: string, messageId: string): string {
  const t = state.threads[conversationId];
  const m = t?.messages.find(x => x.id === messageId);
  if (!t || !m || m.state !== 'failed') return '';
  const messages = t.messages.filter(x => x.id !== messageId);
  set(s => {
    const conv = s.conversations[conversationId];
    const last = [...messages].reverse().find(x => x.state === 'sent');
    return {
      threads: { ...s.threads, [conversationId]: { ...t, messages } },
      conversations: conv ? {
        ...s.conversations,
        [conversationId]: last
          ? { ...conv, lastMessage: previewOf(last.body), lastMessageAt: last.createdAt, lastSenderId: last.senderId }
          : { ...conv, lastMessage: '', lastSenderId: null },
      } : s.conversations,
    };
  });
  return m.body;
}

function patchMessage(conversationId: string, id: string, patch: Partial<ChatMessage>): void {
  set(s => {
    const t = s.threads[conversationId];
    if (!t) return {};
    return { threads: { ...s.threads, [conversationId]: { ...t, messages: t.messages.map(m => (m.id === id ? { ...m, ...patch } : m)) } } };
  });
}

function friendlyError(code: string | undefined, message: string | undefined): string {
  if (code === 'rate_limited' || code === 'objectionable' || code === 'dms_off' || code === 'unavailable'
    || code === 'you_blocked' || code === 'suspended' || code === 'too_long' || code === 'not_found') {
    return message ?? 'Not sent.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You’re offline.';
  return 'Not sent.';
}

/* ── Can this member be messaged? ────────────────────────────────────────── */

export async function canMessage(peerId: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  if (isDemoMode() || !state.me) return { ok: true };
  const res = await serverRpc<{ ok: boolean; code?: string; message?: string }>('dm_can_message', { to: peerId }, state.me);
  /* A failed check must not lock someone out of a chat; the send is checked
     again on the server regardless. */
  return res.data ?? { ok: true };
}

/* ── Realtime ────────────────────────────────────────────────────────────── */

function subscribeRealtime(): void {
  const channels = [
    `databases.${APPWRITE_DB}.tables.messages.rows`,
    `databases.${APPWRITE_DB}.tables.conversations.rows`,
  ];
  try {
    const off = appwriteClient().subscribe(channels, (msg: { events?: string[]; payload?: unknown }) => {
      const events = msg.events ?? [];
      const row = msg.payload as Row | undefined;
      if (!row?.$id) return;
      const isCreate = events.some(e => e.endsWith('.create'));
      const isDelete = events.some(e => e.endsWith('.delete'));
      if (isDelete) return;
      if (events.some(e => e.includes('.tables.messages.'))) onMessageRow(row, isCreate);
      else if (events.some(e => e.includes('.tables.conversations.'))) void onConversationRow(row);
    });
    stopFns.push(() => { try { off(); } catch { /* closed */ } });
  } catch { /* realtime unavailable — the polls carry it */ }
}

function onMessageRow(row: Row, isCreate: boolean): void {
  const me = state.me;
  if (!me) return;
  const convId = String(row.conversation_id ?? '');
  const conv = state.conversations[convId];
  if (!conv) {
    /* A first message in a conversation this member hasn't loaded yet — the
       conversation's own event, or the next inbox load, brings it in. */
    if (isCreate) void loadInbox({ silent: true });
    return;
  }
  const m = toMessage(row, [me, conv.peerId]);
  if (!m) return;

  set(s => {
    const t = s.threads[convId];
    const threads = t ? { ...s.threads, [convId]: { ...t, messages: mergeMessages(t.messages, [m]) } } : s.threads;
    const conversations = isCreate && Date.parse(m.createdAt) >= Date.parse(conv.lastMessageAt || '0')
      ? { ...s.conversations, [convId]: { ...conv, lastMessage: previewOf(m.body), lastMessageAt: m.createdAt, lastSenderId: m.senderId, persisted: true } }
      : s.conversations;
    return { threads, conversations };
  });

  if (isCreate && m.senderId !== me) {
    const watching = state.active === convId && document.visibilityState === 'visible';
    if (watching) void markRead(convId);
    else set(s => ({ unread: { ...s.unread, [convId]: (s.unread[convId] ?? 0) + 1 } }));
  }
}

async function onConversationRow(row: Row): Promise<void> {
  const me = state.me;
  if (!me) return;
  const c = toConversation(row, me);
  if (!c) return;
  await ensurePeers([c.peerId]);
  set(s => {
    const prev = s.conversations[c.id];
    /* A realtime row can arrive after a newer local optimistic preview. */
    const keepLocal = prev && Date.parse(prev.lastMessageAt) > Date.parse(c.lastMessageAt);
    return { conversations: { ...s.conversations, [c.id]: keepLocal ? { ...c, lastMessage: prev.lastMessage, lastMessageAt: prev.lastMessageAt, lastSenderId: prev.lastSenderId } : c } };
  });
}

/* ── Derived views ───────────────────────────────────────────────────────── */

/** The post a thread is about right now: one just opened from, else the
 *  conversation's stored subject. */
export function threadContext(s: MessagingState, id: string): ChatContext | null {
  return s.pendingContext[id] ?? s.conversations[id]?.context ?? null;
}

export interface InboxRow {
  conversation: Conversation;
  peer: Peer | null;
  unread: number;
}

/** The inbox, newest first — without blocked members and without drafts
 *  nobody has written in. */
export function inboxRows(s: MessagingState): InboxRow[] {
  return Object.values(s.conversations)
    .filter(c => c.persisted && !s.blocked.has(c.peerId))
    .sort((x, y) => Date.parse(y.lastMessageAt) - Date.parse(x.lastMessageAt))
    .map(c => ({ conversation: c, peer: s.peers[c.peerId] ?? null, unread: s.unread[c.id] ?? 0 }));
}

/** Conversations with something unread — what the badge counts, the way
 *  Instagram counts: threads, not messages, so one chatty person is 1. */
export function unreadConversations(s: MessagingState): number {
  let n = 0;
  for (const [id, count] of Object.entries(s.unread)) {
    const c = s.conversations[id];
    if (count > 0 && c && !s.blocked.has(c.peerId)) n++;
  }
  return n;
}
