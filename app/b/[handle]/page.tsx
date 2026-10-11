/*
 * /b/<handle> — a brand's shareable link (wecycle.page/b/foku).
 *
 * The page a brand puts in its Instagram bio. Static, from the registry in
 * lib/brands.ts, so the link preview — the brand's own artwork, its name and
 * tagline — is in the HTML for WhatsApp and Instagram to unfurl, and it needs
 * no database. People are bounced into the app with the store open (?b=).
 * Unknown handles 404 rather than opening an empty app.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BRANDS, brandByHandle } from '../../../lib/brands';
import { SITE_URL } from '../../../lib/siteUrl';
import BrandRedirect from './BrandRedirect';

export const dynamicParams = false;

export function generateStaticParams() {
  return BRANDS.map(b => ({ handle: b.handle }));
}

export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  const b = brandByHandle(params.handle);
  if (!b) return { title: 'Wecycle' };
  const title = `${b.name} on Wecycle`;
  const description = `${b.tagline} ${b.about}`;
  /* Absolute, on the canonical host: a preview must not depend on which
     deployment answered the crawler. */
  const og = b.assets.og ? `${SITE_URL}${b.assets.og}` : undefined;
  const images = og ? [{ url: og, width: 1200, height: 630, alt: `${b.name}: ${b.tagline}` }] : undefined;
  return {
    title,
    description,
    openGraph: { type: 'website', siteName: 'Wecycle', title, description, images, url: `/b/${b.handle}` },
    twitter: { card: 'summary_large_image', title, description, images: og ? [og] : undefined },
  };
}

export default function BrandLinkPage({ params }: { params: { handle: string } }) {
  const b = brandByHandle(params.handle);
  if (!b) notFound();
  return (
    <BrandRedirect
      to={`/?b=${b.handle}`}
      name={b.name}
      mascot={b.assets.mascot}
      colour={b.palette.fields[0]}
      ink={b.palette.ink}
    />
  );
}
