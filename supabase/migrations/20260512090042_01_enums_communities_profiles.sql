-- Migration 20260512090042 · 01_enums_communities_profiles
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 01 · enums, communities, profiles
-- ═══════════════════════════════════════════════════════

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── ENUMS ─────────────────────────────────────────────
create type community_type as enum ('campus', 'apartment', 'office', 'neighborhood');
create type listing_type   as enum ('free', 'swap', 'borrow', 'sell');
create type item_condition as enum ('like_new', 'good', 'fair');
create type listing_status as enum ('active', 'pending', 'completed', 'hidden', 'removed');
create type request_urgency as enum ('normal', 'urgent');
create type request_status as enum ('open', 'fulfilled', 'expired', 'cancelled');
create type event_type as enum ('swap', 'repair', 'cleanup', 'workshop', 'drive', 'challenge');
create type event_status as enum ('pending_review', 'published', 'completed', 'cancelled');
create type rsvp_status as enum ('going', 'maybe', 'declined');
create type lost_found_status as enum ('lost', 'found', 'claimed', 'returned');
create type inventory_status as enum ('available', 'borrowed', 'maintenance', 'retired');
create type member_role as enum ('member', 'moderator', 'admin');
create type notification_type as enum (
  'response_received', 'request_help_offered', 'event_rsvp', 'event_starting_soon',
  'item_liked', 'item_commented', 'lost_found_match', 'milestone_reached', 'community_announcement'
);
create type reaction_kind as enum ('like');
create type feed_entity_type as enum ('listing', 'request', 'event', 'lost_found', 'milestone', 'announcement');

-- ── shared trigger fn for updated_at ──────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── COMMUNITIES ───────────────────────────────────────
create table communities (
  id            uuid primary key default gen_random_uuid(),
  slug          citext unique not null,
  name          text not null,
  type          community_type not null default 'campus',
  location      text,
  description   text,
  cover_url     text,
  member_count  int not null default 0,
  items_circulated int not null default 0,
  co2_saved_kg  numeric(12,2) not null default 0,
  active_since  date not null default current_date,
  is_public     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_communities_slug on communities (slug);
create trigger trg_communities_updated before update on communities
  for each row execute function set_updated_at();

-- ── PROFILES (1:1 with auth.users) ────────────────────
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        citext unique,
  full_name       text,
  avatar_url      text,
  avatar_color    text default '#6C63FF',
  initials        text,
  bio             text,
  role            text,
  phone           text,
  community_id    uuid references communities(id) on delete set null,
  badges          text[] not null default '{}',
  impact_score    int not null default 0,
  items_shared_count   int not null default 0,
  items_received_count int not null default 0,
  repairs_helped_count int not null default 0,
  co2_saved_kg    numeric(10,2) not null default 0,
  money_saved     numeric(12,2) not null default 0,
  is_online       boolean not null default false,
  last_active_at  timestamptz default now(),
  joined_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_profiles_community on profiles (community_id);
create index idx_profiles_username on profiles (username);
create index idx_profiles_impact_score on profiles (impact_score desc);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ── COMMUNITY_MEMBERS (multi-community support) ───────
create table community_members (
  community_id  uuid references communities(id) on delete cascade,
  user_id       uuid references profiles(id) on delete cascade,
  role          member_role not null default 'member',
  joined_at     timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index idx_members_user on community_members (user_id);

-- ── auto-create profile on new auth user ──────────────
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  default_username text;
  parts text[];
  first_initial text;
  last_initial text;
begin
  -- derive a username candidate from email local-part or metadata
  default_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user_' || substr(new.id::text, 1, 8)
  );

  -- compute initials from full_name in metadata if any
  parts := regexp_split_to_array(coalesce(new.raw_user_meta_data->>'full_name', ''), '\s+');
  first_initial := upper(left(coalesce(parts[1], 'W'), 1));
  last_initial  := upper(left(coalesce(parts[array_length(parts,1)], ''), 1));

  insert into profiles (id, username, full_name, initials, avatar_color)
  values (
    new.id,
    default_username,
    new.raw_user_meta_data->>'full_name',
    coalesce(nullif(first_initial || last_initial, ''), 'W'),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#6C63FF')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
