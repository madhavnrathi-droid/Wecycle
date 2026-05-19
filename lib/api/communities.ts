import { supabase } from '../supabase';
import type { Community } from './types';

export async function listCommunities() {
  return supabase
    .from('communities')
    .select('*')
    .eq('is_public', true)
    .order('member_count', { ascending: false });
}

export async function getCommunity(slugOrId: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  return supabase
    .from('communities')
    .select('*')
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .single();
}

export async function listCategories() {
  return supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
}

export async function joinCommunity(communityId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return supabase
    .from('community_members')
    .upsert({ community_id: communityId, user_id: user.id, role: 'member' })
    .select()
    .single();
}

export async function leaveCommunity(communityId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', user.id);
}

export async function myCommunities(userId: string) {
  return supabase
    .from('community_members')
    .select('*, community:communities(*)')
    .eq('user_id', userId);
}

export type { Community };
