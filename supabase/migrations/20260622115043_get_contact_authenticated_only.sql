-- Migration 20260622115043 · get_contact_authenticated_only
-- Exported from the live project's applied-migration history.
-- Supabase default privileges grant EXECUTE on new public functions to anon,
-- so the earlier `revoke ... from public` didn't remove anon's own grant.
-- Revoke it explicitly: only signed-in users may resolve contacts, so the
-- public anon key can't harvest opted-in emails/phones one-by-one.
revoke execute on function public.get_contact(uuid) from anon;
