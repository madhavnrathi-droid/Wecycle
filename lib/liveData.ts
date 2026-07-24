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
import type { MarketplaceItem, User, CommunityEvent, LostItem } from './mockData';
import { listingToComp } from './opportunity';
import type { CompressedMedia } from './mediaCompression';
import type { Database } from './database.types';

/* ── Row → MarketplaceItem ─────────────────────────── */

export interface JoinedProfile {
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
  /* 'item' (default) or 'opportunity' (a service offer). Column added by the
     add_kind_to_listings migration; existing rows default to 'item'. */
  kind: string | null;
  /* Opportunity compensation (add_opportunity_compensation migration): 'volunteer'
     | 'free' | 'paid', with an optional price_band when paid. Null for items. */
  comp: string | null;
  price_band: string | null;
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
  save_count: number | null;
  view_count: number | null;
  posted_at: string;
  user?: JoinedProfile | null;
  category?: { id: string; label: string; icon: string } | null;
}

function daysAgo(iso: string): number {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function profileToUser(p: JoinedProfile | null | undefined, fallbackId: string): User {
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
    /* email/phone are intentionally NOT carried on feed rows anymore — the raw
       columns are locked down at the DB so the feed can't leak them in bulk.
       Detail screens fetch a single owner's contact on demand via fetchContact
       (get_contact RPC). The booleans below still drive whether to even show a
       contact channel. */
    contact: {
      email: p?.contact_email_enabled ?? true,
      whatsapp: p?.contact_whatsapp_enabled ?? false,
    },
  };
}

/* ── On-demand contact lookup ──────────────────────────
   email/phone columns are REVOKEd from anon/authenticated so the feed can't be
   used to harvest them in bulk. When a signed-in user actually opens a post, we
   resolve that one owner's contact through the get_contact SECURITY DEFINER RPC,
   which returns the OWN row in full and others' filtered by their share prefs. */
export async function fetchContact(userId: string): Promise<{ email?: string; phone?: string }> {
  if (!hasSupabaseEnv || !userId) return {};
  /* get_contact was added out-of-band and isn't in the generated Database
     types — call it through a narrow cast rather than `any`. */
  const rpc = supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: Array<{ email: string | null; phone: string | null }> | null; error: unknown }>;
  const { data, error } = await rpc('get_contact', { target: userId });
  if (error || !data || data.length === 0) return {};
  return { email: data[0].email ?? undefined, phone: data[0].phone ?? undefined };
}

/* ── Feed cache (stale-while-revalidate) ───────────────
   The home feed is the same community feed for every viewer, so we persist the
   last successful fetch and rehydrate it INSTANTLY on the next open — the screen
   paints from cache immediately, then refreshes in the background. This removes
   the "feed sits on a loading state after it opens" pause on repeat visits. */
export interface FeedCache {
  items: MarketplaceItem[];
  requests: MarketplaceItem[];
  events: CommunityEvent[];
  lostFound: LostItem[];
  /* Optional for back-compat: caches written before opportunities shipped
     won't carry this key — readers fall back to []. */
  opportunities?: MarketplaceItem[];
}

/* v2: events gained hasForm/viewCount/saveCount — old cached shapes would
   bypass registration forms and show fabricated counts, so bump the key. */
const FEED_CACHE_KEY = 'wecycle.feedCache.v2';
const FEED_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; /* ignore caches older than a week */

export function readFeedCache(): FeedCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: FeedCache };
    if (!parsed?.data || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > FEED_CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeFeedCache(data: FeedCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota exceeded / private mode — caching is best-effort, ignore */
  }
}

export function mapListingRow(row: ListingRow): MarketplaceItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category?.label ?? row.category_id ?? 'Other',
    categoryId: row.category_id ?? undefined,
    kind: row.kind === 'opportunity' ? 'opportunity' : 'item',
    /* For legacy opportunities posted before the comp column existed, infer
       comp from the listing_type ('sell'→paid, else free) so their labels +
       contact CTA don't fall through to "Rate on ask" / free-help. */
    comp: row.comp
      ? (row.comp as MarketplaceItem['comp'])
      : (row.kind === 'opportunity' ? listingToComp(row.listing_type) : undefined),
    priceBand: (row.price_band as MarketplaceItem['priceBand']) ?? undefined,
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
    viewCount: row.view_count ?? 0,
    saveCount: row.save_count ?? 0,
    isClosed: (row as { status?: string }).status === 'completed',
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

/* ── Optimistic overlay ────────────────────────────────
   Ids the user just deleted. We filter these out of every read immediately
   so a deleted post never flashes back while the server round-trips or a
   stale refetch lands. Cleared lazily — the set staying small is fine. */
const removedIds = new Set<string>();
function notRemoved<T extends { id: string }>(rows: T[]): T[] {
  return removedIds.size ? rows.filter(r => !removedIds.has(r.id)) : rows;
}

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
    /* Keep completed (sold/given) listings in the feed — they render dimmed
       with a status ribbon rather than vanishing. */
    .in('status', ['active', 'completed'])
    /* Only physical-item listings here — service opportunities live on their
       own Services tab, fetched by fetchOpportunities. */
    .eq('kind', 'item')
    .order('posted_at', { ascending: false })
    .limit(filter.limit ?? 60);

  if (filter.category && filter.category !== 'all') q = q.eq('category_id', filter.category);
  if (filter.search?.trim()) q = q.ilike('title', `%${filter.search.trim()}%`);

  const { data, error } = await q;
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
}

/* Service opportunities — the same listings table filtered to kind='opportunity'.
   Mirrors fetchMarketplaceItems so the Services tab behaves like Shared. */
export async function fetchOpportunities(filter: FeedFilter = {}): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv) return [];
  let q = supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .in('status', ['active', 'completed'])
    .eq('kind', 'opportunity')
    .order('posted_at', { ascending: false })
    .limit(filter.limit ?? 60);

  if (filter.category && filter.category !== 'all') q = q.eq('category_id', filter.category);
  if (filter.search?.trim()) q = q.ilike('title', `%${filter.search.trim()}%`);

  const { data, error } = await q;
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
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
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
}

