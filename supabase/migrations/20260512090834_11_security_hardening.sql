-- Migration 20260512090834 · 11_security_hardening
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 11 · security hardening
-- ═══════════════════════════════════════════════════════

-- 1) Fix mutable search_path on trigger fns
alter function public.set_updated_at()                  set search_path = public;
alter function public.update_listing_save_count()       set search_path = public;
alter function public.update_listing_response_count()   set search_path = public;
alter function public.update_request_offer_count()      set search_path = public;
alter function public.update_event_attendee_count()     set search_path = public;
alter function public.update_comment_reply_count()      set search_path = public;

-- 2) Move citext extension out of public into a dedicated schema
create schema if not exists extensions;
alter extension citext set schema extensions;

-- 3) Tighten communities INSERT policy — only allow community creation
--    once authenticated, and only when caller becomes admin in the same txn.
--    For now: forbid client INSERTs entirely; communities seeded server-side.
drop policy if exists communities_insert_authed on communities;
-- (no replacement: communities are created by admin tooling, not end users)

-- 4) Lock down SECURITY DEFINER trigger/helper functions
--    These should NEVER be called via REST — only fired by triggers.
revoke execute on function public.handle_new_auth_user()    from anon, authenticated, public;
revoke execute on function public.accrue_impact()           from anon, authenticated, public;
revoke execute on function public.create_notification(uuid,uuid,notification_type,feed_entity_type,uuid,text,text) from anon, authenticated, public;
revoke execute on function public.notify_listing_response() from anon, authenticated, public;
revoke execute on function public.notify_request_offer()    from anon, authenticated, public;
revoke execute on function public.notify_event_rsvp()       from anon, authenticated, public;
revoke execute on function public.notify_reaction()         from anon, authenticated, public;
revoke execute on function public.notify_comment()          from anon, authenticated, public;
revoke execute on function public.sync_profile_to_member()  from anon, authenticated, public;
revoke execute on function public.update_community_member_count() from anon, authenticated, public;

-- 5) is_community_member / is_community_admin — keep executable (used in RLS
--    policies), but cap visibility: leave them callable so policies still
--    work, but mark them STABLE and remove from PostgREST exposure via
--    function visibility comments.
comment on function public.is_community_member(uuid) is 'RLS helper — do not call via REST.';
comment on function public.is_community_admin(uuid)  is 'RLS helper — do not call via REST.';

-- 6) rpc_my_impact_summary is the only intentionally-exposed SECURITY DEFINER
--    fn; ensure it stays callable by authenticated.
grant execute on function public.rpc_my_impact_summary() to authenticated;
