'use client';

/* Messaging data layer — client-side bridge between Supabase's conversations /
 * messages tables and the UI.
 *
 *   - Conversation / Message interfaces: canonical shapes the screens render.
 *   - getOrCreateConversation(): RPC wrapper.
 *   - fetchConversations() / fetchMessages(): read paths.
 *   - sendMessage() / markRead(): write paths.
 *   - subscribeToMessages() / subscribeToConversations(): Realtime helpers.
 *
 * Everything degrades gracefully: with no Supabase env (or demo mode) the
 * functions return in-memory mock data so the UI works end-to-end in preview /
 * demo contexts.
 */

import { supabase, hasSupabaseEnv } from './supabase';
import { isDemoMode } from './demoMode';

/* ══════════════════════════════════════════════════════════════════
   INTERFACES
   ══════════════════════════════════════════════════════════════════ */

export interface Conversation {
  id: string;
  otherUser: {
    id: string;
    name: string;
    initials: string;
    color: string;
  };
  subject: string;
  lastMessage: string;
  lastMessageAt: string;   /* ISO */
  lastSenderId: string;
  unreadCount: number;
  listingId: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;       /* ISO */
  readAt: string | null;   /* ISO | null */
}

/* ══════════════════════════════════════════════════════════════════
   DEMO / IN-MEMORY STORE
   ══════════════════════════════════════════════════════════════════ */

const DEMO_USER_ID = 'demo-user-001';
const DEMO_OTHER_ID = 'demo-other-001';
const DEMO_CONV_ID = 'demo-conv-001';

/** Seeded demo messages so the UI has something to render. */
const _demoMessages: Message[] = [
  {
    id: 'demo-msg-001',
    conversationId: DEMO_CONV_ID,
    senderId: DEMO_OTHER_ID,
    body: 'Hi! Is the vintage bicycle still available?',
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    readAt: new Date(Date.now() - 1 * 3_600_000).toISOString(),
  },
  {
    id: 'demo-msg-002',
    conversationId: DEMO_CONV_ID,
    senderId: DEMO_USER_ID,
    body: 'Yes, it is! Still in great condition. When would you like to pick it up?',
    createdAt: new Date(Date.now() - 1.5 * 3_600_000).toISOString(),
    readAt: new Date(Date.now() - 0.5 * 3_600_000).toISOString(),
  },
  {
    id: 'demo-msg-003',
    conversationId: DEMO_CONV_ID,
    senderId: DEMO_OTHER_ID,
    body: 'Could work tomorrow afternoon. Does 3pm work for you?',
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    readAt: null,
  },
];

const _demoConversations: Conversation[] = [
  {
    id: DEMO_CONV_ID,
    otherUser: {
      id: DEMO_OTHER_ID,
      name: 'Alex Chen',
      initials: 'AC',
      color: '#6C63FF',
    },
    subject: 'Vintage Bicycle',
    lastMessage: 'Could work tomorrow afternoon. Does 3pm work for you?',
    lastMessageAt: _demoMessages[_demoMessages.length - 1].createdAt,
    lastSenderId: DEMO_OTHER_ID,
    unreadCount: 1,
    listingId: null,
  },
];

/* Mutable in-memory state for demo sends / reads. */
let _demoMsgStore: Message[] = [..._demoMessages];
let _demoConvStore: Conversation[] = [..._demoConversations];

/* Lightweight pub/sub so demo subscriptions fire on mutations. */
const _msgListeners = new Map<string, Array<(msg: Message) => void>>();
const _convListeners: Array<() => void> = [];

