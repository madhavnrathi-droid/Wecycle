-- Migration 20260519175151 · document_password_policy_v2
-- Exported from the live project's applied-migration history.
-- Password policy for Wecycle, exposed as a small function so the client
-- (or any future integration) can read the source-of-truth without hardcoding.
-- The auth.users password rule lives in the Supabase Auth settings
-- (Dashboard → Authentication → Sign In / Up → Password requirements);
-- this function mirrors that policy in SQL.
CREATE OR REPLACE FUNCTION public.password_policy()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'min_length', 6,
    'requires_uppercase', false,
    'requires_lowercase', false,
    'requires_number', false,
    'requires_special', false,
    'documented_at', '2026-05-19',
    'notes', 'Min 6 chars, no character-class requirements. Mirror Supabase Auth → Password requirements.'
  );
$$;

COMMENT ON FUNCTION public.password_policy() IS
  'Wecycle password rule. Min 6 characters, no required character classes.';

GRANT EXECUTE ON FUNCTION public.password_policy() TO anon, authenticated;
