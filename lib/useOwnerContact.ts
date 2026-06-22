'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchContact } from './liveData';

/**
 * Resolve a post owner's contact (email / phone) for the detail screens.
 *
 * The raw email/phone columns are locked down server-side, so live mode can no
 * longer read them off the joined feed row — it fetches them on demand via the
 * get_contact RPC (which returns them only per the owner's share prefs). Demo
 * mode has no Supabase session, so it just uses the mock user's values passed
 * in as `fallback`.
 *
 * Returns `{}` until the live fetch resolves, so callers should treat a missing
 * email/phone as "no channel yet" (the contact buttons already gate on presence).
 */
export function useOwnerContact(
  ownerId: string | undefined,
  fallback: { email?: string; phone?: string },
): { email?: string; phone?: string } {
  const { isDemo } = useAuth();
  const [contact, setContact] = useState<{ email?: string; phone?: string }>(fallback);

  useEffect(() => {
    if (isDemo || !ownerId) { setContact(fallback); return; }
    let alive = true;
    fetchContact(ownerId).then(c => { if (alive) setContact(c); });
    return () => { alive = false; };
    /* `fallback` is a fresh object each render — intentionally excluded so we
       don't refetch on every parent re-render; ownerId/isDemo are what matter. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, isDemo]);

  return contact;
}
