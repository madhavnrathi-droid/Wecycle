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

import { shareUrl } from './shareUrl';
import { ADMIN_EMAIL } from './AuthContext';
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
      /* status omitted — DB defaults to 'open' (check constraint only
         allows open/reviewing/actioned/dismissed). */
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
   getBlockedUsers (detailed — for the Settings manager UI)
   ══════════════════════════════════════════════════════════════════ */

export interface BlockedUser {
  id: string;
  name: string;
  initials: string;
  color: string;
}

/** Blocked users joined with their profile display info. */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const ids = [...(await getBlockedUserIds())];
  if (!ids.length || isDemoMode() || !hasSupabaseEnv) return [];

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, initials, avatar_color')
    .in('id', ids);

  const rows = (data ?? []) as unknown as Array<{
    id: string; full_name: string | null; initials: string | null; avatar_color: string | null;
  }>;
  return rows.map(r => ({
    id: r.id,
    name: r.full_name || 'Wecycle member',
    initials: r.initials || 'W',
    color: r.avatar_color || '#6C63FF',
  }));
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

/** Compose the escalation email a reporter's mail client opens after filing.
 *
 * The in-app trigger already pings admins, so why this as well: a notification
 * is only seen when an admin opens the app, and the reports that matter most —
 * harassment, a threat, something illegal — are exactly the ones that should
 * not wait for that. Mail reaches a phone that is not running Wecycle. The two
 * are deliberately redundant.
 *
 * Everything is prefilled so a distressed person is not asked to compose
 * anything: reason, what was reported, and a direct link to the post. The
 * reporter can still add context in the body before sending, and can cancel
 * without losing the report — the database row is already written by then.
 */
export function reportMailto(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  reporterEmail?: string | null;
}): string {
  const link = isUuid(input.targetId) ? shareUrl(input.targetId) : '(not a linkable post)';
  const subject = `Wecycle report: ${input.reason} (${input.targetType})`;
  const body = [
    `I am reporting a ${input.targetType} on Wecycle.`,
    '',
    `Reason: ${input.reason}`,
    `Link:   ${link}`,
    `Ref:    ${input.targetType}/${input.targetId}`,
    input.reporterEmail ? `From:   ${input.reporterEmail}` : '',
    '',
    input.details ? `What happened:\n${input.details}` : 'What happened:\n',
    '',
    '— sent from the Wecycle app',
  ].filter(l => l !== undefined).join('\n');

  return `mailto:${ADMIN_EMAIL}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
}

/** Only a real uuid can be turned into a /s/ link. Comment and message ids are
 *  not all uuids, so guard rather than emit a link that 404s. */
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}


/* ══════════════════════════════════════════════════════════════════
   SUSPENSION (admins only)
   ══════════════════════════════════════════════════════════════════ */

/**
 * Suspend an account for `days`, or lift a suspension with days = 0.
 *
 * Guideline 1.2 makes removing violating content the developer's job, and a
 * report queue with no consequence at the end of it is not a moderation
 * process — admins could delete a post but not stop the next one. The rule is
 * enforced by the database (block_suspended_authors), so this is the control,
 * not the mechanism: a client that skipped it would change nothing.
 *
 * Returns the expiry, or null when lifted. Throws if the caller is not an admin
 * — that check is in the SECURITY DEFINER function, not here.
 */
export async function setSuspension(
  targetId: string,
  days: number,
  reason?: string,
): Promise<string | null> {
  if (isDemoMode() || !hasSupabaseEnv) return null;
  const { data, error } = await supabase.rpc('admin_set_suspension' as never, {
    target: targetId,
    days,
    reason: reason ?? null,
  } as never);
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Common lengths, so a moderator picks rather than types. */
export const SUSPENSION_OPTIONS = [
  { days: 3,    label: '3 days' },
  { days: 7,    label: '1 week' },
  { days: 30,   label: '30 days' },
  { days: 3650, label: 'Permanent' },
] as const;
