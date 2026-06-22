/* Comments mock store. In prod this becomes a `comments` table on Supabase
 * with realtime subscriptions. For now we shape the data exactly like the
 * eventual server payload so the UI components don't change when we swap
 * the backend in.
 *
 * Schema parallels Instagram / WhatsApp DMs:
 *   - Top-level comments + one level of nested replies (deeper threads collapse
 *     to "View N more replies" — we never render more than 2 levels)
 *   - @mentions inside a body are highlighted by the renderer
 *   - Anonymous posting is forbidden by design (safety) — every comment must
 *     have a registered authorId.
 */

import { USERS, type User } from './mockData';
import { supabase } from './supabase';
import type { FeedEntityType } from './api/feed';

export interface Comment {
  id: string;
  postId: string;          /* item id, event id, or lost-found id */
  author: User;            /* never null — see "Anonymous posting forbidden" above */
  body: string;
  createdAt: string;       /* ISO */
  parentId?: string;       /* set on replies; absent on top-level */
  /** Optional explicit mention targets so we can render them as chips even when
   *  the body text doesn't include "@Name". */
  mentions?: { userId: string; name: string }[];
}

/* Seed enough comments across items + events so every product page has
   something to look at. Threads are illustrative, not exhaustive. */
const seedComments: Comment[] = [
  /* Bosch Cordless Drill (m6 typically) ----------------------------------- */
  { id: 'c1', postId: 'm6', author: USERS[1], createdAt: '2025-05-18T15:20:00',
    body: 'Is this rechargeable? Asking because I need it for an installation Saturday morning.' },
  { id: 'c2', postId: 'm6', author: USERS[5], parentId: 'c1', createdAt: '2025-05-18T15:42:00',
    body: 'Yep — comes with two batteries and a charger. Both fully charge in about 30 minutes.',
    mentions: [{ userId: USERS[1].id, name: USERS[1].name }] },
  { id: 'c3', postId: 'm6', author: USERS[3], createdAt: '2025-05-18T17:05:00',
    body: 'Borrowed this last month — solid kit, all bits accounted for. Highly recommend.' },

  /* Sony WH-1000XM4 (m1) -------------------------------------------------- */
  { id: 'c4', postId: 'm1', author: USERS[2], createdAt: '2025-05-19T09:10:00',
    body: 'Are the ear cushions in good shape? Mine just gave out and I want to lend these without ruining them.' },
  { id: 'c5', postId: 'm1', author: USERS[1], parentId: 'c4', createdAt: '2025-05-19T09:18:00',
    body: 'Cushions are perfect — barely any wear. Bought new last August.',
    mentions: [{ userId: USERS[2].id, name: USERS[2].name }] },

  /* IKEA Fira Side Table (m7) -------------------------------------------- */
  { id: 'c6', postId: 'm7', author: USERS[4], createdAt: '2025-05-18T12:00:00',
    body: 'Does it come flat-packed or assembled? My room is up four flights.' },
  { id: 'c7', postId: 'm7', author: USERS[7], parentId: 'c6', createdAt: '2025-05-18T12:40:00',
    body: 'Currently assembled but I can disassemble in 5 min — happy to.',
    mentions: [{ userId: USERS[4].id, name: USERS[4].name }] },

  /* Portable Monitor (m3) ------------------------------------------------- */
  { id: 'c8', postId: 'm3', author: USERS[6], createdAt: '2025-05-19T11:00:00',
    body: 'Does it run off a single USB-C cable? Trying to figure out if it works with my MacBook Air.' },

  /* Yoga Mat + Blocks (m8) ----------------------------------------------- */
  { id: 'c9', postId: 'm8', author: USERS[3], createdAt: '2025-05-19T08:00:00',
    body: 'Hey — would you be open to splitting the set? I only need the blocks.' },

  /* Event comment example (e1) ------------------------------------------- */
  { id: 'c10', postId: 'e1', author: USERS[2], createdAt: '2025-05-18T10:00:00',
    body: 'Will there be a spot for clothes too or strictly electronics?' },
  { id: 'c11', postId: 'e1', author: USERS[0], parentId: 'c10', createdAt: '2025-05-18T10:35:00',
    body: 'Clothes are welcome — we have a separate corner for them.',
    mentions: [{ userId: USERS[2].id, name: USERS[2].name }] },
];

