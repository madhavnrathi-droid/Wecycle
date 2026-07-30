-- Migration 20260512090124 · 02_categories_listings_saves
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 02 · categories, listings, saves, responses
-- ═══════════════════════════════════════════════════════

-- ── CATEGORIES ────────────────────────────────────────
create table categories (
  id         text primary key,
  label      text not null,
  icon       text,
  sort_order int not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── LISTINGS (marketplace items + inventory uploads) ──
create table listings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  title         text not null check (length(title) between 2 and 200),
  description   text check (length(description) <= 2000),
  category_id   text references categories(id),
  listing_type  listing_type not null,
  condition     item_condition not null default 'good',
  price         numeric(10,2) check (price is null or price >= 0),
  location      text,
  photo_urls    text[] not null default '{}',
  photo_color   text,
  photo_icon    text,
  tags          text[] not null default '{}',
  status        listing_status not null default 'active',
  is_featured   boolean not null default false,
  response_count int not null default 0,
  save_count    int not null default 0,
  view_count    int not null default 0,
  posted_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint price_required_for_sell check (
    (listing_type = 'sell' and price is not null) or
    (listing_type <> 'sell')
  )
);
create index idx_listings_user on listings (user_id);
create index idx_listings_community_active on listings (community_id, status) where status = 'active';
create index idx_listings_category on listings (category_id) where status = 'active';
create index idx_listings_type on listings (listing_type) where status = 'active';
create index idx_listings_posted on listings (posted_at desc) where status = 'active';
create index idx_listings_tags on listings using gin (tags);
create index idx_listings_search on listings using gin (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
) where status = 'active';

create trigger trg_listings_updated before update on listings
  for each row execute function set_updated_at();

-- ── SAVES (bookmarks) ─────────────────────────────────
create table saves (
  user_id    uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index idx_saves_user on saves (user_id, saved_at desc);

-- maintain listing.save_count
create or replace function update_listing_save_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update listings set save_count = save_count + 1 where id = new.listing_id;
  elsif (tg_op = 'DELETE') then
    update listings set save_count = greatest(0, save_count - 1) where id = old.listing_id;
  end if;
  return null;
end;
$$;
create trigger trg_saves_count_ins after insert on saves
  for each row execute function update_listing_save_count();
create trigger trg_saves_count_del after delete on saves
  for each row execute function update_listing_save_count();

-- ── LISTING_RESPONSES (interest expressions / DM seed) ─
create table listing_responses (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  message     text check (length(message) <= 1000),
  created_at  timestamptz not null default now()
);
create index idx_responses_listing on listing_responses (listing_id, created_at desc);
create index idx_responses_user on listing_responses (user_id, created_at desc);

-- maintain listing.response_count
create or replace function update_listing_response_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update listings set response_count = response_count + 1 where id = new.listing_id;
  elsif (tg_op = 'DELETE') then
    update listings set response_count = greatest(0, response_count - 1) where id = old.listing_id;
  end if;
  return null;
end;
$$;
create trigger trg_responses_count_ins after insert on listing_responses
  for each row execute function update_listing_response_count();
create trigger trg_responses_count_del after delete on listing_responses
  for each row execute function update_listing_response_count();
