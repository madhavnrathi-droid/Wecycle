'use client';

/* We use @supabase/supabase-js `createClient` with localStorage-backed session
 * persistence rather than @supabase/ssr `createBrowserClient`. This app is a
 * pure client-rendered SPA (every screen is 'use client', no server auth /
 * middleware), and the SSR client's cookie-chunked session proved flaky here:
 * getUser() could report a signed-in user while the access token failed to
 * attach to PostgREST/Storage requests — so writes silently hit RLS as anon
 * and vanished (posts not saving, delete/like doing nothing). localStorage
 * persistence attaches the bearer token reliably on every request. */
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import type { Database } from './database.types';

/* ── Session storage ────────────────────────────────────────────────────────
 * WEB: the default localStorage adapter. Sessions already survive restarts —
 * Supabase rotates the refresh token indefinitely, so a signed-in user stays
 * signed in and we never re-send an OTP.
 *
 * NATIVE (Capacitor): localStorage lives in the WebView's data, which Android
 * and iOS can wipe on a cache clear or under storage pressure — that would
 * silently sign people out and cost another OTP. Persist to Preferences
 * instead (SharedPreferences / UserDefaults), which is app data and survives.
 * Supabase accepts an async adapter here (the same contract React Native's
 * AsyncStorage uses). Loaded lazily so the web bundle never pulls it in.
 */
type PrefsModule = typeof import('@capacitor/preferences');
let prefsPromise: Promise<PrefsModule> | null = null;
function prefs(): Promise<PrefsModule> {
  if (!prefsPromise) prefsPromise = import('@capacitor/preferences');
  return prefsPromise;
}

const nativeSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const { Preferences } = await prefs();
    const { value } = await Preferences.get({ key });
    if (value != null) return value;
    /* One-time migration: anyone signed in on a build before this shipped has
       their session in the WebView's localStorage. Adopt it so updating the
       app doesn't sign them out, then keep it natively from here on. */
    try {
      const legacy = window.localStorage.getItem(key);
      if (legacy != null) {
        await Preferences.set({ key, value: legacy });
        return legacy;
      }
    } catch { /* localStorage unavailable — nothing to migrate */ }
    return null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const { Preferences } = await prefs();
    await Preferences.set({ key, value });
  },
  async removeItem(key: string): Promise<void> {
    const { Preferences } = await prefs();
    await Preferences.remove({ key });
    /* Clear the legacy copy too, or the migration above would resurrect a
       session the user just signed out of. */
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/**
 * Browser Supabase client — uses publishable key, safe to ship to the client.
 * RLS enforces all access controls.
 *
 * Usage:
 *   import { supabase } from '@/lib/supabase';
 *   const { data } = await supabase.from('listings').select('*');
 */

let _client: ReturnType<typeof createClient<Database>> | null = null;

/* Accept either the new "publishable" key (sb_publishable_…) or the legacy
   anon JWT — both work for browser-side access; deployments built before the
   key rotation may still set ANON_KEY, and Supabase's dashboard still surfaces
   both formats. We prefer publishable when present. */
const SUPABASE_BROWSER_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the URL + at least one browser key is present. */
export const hasSupabaseEnv = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL && SUPABASE_BROWSER_KEY
);

/**
 * Build a no-op stub that satisfies the shape used across the codebase so
 * demo-only deployments (no Supabase env) don't crash on import. Every async
 * method resolves to `{ data: null, error: <missing-env> }`; sync helpers
 * return inert objects so chain-builders (`from().select().eq()`) keep working.
 */
function makeStubClient(): ReturnType<typeof createClient<Database>> {
  const missingEnvError = {
    message: 'Supabase env vars not configured — running in demo mode.',
    name: 'MissingSupabaseEnvError',
  };
  const asyncResult = async () => ({ data: null, error: missingEnvError });
  const queryBuilder: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined; // not a thenable
        if (prop === Symbol.asyncIterator) return undefined;
        if (prop === 'single' || prop === 'maybeSingle') return asyncResult;
        return () => queryBuilder;
      },
    },
  );
  const auth: any = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser:    async () => ({ data: { user: null }, error: null }),
    signInWithPassword: asyncResult,
    signInWithOtp: asyncResult,
    signUp: asyncResult,
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  };
  const stub: any = {
    auth,
    from: () => queryBuilder,
    rpc: asyncResult,
    storage: {
      from: () => ({
        upload: asyncResult,
        download: asyncResult,
        remove: asyncResult,
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    removeChannel: () => {},
  };
  return stub;
}

export function getSupabase() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = SUPABASE_BROWSER_KEY;

  if (!url || !key) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        '[wecycle] Supabase env vars missing — using stub client (demo mode only).',
      );
    }
    _client = makeStubClient();
    return _client;
  }

  /* Guarded on `window` so a client component rendering on the server (where
     Capacitor has no bridge) still gets the plain web client. */
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  _client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'wecycle-auth',
      ...(isNative ? { storage: nativeSessionStorage } : {}),
    },
  });
  return _client;
}

/** Convenience export for components — calls getSupabase lazily on first use. */
export const supabase = new Proxy({} as ReturnType<typeof getSupabase>, {
  get: (_target, prop, receiver) =>
    Reflect.get(getSupabase(), prop, receiver),
});

/**
 * Call a Postgres function that isn't in the generated `Database` types.
 *
 * ALWAYS use this instead of casting `supabase.rpc` at the call site.
 * supabase-js implements the method as `rpc(fn, args) { return
 * this.rest.rpc(...) }`, so lifting it off the client —
 *
 *     const f = supabase.rpc as unknown as (…) => …;  await f(name, args);
 *     await (supabase.rpc as unknown as (…) => …)(name, args);
 *
 * — invokes it with `this` undefined and throws `Cannot read properties of
 * undefined (reading 'rest')`. Both spellings look like ordinary type
 * narrowing and neither is a type error, which is why three call sites shipped
 * with it: it silently disabled profile loading (the throw escaped
 * fetchContact into AuthContext's Promise.all, leaving every signed-in user
 * with a null profile), push registration, and account deletion.
 *
 * Binding to `getSupabase()` rather than the Proxy keeps `this` pointing at the
 * real client, so the internal `this.rest` lookup resolves normally.
 */
export async function rpcUntyped<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<{ data: T | null; error: { message?: string } | null }> {
  const client = getSupabase() as unknown as {
    rpc: (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: { message?: string } | null }>;
  };
  return client.rpc(fn, args);
}

export type { Database } from './database.types';
