/* ── Brands: student businesses Wecycle features on purpose ──────────────────
 *
 * A storefront is something every member gets. A BRAND page is something the
 * team gives: the business's own wordmark, colours and mascot, its products
 * grouped the way the maker thinks of them, and a place on the home feed and
 * on every one of its product pages ("More from Foku"). That is promotion, and
 * promotion is a decision — so brands are listed here by hand rather than
 * switched on by a profile field anyone can write. A member who chooses
 * "student business" at sign-up gets a shop (lib/shops.ts); the team moves a
 * shop up to a brand by adding it below.
 *
 * Everything here is data about the brand, not about its stock. The products
 * are the owner's live listings, read the normal way, so a brand page can never
 * show something the owner has deleted or sold as available.
 *
 * Assets live in public/brands/<handle>/ and were supplied by the brand for
 * this page. Wordmark and mascot are traced to SVG so they stay sharp at any
 * size and can move (see BrandScreen).
 */

import type { MarketplaceItem } from './mockData';
import { SITE_URL } from './siteUrl';

export interface BrandCollection {
  id: string;
  label: string;
  /** Matched against the listing title, first match wins — so order the more
   *  specific collections first ("marbled" before a catch-all "bangle"). */
  match: RegExp;
}

export interface Brand {
  /** URL handle: wecycle.page/b/<handle>. Lower case, letters and digits. */
  handle: string;
  name: string;
  /** The member account that owns the listings. */
  ownerId: string;
  /** What kind of business, in the brand's words. */
  kind: string;
  tagline: string;
  /** One or two sentences, from the brand's own material. */
  about: string;
  palette: {
    /** Text and the wordmark on the colour fields. Checked ≥7:1 on every field. */
    ink: string;
    /** The colours the hero cycles through, in order. Each field glows with
     *  the next one, so the gradient is always made of the brand's colours. */
    fields: string[];
  };
  assets: {
    wordmark: string;
    mascot: string;
    /** The brand's artwork, shown in About. */
    art?: string;
    /** A poster or flyer, shown in About. */
    poster?: string;
    /** 1200×630 image for link previews of /b/<handle>. */
    og?: string;
  };
  collections: BrandCollection[];
  /** Listing ids the brand wants shown first. Missing or sold ones are skipped. */
  picks: string[];
}

export const BRANDS: readonly Brand[] = [
  {
    handle: 'foku',
    name: 'Foku',
    /* Karan Seth — his account owns the brand: the page, its messages and
       its orders all go to him. */
    ownerId: '20266094-ea7c-4023-b452-d03371722045',
    kind: 'Student brand',
    tagline: 'If clothes were a canvas.',
    about: 'T-shirts, tote bags, stickers and more — for kids and adults.',
    palette: {
      ink: '#0B0B0B',
      /* Sampled from the brand's own animation (teal, pink, mustard) and its
         mascot (green). Black is the fifth colour there; it is left out here
         because the ink is black. */
      fields: ['#20AEA9', '#EB8291', '#E5A922', '#6DBE45'],
    },
    assets: {
      wordmark: '/brands/foku/wordmark.svg',
      mascot: '/brands/foku/mascot.svg',
      art: '/brands/foku/art.webp',
      poster: '/brands/foku/poster.webp',
      og: '/brands/foku/og.jpg',
    },
    collections: [
      { id: 'tees', label: 'Oversized T-shirts', match: /t-?shirt|\btees?\b/i },
      { id: 'tops', label: 'Crop tops', match: /crop\s*top|\btops?\b/i },
      { id: 'totes', label: 'Tote bags', match: /\btote/i },
      { id: 'stickers', label: 'Stickers', match: /sticker/i },
    ],
    picks: [
      '30d1c8ac-a150-4c46-a6d2-03c5d3db019f', // "Existential crisis" tee
      '6bb80a7a-6f47-487c-9ab7-9e4533873d48', // "I need a break" tee — the one on Foku's poster
      '6c45b88f-ff61-4e31-99f0-61cf55288c6a', // Crop top
      'b1af97ce-7d10-49ac-8ea7-4a51fa169fcf', // "The Cat Times" tee
    ],
  },
];

