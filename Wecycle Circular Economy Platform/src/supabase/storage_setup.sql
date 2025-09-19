-- Create storage buckets for Wecycle application

-- Create uploads bucket for material images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create avatars bucket for profile pictures
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create reference_images bucket for request reference images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reference_images',
  'reference_images',
  true,
  3145728, -- 3MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for uploads bucket
CREATE POLICY "Anyone can view upload images" ON storage.objects FOR SELECT
USING (bucket_id = 'uploads');

CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own upload images" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'uploads' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own upload images" ON storage.objects FOR DELETE
USING (
  bucket_id = 'uploads' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policies for avatars bucket
CREATE POLICY "Anyone can view avatar images" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policies for reference_images bucket
CREATE POLICY "Anyone can view reference images" ON storage.objects FOR SELECT
USING (bucket_id = 'reference_images');

CREATE POLICY "Users can upload their own reference images" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'reference_images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own reference images" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'reference_images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own reference images" ON storage.objects FOR DELETE
USING (
  bucket_id = 'reference_images' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Function to clean up orphaned images when uploads are deleted
CREATE OR REPLACE FUNCTION cleanup_upload_images()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete images from storage when upload is deleted
  IF OLD.images IS NOT NULL AND array_length(OLD.images, 1) > 0 THEN
    -- Note: This requires a separate process to actually delete from storage
    -- as we can't directly call storage functions from triggers
    -- You can implement this via a scheduled job or external process
    RAISE NOTICE 'Upload % deleted, should clean up % images', OLD.id, array_length(OLD.images, 1);
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for upload image cleanup
CREATE TRIGGER upload_image_cleanup
  AFTER DELETE ON uploads
  FOR EACH ROW EXECUTE FUNCTION cleanup_upload_images();

-- Helper function to get storage URL for images
CREATE OR REPLACE FUNCTION get_storage_url(bucket_name TEXT, file_path TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE 
    WHEN file_path IS NULL OR file_path = '' THEN NULL
    ELSE concat(
      current_setting('app.settings.supabase_url', true),
      '/storage/v1/object/public/',
      bucket_name,
      '/',
      file_path
    )
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;