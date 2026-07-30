-- Migration 20260622114847 · lock_profile_contact_via_column_grants
-- Exported from the live project's applied-migration history.
-- A column-level REVOKE is a no-op while a TABLE-level SELECT grant exists
-- (table grant covers every column). To actually hide email/phone we must drop
-- the table-level SELECT and re-grant SELECT only on the non-PII columns. UPDATE
-- /INSERT/DELETE grants are untouched, so users can still edit their own contact
-- and RLS still governs rows. email/phone are now reachable ONLY via get_contact().
-- NOTE: new profile columns added later must be added to this grant list.
revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, full_name, avatar_url, avatar_color, initials, bio, role,
  community_id, badges, impact_score, items_shared_count, items_received_count,
  repairs_helped_count, co2_saved_kg, money_saved, is_online, last_active_at,
  joined_at, updated_at, college_id, graduating_year, course, department, residence,
  contact_email_enabled, contact_whatsapp_enabled, show_online_status, allow_dms,
  show_phone_on_profile, hide_listings_from_search, notification_prefs, theme,
  larger_text, hide_prices_on_feed
) on public.profiles to anon, authenticated;
