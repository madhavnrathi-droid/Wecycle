-- Migration 20260512090458 · 08_business_triggers_notifications
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 08 · Business triggers + notifications
-- ═══════════════════════════════════════════════════════

-- ── community member_count maintenance ────────────────
create or replace function update_community_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update communities set member_count = member_count + 1 where id = new.community_id;
  elsif tg_op = 'DELETE' then
    update communities set member_count = greatest(0, member_count - 1) where id = old.community_id;
  end if;
  return null;
end;
$$;
create trigger trg_members_count_ins after insert on community_members
  for each row execute function update_community_member_count();
create trigger trg_members_count_del after delete on community_members
  for each row execute function update_community_member_count();

-- ── Auto-create member row when profile.community_id is set ──
create or replace function sync_profile_to_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.community_id is not null and (old.community_id is distinct from new.community_id) then
    insert into community_members (community_id, user_id, role)
    values (new.community_id, new.id, 'member')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger trg_profile_sync_member after insert or update of community_id on profiles
  for each row execute function sync_profile_to_member();

-- ── Notification helper ───────────────────────────────
create or replace function create_notification(
  _user_id uuid,
  _actor_id uuid,
  _type notification_type,
  _entity_type feed_entity_type,
  _entity_id uuid,
  _title text,
  _body text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _user_id = _actor_id then
    return; -- don't notify yourself
  end if;
  insert into notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  values (_user_id, _actor_id, _type, _entity_type, _entity_id, _title, _body);
end;
$$;

-- ── Notify listing owner when someone shows interest ──
create or replace function notify_listing_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_actor_name text;
begin
  select user_id, title into v_owner, v_title from listings where id = new.listing_id;
  select coalesce(full_name, username, 'Someone') into v_actor_name from profiles where id = new.user_id;
  perform create_notification(
    v_owner, new.user_id, 'response_received', 'listing', new.listing_id,
    v_actor_name || ' is interested in your item',
    v_title
  );
  return null;
end;
$$;
create trigger trg_notify_listing_response after insert on listing_responses
  for each row execute function notify_listing_response();

-- ── Notify request owner when help is offered ─────────
create or replace function notify_request_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_actor_name text;
begin
  select user_id, title into v_owner, v_title from requests where id = new.request_id;
  select coalesce(full_name, username, 'Someone') into v_actor_name from profiles where id = new.user_id;
  perform create_notification(
    v_owner, new.user_id, 'request_help_offered', 'request', new.request_id,
    v_actor_name || ' offered to help',
    v_title
  );
  return null;
end;
$$;
create trigger trg_notify_request_offer after insert on request_offers
  for each row execute function notify_request_offer();

-- ── Notify event organizer on RSVP ────────────────────
create or replace function notify_event_rsvp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_organizer uuid;
  v_title text;
  v_actor_name text;
begin
  if new.status <> 'going' then return null; end if;
  select organizer_id, title into v_organizer, v_title from events where id = new.event_id;
  select coalesce(full_name, username, 'Someone') into v_actor_name from profiles where id = new.user_id;
  perform create_notification(
    v_organizer, new.user_id, 'event_rsvp', 'event', new.event_id,
    v_actor_name || ' is going to your event',
    v_title
  );
  return null;
end;
$$;
create trigger trg_notify_event_rsvp after insert on event_rsvps
  for each row execute function notify_event_rsvp();

-- ── Notify entity owner on reaction (like) ────────────
create or replace function notify_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_actor_name text;
  v_summary text;
begin
  select coalesce(full_name, username, 'Someone') into v_actor_name from profiles where id = new.user_id;

  case new.entity_type
    when 'listing' then
      select user_id, title into v_owner, v_title from listings where id = new.entity_id;
      v_summary := v_actor_name || ' liked your item';
    when 'request' then
      select user_id, title into v_owner, v_title from requests where id = new.entity_id;
      v_summary := v_actor_name || ' liked your request';
    when 'event' then
      select organizer_id, title into v_owner, v_title from events where id = new.entity_id;
      v_summary := v_actor_name || ' liked your event';
    when 'lost_found' then
      select user_id, title into v_owner, v_title from lost_found_reports where id = new.entity_id;
      v_summary := v_actor_name || ' boosted your report';
    else
      return null;
  end case;

  if v_owner is null then return null; end if;
  perform create_notification(
    v_owner, new.user_id, 'item_liked', new.entity_type, new.entity_id,
    v_summary, v_title
  );
  return null;
end;
$$;
create trigger trg_notify_reaction after insert on reactions
  for each row execute function notify_reaction();

-- ── Notify entity owner on new comment ────────────────
create or replace function notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_actor_name text;
  v_summary text;
begin
  select coalesce(full_name, username, 'Someone') into v_actor_name from profiles where id = new.user_id;

  case new.entity_type
    when 'listing' then
      select user_id, title into v_owner, v_title from listings where id = new.entity_id;
    when 'request' then
      select user_id, title into v_owner, v_title from requests where id = new.entity_id;
    when 'event' then
      select organizer_id, title into v_owner, v_title from events where id = new.entity_id;
    when 'lost_found' then
      select user_id, title into v_owner, v_title from lost_found_reports where id = new.entity_id;
    when 'announcement' then
      select author_id, title into v_owner, v_title from announcements where id = new.entity_id;
    else
      return null;
  end case;

  if v_owner is null then return null; end if;
  v_summary := v_actor_name || ' commented on your post';
  perform create_notification(
    v_owner, new.user_id, 'item_commented', new.entity_type, new.entity_id,
    v_summary, v_title
  );
  return null;
end;
$$;
create trigger trg_notify_comment after insert on comments
  for each row execute function notify_comment();

-- ── Impact accrual: when impact_log row written, update profile + community ──
create or replace function accrue_impact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles
  set
    impact_score = impact_score + new.points,
    co2_saved_kg = co2_saved_kg + new.co2_kg,
    money_saved  = money_saved + new.money_saved,
    items_shared_count = items_shared_count + case when new.action_type = 'item_shared' then 1 else 0 end,
    items_received_count = items_received_count + case when new.action_type = 'item_received' then 1 else 0 end,
    repairs_helped_count = repairs_helped_count + case when new.action_type = 'repair_helped' then 1 else 0 end
  where id = new.user_id;

  update communities
  set
    items_circulated = items_circulated + case when new.action_type in ('item_shared', 'item_received') then 1 else 0 end,
    co2_saved_kg = co2_saved_kg + new.co2_kg
  where id = new.community_id;
  return null;
end;
$$;
create trigger trg_accrue_impact after insert on impact_log
  for each row execute function accrue_impact();
