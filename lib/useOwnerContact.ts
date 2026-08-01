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
  const { user, isDemo } = useAuth();
  const [contact, setContact] = useState<{ email?: string; phone?: string }>(fallback);
  /* Depend on the id, not the user object — the object identity changes on
     every token refresh, which would refetch on a timer for no reason. */
  const viewerId = user?.id ?? null;

  useEffect(() => {
    if (isDemo) { setContact(fallback); return; }
    if (!ownerId) { setContact({}); return; }

    /* Clear first. Without this the hook kept serving the PREVIOUS owner's
       address while the new fetch was in flight — so stepping post → post
       through the related shelf showed one seller's email on another's post. */
    setContact({});

    /* get_contact is SECURITY DEFINER and executable by `authenticated` only,
       so there is nothing to ask for until the viewer is signed in. viewerId is
       in the dep list precisely so signing in from the post refetches and the
       contact button unlocks without a reload — it previously stayed a sign-in
       prompt forever. */
    if (!viewerId) return;

    let alive = true;
    fetchContact(ownerId).then(c => { if (alive) setContact(c); });
    return () => { alive = false; };
    /* `fallback` is a fresh object each render — intentionally excluded so we
       don't refetch on every parent re-render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, isDemo, viewerId]);

  return contact;
}
