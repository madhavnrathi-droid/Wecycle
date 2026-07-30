-- Migration 20260724145257 · harden_event_form_responses
-- Exported from the live project's applied-migration history.
-- Review fix: the INSERT policy accepted any (event_id, form_id) pair, letting
-- any authenticated user forge a "response" onto any published event. Require
-- the form to exist AND belong to the named event.
drop policy if exists form_responses_insert_self on public.event_form_responses;
create policy form_responses_insert_self on public.event_form_responses
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.event_forms f
      where f.id = event_form_responses.form_id
        and f.event_id = event_form_responses.event_id
    )
  );

-- Review fix: organizers had no way to remove a single abusive/forged response
-- (their only remedy deleted the whole form + every response).
drop policy if exists form_responses_delete_organizer on public.event_form_responses;
create policy form_responses_delete_organizer on public.event_form_responses
  for delete to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- Review fix: uploaded files could only be deleted by the uploader, so form
-- removal / event deletion orphaned every file. Let the organizer clean up
-- their event's folder.
drop policy if exists form_uploads_delete_organizer on storage.objects;
create policy form_uploads_delete_organizer on storage.objects
  for delete to authenticated using (
    bucket_id = 'form-uploads'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.organizer_id = auth.uid()
    )
  );
