-- Migration 20260622114740 · revoke_profile_contact_columns
-- Exported from the live project's applied-migration history.
-- Lock down the raw PII columns: nobody using the public anon key (anon) or a
-- normal logged-in session (authenticated) can SELECT email/phone off profiles
-- anymore — not in the feed joins, not directly, not in bulk. The only way to
-- read them is the get_contact() SECURITY DEFINER RPC, which returns one user
-- at a time, filtered by that user's share prefs. UPDATE is untouched, so users
-- can still edit their own email/phone. Reversible: re-GRANT to roll back.
revoke select (email, phone) on public.profiles from anon, authenticated;
