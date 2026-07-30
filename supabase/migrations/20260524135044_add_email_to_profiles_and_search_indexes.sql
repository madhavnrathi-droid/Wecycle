-- Migration 20260524135044 · add_email_to_profiles_and_search_indexes
-- Exported from the live project's applied-migration history.
-- Add a public `email` column to profiles so the inline-edit account page
-- can persist the address the user signed up with. Auth still owns the
-- canonical email (auth.users.email) for sign-in; this column is what we
-- show on storefronts + use for the default contact channel.
alter table public.profiles
  add column if not exists email text;

-- One-time backfill: copy auth.users.email into profiles.email for any
-- existing accounts. Safe to run repeatedly because of the COALESCE.
update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and (p.email is null or p.email = '');

-- Indexes for the user-search bar. trigram (pg_trgm) lets us do ILIKE
-- '%query%' searches on name + email cheaply; a btree on lower(college_id)
-- speeds up the ID exact-match path.
create extension if not exists pg_trgm;

create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name gin_trgm_ops);

create index if not exists profiles_email_trgm_idx
  on public.profiles using gin (email gin_trgm_ops);

create index if not exists profiles_college_id_lower_idx
  on public.profiles (lower(college_id));

-- Public-read RLS for profiles already exists for the storefront; we don't
-- need to widen it. Search just uses the same select policy.
