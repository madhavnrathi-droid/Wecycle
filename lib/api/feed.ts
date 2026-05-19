import { supabase } from '../supabase';

export type FeedEntityType = 'listing' | 'request' | 'event' | 'lost_found' | 'milestone' | 'announcement';

export interface FeedRow {
  id: string;
  entity_type: FeedEntityType;
  author_id: string | null;
  community_id: string;
  title: string;
  body: string | null;
  posted_at: string;
  response_count: number;
  save_count: number;
  data: Record<string, unknown>;
}

/** Cursor-paginated unified feed for a community. */
export async function getCommunityFeed(
  communityId: string,
  opts: { limit?: number; before?: string } = {},
) {
  return supabase.rpc('rpc_community_feed', {
    _community_id: communityId,
    _limit: opts.limit ?? 20,
    _before: opts.before,
  });
}

/* ── Reactions ── */

export async function toggleLike(entityType: FeedEntityType, entityId: string): Promise<{ liked: boolean }> {
  const { data, error } = await supabase.rpc('rpc_toggle_like', {
    _entity_type: entityType,
    _entity_id: entityId,
  });
  if (error) throw error;
  return { liked: !!data };
}

export async function listMyReactions(entityType?: FeedEntityType) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };
  let q = supabase
    .from('reactions')
    .select('entity_type, entity_id, kind, created_at')
    .eq('user_id', user.id);
  if (entityType) q = q.eq('entity_type', entityType);
  return q;
}

/* ── Comments ── */

export async function listComments(entityType: FeedEntityType, entityId: string) {
  return supabase
    .from('comments')
    .select(`
      *,
      user:profiles(id, username, full_name, initials, avatar_color)
    `)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true });
}

export async function postComment(
  entityType: FeedEntityType,
  entityId: string,
  body: string,
  parentId?: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return supabase
    .from('comments')
    .insert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      body,
      parent_comment_id: parentId,
    })
    .select()
    .single();
}