export async function fetchListingsByUser(userId: string): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('user_id', userId)
    /* Physical items only — the public storefront's Shared masonry renders
       ItemTiles (not opportunity-aware), and the hero "Shared" stat already
       excludes opportunities, so keeping them out avoids a bare-₹ mislabel
       and a count mismatch. Services surface via the feed's Services tab. */
    .eq('kind', 'item')
    .in('status', ['active', 'completed'])
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
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
  // Keep the .png extension for transparent cutouts (bg-removed photos) so the
  // feed can tell them apart from ordinary opaque photos by their URL.
  const ext = media.kind === 'video' ? 'mp4' : (media.blob.type === 'image/png' ? 'png' : 'jpg');
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
  notifyOnEngagement?: boolean;
  /* 'item' (default) for a physical listing, 'opportunity' for a service. */
  kind?: 'item' | 'opportunity';
  /* Opportunity-only: compensation + optional paid price band. */
  comp?: 'volunteer' | 'free' | 'paid';
  priceBand?: 'under_200' | '200_500' | '500_1000' | 'over_1000';
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
      kind: input.kind ?? 'item',
      comp: input.kind === 'opportunity' ? (input.comp ?? 'free') : null,
      price_band: input.kind === 'opportunity' ? (input.priceBand ?? null) : null,
      listing_type: input.listingType,
      condition: input.condition,
      price: input.listingType === 'sell' ? (input.price ?? null) : null,
      location: input.location?.trim() || null,
      photo_urls: photoUrls,
      video_urls: videoUrls,
      tags: [],
      status: 'active',
      notify_on_engagement: input.notifyOnEngagement ?? true,
    } as never)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) throw error;
  notifyPostsChanged();
  return mapListingRow(data as unknown as ListingRow);
}

/* ════════════════════════════════════════════════════
   REQUESTS
   ════════════════════════════════════════════════════ */

export interface NewRequestInput {
  title: string;
  category: string;
  description?: string;
  urgency: 'normal' | 'urgent';
  needByDate?: string;     /* ISO date or '' */
  /** Auto-expire window in hours. Defaults to 168 (7d) when omitted. The
   *  slider in PostRequestModal lets users pick 24–168 in 1h increments. */
  durationHours?: number;
  media: CompressedMedia[];
  /** When true, the backend will push a notification to the poster when
   *  someone offers to fulfil the request. Optional — defaults to false. */
  notifyOnEngagement?: boolean;
}

async function resolveCommunityId(userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles').select('community_id').eq('id', userId).single();
  const cid = (data as { community_id?: string } | null)?.community_id;
  if (!cid) throw new Error('Your profile has no community yet — sign out and back in.');
  return cid;
}

export async function createRequest(input: NewRequestInput) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to post');
  const communityId = await resolveCommunityId(user.id);

  const { photoUrls, videoUrls } = input.media.length
    ? await uploadMedia('listings', input.media)
    : { photoUrls: [], videoUrls: [] };

  /* Clamp duration to the allowed window [24, 168]. Anything missing
     defaults to a full week — long enough that nobody loses a post by
     accident, short enough that the requests board stays fresh. */
  const hours = Math.max(24, Math.min(168, input.durationHours ?? 168));
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('requests').insert({
    user_id: user.id,
    community_id: communityId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    category_id: input.category.trim().toLowerCase() || null,
    urgency: input.urgency,
    need_by_date: input.needByDate || null,
    status: 'open',
    photo_urls: photoUrls,
    video_urls: videoUrls,
    expires_at: expiresAt,
    notify_on_engagement: input.notifyOnEngagement ?? true,
  } as never);
  if (error) throw error;
  notifyPostsChanged();
}

/* ════════════════════════════════════════════════════
   EVENTS
   ════════════════════════════════════════════════════ */

export interface NewEventInput {
  title: string;
  eventType: 'swap' | 'repair' | 'cleanup' | 'workshop' | 'drive' | 'challenge';
  date: string;            /* yyyy-mm-dd */
  time: string;            /* HH:MM */
  location: string;
  description?: string;
  maxAttendees?: number;
  media: CompressedMedia[];
}

/** Returns the new event's id so callers can attach extras (e.g. a
 *  registration form) right after creation. */
export async function createEvent(input: NewEventInput): Promise<string> {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to post');
  const communityId = await resolveCommunityId(user.id);

  const { photoUrls, videoUrls } = input.media.length
    ? await uploadMedia('events', input.media)
    : { photoUrls: [], videoUrls: [] };

  /* Combine date + time into a timestamptz. Falls back to midnight when the
     time is blank. */
  const startsAt = new Date(`${input.date}T${input.time || '00:00'}:00`).toISOString();

  const { data, error } = await supabase.from('events').insert({
    organizer_id: user.id,
    community_id: communityId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    event_type: input.eventType,
    starts_at: startsAt,
    location: input.location.trim(),
    max_attendees: input.maxAttendees ?? null,
    status: 'published',
    cover_url: photoUrls[0] ?? null,
    photo_urls: photoUrls,
    video_urls: videoUrls,
  }).select('id').single();
  if (error) throw error;
  notifyPostsChanged();
  return (data as { id: string }).id;
}

/* ════════════════════════════════════════════════════
   LOST & FOUND
   ════════════════════════════════════════════════════ */

export interface NewLostFoundInput {
  title: string;
  status: 'lost' | 'found';
  description?: string;
  category?: string;
  lastSeen?: string;
  reward?: string;
  media: CompressedMedia[];
  /** When true, notify the poster when someone responds. Optional. */
  notifyOnEngagement?: boolean;
}

