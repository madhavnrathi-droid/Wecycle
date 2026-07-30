-- Migration 20260512090222 · 04_lost_found_inventory_impact
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 04 · lost & found, inventory, impact, milestones
-- ═══════════════════════════════════════════════════════

-- ── LOST_FOUND_REPORTS ────────────────────────────────
create table lost_found_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  community_id    uuid not null references communities(id) on delete cascade,
  title           text not null check (length(title) between 2 and 200),
  description     text check (length(description) <= 2000),
  category_id     text references categories(id),
  status          lost_found_status not null,
  last_seen       text,
  last_seen_date  date,
  contact_phone   text,
  contact_email   text,
  photo_urls      text[] not null default '{}',
  photo_color     text,
  photo_icon      text,
  reward          text,
  verified        boolean not null default false,
  claimed_by      uuid references profiles(id) on delete set null,
  claimed_at      timestamptz,
  posted_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_lf_community_status on lost_found_reports (community_id, status);
create index idx_lf_user on lost_found_reports (user_id);
create index idx_lf_recent on lost_found_reports (posted_at desc);
create trigger trg_lf_updated before update on lost_found_reports
  for each row execute function set_updated_at();

-- ── INVENTORY_ITEMS (community-shared resources) ──────
create table inventory_items (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  owner_id      uuid references profiles(id) on delete set null,
  title         text not null check (length(title) between 2 and 200),
  description   text check (length(description) <= 1000),
  category_id   text references categories(id),
  photo_url     text,
  photo_color   text,
  photo_icon    text,
  status        inventory_status not null default 'available',
  borrowed_by   uuid references profiles(id) on delete set null,
  borrow_started_at timestamptz,
  due_date      date,
  total_borrows int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_inventory_community on inventory_items (community_id, status);
create index idx_inventory_owner on inventory_items (owner_id);
create trigger trg_inventory_updated before update on inventory_items
  for each row execute function set_updated_at();

-- ── COMMUNITY_MILESTONES ──────────────────────────────
create table community_milestones (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  metric        text not null,
  title         text not null,
  description   text,
  value_display text not null,
  value_numeric numeric(14,2),
  is_pinned     boolean not null default false,
  reached_at    timestamptz not null default now()
);
create index idx_milestones_community on community_milestones (community_id, reached_at desc);

-- ── ANNOUNCEMENTS ─────────────────────────────────────
create table announcements (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  author_id     uuid not null references profiles(id) on delete cascade,
  title         text not null,
  body          text not null,
  is_pinned     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_announcements_community on announcements (community_id, created_at desc);
create trigger trg_announcements_updated before update on announcements
  for each row execute function set_updated_at();

-- ── IMPACT_LOG (immutable record of impact-generating actions) ──
create table impact_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete cascade,
  community_id        uuid not null references communities(id) on delete cascade,
  action_type         text not null,
  related_listing_id  uuid references listings(id) on delete set null,
  related_request_id  uuid references requests(id) on delete set null,
  related_event_id    uuid references events(id) on delete set null,
  co2_kg              numeric(10,2) not null default 0,
  money_saved         numeric(12,2) not null default 0,
  points              int not null default 0,
  notes               text,
  created_at          timestamptz not null default now()
);
create index idx_impact_user on impact_log (user_id, created_at desc);
create index idx_impact_community on impact_log (community_id, created_at desc);
create index idx_impact_action on impact_log (action_type);
