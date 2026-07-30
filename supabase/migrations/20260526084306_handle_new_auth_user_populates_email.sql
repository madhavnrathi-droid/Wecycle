-- Migration 20260526084306 · handle_new_auth_user_populates_email
-- Exported from the live project's applied-migration history.
-- Extend handle_new_auth_user so the public.profiles.email column we
-- added in add_email_to_profiles_and_search_indexes is populated for
-- every new OTP signup. Without this, fresh users would have a null
-- public email until they edited it in Account.
create or replace function public.handle_new_auth_user()
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
  select id into global_id from communities where slug = 'wecycle-global' limit 1;

  full_name_val := nullif(trim(new.raw_user_meta_data->>'full_name'), '');

  default_username := coalesce(
    new.raw_user_meta_data->>'username',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user_' || substr(new.id::text, 1, 8)
  );

  parts := regexp_split_to_array(coalesce(full_name_val, ''), '\s+');
  first_initial := upper(left(coalesce(parts[1], 'W'), 1));
  last_initial  := upper(left(coalesce(parts[array_length(parts,1)], ''), 1));

  insert into profiles (
    id, username, full_name, initials, avatar_color, community_id, phone,
    college_id, graduating_year, course, department, email
  )
  values (
    new.id,
    default_username,
    full_name_val,
    coalesce(nullif(first_initial || last_initial, ''), 'W'),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#6C63FF'),
    global_id,
    new.phone,
    nullif(new.raw_user_meta_data->>'college_id', ''),
    nullif((new.raw_user_meta_data->>'graduating_year')::text, '')::int,
    nullif(new.raw_user_meta_data->>'course', ''),
    nullif(new.raw_user_meta_data->>'department', ''),
    new.email
  )
  on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, profiles.full_name),
      phone     = coalesce(profiles.phone, excluded.phone),
      community_id = coalesce(profiles.community_id, excluded.community_id),
      college_id   = coalesce(excluded.college_id, profiles.college_id),
      email        = coalesce(profiles.email, excluded.email);

  if global_id is not null then
    insert into community_members (community_id, user_id, role)
    values (global_id, new.id, 'member')
    on conflict do nothing;
  end if;

  return new;
end;
$$;
