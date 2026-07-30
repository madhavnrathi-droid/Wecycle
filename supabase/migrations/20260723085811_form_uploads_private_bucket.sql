-- Migration 20260723085811 · form_uploads_private_bucket
-- Exported from the live project's applied-migration history.
-- Private bucket for form file answers. Path scheme:
--   {event_id}/{user_id}/{timestamp}-{n}.{ext}
-- PDF + images only, 10 MB cap (enforced at the bucket level).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-uploads', 'form-uploads', false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only into your own {event_id}/{auth.uid()}/ folder.
drop policy if exists form_uploads_insert_own on storage.objects;
create policy form_uploads_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'form-uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Read (incl. signed URLs): the uploader or the event organizer.
drop policy if exists form_uploads_read_own_or_organizer on storage.objects;
create policy form_uploads_read_own_or_organizer on storage.objects
  for select to authenticated using (
    bucket_id = 'form-uploads'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or exists (
        select 1 from public.events e
        where e.id::text = (storage.foldername(name))[1]
          and e.organizer_id = auth.uid()
      )
    )
  );

-- Delete: the uploader (withdrawing a response cleans up their files).
drop policy if exists form_uploads_delete_own on storage.objects;
create policy form_uploads_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'form-uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