function _notifyMsgListeners(msg: Message) {
  (_msgListeners.get(msg.conversationId) ?? []).forEach(fn => fn(msg));
}
function _notifyConvListeners() {
  _convListeners.forEach(fn => fn());
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════ */

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

function rpc(fn: string, args: Record<string, unknown>) {
  return (supabase.rpc as unknown as RpcFn)(fn, args);
}

/* ══════════════════════════════════════════════════════════════════
   getOrCreateConversation
   ══════════════════════════════════════════════════════════════════ */

/** Calls the DB RPC `get_or_create_conversation` and returns the conversation
 *  UUID, or null on failure. In demo mode returns the seeded conversation id. */
export async function getOrCreateConversation(
  otherUserId: string,
  listingId?: string,
  subject?: string,
): Promise<string | null> {
  if (!hasSupabaseEnv || isDemoMode()) return DEMO_CONV_ID;

  const { data, error } = await rpc('get_or_create_conversation', {
    _other_user: otherUserId,
    _listing_id: listingId ?? null,
    _subject: subject ?? null,
  });
  if (error || !data) return null;
  return data as string;
}

/* ══════════════════════════════════════════════════════════════════
   fetchConversations
   ══════════════════════════════════════════════════════════════════ */

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  listing_id: string | null;
  subject: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  created_at: string;
  profile_a?: { id: string; full_name?: string | null; initials?: string | null; avatar_color?: string | null } | null;
  profile_b?: { id: string; full_name?: string | null; initials?: string | null; avatar_color?: string | null } | null;
  unread?: { count: number }[];
}

/** Fetches all conversations the signed-in user participates in, with the
 *  other participant's display info and an unread-message count. */
export async function fetchConversations(): Promise<Conversation[]> {
  if (!hasSupabaseEnv || isDemoMode()) return _demoConvStore;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await (supabase
    .from('conversations' as never)
    .select(`
      *,
      profile_a:profiles!conversations_user_a_fkey(id, full_name, initials, avatar_color),
      profile_b:profiles!conversations_user_b_fkey(id, full_name, initials, avatar_color)
    ` as never)
    .order('last_message_at' as never, { ascending: false }) as unknown as Promise<{ data: unknown[]; error: unknown }>);

  if (error || !data) return [];

  /* Unread counts — one extra query instead of a nested aggregate (the
     aggregate join blows up the generated types). RLS already scopes the
     rows to this user's conversations, so we just tally client-side. */
  const unreadByConvo = new Map<string, number>();
  try {
    const { data: unreadRows } = await (supabase
      .from('messages' as never)
      .select('conversation_id' as never)
      .is('read_at' as never, null as never)
      .neq('sender_id' as never, user.id as never) as unknown as Promise<{
        data: Array<{ conversation_id: string }> | null;
      }>);
    for (const r of unreadRows ?? []) {
      unreadByConvo.set(r.conversation_id, (unreadByConvo.get(r.conversation_id) ?? 0) + 1);
    }
  } catch { /* unread badges are progressive enhancement — list still renders */ }

  return (data as unknown as ConversationRow[]).map(row => {
    const isA = row.user_a === user.id;
    const otherProfile = isA ? row.profile_b : row.profile_a;
    const otherId = isA ? row.user_b : row.user_a;

    return {
      id: row.id,
      otherUser: {
        id: otherId,
        name: otherProfile?.full_name || 'Wecycle member',
        initials: otherProfile?.initials || 'W',
        color: otherProfile?.avatar_color || '#6C63FF',
      },
      subject: row.subject,
      lastMessage: row.last_message ?? '',
      lastMessageAt: row.last_message_at ?? row.created_at,
      lastSenderId: row.last_sender_id ?? '',
      unreadCount: unreadByConvo.get(row.id) ?? 0,
      listingId: row.listing_id,
    };
  });
}

/* ══════════════════════════════════════════════════════════════════
   fetchMessages
   ══════════════════════════════════════════════════════════════════ */

