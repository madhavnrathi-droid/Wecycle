-- Migration 20260526090458 · remove_autoconfirm_for_otp_flow
-- Exported from the live project's applied-migration history.
-- The wecycle_autoconfirm trigger was added for the previous password
-- flow to skip the email-confirmation link. With OTP-based auth, the
-- OTP IS the email confirmation step — and the trigger short-circuits
-- that: by setting email_confirmed_at at INSERT time, Supabase decides
-- "this user is already verified" and immediately returns a session
-- from /otp without ever dispatching the code.
--
-- Drop both the trigger and its function so signInWithOtp() actually
-- emits the verification email and the user has to type the 6-digit
-- code before they're signed in.

drop trigger if exists wecycle_autoconfirm on auth.users;
drop function if exists public.handle_new_user_autoconfirm();
