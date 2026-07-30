-- Migration 20260512090410 · 07_storage_buckets
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 07 · Storage buckets
-- ═══════════════════════════════════════════════════════
-- Path convention: {bucket}/{user_id}/{file}
-- That way the user_id segment is enforced via RLS.

-- Buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',    'avatars',    true, 5242880,  array['image/jpeg','image/png','image/webp','image/gif']),
  ('listings',   'listings',   true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('lost-found', 'lost-found', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('events',     'events',     true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('community',  'community',  true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage policies ──────────────────────────────────
-- Public read for all buckets
create policy storage_public_read on storage.objects
  for select to authenticated, anon
  using (bucket_id in ('avatars','listings','lost-found','events','community'));

-- Insert: user can upload only to their own folder ({uid}/...)
create policy storage_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars','listings','lost-found','events','community')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update: user can update only their own folder
create policy storage_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars','listings','lost-found','events','community')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: user can delete only their own folder
create policy storage_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars','listings','lost-found','events','community')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
