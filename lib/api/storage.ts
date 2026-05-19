import { supabase } from '../supabase';

export type Bucket = 'avatars' | 'listings' | 'lost-found' | 'events' | 'community';

/**
 * Upload a file to {bucket}/{userId}/{timestamp-filename}.
 * RLS enforces that uploads must go into the user's own folder.
 */
export async function uploadPhoto(bucket: Bucket, file: File): Promise<{ path: string; publicUrl: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function uploadMany(bucket: Bucket, files: File[]) {
  return Promise.all(files.map(f => uploadPhoto(bucket, f)));
}

export async function deletePhoto(bucket: Bucket, path: string) {
  return supabase.storage.from(bucket).remove([path]);
}

export function publicUrl(bucket: Bucket, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
