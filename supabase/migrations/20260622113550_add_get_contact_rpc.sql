-- Migration 20260622113550 · add_get_contact_rpc
-- Exported from the live project's applied-migration history.
-- Single-row contact lookup so the raw email/phone columns can be locked down
-- (a follow-up migration REVOKEs SELECT on them). Returns the OWN row's contact
-- in full; for everyone else, email unless the user disabled it (default on) and
-- phone only if they opted in. SECURITY DEFINER so it can read the columns after
-- the REVOKE; callable only by authenticated users so the public anon key can't
-- harvest contacts in bulk.
create or replace function public.get_contact(target uuid)
returns table (
  email text,
  phone text,
  contact_email_enabled boolean,
  contact_whatsapp_enabled boolean
)
language sql
security definer
set search_path = public
as $$
  select
    case when p.id = auth.uid() or coalesce(p.contact_email_enabled, true)
         then p.email else null end as email,
    case when p.id = auth.uid() or coalesce(p.contact_whatsapp_enabled, false)
         then p.phone else null end as phone,
    coalesce(p.contact_email_enabled, true)      as contact_email_enabled,
    coalesce(p.contact_whatsapp_enabled, false)  as contact_whatsapp_enabled
  from public.profiles p
  where p.id = target;
$$;

revoke all on function public.get_contact(uuid) from public;
grant execute on function public.get_contact(uuid) to authenticated;
