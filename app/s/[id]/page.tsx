/*
 * /s/<postId> — the shareable product link.
 *
 * Server-rendered so the per-post Open Graph tags (product photo + title +
 * price) are present in the HTML <head>. Messaging apps fetch this URL and
 * unfurl it into a rich preview — link + picture, the way Amazon / any
 * e-commerce share works. Humans get bounced straight into the SPA with the
 * post open (?p=<id>).
 */

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ShareRedirect from './ShareRedirect';
import { isFullUuid, idPrefixBounds } from '../../../lib/shareUrl';

export const dynamic = 'force-dynamic';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface PostMeta {
  /** The full uuid, resolved from a possibly-short path segment. */
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  photo: string | null;
  kindLabel: string;
}

const first = (u: unknown): string | null =>
  Array.isArray(u) && typeof u[0] === 'string' ? (u[0] as string) : null;

/** Public (anon) read of the post for OG tags. RLS already allows the feed to
 *  read these tables anonymously, so this works server-side too. */
async function fetchPostMeta(seg: string): Promise<PostMeta | null> {
  if (!SB_URL || !SB_KEY || !seg) return null;
  let sb;
  try { sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }); } catch { return null; }

  /* Share links carry a short id (see lib/shareUrl.ts). Resolve it as a uuid
     RANGE rather than a text LIKE: Postgres compares uuids natively, so this
     uses the primary key index, whereas `id::text LIKE '…%'` would force a
     full scan of every table on every unfurl. Full uuids still match exactly,
     so links shared before the short form existed keep working. */
  const bounds = isFullUuid(seg) ? null : idPrefixBounds(seg);
  if (!isFullUuid(seg) && !bounds) return null;

  /* The generated Supabase types can't parse a select list built at runtime, so
     the row comes back as a parser-error type. Casting to this shape is the
     same accommodation the rest of the codebase makes for the stale generated
     types; the columns below are the ones every branch actually reads. */
  type Row = {
    id: string;
    title: string;
    description: string | null;
    price?: number | null;
    photo_urls?: unknown;
    cover_url?: unknown;
  };
  const find = async (table: string, cols: string): Promise<Row | null> => {
    const q = sb!.from(table).select(cols);
    const r = await (bounds ? q.gte('id', bounds.lo).lte('id', bounds.hi) : q.eq('id', seg))
      .limit(1).maybeSingle();
    return (r.data as Row | null) ?? null;
  };

  try {
    const l = await find('listings', 'id,title,description,price,photo_urls');
    if (l) return { id: l.id, kindLabel: 'Selling on Wecycle', title: l.title, description: l.description, price: l.price ?? null, photo: first(l.photo_urls) };
    const r = await find('requests', 'id,title,description,photo_urls');
    if (r) return { id: r.id, kindLabel: 'Wanted on Wecycle', title: r.title, description: r.description, price: null, photo: first(r.photo_urls) };
    const e = await find('events', 'id,title,description,photo_urls,cover_url');
    if (e) return { id: e.id, kindLabel: 'Event on Wecycle', title: e.title, description: e.description, price: null, photo: first(e.photo_urls) ?? (typeof e.cover_url === 'string' ? e.cover_url : null) };
    const f = await find('lost_found_reports', 'id,title,description,photo_urls');
    if (f) return { id: f.id, kindLabel: 'Lost & Found on Wecycle', title: f.title, description: f.description, price: null, photo: first(f.photo_urls) };
  } catch { /* fall through to default OG */ }
  return null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const m = await fetchPostMeta(params.id);
  if (!m) {
    return {
      title: 'Wecycle',
      openGraph: { type: 'website', siteName: 'Wecycle', title: 'Wecycle', description: 'Buy, borrow, swap and give away on campus. By students, for students.', images: [{ url: '/og-image.png', width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
    };
  }
  const priceStr = m.price != null ? ` — ₹${m.price.toLocaleString('en-IN')}` : '';
  const ogTitle = `${m.title}${priceStr}`;
  const desc = (m.description?.trim() || `${m.kindLabel} — circulate what you no longer need.`).slice(0, 180);
  const images = [{ url: m.photo ?? '/og-image.png', alt: m.title }];
  return {
    title: `${m.title} · Wecycle`,
    description: desc,
    openGraph: { type: 'website', siteName: 'Wecycle', title: ogTitle, description: desc, images, url: `/s/${params.id}` },
    twitter: { card: 'summary_large_image', title: ogTitle, description: desc, images: [m.photo ?? '/og-image.png'] },
  };
}

export default async function SharePage({ params }: { params: { id: string } }) {
  /* Resolve here too, so the SPA is handed a real uuid: `?p=3f22523a` would
     match no post and open an empty app. force-dynamic already means this page
     is built per request, and the lookup is a single indexed hit. */
  const m = await fetchPostMeta(params.id);
  return <ShareRedirect to={`/?p=${m?.id ?? params.id}`} />;
}
