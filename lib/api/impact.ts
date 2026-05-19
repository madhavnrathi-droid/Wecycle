import { supabase } from '../supabase';
import type { Profile } from './types';

export interface ImpactSummary {
  profile: Profile;
  community_rank: number | null;
  global_rank: number | null;
  community_members: number | null;
}

export async function getMyImpact(): Promise<ImpactSummary | null> {
  const { data, error } = await supabase.rpc('rpc_my_impact_summary');
  if (error) throw error;
  return data as unknown as ImpactSummary;
}

export async function getLeaderboard(communityId?: string, limit = 20) {
  let q = supabase
    .from('leaderboard_view')
    .select('*')
    .order('community_rank', { ascending: true })
    .limit(limit);
  if (communityId) q = q.eq('community_id', communityId);
  return q;
}

export async function getCommunityStats(communityId: string) {
  return supabase.from('communities').select('*').eq('id', communityId).single();
}

export async function getMyActivity(limit = 20) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };
  return supabase
    .from('impact_log')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
}
