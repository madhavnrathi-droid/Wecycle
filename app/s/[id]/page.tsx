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

export const dynamic = 'force-dynamic';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface PostMeta {
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
async function fetchPostMeta(id: string): Promise<PostMeta | null> {
  if (!SB_URL || !SB_KEY || !id) return null;
  let sb;
  try { sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }); } catch { return null; }
  try {
    const l = await sb.from('listings').select('title,description,price,photo_urls').eq('id', id).maybeSingle();
    if (l.data) return { kindLabel: 'Selling on Wecycle', title: l.data.title, description: l.data.description, price: l.data.price, photo: first(l.data.photo_urls) };
    const r = await sb.from('requests').select('title,description,photo_urls').eq('id', id).maybeSingle();
    if (r.data) return { kindLabel: 'Wanted on Wecycle', title: r.data.title, description: r.data.description, price: null, photo: first(r.data.photo_urls) };
    const e = await sb.from('events').select('title,description,photo_urls,cover_url').eq('id', id).maybeSingle();
    if (e.data) return { kindLabel: 'Event on Wecycle', title: e.data.title, description: e.data.description, price: null, photo: first(e.data.photo_urls) ?? (typeof e.data.cover_url === 'string' ? e.data.cover_url : null) };
    const f = await sb.from('lost_found_reports').select('title,description,photo_urls').eq('id', id).maybeSingle();
    if (f.data) return { kindLabel: 'Lost & Found on Wecycle', title: f.data.title, description: f.data.description, price: null, photo: first(f.data.photo_urls) };
  } catch { /* fall through to default OG */ }
  return null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const m = await fetchPostMeta(params.id);
  if (!m) {
    return {
      title: 'Wecycle',
      openGraph: { type: 'website', siteName: 'Wecycle', title: 'Wecycle', description: 'Circulate resources within your community.', images: [{ url: '/og-image.png', width: 1200, height: 630 }] },
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

export default function SharePage({ params }: { params: { id: string } }) {
  return <ShareRedirect to={`/?p=${params.id}`} />;
}
