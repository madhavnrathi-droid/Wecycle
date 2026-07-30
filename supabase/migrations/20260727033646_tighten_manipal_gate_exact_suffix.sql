-- Migration 20260727033646 · tighten_manipal_gate_exact_suffix
-- Exported from the live project's applied-migration history.
-- Tighten the gate: the previous version accepted any domain with a label
-- containing 'manipal', which accepts `manipal.com.attacker.net` — a domain
-- anyone can register. Now it's an exact suffix match on the real Manipal mail
-- roots (both verified to have live MX): manipal.edu (covers
-- learner.manipal.edu and any future MAHE subdomain) and manipal.com.
--
-- Mirrors isManipalEmail()/MANIPAL_ROOT_DOMAINS in lib/emailDomain.ts. Change
-- both together.
create or replace function public.enforce_manipal_signup_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  addr   text := lower(trim(coalesce(new.email, '')));
  domain text;
begin
  -- No email at all (phone-only / OAuth-only) — nothing for us to police.
  if addr = '' then
    return new;
  end if;

  domain := split_part(addr, '@', 2);
  if domain = '' then
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

  if domain = 'manipal.edu'  or domain like '%.manipal.edu'
  or domain = 'manipal.com'  or domain like '%.manipal.com' then
    return new;
  end if;

  raise exception
    'Wecycle accounts require a Manipal email address (got @%). Use your Manipal email, e.g. name@learner.manipal.edu.', domain
    using errcode = 'check_violation';
end;
$$;

-- INSERT covers new accounts. Also guard the email SWAP, or a member could
-- change their address to a personal one afterwards and keep the account —
-- which would quietly erode the Manipal-only invariant. Scoped to actual email
-- changes so GoTrue's constant housekeeping updates (tokens, last_sign_in_at)
-- are untouched.
drop trigger if exists trg_enforce_manipal_signup_email on auth.users;
create trigger trg_enforce_manipal_signup_email
before insert on auth.users
for each row execute function public.enforce_manipal_signup_email();

drop trigger if exists trg_enforce_manipal_email_change on auth.users;
create trigger trg_enforce_manipal_email_change
before update of email on auth.users
for each row
when (new.email is distinct from old.email)
execute function public.enforce_manipal_signup_email();
