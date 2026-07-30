-- Migration 20260723085715 · event_metrics_views_saves
-- Exported from the live project's applied-migration history.
-- ── Event views ─────────────────────────────────────
alter table public.events add column if not exists view_count integer not null default 0;
alter table public.events add column if not exists save_count integer not null default 0;

create or replace function public.rpc_increment_event_view(_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.events set view_count = view_count + 1 where id = _event_id;
end;
$$;

-- ── Event saves (heart) ─────────────────────────────
create table if not exists public.event_saves (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_saves enable row level security;

drop policy if exists event_saves_select_self on public.event_saves;
create policy event_saves_select_self on public.event_saves
  for select to authenticated using (user_id = auth.uid());
drop policy if exists event_saves_insert_self on public.event_saves;
create policy event_saves_insert_self on public.event_saves
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists event_saves_delete_self on public.event_saves;
create policy event_saves_delete_self on public.event_saves
  for delete to authenticated using (user_id = auth.uid());

-- SECURITY DEFINER: the count lives on events, whose RLS would otherwise
-- silently block the update when a non-organizer saves.
create or replace function public.update_event_save_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    update public.events set save_count = save_count + 1 where id = new.event_id;
  elsif tg_op = 'DELETE' then
    update public.events set save_count = greatest(0, save_count - 1) where id = old.event_id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_event_save_count on public.event_saves;
create trigger trg_event_save_count
after insert or delete on public.event_saves
for each row execute function public.update_event_save_count();

create or replace function public.rpc_toggle_event_save(_event_id uuid)
returns boolean
language plpgsql
set search_path to 'public'
as $$
begin
  if exists (select 1 from event_saves where user_id = auth.uid() and event_id = _event_id) then
    delete from event_saves where user_id = auth.uid() and event_id = _event_id;
    return false;
  else
    insert into event_saves (event_id, user_id) values (_event_id, auth.uid());
    return true;
  end if;
end;
$$;

-- ── Fix the latent RLS-blocked count triggers (found via drift audit) ──
-- update_listing_save_count / update_event_attendee_count ran as the invoking
-- user, so RLS on listings/events silently swallowed the count update when the
-- actor wasn't the owner (verified: a listing with 3 saves showed save_count 0).
create or replace function public.update_listing_save_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set save_count = save_count + 1 where id = new.listing_id;
  elsif tg_op = 'DELETE' then
    update public.listings set save_count = greatest(0, save_count - 1) where id = old.listing_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_event_attendee_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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

-- Resync any drifted counts to ground truth.
update public.listings l set save_count = sub.n
from (select listing_id, count(*)::int n from public.saves group by listing_id) sub
where sub.listing_id = l.id and l.save_count <> sub.n;

update public.events e set attendee_count = coalesce(sub.n, 0)
from (select event_id, count(*)::int n from public.event_rsvps where status = 'going' group by event_id) sub
where sub.event_id = e.id and e.attendee_count <> coalesce(sub.n, 0);
