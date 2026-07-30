-- Migration 20260622113816 · get_contact_phone_gate_two_flags
-- Exported from the live project's applied-migration history.
-- Refine: phone is consent-exposed via EITHER the WhatsApp-contact toggle OR
-- the "show phone on profile" toggle. Each consumer still applies its own
-- display rule; the RPC just returns the value when the user opted in anywhere.
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
    case when p.id = auth.uid()
              or coalesce(p.contact_whatsapp_enabled, false)
              or coalesce(p.show_phone_on_profile, false)
         then p.phone else null end as phone,
    coalesce(p.contact_email_enabled, true)      as contact_email_enabled,
    coalesce(p.contact_whatsapp_enabled, false)  as contact_whatsapp_enabled
  from public.profiles p
  where p.id = target;
$$;

revoke all on function public.get_contact(uuid) from public;
grant execute on function public.get_contact(uuid) to authenticated;
