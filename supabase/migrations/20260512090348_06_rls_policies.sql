-- Migration 20260512090348 · 06_rls_policies
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 06 · Row Level Security policies
-- ═══════════════════════════════════════════════════════

-- Helper: is the current user a member of this community?
create or replace function is_community_member(_community_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = _community_id and user_id = auth.uid()
  ) or exists (
    -- fallback: profile.community_id matches
    select 1 from profiles where id = auth.uid() and community_id = _community_id
  );
$$;

-- Helper: is the current user a moderator/admin of this community?
create or replace function is_community_admin(_community_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = _community_id
      and user_id = auth.uid()
      and role in ('moderator', 'admin')
  );
$$;

-- Enable RLS on all tables
alter table communities          enable row level security;
alter table profiles             enable row level security;
alter table community_members    enable row level security;
alter table categories           enable row level security;
alter table listings             enable row level security;
alter table saves                enable row level security;
alter table listing_responses    enable row level security;
alter table requests             enable row level security;
alter table request_offers       enable row level security;
alter table events               enable row level security;
alter table event_rsvps          enable row level security;
alter table lost_found_reports   enable row level security;
alter table inventory_items      enable row level security;
alter table community_milestones enable row level security;
alter table announcements        enable row level security;
alter table impact_log           enable row level security;
alter table reactions            enable row level security;
alter table comments             enable row level security;
alter table notifications        enable row level security;

-- ── COMMUNITIES ───────────────────────────────────────
create policy communities_select_all on communities
  for select to authenticated, anon using (is_public = true);
create policy communities_insert_authed on communities
  for insert to authenticated with check (true);
create policy communities_update_admin on communities
  for update to authenticated using (is_community_admin(id));

-- ── CATEGORIES ────────────────────────────────────────
create policy categories_select_all on categories
  for select to authenticated, anon using (true);

-- ── PROFILES ──────────────────────────────────────────
create policy profiles_select_all on profiles
  for select to authenticated, anon using (true);
create policy profiles_insert_self on profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on profiles
  for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());
create policy profiles_delete_self on profiles
  for delete to authenticated using (id = auth.uid());

-- ── COMMUNITY_MEMBERS ─────────────────────────────────
create policy members_select_authed on community_members
  for select to authenticated using (true);
create policy members_join_self on community_members
  for insert to authenticated with check (user_id = auth.uid());
create policy members_leave_self on community_members
  for delete to authenticated using (user_id = auth.uid());
create policy members_admin_update on community_members
  for update to authenticated using (is_community_admin(community_id));

-- ── LISTINGS ──────────────────────────────────────────
create policy listings_select_community on listings
  for select to authenticated, anon
  using (status = 'active' or user_id = auth.uid());
create policy listings_insert_self on listings
  for insert to authenticated
  with check (user_id = auth.uid() and is_community_member(community_id));
create policy listings_update_owner on listings
  for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
create policy listings_delete_owner on listings
  for delete to authenticated using (user_id = auth.uid());

-- ── SAVES ─────────────────────────────────────────────
create policy saves_select_self on saves
  for select to authenticated using (user_id = auth.uid());
create policy saves_insert_self on saves
  for insert to authenticated with check (user_id = auth.uid());
create policy saves_delete_self on saves
  for delete to authenticated using (user_id = auth.uid());

-- ── LISTING_RESPONSES ─────────────────────────────────
create policy responses_select_involved on listing_responses
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from listings l where l.id = listing_id and l.user_id = auth.uid())
  );
create policy responses_insert_self on listing_responses
  for insert to authenticated with check (user_id = auth.uid());
create policy responses_delete_self on listing_responses
  for delete to authenticated using (user_id = auth.uid());

-- ── REQUESTS ──────────────────────────────────────────
create policy requests_select_all on requests
  for select to authenticated, anon
  using (status = 'open' or user_id = auth.uid());
create policy requests_insert_self on requests
  for insert to authenticated
  with check (user_id = auth.uid() and is_community_member(community_id));
create policy requests_update_owner on requests
  for update to authenticated using (user_id = auth.uid());
create policy requests_delete_owner on requests
  for delete to authenticated using (user_id = auth.uid());

-- ── REQUEST_OFFERS ────────────────────────────────────
create policy offers_select_involved on request_offers
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from requests r where r.id = request_id and r.user_id = auth.uid())
  );
