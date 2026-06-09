/* Saved searches ("notify me when someone posts X").
 *
 * Campus marketplaces live or die on requests being answered, but a student
 * who needs a cycle today won't keep refreshing the Requests tab for a week.
 * A saved search lets them say "ping me when a cycle shows up" — we persist
 * the keyword locally and surface an in-app match banner the moment a new
 * request (or listing) matches. No push backend required to be useful; when
 * we add Web Push later these same records become the subscription list.
 *
 * Storage is localStorage (per-device), SSR-safe, and change-broadcast so any
 * mounted component re-reads when the set changes (mirrors lib/settings).
 */

export interface SavedSearch {
  id: string;
  /** Lowercased keyword/phrase the user wants to be alerted about. */
  query: string;
  /** Epoch ms — set by the caller (we avoid Date.now() here for testability). */
  createdAt: number;
}

const STORAGE_KEY = 'wecycle.savedSearches.v1';
const EVENT = 'wecycle:savedSearches';

function read(): SavedSearch[] {
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

function write(list: SavedSearch[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* quota / private mode — fail soft */
  }
}

export function getSavedSearches(): SavedSearch[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function hasSavedSearch(query: string): boolean {
  const q = query.trim().toLowerCase();
  return read().some(s => s.query === q);
}

/** Add a keyword. No-ops on empty/duplicate. Returns the updated list. */
export function addSavedSearch(query: string): SavedSearch[] {
  const q = query.trim().toLowerCase();
  if (!q) return getSavedSearches();
  const list = read();
  if (list.some(s => s.query === q)) return getSavedSearches();
  /* Date.now() is fine in the browser at call time (this module never runs in
     a resume-sensitive context); guard for the SSR/never branch. */
  const now = typeof performance !== 'undefined' ? Date.now() : 0;
  list.push({ id: `ss_${q}_${now}`, query: q, createdAt: now });
  write(list);
  return getSavedSearches();
}

export function removeSavedSearch(id: string): SavedSearch[] {
  write(read().filter(s => s.id !== id));
  return getSavedSearches();
}

/** Subscribe to changes (storage event + same-tab custom event). */
export function onSavedSearchesChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
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