/* In-memory store keyed by postId. We append at runtime when the user posts. */
const store: Map<string, Comment[]> = new Map();
seedComments.forEach(c => {
  const arr = store.get(c.postId) ?? [];
  arr.push(c);
  store.set(c.postId, arr);
});

export function getComments(postId: string): Comment[] {
  return (store.get(postId) ?? []).slice();
}

/** Remove a comment + any of its replies in one pass. Used by admin moderation. */
export function deleteComment(postId: string, commentId: string): boolean {
  const arr = store.get(postId);
  if (!arr) return false;
  const next = arr.filter(c => c.id !== commentId && c.parentId !== commentId);
  if (next.length === arr.length) return false;
  store.set(postId, next);
  return true;
}

export function addComment(c: Omit<Comment, 'id' | 'createdAt'>): Comment {
  const full: Comment = {
    ...c,
    id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const arr = store.get(c.postId) ?? [];
  arr.push(full);
  store.set(c.postId, arr);
  return full;
}

/** Friendly "5m ago" / "2h ago" / "Mar 14" formatter. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Live (Supabase-backed) comments ─────────────────────────────────────
   Demo mode keeps using the in-memory store above. Live mode reads/writes the
   `comments` table; both return the same `Comment` shape so the UI never
   branches on mode itself — it just passes `isDemo` through. */

const COMMENT_SELECT =
  'id, entity_id, parent_comment_id, body, created_at, ' +
  'author:profiles!comments_user_id_fkey(id, full_name, initials, avatar_color, role)';

interface CommentRow {
  id: string;
  entity_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  author: {
    id: string;
    full_name: string | null;
    initials: string | null;
    avatar_color: string | null;
    role: string | null;
  } | null;
}

function rowToComment(r: CommentRow): Comment {
  const a = r.author;
  return {
    id: r.id,
    postId: r.entity_id,
    body: r.body,
    createdAt: r.created_at,
    parentId: r.parent_comment_id ?? undefined,
    author: {
      id: a?.id ?? 'unknown',
      name: a?.full_name || 'Wecycle member',
      initials: a?.initials || (a?.full_name?.[0] ?? 'W').toUpperCase(),
      color: a?.avatar_color || '#6C63FF',
      role: a?.role || 'Member',
      community: '',
      joinedDaysAgo: 0,
      itemsShared: 0,
      itemsReceived: 0,
      impactScore: 0,
      badges: [],
      isOnline: false,
    },
  };
}

/** Load every comment (top-level + replies) for a post. Demo → in-memory. */
export async function fetchComments(
  postId: string, entityType: FeedEntityType, isDemo: boolean,
): Promise<Comment[]> {
  if (isDemo) return getComments(postId);
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('entity_type', entityType)
    .eq('entity_id', postId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as CommentRow[]).map(rowToComment);
}

/** Post a comment. Demo → in-memory; live → insert (author = the auth user;
    RLS enforces user_id = auth.uid()). Returns the persisted comment, or null
    if the write failed (network / not signed in). */
export async function createComment(
  input: {
    postId: string; entityType: FeedEntityType; author: User;
    body: string; parentId?: string; mentions?: { userId: string; name: string }[];
  },
  isDemo: boolean,
): Promise<Comment | null> {
  if (isDemo) {
    return addComment({
      postId: input.postId, author: input.author, body: input.body,
      parentId: input.parentId, mentions: input.mentions,
    });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('comments')
    .insert({
      user_id: user.id,
      entity_type: input.entityType,
      entity_id: input.postId,
      body: input.body,
      parent_comment_id: input.parentId ?? null,
    })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) return null;
  return rowToComment(data as unknown as CommentRow);
}

/** Delete a comment (+ its replies). Demo → in-memory; live → DB delete. RLS
    permits own-comment or admin; replies are removed by the self-FK ON DELETE
    CASCADE. */
export async function removeComment(
  postId: string, commentId: string, _entityType: FeedEntityType, isDemo: boolean,
): Promise<boolean> {
  if (isDemo) return deleteComment(postId, commentId);
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  return !error;
}