export async function createLostFound(input: NewLostFoundInput) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to post');
  const communityId = await resolveCommunityId(user.id);

  const { photoUrls, videoUrls } = input.media.length
    ? await uploadMedia('lost-found', input.media)
    : { photoUrls: [], videoUrls: [] };

  const { error } = await supabase.from('lost_found_reports').insert({
    user_id: user.id,
    community_id: communityId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    category_id: input.category?.trim().toLowerCase() || null,
    status: input.status,
    last_seen: input.lastSeen?.trim() || null,
    reward: input.reward?.trim() || null,
    photo_urls: photoUrls,
    video_urls: videoUrls,
    notify_on_engagement: input.notifyOnEngagement ?? true,
  } as never);
  if (error) throw error;
  notifyPostsChanged();
}

/* ════════════════════════════════════════════════════
   READ: requests (with mapper → MarketplaceItem-shaped)
   ════════════════════════════════════════════════════ */

interface RequestRowLite {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  urgency: 'normal' | 'urgent';
  need_by_date: string | null;
  photo_urls: string[] | null;
  video_urls: string[] | null;
  offer_count: number | null;
  posted_at: string;
  user?: JoinedProfile | null;
}

/** Title-case a lowercase category id ("electronics" → "Electronics"). */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

/** Requests render through the MarketplaceItem cards but flagged `isRequest`
 *  so the UI shows a "Wanted" chip + "Respond / I can help" action instead of
 *  a price and a listing-type verb. `listingType` is irrelevant for requests
 *  (kept as 'free' purely to satisfy the type — the UI never reads it when
 *  isRequest is true). */
export function mapRequestRow(row: RequestRowLite): MarketplaceItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category_id ? titleCase(row.category_id) : 'Other',
    listingType: 'free',
    condition: 'good',
    photoColor: '#1C1C1A',
    photoIcon: '🙋',
    location: '',
    user: profileToUser(row.user, row.user_id),
    saved: false,
    responses: row.offer_count ?? 0,
    postedDaysAgo: daysAgo(row.posted_at),
    tags: row.urgency === 'urgent' ? ['urgent'] : [],
    photoUrls: row.photo_urls ?? [],
    videoUrls: row.video_urls ?? [],
    isRequest: true,
    urgent: row.urgency === 'urgent',
    needBy: row.need_by_date ?? undefined,
    isClosed: (row as { status?: string }).status === 'fulfilled',
  };
}

const REQUEST_SELECT = `
  *,
  user:profiles!requests_user_id_fkey(
    id, username, full_name, initials, avatar_url, avatar_color, role,
    is_online, contact_email_enabled, contact_whatsapp_enabled
  )
`;

export async function fetchRequests(filter: FeedFilter = {}): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv) return [];
  /* Only return requests that haven't expired. We use server-side `gt`
     for the cheap index hit; the .or() also surfaces legacy rows where
     expires_at is still null. */
  const nowIso = new Date().toISOString();
  let q = supabase
    .from('requests')
    .select(REQUEST_SELECT)
    /* Keep fulfilled requests visible (dimmed "Fulfilled" ribbon) so the
       board reads as a place where asks actually get answered. */
    .in('status', ['open', 'fulfilled'])
    .or(`expires_at.gt.${nowIso},expires_at.is.null`)
    .order('posted_at', { ascending: false })
    .limit(filter.limit ?? 60);
  if (filter.category && filter.category !== 'all') q = q.eq('category_id', filter.category);
  if (filter.search?.trim()) q = q.ilike('title', `%${filter.search.trim()}%`);
  const { data, error } = await q;
  if (error || !data) return [];
  return notRemoved((data as unknown as RequestRowLite[]).map(mapRequestRow));
}

/** Best-effort sweep of past-due requests. Fire-and-forget on app open —
 *  RLS lets a user delete their own; admin nukes anyone's. */
export async function purgeExpiredRequests() {
  if (!hasSupabaseEnv) return;
  const cutoff = new Date().toISOString();
  await supabase.from('requests').delete().lt('expires_at', cutoff);
  notifyPostsChanged();
}

export async function fetchMyRequests(userId: string): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('requests')
    .select(REQUEST_SELECT)
    .eq('user_id', userId)
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return notRemoved((data as unknown as RequestRowLite[]).map(mapRequestRow));
}

/* ════════════════════════════════════════════════════
   READ: events + lost-found (with mappers)
   ════════════════════════════════════════════════════ */

const EVENT_SELECT = `
  *,
  organizer:profiles!events_organizer_id_fkey(
    id, username, full_name, initials, avatar_url, avatar_color, role,
    is_online, contact_email_enabled, contact_whatsapp_enabled
  ),
  form:event_forms(id)
`;

interface EventRowLite {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  event_type: CommunityEvent['eventType'];
  color_accent: string | null;
  starts_at: string;
  location: string;
  max_attendees: number | null;
  attendee_count: number | null;
  view_count: number | null;
  save_count: number | null;
  photo_urls: string[] | null;
  video_urls: string[] | null;
  cover_url: string | null;
  organizer?: JoinedProfile | null;
  /* event_forms is UNIQUE on event_id, so the join is a single object (or
     null). Presence = "this event has a registration form". */
  form?: { id: string } | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
}

export function mapEventRow(row: EventRowLite): CommunityEvent & { photoUrls?: string[]; videoUrls?: string[] } {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    eventType: row.event_type,
    date: fmtDate(row.starts_at),
    time: fmtTime(row.starts_at),
    location: row.location,
    attendees: row.attendee_count ?? 0,
    maxAttendees: row.max_attendees ?? undefined,
    colorAccent: row.color_accent ?? '#A8DD00',
    organizer: profileToUser(row.organizer, row.organizer_id),
    tags: [],
    rsvpd: false,
    hasForm: !!row.form,
    viewCount: row.view_count ?? 0,
    saveCount: row.save_count ?? 0,
    photoUrls: row.photo_urls ?? [],
    videoUrls: row.video_urls ?? [],
  };
}

/* Events past their starts_at are auto-hidden client-side. We don't trust the
   server clock alone — a viewer hitting the page right after start would still
   see the event for a few seconds. Filtering here makes it instant. */
function notExpired(rows: EventRowLite[]): EventRowLite[] {
  const now = Date.now();
  return rows.filter(r => {
    const ts = new Date(r.starts_at).getTime();
    return Number.isFinite(ts) && ts > now;
  });
}

