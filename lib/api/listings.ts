import { supabase } from '../supabase';
import type { Insert, Listing, Update } from './types';

export type ListingFilter = {
  communityId?: string;
  listingType?: 'free' | 'borrow' | 'swap' | 'sell' | 'all';
  category?: string;
  search?: string;
  limit?: number;
  cursor?: string; // posted_at ISO timestamp
};

/** Paginated marketplace query. */
export async function listListings(filter: ListingFilter = {}) {
  let q = supabase
    .from('listings')
    .select(`
      *,
      user:profiles!listings_user_id_fkey(id, username, full_name, initials, avatar_url, avatar_color, role),
      category:categories(id, label, icon)
    `)
    .eq('status', 'active')
    .order('posted_at', { ascending: false })
    .limit(filter.limit ?? 24);

  if (filter.communityId) q = q.eq('community_id', filter.communityId);
  if (filter.listingType && filter.listingType !== 'all') q = q.eq('listing_type', filter.listingType);
  if (filter.category && filter.category !== 'all') q = q.eq('category_id', filter.category);
  if (filter.search?.trim()) q = q.textSearch('title', filter.search, { type: 'websearch' });
  if (filter.cursor) q = q.lt('posted_at', filter.cursor);

  return q;
}

export async function getListing(id: string) {
  return supabase
    .from('listings')
    .select(`
      *,
      user:profiles!listings_user_id_fkey(*),
      category:categories(*),
      responses:listing_responses(*, user:profiles(id, username, full_name, initials, avatar_color))
    `)
    .eq('id', id)
    .single();
}

export async function myListings(userId: string) {
  return supabase
    .from('listings')
    .select('*')
    .eq('user_id', userId)
    .order('posted_at', { ascending: false });
}

export async function createListing(input: Insert<'listings'>) {
  return supabase.from('listings').insert(input).select().single();
}

export async function updateListing(id: string, patch: Update<'listings'>) {
  return supabase.from('listings').update(patch).eq('id', id).select().single();
}

export async function hideListing(id: string) {
  return updateListing(id, { status: 'hidden' });
}
export async function showListing(id: string) {
  return updateListing(id, { status: 'active' });
}
export async function deleteListing(id: string) {
  return supabase.from('listings').delete().eq('id', id);
}

/* ── Saves ── */

export async function listSaves(userId: string) {
  return supabase
    .from('saves')
    .select('listing_id, saved_at, listing:listings(*)')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
}

export async function toggleSave(listingId: string): Promise<{ saved: boolean }> {
  const { data, error } = await supabase.rpc('rpc_toggle_save', { _listing_id: listingId });
  if (error) throw error;
  return { saved: !!data };
}

/* ── Responses (express interest) ── */

export async function respondToListing(listingId: string, message?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return supabase
    .from('listing_responses')
    .insert({ listing_id: listingId, user_id: user.id, message })
    .select()
    .single();
}

export type { Listing };
