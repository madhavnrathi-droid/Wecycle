-- Migration 20260727025134 · enforce_manipal_signup_email
-- Exported from the live project's applied-migration history.
-- Wecycle is a Manipal community: only Manipal email addresses may hold an
-- account. The client gates this before spending an OTP email; this trigger is
-- the authoritative check so hitting /auth/v1/signup directly can't bypass it.
--
-- Rule (mirrors lib/emailDomain.ts): some label of the DOMAIN contains
-- "manipal" — learner.manipal.edu, manipal.edu, mahe.manipal.edu all pass,
-- while manipal@gmail.com does not (the local part is never considered).
--
-- BEFORE INSERT only: existing accounts (including the pre-policy Gmail ones)
-- are untouched and can still sign in.
create or replace function public.enforce_manipal_signup_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  addr    text := lower(coalesce(new.email, ''));
  domain  text := split_part(addr, '@', 2);
  is_manipal boolean;
begin
  -- No email at all (e.g. phone-only signup) — nothing for us to police.
  if addr = '' or domain = '' then
    return new;
  end if;

  -- Exempt: Play Console reviewer (demo-only session) + the admin accounts.
  if addr in (
    'playreview@wecycle.page',
    'wecycle.page@gmail.com',
    'madhav.n.rathi@gmail.com'
  ) then
    return new;
  end if;

  select bool_or(label like '%manipal%')
    into is_manipal
    from unnest(string_to_array(domain, '.')) as label;

  if coalesce(is_manipal, false) then
    return new;
  end if;

  raise exception
    'Wecycle accounts require a Manipal email address (got @%). Sign up with your Manipal email, e.g. name@learner.manipal.edu.', domain
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_manipal_signup_email on auth.users;
create trigger trg_enforce_manipal_signup_email
before insert on auth.users
for each row execute function public.enforce_manipal_signup_email();
