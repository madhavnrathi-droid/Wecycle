-- Baseline · content_reports + user_blocks (moderation)
--
-- These two tables were created out-of-band (SQL editor), so they never
-- entered the applied-migration history. This file is RECONSTRUCTED from the
-- live catalog (columns, constraints, indexes, RLS policies) on 2026-07-30 so
-- a fresh environment gets the full schema. On the live project it is a no-op
-- by construction (IF NOT EXISTS everywhere).
--
-- Consumed by lib/moderation.ts: users can report content and block users;
-- reports are reviewed from the dashboard (status: open → reviewing →
-- actioned / dismissed).

-- ── content_reports ───────────────────────────────────────────────────────
create table if not exists public.content_reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references auth.users(id) on delete cascade,
  target_type    text not null check (target_type in
                   ('listing','request','lostfound','event','comment','message','user')),
  target_id      text not null,
  target_user_id uuid references auth.users(id) on delete cascade,
  reason         text not null check (char_length(reason) between 1 and 60),
  details        text check (char_length(details) <= 1000),
  status         text not null default 'open' check (status in
                   ('open','reviewing','actioned','dismissed')),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id) on delete set null
);

create index if not exists content_reports_status_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);
create index if not exists content_reports_target_user_idx
  on public.content_reports (target_user_id);

alter table public.content_reports enable row level security;

do $$ begin
  create policy "users insert own reports" on public.content_reports
    for insert with check (auth.uid() = reporter_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users read own reports" on public.content_reports
    for select using (auth.uid() = reporter_id);
exception when duplicate_object then null; end $$;

-- ── user_blocks ───────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  target_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, target_id),
  constraint user_blocks_no_self check (blocker_id <> target_id)
);

create index if not exists user_blocks_target_idx
  on public.user_blocks (target_id);

alter table public.user_blocks enable row level security;

do $$ begin
  create policy "users manage own blocks" on public.user_blocks
    for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
exception when duplicate_object then null; end $$;
