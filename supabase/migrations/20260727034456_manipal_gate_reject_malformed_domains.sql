-- Migration 20260727034456 · manipal_gate_reject_malformed_domains
-- Exported from the live project's applied-migration history.
create or replace function public.enforce_manipal_signup_email()
returns trigger
language plpgsql
security definer
set search_path = public
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
  -- Mirrors DOMAIN_EXEMPT_EMAILS in lib/emailDomain.ts.
  if addr in (
    'playreview@wecycle.page',
    'wecycle.page@gmail.com',
    'madhav.n.rathi@gmail.com'
  ) then
    return new;
  end if;

  -- Must be a syntactically real hostname first. A bare suffix test would accept
  -- '.manipal.edu' (empty first label), which cannot exist in DNS and so can
  -- never receive a confirmation code. Mirrors HOSTNAME in lib/emailDomain.ts.
  if domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$' then
    raise exception
      'That email address isn''t valid (%). Use your Manipal email, e.g. name@learner.manipal.edu.', addr
      using errcode = 'check_violation';
  end if;

  -- Exact-suffix match on the real Manipal roots. NOT a substring test: a
  -- "contains manipal" rule would accept manipal.com.attacker.net.
  if domain = 'manipal.edu'  or domain like '%.manipal.edu'
  or domain = 'manipal.com'  or domain like '%.manipal.com' then
    return new;
  end if;

  raise exception
    'Wecycle accounts require a Manipal email address (got @%). Use your Manipal email, e.g. name@learner.manipal.edu.', domain
    using errcode = 'check_violation';
end;
$$;
