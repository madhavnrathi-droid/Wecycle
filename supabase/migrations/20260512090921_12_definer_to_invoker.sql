-- Migration 20260512090921 · 12_definer_to_invoker
-- Exported from the live project's applied-migration history.

-- The remaining warnings are about helper functions that don't actually need
-- SECURITY DEFINER — they only read tables that are publicly readable via RLS.
-- Converting to SECURITY INVOKER lets RLS apply and silences the lint.

create or replace function is_community_member(_community_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1 from community_members
    where community_id = _community_id and user_id = auth.uid()
  ) or exists (
    select 1 from profiles where id = auth.uid() and community_id = _community_id
  );
$$;

create or replace function is_community_admin(_community_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1 from community_members
    where community_id = _community_id
      and user_id = auth.uid()
      and role in ('moderator', 'admin')
  );
$$;

create or replace function rpc_my_impact_summary()
returns jsonb
language sql
security invoker
set search_path = public
stable
as $$
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
