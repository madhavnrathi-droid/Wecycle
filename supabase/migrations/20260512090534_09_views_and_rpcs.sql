-- Migration 20260512090534 · 09_views_and_rpcs
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 09 · Unified feed view + RPCs
-- ═══════════════════════════════════════════════════════

-- ── Unified feed view (security_invoker so RLS applies on base tables) ──
create or replace view feed_view
with (security_invoker = true) as
  select
    l.id                                  as id,
    'listing'::feed_entity_type           as entity_type,
    l.user_id                             as author_id,
    l.community_id                        as community_id,
    l.title                               as title,
    l.description                         as body,
    l.posted_at                           as posted_at,
    l.response_count                      as response_count,
    l.save_count                          as save_count,
    jsonb_build_object(
      'listing_type', l.listing_type,
      'condition',    l.condition,
      'price',        l.price,
      'location',     l.location,
      'photo_urls',   l.photo_urls,
      'photo_color',  l.photo_color,
      'photo_icon',   l.photo_icon,
      'category_id',  l.category_id,
      'tags',         l.tags
    ) as data
  from listings l
  where l.status = 'active'

  union all

  select
    r.id,
    'request',
    r.user_id,
    r.community_id,
    r.title,
    r.description,
    r.posted_at,
    r.offer_count,
    0,
    jsonb_build_object(
      'urgency',      r.urgency,
      'need_by_date', r.need_by_date,
      'category_id',  r.category_id
    )
  from requests r
  where r.status = 'open'

  union all

  select
    e.id,
    'event',
    e.organizer_id,
    e.community_id,
    e.title,
    e.description,
    e.created_at,
    e.attendee_count,
    0,
    jsonb_build_object(
      'event_type',    e.event_type,
      'color_accent',  e.color_accent,
      'starts_at',     e.starts_at,
      'ends_at',       e.ends_at,
      'location',      e.location,
      'max_attendees', e.max_attendees,
      'cover_url',     e.cover_url
    )
  from events e
  where e.status = 'published'

  union all

  select
    lf.id,
    'lost_found',
    lf.user_id,
    lf.community_id,
    lf.title,
    lf.description,
    lf.posted_at,
    0,
    0,
    jsonb_build_object(
      'status',        lf.status,
      'last_seen',     lf.last_seen,
      'last_seen_date',lf.last_seen_date,
      'photo_urls',    lf.photo_urls,
      'photo_color',   lf.photo_color,
      'photo_icon',    lf.photo_icon,
      'reward',        lf.reward,
      'verified',      lf.verified
    )
  from lost_found_reports lf

  union all

  select
    cm.id,
    'milestone',
    null,
    cm.community_id,
    cm.title,
    cm.description,
    cm.reached_at,
    0,
    0,
    jsonb_build_object(
      'metric',        cm.metric,
      'value_display', cm.value_display,
      'value_numeric', cm.value_numeric,
      'is_pinned',     cm.is_pinned
    )
  from community_milestones cm

  union all

  select
    a.id,
    'announcement',
    a.author_id,
    a.community_id,
    a.title,
    a.body,
    a.created_at,
    0,
    0,
    jsonb_build_object('is_pinned', a.is_pinned)
  from announcements a;


-- ── leaderboard view ──────────────────────────────────
create or replace view leaderboard_view
with (security_invoker = true) as
  select
    p.id                  as user_id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.avatar_color,
    p.initials,
    p.role,
    p.community_id,
    p.impact_score,
    p.items_shared_count,
    p.items_received_count,
    p.co2_saved_kg,
    rank() over (partition by p.community_id order by p.impact_score desc) as community_rank,
    rank() over (order by p.impact_score desc) as global_rank
  from profiles p
  where p.impact_score > 0;


-- ── RPC: get user's rank summary ──────────────────────
create or replace function rpc_my_impact_summary()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'profile', to_jsonb(p.*),
    'community_rank', (
      select community_rank from leaderboard_view where user_id = auth.uid()
    ),
    'global_rank', (
      select global_rank from leaderboard_view where user_id = auth.uid()
    ),
    'community_members', (
      select c.member_count from communities c where c.id = p.community_id
    )
  )
  from profiles p
  where p.id = auth.uid();
$$;


-- ── RPC: toggle save ──────────────────────────────────
create or replace function rpc_toggle_save(_listing_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  is_saved boolean;
begin
  if exists (select 1 from saves where user_id = auth.uid() and listing_id = _listing_id) then
    delete from saves where user_id = auth.uid() and listing_id = _listing_id;
    return false;
  else
    insert into saves (user_id, listing_id) values (auth.uid(), _listing_id);
    return true;
  end if;
end;
$$;


-- ── RPC: toggle like (reaction) ───────────────────────
create or replace function rpc_toggle_like(_entity_type feed_entity_type, _entity_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if exists (
    select 1 from reactions
    where user_id = auth.uid() and entity_type = _entity_type and entity_id = _entity_id and kind = 'like'
  ) then
    delete from reactions
    where user_id = auth.uid() and entity_type = _entity_type and entity_id = _entity_id and kind = 'like';
    return false;
  else
    insert into reactions (user_id, entity_type, entity_id, kind)
    values (auth.uid(), _entity_type, _entity_id, 'like');
    return true;
  end if;
end;
$$;


-- ── RPC: toggle RSVP ──────────────────────────────────
create or replace function rpc_toggle_rsvp(_event_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from event_rsvps where user_id = auth.uid() and event_id = _event_id and status = 'going') then
    delete from event_rsvps where user_id = auth.uid() and event_id = _event_id;
    return 'cancelled';
  else
    insert into event_rsvps (event_id, user_id, status)
    values (_event_id, auth.uid(), 'going')
    on conflict (event_id, user_id) do update set status = 'going';
    return 'going';
  end if;
end;
$$;


-- ── RPC: mark notifications read ──────────────────────
create or replace function rpc_mark_notifications_read(_ids uuid[] default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_count int;
begin
  if _ids is null then
    update notifications set is_read = true, read_at = now()
    where user_id = auth.uid() and is_read = false;
  else
    update notifications set is_read = true, read_at = now()
    where user_id = auth.uid() and id = any(_ids) and is_read = false;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ── RPC: paginated community feed ─────────────────────
create or replace function rpc_community_feed(
  _community_id uuid,
  _limit int default 20,
  _before timestamptz default null
) returns setof feed_view
language sql security invoker set search_path = public stable as $$
  select * from feed_view
  where community_id = _community_id
    and (_before is null or posted_at < _before)
  order by posted_at desc
  limit least(_limit, 100);
$$;
