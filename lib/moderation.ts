'use client';

/* Moderation data layer — content reports and user blocks.
 *
 *   - reportContent(): submit a report on a listing, message, user, etc.
 *   - blockUser() / unblockUser(): manage the current user's block list.
 *   - getBlockedUserIds(): returns a cached Set of blocked user IDs.
 *   - onBlocksChange(): subscribe to block-list mutations.
 *
 * All DB calls cast via `as never` to sidestep TypeScript's "Type
 * instantiation is excessively deep" error on generated Supabase types that
 * don't yet include the content_reports / user_blocks tables. This pattern
 * mirrors lib/messaging.ts.
 *
 * Degrades gracefully in demo mode and when Supabase env vars are absent —
 * writes are no-ops, reads return empty data.
 */

import { supabase, hasSupabaseEnv } from './supabase';
import { isDemoMode } from './demoMode';

/* ══════════════════════════════════════════════════════════════════
   PUBLIC TYPES
   ══════════════════════════════════════════════════════════════════ */

export type ReportTargetType =
  | 'listing'
  | 'request'
  | 'lostfound'
  | 'event'
  | 'comment'
  | 'message'
  | 'user';

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  /** Owner of the reported content (optional). */
  targetUserId?: string;
  /** Chosen from REPORT_REASONS, max 60 chars. */
  reason: string;
  /** Optional free-text elaboration, max 1000 chars. */
  details?: string;
}

export const REPORT_REASONS = [
  'Spam or scam',
  'Harassment or hate speech',
  'Sexual content',
  'Violence or threats',
  'Illegal item / activity',
  'Misinformation',
  'Other',
] as const;

/* ══════════════════════════════════════════════════════════════════
   MODULE-LEVEL CACHE + PUB/SUB
   ══════════════════════════════════════════════════════════════════ */

let _cache: Set<string> | null = null;
const _listeners: Set<() => void> = new Set();

function _notify() {
  _listeners.forEach(fn => fn());
}

/* ══════════════════════════════════════════════════════════════════
   reportContent
   ══════════════════════════════════════════════════════════════════ */

/**
 * Submit a content report. Returns true on success, false on failure or demo mode.
 */
export async function reportContent(input: ReportInput): Promise<boolean> {
  if (isDemoMode() || !hasSupabaseEnv) return true; /* silent no-op in demo */

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('content_reports' as never)
    .insert({
      reporter_id: user.id,
      target_type: input.targetType,
      target_id: input.targetId,
      target_user_id: input.targetUserId ?? null,
      reason: input.reason.slice(0, 60),
      details: input.details ? input.details.slice(0, 1000) : null,
      status: 'pending',
    } as never);

  return !error;
}

/* ══════════════════════════════════════════════════════════════════
   blockUser
   ══════════════════════════════════════════════════════════════════ */

/**
 * Block a user — they vanish from feeds and can't message you.
 * Mutates the local cache and notifies subscribers.
 */
export async function blockUser(targetId: string): Promise<boolean> {
  if (isDemoMode() || !hasSupabaseEnv) {
    /* Update cache locally even in demo so UI reacts. */
    if (_cache) _cache.add(targetId);
    _notify();
    return true;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('user_blocks' as never)
    .insert({
      blocker_id: user.id,
      target_id: targetId,
    } as never);

  if (error) return false;

  /* Optimistically update cache. */
  if (_cache) _cache.add(targetId);
  _notify();
  return true;
}

/* ══════════════════════════════════════════════════════════════════
   unblockUser
   ══════════════════════════════════════════════════════════════════ */

/**
 * Remove a block. Mutates the local cache and notifies subscribers.
 */
export async function unblockUser(targetId: string): Promise<boolean> {
  if (isDemoMode() || !hasSupabaseEnv) {
    if (_cache) _cache.delete(targetId);
    _notify();
    return true;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('user_blocks' as never)
    .delete()
    .eq('blocker_id' as never, user.id as never)
    .eq('target_id' as never, targetId as never);

  if (error) return false;

  if (_cache) _cache.delete(targetId);
  _notify();
  return true;
}

/* ══════════════════════════════════════════════════════════════════
   getBlockedUserIds
   ══════════════════════════════════════════════════════════════════ */

/**
 * Returns the set of user IDs the current user has blocked.
 * Results are cached in-memory for the session after the first fetch.
 */
export async function getBlockedUserIds(): Promise<Set<string>> {
  if (isDemoMode() || !hasSupabaseEnv) return new Set();

  if (_cache !== null) return _cache;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    _cache = new Set();
    return _cache;
  }

  const { data, error } = await supabase
    .from('user_blocks' as never)
    .select('target_id' as never)
    .eq('blocker_id' as never, user.id as never);

  if (error || !data) {
    _cache = new Set();
    return _cache;
  }

  _cache = new Set(
    (data as unknown as Array<{ target_id: string }>).map(r => r.target_id),
  );
  return _cache;
}

/* ══════════════════════════════════════════════════════════════════
   clearBlockCache
   ══════════════════════════════════════════════════════════════════ */

/** Force the next call to getBlockedUserIds() to re-fetch from the DB. */
export function clearBlockCache(): void {
  _cache = null;
}

/* ══════════════════════════════════════════════════════════════════
   onBlocksChange
   ══════════════════════════════════════════════════════════════════ */

/**
 * Subscribe to block-list mutations (block/unblock) so feeds can re-filter.
 * Returns an unsubscribe function.
 */
export function onBlocksChange(cb: () => void): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}
