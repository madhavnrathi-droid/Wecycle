-- Migration 20260723085742 · event_forms_and_responses
-- Exported from the live project's applied-migration history.
-- ── Registration forms (one per event, Google-Forms-style field list) ──
-- fields: jsonb array of
--   { id, type: 'short_text'|'long_text'|'mcq'|'checkboxes'|'dropdown'|
--     'name'|'email'|'phone'|'number'|'file', label, required, options?[] }
create table if not exists public.event_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.event_forms enable row level security;

-- Anyone who can see the event can read its form (needed to render the
-- RSVP form + the "Register" indicator on cards).
drop policy if exists event_forms_select_visible on public.event_forms;
create policy event_forms_select_visible on public.event_forms
  for select to anon, authenticated using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status = 'published' or e.organizer_id = auth.uid())
    )
  );
-- Only the organizer manages the form.
drop policy if exists event_forms_insert_organizer on public.event_forms;
create policy event_forms_insert_organizer on public.event_forms
  for insert to authenticated with check (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );
drop policy if exists event_forms_update_organizer on public.event_forms;
create policy event_forms_update_organizer on public.event_forms
  for update to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );
drop policy if exists event_forms_delete_organizer on public.event_forms;
create policy event_forms_delete_organizer on public.event_forms
  for delete to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- ── Responses (one per user per event) ──────────────
-- answers: jsonb map { [fieldId]: string | string[] } — file fields hold
-- storage object paths in the private form-uploads bucket.
create table if not exists public.event_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.event_forms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists idx_form_responses_event on public.event_form_responses (event_id, submitted_at desc);
alter table public.event_form_responses enable row level security;

-- Respondent writes their own; organizer reads all for their event.
drop policy if exists form_responses_insert_self on public.event_form_responses;
create policy form_responses_insert_self on public.event_form_responses
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists form_responses_update_self on public.event_form_responses;
create policy form_responses_update_self on public.event_form_responses
  for update to authenticated using (user_id = auth.uid());
drop policy if exists form_responses_delete_self on public.event_form_responses;
create policy form_responses_delete_self on public.event_form_responses
  for delete to authenticated using (user_id = auth.uid());
drop policy if exists form_responses_select_self_or_organizer on public.event_form_responses;
create policy form_responses_select_self_or_organizer on public.event_form_responses
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );
