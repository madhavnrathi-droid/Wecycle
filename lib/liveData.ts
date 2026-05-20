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
import type { CompressedMedia } from './mediaCompression';
import type { Database } from './database.types';

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
    viewCount: row.view_count ?? 0,
    saveCount: row.save_count ?? 0,
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

/* ════════════════════════════════════════════════════
   REQUESTS
   ════════════════════════════════════════════════════ */

export interface NewRequestInput {
  title: string;
  category: string;
  description?: string;
  urgency: 'normal' | 'urgent';
  needByDate?: string;     /* ISO date or '' */
  media: CompressedMedia[];
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
  });
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

export async function createEvent(input: NewEventInput) {
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

  const { error } = await supabase.from('events').insert({
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
  });
  if (error) throw error;
  notifyPostsChanged();
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
  });
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
  let q = supabase
    .from('requests')
    .select(REQUEST_SELECT)
    .eq('status', 'open')
    .order('posted_at', { ascending: false })
    .limit(filter.limit ?? 60);
  if (filter.category && filter.category !== 'all') q = q.eq('category_id', filter.category);
  if (filter.search?.trim()) q = q.ilike('title', `%${filter.search.trim()}%`);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as unknown as RequestRowLite[]).map(mapRequestRow);
}

export async function fetchMyRequests(userId: string): Promise<MarketplaceItem[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('requests')
    .select(REQUEST_SELECT)
    .eq('user_id', userId)
    .order('posted_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as RequestRowLite[]).map(mapRequestRow);
}

/* ════════════════════════════════════════════════════
   READ: events + lost-found (with mappers)
   ════════════════════════════════════════════════════ */

const EVENT_SELECT = `
  *,
  organizer:profiles!events_organizer_id_fkey(
    id, username, full_name, initials, avatar_url, avatar_color, role,
    is_online, contact_email_enabled, contact_whatsapp_enabled
  )
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
  photo_urls: string[] | null;
  video_urls: string[] | null;
  cover_url: string | null;
  organizer?: JoinedProfile | null;
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
    photoUrls: row.photo_urls ?? [],
    videoUrls: row.video_urls ?? [],
  };
}

export async function fetchEvents(): Promise<CommunityEvent[]> {
  if (!hasSupabaseEnv) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as EventRowLite[]).map(mapEventRow);
}

export async function fetchEventsByUser(userId: string): Promise<CommunityEvent[]> {
  if (!hasSupabaseEnv || !userId) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('organizer_id', userId)
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as EventRowLite[]).map(mapEventRow);
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
  return (data as unknown as LostFoundRowLite[]).map(mapLostFoundRow);
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

export async function deleteListingById(id: string) {
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase.from('listings').delete().eq('id', id);
  if (error) throw error;
  notifyPostsChanged();
}

/** Bump a listing's view counter (fire-and-forget — never blocks the UI). */
export function incrementListingView(id: string) {
  if (!hasSupabaseEnv) return;
  /* SECURITY DEFINER RPC — viewers can't UPDATE the row directly. */
  supabase.rpc('rpc_increment_listing_view', { _listing_id: id }).then(() => {}, () => {});
}

/** Toggle a save on a listing for the signed-in user. Returns the new state. */
export async function toggleListingSave(id: string): Promise<boolean> {
  if (!hasSupabaseEnv) return false;
  const { data, error } = await supabase.rpc('rpc_toggle_save', { _listing_id: id });
  if (error) throw error;
  notifyPostsChanged();
  return !!data;
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
