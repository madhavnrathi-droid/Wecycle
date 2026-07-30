-- Migration 20260525133520 · wecycle_admin_function_and_delete_policies
-- Exported from the live project's applied-migration history.
-- Wecycle admin function + cross-account moderation policies.
-- Both addresses below are admins; the function compares against the
-- caller's auth.jwt() email so it stays trigger-able from any RLS context.

create or replace function public.is_wecycle_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') in (
      'wecycle.page@gmail.com',
      'madhav.n.rathi@gmail.com'
    ),
    false
  );
$$;

-- DELETE policies — these are ADDITIVE to the existing
-- "owners can delete their own" policies; Postgres OR-combines policies
-- on the same command, so a row is deletable if EITHER the user owns it
-- OR they're a Wecycle admin.

do $$
begin
  -- listings
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='listings'
                    and policyname='admin_delete_listings') then
    create policy "admin_delete_listings"
      on public.listings for delete
      using (public.is_wecycle_admin());
  end if;

  -- requests
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='requests'
                    and policyname='admin_delete_requests') then
    create policy "admin_delete_requests"
      on public.requests for delete
      using (public.is_wecycle_admin());
  end if;

  -- events
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='events'
                    and policyname='admin_delete_events') then
    create policy "admin_delete_events"
      on public.events for delete
      using (public.is_wecycle_admin());
  end if;

  -- lost & found
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='lost_found_reports'
                    and policyname='admin_delete_lost_found') then
    create policy "admin_delete_lost_found"
      on public.lost_found_reports for delete
      using (public.is_wecycle_admin());
  end if;

  -- comments (so admin moderation can scrub abusive replies anywhere)
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='comments'
                    and policyname='admin_delete_comments') then
    create policy "admin_delete_comments"
      on public.comments for delete
      using (public.is_wecycle_admin());
  end if;
end$$;
