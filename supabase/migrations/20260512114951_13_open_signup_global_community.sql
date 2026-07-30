-- Migration 20260512114951 · 13_open_signup_global_community
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 13 · open signup + auto-join "Wecycle Global"
-- Anyone with any email/phone can sign up. No institution
-- required up-front; community scoping comes later.
-- ═══════════════════════════════════════════════════════

-- Seed the global community
insert into communities (slug, name, type, location, description, active_since, is_public)
values
  ('wecycle-global', 'Wecycle', 'neighborhood', 'Worldwide',
   'The open Wecycle community — share, swap, repair anywhere.',
   current_date, true)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      is_public = true;

-- Rewrite the new-user trigger to auto-join the global community
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_username text;
  parts text[];
  first_initial text;
  last_initial text;
  global_id uuid;
  full_name_val text;
begin
  -- find the global community id
  select id into global_id from communities where slug = 'wecycle-global' limit 1;

  full_name_val := nullif(trim(new.raw_user_meta_data->>'full_name'), '');

  -- derive a username candidate
  default_username := coalesce(
    new.raw_user_meta_data->>'username',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user_' || substr(new.id::text, 1, 8)
  );

  -- compute initials from full_name if any
  parts := regexp_split_to_array(coalesce(full_name_val, ''), '\s+');
  first_initial := upper(left(coalesce(parts[1], 'W'), 1));
  last_initial  := upper(left(coalesce(parts[array_length(parts,1)], ''), 1));

  insert into profiles (id, username, full_name, initials, avatar_color, community_id, phone)
  values (
    new.id,
    default_username,
    full_name_val,
    coalesce(nullif(first_initial || last_initial, ''), 'W'),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#6C63FF'),
    global_id,
    new.phone
  )
  on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, profiles.full_name),
      phone     = coalesce(profiles.phone, excluded.phone),
      community_id = coalesce(profiles.community_id, excluded.community_id);

  -- ensure membership row (sync trigger normally handles this; belt + suspenders)
  if global_id is not null then
    insert into community_members (community_id, user_id, role)
    values (global_id, new.id, 'member')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Backfill: any existing profiles without a community get assigned to global
update profiles
set community_id = (select id from communities where slug = 'wecycle-global')
where community_id is null;