create policy offers_insert_self on request_offers
  for insert to authenticated with check (user_id = auth.uid());
create policy offers_delete_self on request_offers
  for delete to authenticated using (user_id = auth.uid());

-- ── EVENTS ────────────────────────────────────────────
create policy events_select_published_or_own on events
  for select to authenticated, anon
  using (status = 'published' or organizer_id = auth.uid());
create policy events_insert_self on events
  for insert to authenticated
  with check (organizer_id = auth.uid() and is_community_member(community_id));
create policy events_update_organizer on events
  for update to authenticated
    using (organizer_id = auth.uid() or is_community_admin(community_id));
create policy events_delete_organizer on events
  for delete to authenticated
  using (organizer_id = auth.uid() or is_community_admin(community_id));

-- ── EVENT_RSVPS ───────────────────────────────────────
create policy rsvps_select_all on event_rsvps
  for select to authenticated using (true);
create policy rsvps_upsert_self on event_rsvps
  for insert to authenticated with check (user_id = auth.uid());
create policy rsvps_update_self on event_rsvps
  for update to authenticated using (user_id = auth.uid());
create policy rsvps_delete_self on event_rsvps
  for delete to authenticated using (user_id = auth.uid());

-- ── LOST_FOUND_REPORTS ────────────────────────────────
create policy lf_select_all on lost_found_reports
  for select to authenticated, anon using (true);
create policy lf_insert_self on lost_found_reports
  for insert to authenticated
  with check (user_id = auth.uid() and is_community_member(community_id));
create policy lf_update_owner on lost_found_reports
  for update to authenticated
  using (user_id = auth.uid() or is_community_admin(community_id));
create policy lf_delete_owner on lost_found_reports
  for delete to authenticated
  using (user_id = auth.uid() or is_community_admin(community_id));

-- ── INVENTORY_ITEMS ───────────────────────────────────
create policy inventory_select_community on inventory_items
  for select to authenticated using (is_community_member(community_id));
create policy inventory_insert_member on inventory_items
  for insert to authenticated
  with check (is_community_member(community_id));
create policy inventory_update_owner_or_admin on inventory_items
  for update to authenticated
  using (
    owner_id = auth.uid()
    or borrowed_by = auth.uid()
    or is_community_admin(community_id)
  );
create policy inventory_delete_owner_or_admin on inventory_items
  for delete to authenticated
  using (owner_id = auth.uid() or is_community_admin(community_id));

-- ── COMMUNITY_MILESTONES ──────────────────────────────
create policy milestones_select_all on community_milestones
  for select to authenticated, anon using (true);
create policy milestones_admin_write on community_milestones
  for all to authenticated
  using (is_community_admin(community_id))
  with check (is_community_admin(community_id));

-- ── ANNOUNCEMENTS ─────────────────────────────────────
create policy announcements_select_all on announcements
  for select to authenticated, anon using (true);
create policy announcements_admin_write on announcements
  for all to authenticated
  using (is_community_admin(community_id))
  with check (is_community_admin(community_id));

-- ── IMPACT_LOG ────────────────────────────────────────
create policy impact_select_own on impact_log
  for select to authenticated
  using (user_id = auth.uid() or is_community_admin(community_id));
-- impact log is written by server-side functions (security definer) only — no client INSERT policy

-- ── REACTIONS ─────────────────────────────────────────
create policy reactions_select_all on reactions
  for select to authenticated, anon using (true);
create policy reactions_insert_self on reactions
  for insert to authenticated with check (user_id = auth.uid());
create policy reactions_delete_self on reactions
  for delete to authenticated using (user_id = auth.uid());

-- ── COMMENTS ──────────────────────────────────────────
create policy comments_select_all on comments
  for select to authenticated, anon using (true);
create policy comments_insert_self on comments
  for insert to authenticated with check (user_id = auth.uid());
create policy comments_update_self on comments
  for update to authenticated using (user_id = auth.uid());
create policy comments_delete_self on comments
  for delete to authenticated using (user_id = auth.uid());

-- ── NOTIFICATIONS ─────────────────────────────────────
create policy notifications_select_self on notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update_self on notifications
  for update to authenticated using (user_id = auth.uid());
create policy notifications_delete_self on notifications
  for delete to authenticated using (user_id = auth.uid());
-- notifications are inserted by SECURITY DEFINER triggers only
