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
import type { Database } from './database.types';

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

  _client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'wecycle-auth',
    },
  });
  return _client;
}

/** Convenience export for components — calls getSupabase lazily on first use. */
export const supabase = new Proxy({} as ReturnType<typeof getSupabase>, {
  get: (_target, prop, receiver) =>
    Reflect.get(getSupabase(), prop, receiver),
});

export type { Database } from './database.types';
