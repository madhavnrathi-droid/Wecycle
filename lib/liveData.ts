'use client';

/* Live data layer — the bridge between Supabase rows and the UI's
 * MarketplaceItem shape, plus the create path for new posts.
 *
 *   - mapListingRow(): Supabase `listings` row (with joined profile +
 *     category) → MarketplaceItem the screens already know how to render.
 *   - fetchMarketplaceItems() / fetchMyUploads(): read paths.
 *   - createListingWithMedia(): uploads the picker's compressed blobs to the
 *     `listings` storage bucket, then inserts the row.
 *   - notifyPostsChanged() / onPostsChanged(): a tiny pub/sub so the feed +
 *     inventory refetch the instant a post lands, without prop-drilling.
 *
 * Everything degrades safely: with no Supabase env the stub client returns
 * empty arrays and create throws a friendly error.
 */

import { supabase, hasSupabaseEnv } from './supabase';
import type { MarketplaceItem, User } from './mockData';
import type { CompressedMedia } from './mediaCompression';

/* ── Row → MarketplaceItem ─────────────────────────── */

interface JoinedProfile {
  id: string;
  username?: string | null;
  full_name?: string | null;
  initials?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  role?: string | null;
  is_online?: boolean | null;
  email?: string | null;
  phone?: string | null;
  contact_email_enabled?: boolean | null;
  contact_whatsapp_enabled?: boolean | null;
}

interface ListingRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  listing_type: MarketplaceItem['listingType'];
  condition: MarketplaceItem['condition'];
  price: number | null;
  location: string | null;
  photo_urls: string[] | null;
  video_urls: string[] | null;
  photo_color: string | null;
  photo_icon: string | null;
  tags: string[] | null;
  response_count: number | null;
  posted_at: string;
  user?: JoinedProfile | null;
  category?: { id: string; label: string; icon: string } | null;
}

function daysAgo(iso: string): number {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function profileToUser(p: JoinedProfile | null | undefined, fallbackId: string): User {
  return {
    id: p?.id ?? fallbackId,
    name: p?.full_name || p?.username || 'Wecycle member',
    initials: p?.initials || 'W',
    color: p?.avatar_color || '#6C63FF',
    role: p?.role || 'Member',
    community: 'Wecycle',
    joinedDaysAgo: 0,
    itemsShared: 0,
    itemsReceived: 0,
    impactScore: 0,
    badges: [],
    isOnline: p?.is_online ?? false,
    email: p?.email ?? undefined,
    phone: p?.phone ?? undefined,
    contact: {
      email: p?.contact_email_enabled ?? true,
      whatsapp: p?.contact_whatsapp_enabled ?? false,
    },
  };
}

export function mapListingRow(row: ListingRow): MarketplaceItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category?.label ?? row.category_id ?? 'Other',
    listingType: row.listing_type,
    price: row.price ?? undefined,
    condition: row.condition,
    photoColor: row.photo_color ?? '#1C1C1A',
    photoIcon: row.photo_icon ?? '📦',
    location: row.location ?? '',
    user: profileToUser(row.user, row.user_id),
    saved: false,
    responses: row.response_count ?? 0,
    postedDaysAgo: daysAgo(row.posted_at),
    tags: row.tags ?? [],
    photoUrls: row.photo_urls ?? [],
    videoUrls: row.video_urls ?? [],
  };
}

const SELECT_WITH_JOINS = `
  *,
  user:profiles!listings_user_id_fkey(
    id, username, full_name, initials, avatar_url, avatar_color, role,
    is_online, contact_email_enabled, contact_whatsapp_enabled
  ),
  category:categories(id, label, icon)
`;

/* ── Reads ─────────────────────────────────────────── */

export interface FeedFilter {
  category?: string;    /* category id, or 'all' */
  search?: string;
  limit?: number;
}

export async function fetchMarketplaceItems(filter: FeedFilter = {}): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv) return [];
  let q = supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('status', 'active')
    .order('posted_at', { ascending: false })
    .limit(filter.limit ?? 60);

  if (filter.category && filter.category !== 'all') q = q.eq('category_id', filter.category);
  if (filter.search?.trim()) q = q.ilike('title', `%${filter.search.trim()}%`);

  const { data, error } = await q;
  if (error || !data) return [];
  return (data as unknown as ListingRow[]).map(mapListingRow);
}

export async function fetchMyUploads(userId: string): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('user_id', userId)
    .neq('status', 'removed')
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as ListingRow[]).map(mapListingRow);
}

export async function fetchListingsByUser(userId: string): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as ListingRow[]).map(mapListingRow);
}

/* ── Media upload ──────────────────────────────────── */

/** Upload a single compressed blob to {bucket}/{uid}/{ts}-{n}.{ext}.
 *  Returns the public URL. */
async function uploadOne(
  bucket: string,
  uid: string,
  media: CompressedMedia,
  index: number,
): Promise<string> {
  const ext = media.kind === 'video' ? 'mp4' : 'jpg';
  const path = `${uid}/${Date.now()}-${index}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, media.blob, {
    cacheControl: '3600',
    upsert: false,
    contentType: media.blob.type || (media.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export interface UploadedMedia {
  photoUrls: string[];
  videoUrls: string[];
}

/** Upload every picker blob, splitting photos vs videos. Order preserved. */
export async function uploadMedia(bucket: string, media: CompressedMedia[]): Promise<UploadedMedia> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const photoUrls: string[] = [];
  const videoUrls: string[] = [];
  let i = 0;
  for (const m of media) {
    const url = await uploadOne(bucket, user.id, m, i++);
    if (m.kind === 'video') videoUrls.push(url);
    else photoUrls.push(url);
  }
  return { photoUrls, videoUrls };
}

/* ── Create a listing ──────────────────────────────── */

export interface NewListingInput {
  title: string;
  category: string;       /* category id, lowercased */
  condition: 'like_new' | 'good' | 'fair';
  description?: string;
  location?: string;
  listingType: 'free' | 'sell' | 'borrow' | 'swap';
  price?: number;
  media: CompressedMedia[];
}

export async function createListingWithMedia(input: NewListingInput): Promise<MarketplaceItem> {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to post');

  /* Need the poster's community to satisfy the NOT NULL FK. */
  const { data: profile } = await supabase
    .from('profiles')
    .select('community_id')
    .eq('id', user.id)
    .single();
  const communityId = (profile as { community_id?: string } | null)?.community_id;
  if (!communityId) throw new Error('Your profile has no community yet — try signing out and back in.');

  /* 1. Upload media (if any). */
  const { photoUrls, videoUrls } = input.media.length
    ? await uploadMedia('listings', input.media)
    : { photoUrls: [], videoUrls: [] };

  /* 2. Insert the row. category_id must be an existing categories.id —
        we lowercase the label the form gave us. */
  const categoryId = input.category.trim().toLowerCase();
  const { data, error } = await supabase
    .from('listings')
    .insert({
      user_id: user.id,
      community_id: communityId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category_id: categoryId,
      listing_type: input.listingType,
      condition: input.condition,
      price: input.listingType === 'sell' ? (input.price ?? null) : null,
      location: input.location?.trim() || null,
      photo_urls: photoUrls,
      video_urls: videoUrls,
      tags: [],
      status: 'active',
    })
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) throw error;
  notifyPostsChanged();
  return mapListingRow(data as unknown as ListingRow);
}

/* ── Pub/sub: refetch feeds after a post ───────────── */

const CHANGE_EVENT = 'wecycle:posts-changed';

export function notifyPostsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function onPostsChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