export async function fetchEvents(): Promise<CommunityEvent[]> {
  if (!hasSupabaseEnv) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  const live = notExpired(data as unknown as EventRowLite[]);
  return notRemoved(live.map(mapEventRow));
}

export async function fetchEventsByUser(userId: string): Promise<CommunityEvent[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('organizer_id', userId)
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  /* Owner's inventory also drops expired events — they're cleaned up. */
  const live = notExpired(data as unknown as EventRowLite[]);
  return notRemoved(live.map(mapEventRow));
}

/** Best-effort cleanup of past-dated events. Fire-and-forget — RLS lets the
 *  organizer delete their own, the admin lets everyone's go. Called by a tiny
 *  client-side janitor on app load. */
export async function purgeExpiredEvents() {
  if (!hasSupabaseEnv) return;
  const cutoff = new Date().toISOString();
  await supabase.from('events').delete().lt('starts_at', cutoff);
  notifyPostsChanged();
}

/* ── RSVPs (real persistence — event_rsvps + rpc_toggle_rsvp) ──── */

/** Toggle the signed-in user's RSVP. Returns the resulting state. The DB
 *  trigger maintains events.attendee_count and notifies the organizer. */
export async function toggleEventRsvp(eventId: string): Promise<'going' | 'cancelled'> {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { data, error } = await supabase.rpc('rpc_toggle_rsvp', { _event_id: eventId });
  if (error) throw error;
  notifyPostsChanged();
  return (data as string) === 'going' ? 'going' : 'cancelled';
}

/** Ids of events the user is going to — hydrates the app-level RSVP set. */
export async function fetchMyRsvpIds(userId: string): Promise<Set<string>> {
  if (!hasSupabaseEnv || !userId) return new Set();
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'going');
  if (error || !data) return new Set();
  return new Set((data as Array<{ event_id: string }>).map(r => r.event_id));
}

export interface EventAttendee {
  user: User;
  rsvpedAt: string;
}

/** Attendee list for the organizer's insights — profiles join carries only
 *  the non-PII columns (email/phone stay locked behind get_contact). */
export async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  if (!hasSupabaseEnv) return [];
  const { data, error } = await supabase
    .from('event_rsvps')
    .select(`
      user_id, rsvped_at,
      user:profiles!event_rsvps_user_id_fkey(
        id, username, full_name, initials, avatar_url, avatar_color, role, is_online
      )
    `)
    .eq('event_id', eventId)
    .eq('status', 'going')
    .order('rsvped_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Array<{
    user_id: string; rsvped_at: string; user?: JoinedProfile | null;
  }>).map(r => ({
    user: profileToUser(r.user, r.user_id),
    rsvpedAt: r.rsvped_at,
  }));
}

/* ── Event views + saves (insights metrics) ────────── */

/** Fire-and-forget view bump — mirrors incrementListingView. */
export function incrementEventView(id: string): void {
  if (!hasSupabaseEnv) return;
  supabase.rpc('rpc_increment_event_view' as never, { _event_id: id } as never).then(() => {}, () => {});
}

/** Toggle a save (heart) on an event. Returns the new saved state. */
export async function toggleEventSave(id: string): Promise<boolean> {
  if (!hasSupabaseEnv) return false;
  const { data, error } = await supabase.rpc('rpc_toggle_event_save' as never, { _event_id: id } as never);
  if (error) throw error;
  return !!data;
}

/** Event ids the user has saved (hydrates hearts). */
export async function fetchSavedEventIds(userId: string): Promise<Set<string>> {
  if (!hasSupabaseEnv || !userId) return new Set();
  const { data, error } = await supabase
    .from('event_saves' as never)
    .select('event_id' as never)
    .eq('user_id' as never, userId as never);
  if (error || !data) return new Set();
  return new Set((data as unknown as Array<{ event_id: string }>).map(r => r.event_id));
}

/** Comment count for one event — head-count query, same pattern as
 *  fetchProfileStats. Used by organizer insights. */
export async function fetchEventCommentCount(eventId: string): Promise<number> {
  if (!hasSupabaseEnv) return 0;
  const { count } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'event')
    .eq('entity_id', eventId);
  return count ?? 0;
}

/* ── Event edit + delete ───────────────────────────── */

export interface EditEventPatch {
  title?: string;
  eventType?: 'swap' | 'repair' | 'cleanup' | 'workshop' | 'drive' | 'challenge';
  date?: string;     /* yyyy-mm-dd */
  time?: string;     /* HH:MM */
  location?: string;
  description?: string;
  maxAttendees?: number;
}

export async function updateEvent(id: string, patch: EditEventPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined)       update.title = patch.title.trim();
  if (patch.eventType !== undefined)   update.event_type = patch.eventType;
  if (patch.location !== undefined)    update.location = patch.location.trim();
  if (patch.description !== undefined) update.description = patch.description.trim() || null;
  if (patch.maxAttendees !== undefined) update.max_attendees = patch.maxAttendees ?? null;
  if (patch.date !== undefined || patch.time !== undefined) {
    /* Recompose starts_at from whichever parts we have. */
    update.starts_at = new Date(`${patch.date ?? '1970-01-01'}T${patch.time || '00:00'}:00`).toISOString();
  }
  const { error } = await supabase.from('events').update(update as never).eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/** Best-effort purge of every registration-form upload under an event's
 *  folder in the private form-uploads bucket ({eventId}/{userId}/file). The
 *  organizer-delete storage policy makes this legal for the event's owner.
 *  DB rows cascade on delete; storage objects don't — hence this sweep. */
export async function purgeEventFormUploads(eventId: string): Promise<void> {
  if (!hasSupabaseEnv) return;
  try {
    const bucket = supabase.storage.from('form-uploads');
    const { data: folders } = await bucket.list(eventId, { limit: 200 });
    if (!folders?.length) return;
    const paths: string[] = [];
    for (const folder of folders) {
      const { data: files } = await bucket.list(`${eventId}/${folder.name}`, { limit: 100 });
      for (const f of files ?? []) paths.push(`${eventId}/${folder.name}/${f.name}`);
    }
    if (paths.length) await bucket.remove(paths);
  } catch {
    /* cleanup is best-effort — orphaned objects are invisible (private
       bucket) and harmless beyond storage space */
  }
}

