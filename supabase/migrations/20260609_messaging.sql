-- ============================================================================
-- In-app messaging: 1:1 conversations + messages
-- ----------------------------------------------------------------------------
-- Replaces the WhatsApp/email handoff with a lightweight in-app thread.
-- Idempotent: safe to re-run. RLS restricts everything to the two participants.
-- ============================================================================

-- ── conversations ──────────────────────────────────────────────────────────
-- A 1:1 thread between two users, optionally anchored to the listing/request
-- that started it. user_a < user_b is enforced so a pair maps to one row
-- regardless of who initiates (dedupe via the unique index below).
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_a           uuid not null references auth.users(id) on delete cascade,
  user_b           uuid not null references auth.users(id) on delete cascade,
  listing_id       uuid references public.listings(id) on delete set null,
  subject          text,
  last_message     text,
  last_message_at  timestamptz,
  last_sender_id   uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint conversations_ordered_pair check (user_a < user_b)
);

-- One thread per (pair + listing context). NULL listing_id collapses to a
-- single "general" thread per pair via the coalesce expression index.
create unique index if not exists conversations_pair_listing_uq
  on public.conversations (user_a, user_b, coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists conversations_user_a_idx on public.conversations (user_a, last_message_at desc nulls last);
create index if not exists conversations_user_b_idx on public.conversations (user_b, last_message_at desc nulls last);

-- ── messages ───────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references auth.users(id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 4000),
  created_at       timestamptz not null default now(),
  read_at          timestamptz
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (conversation_id, read_at) where read_at is null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages       enable row level security;

drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations" on public.conversations
  for select using (auth.uid() = user_a or auth.uid() = user_b);

-- Inserts/updates go through the SECURITY DEFINER RPCs below, but we still
-- allow a participant to update their own thread metadata defensively.
drop policy if exists "participants update conversations" on public.conversations;
create policy "participants update conversations" on public.conversations
  for update using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- A recipient may mark messages read (update read_at on rows they did NOT send).
drop policy if exists "recipients mark read" on public.messages;
create policy "recipients mark read" on public.messages
  for update using (
    auth.uid() <> sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- ── get_or_create_conversation(other_user, listing) ─────────────────────────
-- Orders the pair, finds the existing thread or creates it. SECURITY DEFINER so
-- the canonical-ordering insert isn't blocked by the row's check vs auth.uid().
create or replace function public.get_or_create_conversation(
  _other_user uuid,
  _listing_id uuid default null,
  _subject    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _me   uuid := auth.uid();
  _a    uuid;
  _b    uuid;
  _id   uuid;
begin
  if _me is null then raise exception 'not authenticated'; end if;
  if _other_user is null or _other_user = _me then raise exception 'invalid recipient'; end if;

  if _me < _other_user then _a := _me; _b := _other_user;
  else                      _a := _other_user; _b := _me;
  end if;

  select id into _id from public.conversations
   where user_a = _a and user_b = _b
     and coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
   limit 1;

  if _id is null then
    insert into public.conversations (user_a, user_b, listing_id, subject)
    values (_a, _b, _listing_id, _subject)
    returning id into _id;
  end if;

  return _id;
end;
$$;
grant execute on function public.get_or_create_conversation(uuid, uuid, text) to authenticated;

-- ── keep conversation preview fresh on each new message ─────────────────────
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message    = left(new.body, 140),
         last_message_at = new.created_at,
         last_sender_id  = new.sender_id
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ── realtime ────────────────────────────────────────────────────────────────
-- Add to the supabase_realtime publication so the client gets live INSERTs.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.messages'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.conversations'; exception when duplicate_object then null; end;
end $$;