export function brandForUser(userId: string | null | undefined): Brand | null {
  if (!userId) return null;
  return BRANDS.find(b => b.ownerId === userId) ?? null;
}

export function brandByHandle(handle: string | null | undefined): Brand | null {
  const h = (handle ?? '').trim().toLowerCase();
  if (!h) return null;
  return BRANDS.find(b => b.handle === h) ?? null;
}

export function brandUrl(brand: Pick<Brand, 'handle'>): string {
  return `${SITE_URL}/b/${brand.handle}`;
}

export interface BrandSection {
  id: string;
  label: string;
  items: MarketplaceItem[];
}

/** The brand's live listings as the maker groups them, in collection order.
 *  Anything no collection claims goes in "More from <brand>"; anything sold or
 *  closed goes in a last "Already sold" section, so every row above it is a
 *  row you can buy from. Empty sections are left out. */
export function sectionsFor(brand: Brand, items: MarketplaceItem[]): BrandSection[] {
  const open = items.filter(i => !i.isClosed && !i.isRequest);
  const sold = items.filter(i => i.isClosed && !i.isRequest);
  const by = new Map<string, MarketplaceItem[]>();
  const rest: MarketplaceItem[] = [];
  for (const it of open) {
    const c = brand.collections.find(col => col.match.test(it.title));
    if (!c) { rest.push(it); continue; }
    const list = by.get(c.id) ?? [];
    list.push(it);
    by.set(c.id, list);
  }
  const out: BrandSection[] = brand.collections
    .filter(c => (by.get(c.id)?.length ?? 0) > 0)
    .map(c => ({ id: c.id, label: c.label, items: by.get(c.id)! }));
  if (rest.length) out.push({ id: 'more', label: `More from ${brand.name}`, items: rest });
  if (sold.length) out.push({ id: 'sold', label: 'Already sold', items: sold });
  return out;
}

/** Up to four products to lead with: the brand's own picks while they are
 *  still for sale, topped up across the sections so a brand with no picks
 *  (or sold-out picks) still opens on its range. */
export function picksFor(brand: Brand, items: MarketplaceItem[], max = 4): MarketplaceItem[] {
  const open = items.filter(i => !i.isClosed && !i.isRequest);
  const byId = new Map(open.map(i => [i.id, i]));
  const out: MarketplaceItem[] = [];
  for (const id of brand.picks) {
    const it = byId.get(id);
    if (it && !out.includes(it)) out.push(it);
    if (out.length >= max) return out;
  }
  /* Round-robin across the sections, so a brand with two collections still
     opens on four products and on both of them. */
  const sections = sectionsFor(brand, open);
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const s of sections) {
      const it = s.items.filter(i => !out.includes(i))[0];
      if (it && s.items.indexOf(it) >= round) { out.push(it); added = true; }
      if (out.length >= max) break;
    }
    if (!added) break;
  }
  return out;
}

/** "₹100 each" when everything costs the same, "₹70–₹150" otherwise, null when
 *  nothing has a price. Only open, priced listings count. */
export function priceLine(items: MarketplaceItem[]): string | null {
  const prices = items
    .filter(i => !i.isClosed && !i.isRequest && i.listingType === 'sell' && typeof i.price === 'number' && i.price > 0)
    .map(i => i.price as number);
  if (!prices.length) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const r = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (lo === hi) return prices.length > 1 ? `${r(lo)} each` : r(lo);
  return `${r(lo)}–${r(hi)}`;
}

/** "Swirl bangles, marbled bangles and keychain journals" — what is in the
 *  shop right now, from the sections, so the About copy can never claim a
 *  range the shop does not have. */
export function rangeLine(sections: BrandSection[]): string {
  const names = sections
    .filter(s => s.id !== 'sold' && s.id !== 'more')
    .map((s, i) => (i === 0 ? s.label : s.label.charAt(0).toLowerCase() + s.label.slice(1)));
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