export async function deleteEvent(id: string) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  removedIds.add(id);
  notifyPostsChanged();
  /* Purge form-upload files FIRST — after the row deletion cascades away the
     events row, the organizer-delete storage policy can no longer verify
     ownership and the objects would orphan. */
  await purgeEventFormUploads(id);
  const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) {
    removedIds.delete(id);
    notifyPostsChanged();
    throw error ?? new Error('Could not delete — you may not own this event.');
  }
}

const LF_SELECT = `
  *,
  user:profiles!lost_found_reports_user_id_fkey(
    id, username, full_name, initials, avatar_url, avatar_color, role,
    is_online, contact_email_enabled, contact_whatsapp_enabled
  )
`;

interface LostFoundRowLite {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  status: 'lost' | 'found' | 'claimed' | 'returned';
  last_seen: string | null;
  photo_color: string | null;
  photo_icon: string | null;
  photo_urls: string[] | null;
  reward: string | null;
  verified: boolean;
  posted_at: string;
  user?: JoinedProfile | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function mapLostFoundRow(row: LostFoundRowLite): LostItem & { photoUrls?: string[] } {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category_id ?? undefined,
    status: (row.status === 'returned' ? 'claimed' : row.status) as LostItem['status'],
    lastSeen: row.last_seen ?? '',
    photoColor: row.photo_color ?? '#1C1C1A',
    photoIcon: row.photo_icon ?? '🔍',
    user: profileToUser(row.user, row.user_id),
    timeAgo: timeAgo(row.posted_at),
    reward: row.reward ?? undefined,
    verified: row.verified,
    photoUrls: row.photo_urls ?? [],
  };
}

export async function fetchLostFound(): Promise<(LostItem & { photoUrls?: string[] })[]> {
  if (!hasSupabaseEnv) return [];
  const { data, error } = await supabase
    .from('lost_found_reports')
    .select(LF_SELECT)
    .in('status', ['lost', 'found'])
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return notRemoved((data as unknown as LostFoundRowLite[]).map(mapLostFoundRow));
}

/** Just the lost/found posts the signed-in user opened. Powers the L&F
 *  group in the Inventory "All" tab. */
export async function fetchLostFoundByUser(userId: string): Promise<(LostItem & { photoUrls?: string[] })[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('lost_found_reports')
    .select(LF_SELECT)
    .eq('user_id', userId)
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return notRemoved((data as unknown as LostFoundRowLite[]).map(mapLostFoundRow));
}

/* ── Deep link: open a single post by id ──────────────
   Powers shareable product links (`/?p=<id>`). Tries each post type in
   turn and returns the first match, mapped to its app shape, so the host
   can route it to the right detail screen. */
export type DeepLinkPost =
  | { kind: 'item'; data: MarketplaceItem }
  | { kind: 'request'; data: MarketplaceItem }
  | { kind: 'event'; data: CommunityEvent & { photoUrls?: string[] } }
  | { kind: 'lostfound'; data: LostItem & { photoUrls?: string[] } };

export async function fetchPostById(id: string): Promise<DeepLinkPost | null> {
  if (!hasSupabaseEnv || !id) return null;

  const listing = await supabase.from('listings').select(SELECT_WITH_JOINS).eq('id', id).maybeSingle();
  if (listing.data) return { kind: 'item', data: mapListingRow(listing.data as unknown as ListingRow) };

  const request = await supabase.from('requests').select(REQUEST_SELECT).eq('id', id).maybeSingle();
  if (request.data) return { kind: 'request', data: mapRequestRow(request.data as unknown as RequestRowLite) };

  const event = await supabase.from('events').select(EVENT_SELECT).eq('id', id).maybeSingle();
  if (event.data) return { kind: 'event', data: mapEventRow(event.data as unknown as EventRowLite) };

  const lf = await supabase.from('lost_found_reports').select(LF_SELECT).eq('id', id).maybeSingle();
  if (lf.data) return { kind: 'lostfound', data: mapLostFoundRow(lf.data as unknown as LostFoundRowLite) };

  return null;
}

/* ── Lost & Found: edit + repost ───────────────────── */

export interface EditLostFoundPatch {
  title?: string;
  description?: string;
  status?: 'lost' | 'found';
  lastSeen?: string;
  reward?: string;
}

export async function updateLostFoundFields(id: string, patch: EditLostFoundPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined)       update.title = patch.title.trim();
  if (patch.description !== undefined) update.description = patch.description.trim() || null;
  if (patch.status !== undefined)      update.status = patch.status;
  if (patch.lastSeen !== undefined)    update.last_seen = patch.lastSeen.trim() || null;
  if (patch.reward !== undefined)      update.reward = patch.reward.trim() || null;
  const { error } = await supabase.from('lost_found_reports').update(update as never).eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

