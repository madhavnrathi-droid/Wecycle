'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

/**
 * Browser Supabase client — uses publishable key, safe to ship to the client.
 * RLS enforces all access controls.
 *
 * Usage:
 *   import { supabase } from '@/lib/supabase';
 *   const { data } = await supabase.from('listings').select('*');
 */

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabase() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.local.example to .env.local.'
    );
  }

  _client = createBrowserClient<Database>(url, key);
  return _client;
}

/** Convenience export for components — calls getSupabase lazily on first use. */
export const supabase = new Proxy({} as ReturnType<typeof getSupabase>, {
  get: (_target, prop, receiver) =>
    Reflect.get(getSupabase(), prop, receiver),
});

export type { Database } from './database.types';
