import { supabase } from '../supabase';
import type { Insert, LostFoundRow, Update } from './types';

export async function listLostFound(communityId?: string, status?: 'lost' | 'found') {
  let q = supabase
    .from('lost_found_reports')
    .select(`
      *,
      user:profiles!lost_found_reports_user_id_fkey(id, username, full_name, initials, avatar_color),
      category:categories(*)
    `)
    .order('posted_at', { ascending: false });

  if (communityId) q = q.eq('community_id', communityId);
  if (status) q = q.eq('status', status);
  return q;
}

export async function createReport(input: Insert<'lost_found_reports'>) {
  return supabase.from('lost_found_reports').insert(input).select().single();
}

export async function updateReport(id: string, patch: Update<'lost_found_reports'>) {
  return supabase.from('lost_found_reports').update(patch).eq('id', id).select().single();
}

export async function claimReport(id: string, claimedBy: string) {
  return updateReport(id, {
    status: 'claimed',
    claimed_by: claimedBy,
    claimed_at: new Date().toISOString(),
  });
}

export type { LostFoundRow };