/** Fetches all messages for a conversation, ordered oldest-first. */
export async function fetchMessages(conversationId: string): Promise<Message[]> {
  if (!hasSupabaseEnv || isDemoMode()) {
    return _demoMsgStore.filter(m => m.conversationId === conversationId);
  }

  const { data, error } = await supabase
    .from('messages' as never)
    .select('*' as never)
    .eq('conversation_id' as never, conversationId as never)
    .order('created_at' as never, { ascending: true });

  if (error || !data) return [];

  return ((data ?? []) as unknown as Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
  }>).map(row => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

/* ══════════════════════════════════════════════════════════════════
   sendMessage
   ══════════════════════════════════════════════════════════════════ */

/** Inserts a message row and returns the canonical Message shape, or null on
 *  failure. In demo mode appends to the in-memory store and notifies listeners. */
export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<Message | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (!hasSupabaseEnv || isDemoMode()) {
    const msg: Message = {
      id: `demo-msg-${Date.now()}`,
      conversationId,
      senderId: DEMO_USER_ID,
      body: trimmed,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    _demoMsgStore = [..._demoMsgStore, msg];
    /* Update the matching conversation's last-message fields. */
    _demoConvStore = _demoConvStore.map(c =>
      c.id !== conversationId ? c : {
        ...c,
        lastMessage: trimmed,
        lastMessageAt: msg.createdAt,
        lastSenderId: DEMO_USER_ID,
      },
    );
    _notifyMsgListeners(msg);
    _notifyConvListeners();
    return msg;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('messages' as never)
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed,
    } as never)
    .select('*' as never)
    .single();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
  };

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/* ══════════════════════════════════════════════════════════════════
   markRead
   ══════════════════════════════════════════════════════════════════ */

/** Stamps read_at = now() on all unread messages in the conversation that were
 *  sent by someone else (i.e. the current user is the recipient). */
export async function markRead(conversationId: string): Promise<void> {
  if (!hasSupabaseEnv || isDemoMode()) {
    /* In demo mode mark messages in the in-memory store. */
    const now = new Date().toISOString();
    _demoMsgStore = _demoMsgStore.map(m =>
      m.conversationId === conversationId &&
      m.senderId !== DEMO_USER_ID &&
      m.readAt === null
        ? { ...m, readAt: now }
        : m,
    );
    _demoConvStore = _demoConvStore.map(c =>
      c.id !== conversationId ? c : { ...c, unreadCount: 0 },
    );
    _notifyConvListeners();
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('messages' as never)
    .update({ read_at: new Date().toISOString() } as never)
    .eq('conversation_id' as never, conversationId as never)
    .neq('sender_id' as never, user.id as never)
    .is('read_at' as never, null as never);
}

/* ══════════════════════════════════════════════════════════════════
   subscribeToMessages
   ══════════════════════════════════════════════════════════════════ */

/** Opens a Supabase Realtime subscription on the messages table for a given
 *  conversation and calls `onNew` for every INSERT.
 *
 *  Returns an unsubscribe function — call it on component unmount. */
export function subscribeToMessages(
  conversationId: string,
  onNew: (msg: Message) => void,
): () => void {
  if (!hasSupabaseEnv || isDemoMode()) {
    /* Wire into the demo pub/sub. */
    const listeners = _msgListeners.get(conversationId) ?? [];
    listeners.push(onNew);
    _msgListeners.set(conversationId, listeners);
    return () => {
      const updated = (_msgListeners.get(conversationId) ?? []).filter(fn => fn !== onNew);
      _msgListeners.set(conversationId, updated);
    };
  }

  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
          read_at: string | null;
        };
        onNew({
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          body: row.body,
          createdAt: row.created_at,
          readAt: row.read_at,
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ══════════════════════════════════════════════════════════════════
   subscribeToConversations
   ══════════════════════════════════════════════════════════════════ */

/** Opens a Realtime subscription on the conversations table (any change) and
 *  calls `onUpdate` so the inbox can refetch. Returns an unsubscribe function. */
export function subscribeToConversations(onUpdate: () => void): () => void {
  if (!hasSupabaseEnv || isDemoMode()) {
    _convListeners.push(onUpdate);
    return () => {
      const idx = _convListeners.indexOf(onUpdate);
      if (idx !== -1) _convListeners.splice(idx, 1);
    };
  }

  const channel = supabase
    .channel('conversations:all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations' },
      () => onUpdate(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