export async function repostLostFound(id: string, patch?: EditLostFoundPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  if (patch) await updateLostFoundFields(id, patch);
  const { error } = await supabase
    .from('lost_found_reports')
    .update({ posted_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

export async function updateLostFoundMedia(id: string, photoUrls: string[]) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('lost_found_reports')
    .update({ photo_urls: photoUrls, updated_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/* ════════════════════════════════════════════════════
   UPDATE / DELETE / REPOST a listing
   ════════════════════════════════════════════════════ */

export interface EditListingPatch {
  title?: string;
  category?: string;        /* category id, lowercased */
  condition?: 'like_new' | 'good' | 'fair';
  description?: string;
  location?: string;
  listingType?: 'free' | 'sell' | 'borrow' | 'swap';
  price?: number;
  isHidden?: boolean;
  /* Opportunity-only compensation edits. */
  comp?: 'volunteer' | 'free' | 'paid';
  priceBand?: 'under_200' | '200_500' | '500_1000' | 'over_1000' | null;
}

type ListingUpdate = Database['public']['Tables']['listings']['Update'];

export async function updateListingFields(id: string, patch: EditListingPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const update: ListingUpdate = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined)       update.title = patch.title.trim();
  if (patch.category !== undefined)    update.category_id = patch.category.trim().toLowerCase();
  if (patch.condition !== undefined)   update.condition = patch.condition;
  if (patch.description !== undefined) update.description = patch.description.trim() || null;
  if (patch.location !== undefined)    update.location = patch.location.trim() || null;
  if (patch.listingType !== undefined) {
    update.listing_type = patch.listingType;
    update.price = patch.listingType === 'sell' ? (patch.price ?? null) : null;
  } else if (patch.price !== undefined) {
    update.price = patch.price;
  }
  if (patch.comp !== undefined)        (update as { comp?: string }).comp = patch.comp;
  if (patch.priceBand !== undefined)   (update as { price_band?: string | null }).price_band = patch.priceBand;
  if (patch.isHidden !== undefined)    update.status = patch.isHidden ? 'hidden' : 'active';

  const { error } = await supabase.from('listings').update(update).eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/** Bump posted_at to now so the listing jumps to the top of the feed. */
export async function repostListing(id: string, patch?: EditListingPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  if (patch) await updateListingFields(id, patch);
  const { error } = await supabase
    .from('listings')
    .update({ posted_at: new Date().toISOString(), status: 'active' })
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/* Photos: replace the entire array of URLs (and the video array). The caller
   has already uploaded any new blobs and constructed the final URL lists. */
export async function updateListingMedia(
  id: string,
  photoUrls: string[],
  videoUrls: string[],
) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('listings')
    .update({
      photo_urls: photoUrls,
      video_urls: videoUrls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/* ── Requests: edit + repost (mirror of the listings helpers) ── */

export interface EditRequestPatch {
  title?: string;
  category?: string;
  description?: string;
  urgency?: 'normal' | 'urgent';
  needByDate?: string;     /* ISO date or '' to clear */
}

export async function updateRequestFields(id: string, patch: EditRequestPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined)       update.title = patch.title.trim();
  if (patch.category !== undefined)    update.category_id = patch.category.trim().toLowerCase();
  if (patch.description !== undefined) update.description = patch.description.trim() || null;
  if (patch.urgency !== undefined)     update.urgency = patch.urgency;
  if (patch.needByDate !== undefined)  update.need_by_date = patch.needByDate || null;
  const { error } = await supabase.from('requests').update(update as never).eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

export async function repostRequest(id: string, patch?: EditRequestPatch) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  if (patch) await updateRequestFields(id, patch);
  const { error } = await supabase
    .from('requests')
    .update({ posted_at: new Date().toISOString(), status: 'open' } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

export async function updateRequestMedia(
  id: string,
  photoUrls: string[],
  videoUrls: string[],
) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('requests')
    .update({
      photo_urls: photoUrls,
      video_urls: videoUrls,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/* ── Events: media update (alongside the existing updateEvent + deleteEvent) ── */
export async function updateEventMedia(
  id: string,
  photoUrls: string[],
  videoUrls: string[],
) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('events')
    .update({
      photo_urls: photoUrls,
      video_urls: videoUrls,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

export async function deleteListingById(id: string) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  /* Optimistic: hide it from every read immediately, then refresh so the
     inventory updates the instant we pop back — no waiting on the round-trip. */
  removedIds.add(id);
  notifyPostsChanged();
  /* `.select('id')` makes the delete return the rows it removed. If RLS
     silently blocked it (0 rows), we'd otherwise get a false success — so we
     surface that as an error and un-hide the item. */
  const { data, error } = await supabase
    .from('listings').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) {
    removedIds.delete(id);
    notifyPostsChanged();
    throw error ?? new Error('Could not delete — you may not own this post.');
  }
}

/** Try delete; also try requests/lost-found in case the id belongs there.
 *  Used by the generic detail-screen delete which doesn't know the post type. */
export async function deletePostById(id: string, kind: 'listing' | 'request' | 'lostfound' | 'event' = 'listing') {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const table =
    kind === 'request'  ? 'requests' :
    kind === 'lostfound' ? 'lost_found_reports' :
    kind === 'event'    ? 'events' :
    'listings';
  removedIds.add(id);
  notifyPostsChanged();
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) {
    removedIds.delete(id);
    notifyPostsChanged();
    throw error ?? new Error('Could not delete — you may not own this post.');
  }
}

/* ── Mark complete ──────────────────────────────────
   "Sold" / "Fulfilled" flip the post to a terminal status instead of deleting
   it. The post STAYS in the feed — rendered dimmed with a status ribbon
   ("Sold" / "Claimed" / "Fulfilled") — so the marketplace reads as an active,
   trustworthy community where things actually move, rather than one where
   posts silently disappear. The owner can still delete outright from the
   detail screen if they truly want it gone. */
export async function markListingSold(id: string) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('listings')
    .update({ status: 'completed', updated_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}
export async function markRequestCompleted(id: string) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('requests')
    .update({ status: 'fulfilled', updated_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}
/* L&F still resolves by removal — it has its own dedicated status UI on the
   L&F screen and isn't part of the marketplace masonry. */
export async function markLostFoundResolved(id: string) {
  return deletePostById(id, 'lostfound');
}

/** Bump a listing's view counter (fire-and-forget — never blocks the UI). */
export function incrementListingView(id: string) {
  /* Append to localStorage recently-viewed regardless of backend, so the
     "Recently viewed" rail still works in demo and signed-out. */
  pushRecentlyViewed(id);
  if (!hasSupabaseEnv) return;
  /* SECURITY DEFINER RPC — viewers can't UPDATE the row directly. */
  supabase.rpc('rpc_increment_listing_view', { _listing_id: id }).then(() => {}, () => {});
}

/* ══════════════════════════════════════════════════════════════════
   RECENTLY VIEWED (localStorage-only, per device)
   ══════════════════════════════════════════════════════════════════ */

const RECENTLY_VIEWED_KEY = 'wecycle.recentlyViewed.v1';
const RECENTLY_VIEWED_CAP = 30;

function pushRecentlyViewed(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr : [];
    /* Dedupe + most-recent-first, cap at N. */
    const next = [id, ...list.filter(x => x !== id)].slice(0, RECENTLY_VIEWED_CAP);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch { /* quota / private mode — fail soft */ }
}

function getRecentlyViewedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/* ══════════════════════════════════════════════════════════════════
   RELATED-ITEMS FETCHERS — Amazon-style detail-page rails
   ──────────────────────────────────────────────────────────────────
   Each fetcher returns 0..limit MarketplaceItems. All return [] in demo
   mode / when Supabase isn't configured so the orchestrator can just
   skip the rail when empty (per the user spec — no mock content).
   ══════════════════════════════════════════════════════════════════ */

/** More listings from the same seller (excluding the current one). */
export async function fetchSellerListings(
  userId: string, excludeId: string, limit = 8, kind: 'item' | 'opportunity' = 'item',
): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('user_id', userId)
    .eq('kind', kind)
    .neq('id', excludeId)
    .in('status', ['active'])
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
}

/** Similar listings in the same category (excluding the current + same seller). */
export async function fetchSimilarListings(
  categoryId: string | null, excludeId: string, excludeUserId: string, limit = 10,
  kind: 'item' | 'opportunity' = 'item',
): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !categoryId) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('category_id', categoryId)
    .eq('kind', kind)
    .neq('id', excludeId)
    .neq('user_id', excludeUserId)
    .in('status', ['active'])
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
}

/** Free items in the community (listing_type = 'free'). */
export async function fetchFreeListings(
  excludeId: string, limit = 10, kind: 'item' | 'opportunity' = 'item',
): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('listing_type', 'free')
    .eq('kind', kind)
    .neq('id', excludeId)
    .in('status', ['active'])
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
}

/** Listings the user recently tapped (read from localStorage, fetched from DB
 *  in one shot, returned in viewed-order so the most recent sits leftmost.
 *  Skips the currently-open item and removed items. */
export async function fetchRecentlyViewedListings(
  excludeId: string, limit = 10, kind: 'item' | 'opportunity' = 'item',
): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv) return [];
  const ids = getRecentlyViewedIds().filter(id => id !== excludeId).slice(0, limit);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .in('id', ids)
    .eq('kind', kind)
    .in('status', ['active', 'completed']);
  if (error || !data) return [];
  const items = notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
  /* Restore viewed-order from the localStorage list — the .in() query
     comes back in arbitrary order. */
  const byId = new Map(items.map(it => [it.id, it]));
  return ids.map(id => byId.get(id)).filter((it): it is MarketplaceItem => !!it);
}

/** Open Lost & Found posts — rendered as native sponsored slots inside
 *  the related shelf. Random sample of recent open items so the same 4
 *  don't appear on every product page. */
export async function fetchLostFoundForAds(limit = 6): Promise<(LostItem & { photoUrls?: string[] })[]> {
  if (!hasSupabaseEnv) return [];
  /* Pull a wider pool than we need, then shuffle client-side so each
     product page surfaces a slightly different mix. */
  const pool = Math.max(limit * 3, 18);
  const { data, error } = await (supabase
    .from('lost_found_reports' as never)
    .select(LF_SELECT as never)
    .in('status' as never, ['lost', 'found'] as never)
    .order('posted_at' as never, { ascending: false })
    .limit(pool) as unknown as Promise<{ data: unknown[] | null; error: unknown }>);
  if (error || !data) return [];
  const rows = (data as unknown as LostFoundRowLite[]).map(mapLostFoundRow);
  /* Fisher-Yates would be cleaner but a single sort-by-random is plenty for
     a 6-item ad rail. */
  return rows
    .map(r => ({ r, k: hashStr(r.id) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, limit)
    .map(x => x.r);
}

/* Deterministic per-id shuffle key — same item bucket stays stable across
   re-mounts of the same page but varies across product pages because the
   pool composition changes. (Date-of-day salt to refresh once a day.) */
function hashStr(s: string): number {
  const salt = Math.floor((typeof performance !== 'undefined' ? Date.now() : 0) / 86_400_000);
  let h = salt | 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Generic fallback: most-recent active listings, excluding the current item
 *  and (optionally) a specific user. No category or type filter — used as the
 *  safety net when specific rails return empty. */
export async function fetchAnyOtherListings(
  excludeId: string,
  excludeUserId?: string,
  limit = 10,
  kind: 'item' | 'opportunity' = 'item',
): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv) return [];
  let q = supabase
    .from('listings')
    .select(SELECT_WITH_JOINS)
    .eq('kind', kind)
    .neq('id', excludeId)
    .in('status', ['active'])
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (excludeUserId) q = (q as typeof q).neq('user_id', excludeUserId) as never;
  const { data, error } = await (q as unknown as Promise<{ data: unknown[] | null; error: unknown }>);
  if (error || !data) return [];
  return notRemoved((data as unknown as ListingRow[]).map(mapListingRow));
}

/** Toggle a save on a listing for the signed-in user. Returns the new state. */
export async function toggleListingSave(id: string): Promise<boolean> {
  if (!hasSupabaseEnv) return false;
  const { data, error } = await supabase.rpc('rpc_toggle_save', { _listing_id: id });
  if (error) throw error;
  notifyPostsChanged();
  return !!data;
}

/** Set of listing IDs the signed-in user has saved. Cheap query (saves
 *  table is small per user) that the feed reads on mount so the heart
 *  icon's initial state matches the server.
 *
 *  Stale saves whose underlying listings have been deleted resolve to
 *  nothing in the JOIN below; we filter them out so the Saved tab doesn't
 *  show ghosts. The saves table has ON DELETE CASCADE on listing_id so
 *  the row is dropped automatically when the listing dies — this filter
 *  is belt-and-braces in case a stray row survives. */
export async function fetchSavedListingIds(userId: string): Promise<Set<string>> {
  if (!hasSupabaseEnv || !userId) return new Set();
  const { data, error } = await supabase
    .from('saves')
    .select('listing_id')
    .eq('user_id', userId);
  if (error || !data) return new Set();
  return new Set(
    (data as unknown as Array<{ listing_id: string }>).map(r => r.listing_id),
  );
}

/** Full saved listings for the inventory "Saved" tab — JOINs through the
 *  saves table to get only listings that still exist (CASCADE on delete
 *  handles the stale case, but the inner join here also acts as a guard). */
export async function fetchMySaves(userId: string): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  /* Query the saves table and pull in the joined listing row so we get
     the full MarketplaceItem shape — same join the feed uses. */
  const { data, error } = await supabase
    .from('saves')
    .select(`
      saved_at,
      listing:listings!saves_listing_id_fkey(
        *,
        user:profiles!listings_user_id_fkey(
          id, username, full_name, initials, avatar_url, avatar_color, role,
          is_online, contact_email_enabled, contact_whatsapp_enabled
        ),
        category:categories(id, label, icon)
      )
    `)
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });

  if (error || !data) return [];
  /* ListingRow doesn't carry the `status` column in its local type (the
     mapper doesn't need it), so we cast to a tagged superset for the
     filter step then map back. */
  type Row = { saved_at: string; listing: (ListingRow & { status?: string }) | null };
  const items = (data as unknown as Row[])
    .map(r => r.listing)
    .filter((l): l is ListingRow & { status?: string } =>
      l !== null && l.status !== 'removed')
    .map(mapListingRow)
    .map(it => ({ ...it, saved: true }));
  return notRemoved(items);
}

/* ── Storefront stats ──────────────────────────────
   Pulls the three numbers shown on a storefront's hero (Shared / Received /
   Impact). We prefer values from the profile row (computed by DB triggers
   when present), but fall back to live counts from listings/requests/events
   so a brand-new account that hasn't yet had its triggers fire still shows
   a meaningful "Shared = 1" the moment a post lands. */
export interface ProfileStats {
  shared: number;
  received: number;
  impact: number;
}

export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  if (!hasSupabaseEnv || !userId) return { shared: 0, received: 0, impact: 0 };

  /* Profile counters (trigger-maintained) */
  const profileQ = supabase
    .from('profiles')
    .select('items_shared_count, items_received_count, impact_score')
    .eq('id', userId)
    .single();

  /* Live counts as a fallback / for currently-active posts. Only physical
     items count toward "Shared" / impact — service opportunities aren't
     circulated goods, so they're excluded here. */
  const listingsQ = supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'item')
    .eq('status', 'active');

  const eventsQ = supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('organizer_id', userId);

  const requestsQ = supabase
    .from('requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const [profileRes, listingsRes, eventsRes, requestsRes] = await Promise.all([
    profileQ, listingsQ, eventsQ, requestsQ,
  ]);

  const prof = (profileRes.data ?? null) as {
    items_shared_count?: number | null;
    items_received_count?: number | null;
    impact_score?: number | null;
  } | null;

  const listingCount  = listingsRes.count ?? 0;
  const eventCount    = eventsRes.count   ?? 0;
  const requestCount  = requestsRes.count ?? 0;

  /* Shared = listings the user actively has up + events organized.
     Profile counter wins when it's the larger number (covers historical posts
     that have since been removed). */
  const sharedLive = listingCount + eventCount;
  const shared = Math.max(prof?.items_shared_count ?? 0, sharedLive);

  /* Received = profile-tracked items received (no live source). */
  const received = prof?.items_received_count ?? 0;

  /* Impact = profile-tracked score; if missing, derive a friendly default
     so new users see *something* nonzero once they post:
       10 per active listing + 25 per event + 5 per open request. */
  const impactLive = listingCount * 10 + eventCount * 25 + requestCount * 5;
  const impact = Math.max(prof?.impact_score ?? 0, impactLive);

  return { shared, received, impact };
}

/* ── User search ────────────────────────────────────
   Powers the search bar on the home feed — looks up people by name, email,
   or college ID (any of the three matches will surface the user). Capped at
   8 results so the preview row stays scrollable.

   Indexes (added in the add_email_to_profiles_and_search_indexes migration):
     - full_name      → GIN trigram (ILIKE %q%)
     - email          → GIN trigram (ILIKE %q%)
     - lower(college_id) → btree (exact match)
*/
export interface UserSearchHit {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  email?: string;
  collegeId?: string;
  role?: string;
  department?: string;
  isOnline?: boolean;
}

export async function searchUsers(q: string, limit = 8): Promise<UserSearchHit[]> {
  if (!hasSupabaseEnv) return [];
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  /* Pattern-match for trigram ILIKE; OR the three columns. We escape the
     comma + closing paren that Supabase's PostgREST `.or()` parser treats
     as separators inside values. */
  const safe = trimmed.replace(/[%,()]/g, ' ');
  const pat = `%${safe}%`;

  /* Search by NAME only, and never select email / college_id here — a public
     user search must not let anyone enumerate students' emails or roll numbers
     (PII). Contact details are fetched only when a signed-in user opens a post. */
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, initials, avatar_color, role, department, is_online, hide_listings_from_search')
    .ilike('full_name', pat)
    .limit(limit);
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    full_name: string | null;
    initials: string | null;
    avatar_color: string | null;
    role: string | null;
    department: string | null;
    is_online: boolean | null;
    hide_listings_from_search: boolean | null;
  }>)
    /* Respect the "hide me from search" pref. */
    .filter(r => !r.hide_listings_from_search)
    .map(r => ({
      id: r.id,
      name: r.full_name || 'Wecycle member',
      initials: r.initials || (r.full_name?.[0] ?? 'W').toUpperCase(),
      avatarColor: r.avatar_color || '#6C63FF',
      role: r.role ?? undefined,
      department: r.department ?? undefined,
      isOnline: r.is_online ?? false,
    }));
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
