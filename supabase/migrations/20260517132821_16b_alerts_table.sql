-- Migration 20260517132821 · 16b_alerts_table
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 16b · alerts table + push queue
-- ═══════════════════════════════════════════════════════

create type notify_channel as enum ('email', 'phone', 'both');
create type alert_status as enum ('active', 'matched', 'expired', 'cancelled');
create type push_status as enum ('pending', 'sent', 'failed', 'skipped');

-- ── ALERTS ────────────────────────────────────────────
create table alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  community_id    uuid references communities(id) on delete cascade,
  title           text not null check (length(title) between 2 and 200),
  description     text not null check (length(description) between 5 and 1000),
  category_id     text references categories(id),
  condition       item_condition,                              -- NULL = any condition
  max_price       numeric(10,2) check (max_price is null or max_price >= 0),
  location_pref   text,
  notify          notify_channel not null default 'email',
  duration_hours  int not null check (duration_hours between 1 and 240),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null check (expires_at > created_at),
  status          alert_status not null default 'active',
  match_count     int not null default 0,
  last_matched_at timestamptz
);
create index idx_alerts_user_status on alerts(user_id, status);
create index idx_alerts_active_by_cat on alerts(category_id, status) where status = 'active';
create index idx_alerts_expiring on alerts(expires_at) where status = 'active';

alter table alerts enable row level security;

create policy alerts_select_own on alerts
  for select to authenticated using (user_id = auth.uid());
create policy alerts_insert_own on alerts
  for insert to authenticated with check (user_id = auth.uid());
create policy alerts_update_own on alerts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy alerts_delete_own on alerts
  for delete to authenticated using (user_id = auth.uid());

-- ── PUSH QUEUE ────────────────────────────────────────
-- Server-side jobs to fan-out email / SMS via an Edge Function.
-- Insertable only by SECURITY DEFINER triggers (no client RLS write).
create table push_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  channel     notify_channel not null,
  payload     jsonb not null,
  status      push_status not null default 'pending',
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index idx_push_queue_pending on push_queue(status, created_at) where status = 'pending';

alter table push_queue enable row level security;
-- recipients can read their own pending pushes (useful for debugging in dashboard)
create policy push_queue_select_own on push_queue
  for select to authenticated using (user_id = auth.uid());
-- no client writes; only service role + SECURITY DEFINER functions
