/* Demo-mode flag.
 *
 * Default for every fresh visitor is "live, empty" — no mock data shows. We
 * deliberately keep the seeded marketplace / events / lost-found data around
 * so a) we can demo the app to anyone with `?demo=1`, and b) we can run
 * Playwright/visual tests against a populated UI.
 *
 * The flag is sticky once set: `?demo=1` writes to localStorage, `?demo=0`
 * clears it, so users don't have to keep the query string around. The check
 * is sync + SSR-safe (returns `false` on the server).
 *
 * In production we wire this so that:
 *   - `hasSupabaseEnv` AND no `demo` flag → real Supabase reads (empty until
 *     the first user posts)
 *   - `demo` flag set OR no Supabase env → mock data
 */

const STORAGE_KEY = 'wecycle.demo.v1';

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;

  /* URL wins. ?demo=1 enables, ?demo=0 disables, anything else falls through
     to whatever's been stored on this device. */
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get('demo');
    if (param === '1' || param === 'true') {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
      return true;
    }
    if (param === '0' || param === 'false') {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return false;
    }
  } catch {
    /* URLSearchParams throws on weird routes — fall through to storage */
  }

  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Imperative toggle — useful if we add a "show demo data" switch later. */
export function setDemoMode(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
