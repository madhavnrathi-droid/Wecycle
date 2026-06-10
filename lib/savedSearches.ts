/* Saved searches ("notify me when someone posts X").
 *
 * Hybrid store:
 *   - localStorage is the instant, offline-safe mirror (and the only store
 *     in demo mode / signed-out browsing).
 *   - When signed in with a live backend, the `saved_searches` TABLE is the
 *     source of truth — that's what the push-fanout Edge Function matches
 *     new posts against, so a keyword only triggers real phone notifications
 *     once it lands in the DB.
 *
 * Sync model: reads stay synchronous against an in-memory cache (UI never
 * blocks), writes are optimistic (cache + mirror update immediately, DB write
 * fires in the background). syncSavedSearches() reconciles on mount: local
 * entries that never reached the DB get pushed up, then the DB list wins.
 */

import { supabase, hasSupabaseEnv } from './supabase';
import { isDemoMode } from './demoMode';

export interface SavedSearch {
  id: string;
  /** Lowercased keyword/phrase the user wants to be alerted about. */
  query: string;
  /** Epoch ms — set by the caller (we avoid Date.now() here for testability). */
  createdAt: number;
  /** True once this row exists server-side (push notifications active). */
  synced?: boolean;
}

const STORAGE_KEY = 'wecycle.savedSearches.v1';
const EVENT = 'wecycle:savedSearches';
/* Alerts ride on the Requests tab today, so every row is scoped to requests —
   the Edge Function only fans out matching posts within this scope. */
const SCOPE = 'requests';

let _cache: SavedSearch[] | null = null;

function liveBackend(): boolean {
  return hasSupabaseEnv && !isDemoMode();
}

function readMirror(): SavedSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(s => s && typeof s.query === 'string') : [];
  } catch {
    return [];
  }
}

function writeMirror(list: SavedSearch[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — fail soft */
  }
}

function emitChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function cache(): SavedSearch[] {
  if (_cache === null) _cache = readMirror();
  return _cache;
}

function setCache(list: SavedSearch[]): void {
  _cache = list;
  writeMirror(list);
  emitChange();
}

export function getSavedSearches(): SavedSearch[] {
  return [...cache()].sort((a, b) => b.createdAt - a.createdAt);
}

export function hasSavedSearch(query: string): boolean {
  const q = query.trim().toLowerCase();
  return cache().some(s => s.query === q);
}

/* ── DB helpers (all casts mirror lib/messaging.ts — the generated types
      don't know the saved_searches table yet) ─────────────────────── */

type DbRow = { id: string; query: string; created_at: string };

async function dbInsert(query: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('saved_searches' as never)
    .insert({ user_id: user.id, query, scope: SCOPE } as never)
    .select('id' as never)
    .single();
  if (error || !data) return null;
  return (data as unknown as { id: string }).id;
}

async function dbDelete(entry: SavedSearch): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  /* Delete by query, not row id — covers entries that were created locally
     before sync assigned them a DB uuid. */
  await supabase
    .from('saved_searches' as never)
    .delete()
    .eq('user_id' as never, user.id as never)
    .eq('query' as never, entry.query as never);
}

/**
 * Reconcile local mirror ↔ DB. Call on mount when the alerts UI shows.
 *   1. Push up any local-only keywords (pre-sign-in adds, offline adds).
 *   2. Pull the DB list and make it the cache.
 * No-op in demo mode / signed out — local mirror stays authoritative.
 */
export async function syncSavedSearches(): Promise<void> {
  if (!liveBackend()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const local = cache();

  const { data, error } = await supabase
    .from('saved_searches' as never)
    .select('id, query, created_at' as never)
    .eq('user_id' as never, user.id as never);
  if (error) return; /* offline / table missing — keep the mirror */

  const dbRows = (data ?? []) as unknown as DbRow[];
  const dbQueries = new Set(dbRows.map(r => r.query));

  /* 1 — migrate local-only keywords up. unique(user_id,query,scope) makes
     re-runs harmless. */
  const pending = local.filter(s => !dbQueries.has(s.query));
  for (const s of pending) {
    const id = await dbInsert(s.query);
    if (id) dbRows.push({ id, query: s.query, created_at: new Date(s.createdAt).toISOString() });
  }

  /* 2 — DB list becomes the cache (all rows synced ⇒ push is live). */
  setCache(dbRows.map(r => ({
    id: r.id,
    query: r.query,
    createdAt: new Date(r.created_at).getTime() || 0,
    synced: true,
  })));
}

/** Add a keyword. No-ops on empty/duplicate. Returns the updated list.
 *  Optimistic: the list updates instantly; the DB write (which arms real
 *  push notifications) follows in the background. */
export function addSavedSearch(query: string): SavedSearch[] {
  const q = query.trim().toLowerCase().slice(0, 80);
  if (!q || hasSavedSearch(q)) return getSavedSearches();

  const now = typeof performance !== 'undefined' ? Date.now() : 0;
  const entry: SavedSearch = { id: `local_${q}_${now}`, query: q, createdAt: now };
  setCache([...cache(), entry]);

  if (liveBackend()) {
    void dbInsert(q).then(id => {
      if (!id) return;
      setCache(cache().map(s => (s.query === q ? { ...s, id, synced: true } : s)));
    });
  }
  return getSavedSearches();
}

/** Remove by id. Returns the updated list. */
export function removeSavedSearch(id: string): SavedSearch[] {
  const entry = cache().find(s => s.id === id);
  setCache(cache().filter(s => s.id !== id));
  if (entry && liveBackend()) void dbDelete(entry);
  return getSavedSearches();
}

/** Subscribe to changes (same-tab custom event + cross-tab storage event). */
export function onSavedSearchesChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    _cache = null; /* re-hydrate from mirror on cross-tab updates */
    cb();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/** Does this text match any saved search? Case-insensitive substring. */
export function matchesAnySavedSearch(text: string, searches: SavedSearch[]): boolean {
  const t = text.toLowerCase();
  return searches.some(s => t.includes(s.query));
}
