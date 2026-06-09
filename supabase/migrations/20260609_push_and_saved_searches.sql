-- ============================================================================
-- Web Push + DB-backed saved searches
-- ----------------------------------------------------------------------------
-- Moves saved searches server-side so the push sender can match new posts
-- against every user's alerts, and stores Web Push subscriptions per device.
-- Idempotent. RLS keeps each user scoped to their own rows; the Edge Function
-- sender uses the service role to read across users.
-- ============================================================================

create extension if not exists pg_trgm;

-- ── saved_searches ──────────────────────────────────────────────────────────
create table if not exists public.saved_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  query       text not null check (char_length(query) between 1 and 80),
  -- which feeds this alert watches; defaults to requests (the high-intent one)
  scope       text not null default 'requests' check (scope in ('requests','listings','all')),
  created_at  timestamptz not null default now(),
  unique (user_id, query, scope)
);
create index if not exists saved_searches_query_trgm on public.saved_searches using gin (query gin_trgm_ops);
create index if not exists saved_searches_user_idx on public.saved_searches (user_id);

alter table public.saved_searches enable row level security;
drop policy if exists "own saved searches" on public.saved_searches;
create policy "own saved searches" on public.saved_searches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── push_subscriptions ───────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── upsert helper (endpoint is the natural key) ──────────────────────────────
create or replace function public.upsert_push_subscription(
  _endpoint text, _p256dh text, _auth text, _user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare _me uuid := auth.uid();
begin
  if _me is null then raise exception 'not authenticated'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (_me, _endpoint, _p256dh, _auth, _user_agent)
  on conflict (endpoint) do update
    set user_id = _me, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();
end; $$;
grant execute on function public.upsert_push_subscription(text,text,text,text) to authenticated;

-- ── matcher: given a new post's text, who has a matching alert? ───────────────
-- Used by the Edge Function (service role). Returns each subscriber's push
-- credentials for users whose saved_search query is a substring of the text
-- (excluding the poster themselves).
create or replace function public.subscribers_for_text(
  _text text, _scope text, _exclude_user uuid
) returns table (endpoint text, p256dh text, auth text, matched_query text)
language sql security definer set search_path = public as $$
  select distinct ps.endpoint, ps.p256dh, ps.auth, ss.query
  from public.saved_searches ss
  join public.push_subscriptions ps on ps.user_id = ss.user_id
  where ss.user_id <> _exclude_user
    and (ss.scope = 'all' or ss.scope = _scope)
    and position(lower(ss.query) in lower(_text)) > 0;
$$;
-- service_role only (do NOT grant to authenticated — it would leak endpoints)
revoke all on function public.subscribers_for_text(text,text,uuid) from public, authenticated;
