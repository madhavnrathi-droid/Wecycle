import { supabase } from '../supabase';
import type { Insert, RequestRow, Update } from './types';

export async function listRequests(communityId?: string) {
  let q = supabase
    .from('requests')
    .select(`
      *,
      user:profiles!requests_user_id_fkey(id, username, full_name, initials, avatar_url, avatar_color, role),
      category:categories(id, label, icon)
    `)
    .eq('status', 'open')
    .order('posted_at', { ascending: false });

  if (communityId) q = q.eq('community_id', communityId);
  return q;
}

export async function createRequest(input: Insert<'requests'>) {
  return supabase.from('requests').insert(input).select().single();
}

export async function updateRequest(id: string, patch: Update<'requests'>) {
  return supabase.from('requests').update(patch).eq('id', id).select().single();
}

export async function fulfillRequest(id: string) {
  return updateRequest(id, { status: 'fulfilled' });
}

export async function cancelRequest(id: string) {
  return updateRequest(id, { status: 'cancelled' });
}

export async function offerHelp(requestId: string, message?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return supabase
    .from('request_offers')
    .insert({ request_id: requestId, user_id: user.id, message })
    .select()
    .single();
}

export async function listMyOffers(userId: string) {
  return supabase
    .from('request_offers')
    .select('*, request:requests(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export type { RequestRow };
