-- Migration 20260512090248 · 05_reactions_comments_notifications
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 05 · reactions, comments, notifications
-- ═══════════════════════════════════════════════════════

-- ── REACTIONS (polymorphic likes) ─────────────────────
create table reactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  entity_type   feed_entity_type not null,
  entity_id     uuid not null,
  kind          reaction_kind not null default 'like',
  created_at    timestamptz not null default now(),
  unique (user_id, entity_type, entity_id, kind)
);
create index idx_reactions_entity on reactions (entity_type, entity_id);
create index idx_reactions_user on reactions (user_id, created_at desc);

-- ── COMMENTS (polymorphic, threaded) ──────────────────
create table comments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  entity_type       feed_entity_type not null,
  entity_id         uuid not null,
  parent_comment_id uuid references comments(id) on delete cascade,
  body              text not null check (length(body) between 1 and 2000),
  is_edited         boolean not null default false,
  reply_count       int not null default 0,
  like_count        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_comments_entity on comments (entity_type, entity_id, created_at);
create index idx_comments_parent on comments (parent_comment_id) where parent_comment_id is not null;
create index idx_comments_user on comments (user_id);
create trigger trg_comments_updated before update on comments
  for each row execute function set_updated_at();

-- maintain parent.reply_count
create or replace function update_comment_reply_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.parent_comment_id is not null) then
    update comments set reply_count = reply_count + 1 where id = new.parent_comment_id;
  elsif (tg_op = 'DELETE' and old.parent_comment_id is not null) then
    update comments set reply_count = greatest(0, reply_count - 1) where id = old.parent_comment_id;
  end if;
  return null;
end;
$$;
create trigger trg_comments_reply_count_ins after insert on comments
  for each row execute function update_comment_reply_count();
create trigger trg_comments_reply_count_del after delete on comments
  for each row execute function update_comment_reply_count();

-- ── NOTIFICATIONS ─────────────────────────────────────
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  actor_id      uuid references profiles(id) on delete set null,
  type          notification_type not null,
  entity_type   feed_entity_type,
  entity_id     uuid,
  title         text not null,
  body          text,
  is_read       boolean not null default false,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_notifications_user_unread on notifications (user_id, is_read, created_at desc);
create index idx_notifications_recent on notifications (user_id, created_at desc);
