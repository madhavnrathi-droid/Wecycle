-- Migration 20260519181024 · auto_confirm_signups
-- Exported from the live project's applied-migration history.
-- Wecycle policy: no email confirmation step. Users sign up with a password,
-- their record is created with email_confirmed_at already populated, and they
-- can sign in immediately on the very next call.
--
-- We do this with a BEFORE INSERT trigger on auth.users that pre-fills
-- email_confirmed_at + confirmed_at when GoTrue would have left them null.
-- Because the value is set before GoTrue evaluates whether to send a
-- confirmation email, no email is sent either — even if the dashboard's
-- "Confirm email" toggle is still on.
--
-- SECURITY DEFINER so the function runs with the privileges of its owner
-- (postgres), not the calling role (gotrue).

CREATE OR REPLACE FUNCTION public.handle_new_user_autoconfirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  /* Only touch the column when GoTrue left it null — manual admin inserts
     that already provide a value pass through unchanged. */
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  IF NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wecycle_autoconfirm ON auth.users;
CREATE TRIGGER wecycle_autoconfirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_autoconfirm();

COMMENT ON FUNCTION public.handle_new_user_autoconfirm() IS
  'Pre-confirms every new auth.users row so the Wecycle signup flow never needs an email link. Mirrors the effect of mailer_autoconfirm=true without requiring a dashboard toggle.';
