-- Migration 20260512090153 · 03_requests_events_rsvps
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 03 · requests, events, RSVPs
-- ═══════════════════════════════════════════════════════

-- ── REQUESTS ──────────────────────────────────────────
create table requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  title         text not null check (length(title) between 2 and 200),
  description   text check (length(description) <= 2000),
  category_id   text references categories(id),
  urgency       request_urgency not null default 'normal',
  need_by_date  date,
  status        request_status not null default 'open',
  offer_count   int not null default 0,
  posted_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_requests_community_open on requests (community_id, status) where status = 'open';
create index idx_requests_user on requests (user_id);
create index idx_requests_urgency on requests (urgency, posted_at desc) where status = 'open';
create trigger trg_requests_updated before update on requests
  for each row execute function set_updated_at();

-- ── REQUEST_OFFERS ────────────────────────────────────
create table request_offers (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  message     text check (length(message) <= 1000),
  created_at  timestamptz not null default now(),
  unique (request_id, user_id)
);
create index idx_offers_request on request_offers (request_id, created_at desc);

-- maintain request.offer_count
create or replace function update_request_offer_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update requests set offer_count = offer_count + 1 where id = new.request_id;
  elsif (tg_op = 'DELETE') then
    update requests set offer_count = greatest(0, offer_count - 1) where id = old.request_id;
  end if;
  return null;
end;
$$;
create trigger trg_offers_count_ins after insert on request_offers
  for each row execute function update_request_offer_count();
create trigger trg_offers_count_del after delete on request_offers
  for each row execute function update_request_offer_count();

-- ── EVENTS ────────────────────────────────────────────
create table events (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references profiles(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  title         text not null check (length(title) between 2 and 200),
  description   text check (length(description) <= 3000),
  event_type    event_type not null,
  color_accent  text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location      text not null,
  max_attendees int check (max_attendees is null or max_attendees > 0),
  attendee_count int not null default 0,
  status        event_status not null default 'pending_review',
  cover_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ends_after_starts check (ends_at is null or ends_at > starts_at)
);
create index idx_events_community_published on events (community_id, starts_at) where status = 'published';
create index idx_events_organizer on events (organizer_id);
create index idx_events_upcoming on events (starts_at) where status = 'published';
create trigger trg_events_updated before update on events
  for each row execute function set_updated_at();

-- ── EVENT_RSVPS ───────────────────────────────────────
create table event_rsvps (
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  status     rsvp_status not null default 'going',
  rsvped_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index idx_rsvps_user on event_rsvps (user_id);

-- maintain event.attendee_count (only count 'going')
create or replace function update_event_attendee_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.status = 'going' then
      update events set attendee_count = attendee_count + 1 where id = new.event_id;
    end if;
  elsif (tg_op = 'UPDATE') then
    if old.status = 'going' and new.status <> 'going' then
      update events set attendee_count = greatest(0, attendee_count - 1) where id = new.event_id;
    elsif old.status <> 'going' and new.status = 'going' then
      update events set attendee_count = attendee_count + 1 where id = new.event_id;
    end if;
  elsif (tg_op = 'DELETE') then
    if old.status = 'going' then
      update events set attendee_count = greatest(0, attendee_count - 1) where id = old.event_id;
    end if;
  end if;
  return null;
end;
$$;
create trigger trg_rsvps_count_ins after insert on event_rsvps
  for each row execute function update_event_attendee_count();
create trigger trg_rsvps_count_upd after update on event_rsvps
  for each row execute function update_event_attendee_count();
create trigger trg_rsvps_count_del after delete on event_rsvps
  for each row execute function update_event_attendee_count();
