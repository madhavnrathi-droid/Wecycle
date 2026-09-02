-- Migration 20260902135935 · get_contact_honours_allow_dms
-- Exported from the live project's applied-migration history.
--
-- "Allow direct messages" was a switch wired to nothing.
--
-- Settings wrote profiles.allow_dms and the column has existed since May, but
-- no read path consulted it: get_contact handed out the email and phone
-- regardless. A member who turned it off was told "Others can DM you about
-- your posts" was now false while their address kept being served to every
-- signed-in viewer. A privacy control that does nothing is worse than no
-- control, because the member stops watching for the thing they opted out of.
--
-- Enforced here rather than in the client because the client is a suggestion:
-- get_contact is callable directly by any authenticated user, so hiding the
-- button while the RPC still answers is theatre.
--
-- Owners always see their own details, exactly as before. Safe as applied:
-- allow_dms is NOT NULL DEFAULT true and no row had it false, so this changed
-- nobody's behaviour — it only makes the switch mean something when flipped.
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
    case when p.id = auth.uid()
              or (coalesce(p.allow_dms, true) and coalesce(p.contact_email_enabled, true))
         then p.email else null end as email,
    case when p.id = auth.uid()
              or (coalesce(p.allow_dms, true)
                  and (coalesce(p.contact_whatsapp_enabled, false)
                       or coalesce(p.show_phone_on_profile, false)))
         then p.phone else null end as phone,
    -- Report the EFFECTIVE state, not the raw column: a viewer asking "can I
    -- email this person" must be told no when DMs are off, or the UI will
    -- render a contact button with nothing behind it.
    (coalesce(p.allow_dms, true) and coalesce(p.contact_email_enabled, true))
      as contact_email_enabled,
    (coalesce(p.allow_dms, true) and coalesce(p.contact_whatsapp_enabled, false))
      as contact_whatsapp_enabled
  from public.profiles p
  where p.id = target;
$$;

revoke all on function public.get_contact(uuid) from public;
revoke execute on function public.get_contact(uuid) from anon;
grant execute on function public.get_contact(uuid) to authenticated;
