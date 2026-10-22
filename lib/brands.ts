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
  /** How the share message names it, when the label is too long or several
   *  collections are one thing to a reader ("lacquer bangles"). */
  short?: string;
}

/** The top of a brand page, in the brand's own motion (components/brand/BrandCanvas).
 *  'cycle': a mascot on a field that changes through the brand's colours (Foku).
 *  'stall': a still field with the brand's shapes growing in from the corners
 *  and the wordmark's letters dropping into place (Kinnu's intro). */
export type BrandCanvasStyle =
  | { kind: 'cycle' }
  | { kind: 'stall'; discs: { color: string; corner: 'tl' | 'tr' | 'bl' | 'br' }[] };

export interface BrandImage { src: string; alt: string }

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
  /** The brand's name in another script, shown in About ("किन्नू की कलाकारी"). */
  aka?: { text: string; lang: string; gloss: string };
  /** One emoji to open the share message with, if the brand has one. */
  shareEmoji?: string;
  canvas: BrandCanvasStyle;
  palette: {
    /** Text and the wordmark on the colour fields. Checked ≥7:1 on every field. */
    ink: string;
    /** The brand's darkest colour — its text on light surfaces. */
    dark: string;
    /** Buttons and price tags: fill and label (label ≥4.5:1 on the fill). */
    action: { bg: string; fg: string };
    /** The colours the hero cycles through, in order. Each field glows with
     *  the next one, so the gradient is always made of the brand's colours. */
    fields: string[];
    /** The share card's background — the "Foku lush gradient" shader
     *  (lib/lushGradient.ts). Colours are ordered so each neighbour is a
     *  short step round the hue wheel; the rest are the shader's controls. */
    lush: {
      colors: string[];
      stops: number[];
      scale?: number; flow?: number; spread?: number;
      chroma?: number; depth?: number; glow?: number; grain?: number;
      /** Text drawn straight on the gradient — the brand's ink by default. */
      text?: string;
    };
  };
  assets: {
    wordmark: string;
    /** width ÷ height of the wordmark artwork, so its box is reserved. */
    wordmarkRatio: number;
    mascot?: string;
    /** The brand's artwork, shown wide in About. */
    art?: BrandImage;
    /** Posters and flyers, shown in About as a row. */
    posters?: BrandImage[];
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
    shareEmoji: '👕',
    canvas: { kind: 'cycle' },
    palette: {
      ink: '#0B0B0B',
      dark: '#0B0B0B',
      action: { bg: '#0B0B0B', fg: '#FFFFFF' },
      /* Sampled from the brand's own animation (teal, pink, mustard) and its
         mascot (green). Black is the fifth colour there; it is left out here
         because the ink is black. */
      fields: ['#20AEA9', '#EB8291', '#E5A922', '#6DBE45'],
      /* Teal, then the periwinkle from Foku's doodle art as the bridge to its
         pink, then mustard. Teal straight into pink crosses the hue wheel and
         goes grey; through periwinkle it stays a colour all the way. */
      lush: {
        colors: ['#20AEA9', '#9697CB', '#EB8291', '#E5A922'],
        stops: [0, 0.55, 0.78, 1],
        scale: 0.8, flow: 0.55, spread: 3, chroma: 1.3, depth: 0.2, glow: 0.25, grain: 0.08,
      },
    },
    assets: {
      wordmark: '/brands/foku/wordmark.svg',
      wordmarkRatio: 625 / 359,
      mascot: '/brands/foku/mascot.svg',
      art: { src: '/brands/foku/art.webp', alt: 'Foku artwork: the wordmark in a cloud, surrounded by colourful doodles' },
      posters: [{ src: '/brands/foku/poster.webp', alt: 'Foku poster: T-shirts, tote bags, stickers and more' }],
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
  {
    handle: 'kinnu',
    name: 'Kinnu',
    /* Aagam Tambi — his bangles, journals and frames. */
    ownerId: '6b4e2316-692c-4857-aa7e-0b1238913413',
    kind: 'Handmade art stall',
    /* From Kinnu's own intro animation. */
    tagline: 'Handmade, one at a time.',
    /* From Kinnu's posters: "little things, made by hand" and the stall's
       "bangles · journals · frames · skirts". */
    about: 'Little things, made by hand — lacquer bangles, keychain journals, photo frames and skirts.',
    aka: { text: 'किन्नू की कलाकारी', lang: 'hi', gloss: 'Kinnu ki kalakaari — Kinnu’s handiwork' },
    shareEmoji: '✨',
    /* Kinnu's intro: a navy field, a red disc in the top-left corner and a
       marigold one in the bottom-right, the wordmark dropping in between. */
    canvas: { kind: 'stall', discs: [{ color: '#C0202A', corner: 'tl' }, { color: '#F59E0B', corner: 'br' }] },
    palette: {
      /* Cream, as the wordmark is on Kinnu's navy: 13:1. */
      ink: '#F6EEDD',
      dark: '#2A1608',
      /* Marigold with navy on it, 7.6:1 — the stall's own pairing. */
      action: { bg: '#F59E0B', fg: '#1B2352' },
      /* Navy, red, marigold, and the bunting's green. */
      fields: ['#1B2352', '#C0202A', '#F59E0B', '#1E6B54'],
      /* Kept deep so the cream type on the card reads everywhere (≥5:1 even
         on the red); marigold stays for the disc and the price tags. Indigo
         and a wine bridge the navy to the red round the hue wheel. */
      lush: {
        colors: ['#1B2352', '#33418F', '#9B2347', '#C0202A'],
        stops: [0, 0.4, 0.74, 1],
        scale: 0.8, flow: 0.55, spread: 2.6, chroma: 1.15, depth: 0.25, glow: 0.12, grain: 0.08,
        text: '#F6EEDD',
      },
    },
    assets: {
      wordmark: '/brands/kinnu/wordmark.svg',
      wordmarkRatio: 1252 / 362,
      posters: [
        { src: '/brands/kinnu/poster-stall.webp', alt: 'Kinnu’s handmade art stall poster: bangles ₹200, keychain journal ₹70, photo frames ₹160' },
        { src: '/brands/kinnu/poster-bangles.webp', alt: 'Kinnu lacquer bangles, handmade pair by pair' },
        { src: '/brands/kinnu/poster-journals.webp', alt: 'Kinnu photo frames and keychain journals — little things, made by hand' },
      ],
      og: '/brands/kinnu/og.jpg',
    },
    collections: [
      { id: 'marbled', label: 'Marbled lacquer bangles', short: 'lacquer bangles', match: /marbled/i },
      { id: 'swirl', label: 'Swirl lacquer bangles', short: 'lacquer bangles', match: /swirl/i },
      { id: 'floral', label: 'Floral-print bangles', short: 'floral bangles', match: /floral.*bangle|bangle.*floral/i },
      { id: 'bangles', label: 'Bangles', match: /bangle|kada|bracelet/i },
      { id: 'journals', label: 'Keychain journals', match: /journal|notebook|diary/i },
      { id: 'frames', label: 'Photo frames', match: /frame/i },
      { id: 'skirts', label: 'Skirts', match: /skirt/i },
    ],
    picks: [
      '6acb864360945022ff80', // Rainbow marbled bangle
      '6acb8655235870835e5d', // Photo frame — lilac block-print fabric
      '6acb865774231829c579', // Keychain journal — olive floral fabric
      '6acb864f4d4e1dad52e4', // Red & black swirl bangle
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

/** "₹499" — the cheapest open, priced listing, for "from ₹499". */
export function fromPrice(items: MarketplaceItem[]): string | null {
  const prices = items
    .filter(i => !i.isClosed && !i.isRequest && i.listingType === 'sell' && typeof i.price === 'number' && i.price > 0)
    .map(i => i.price as number);
  return prices.length ? `₹${Math.min(...prices).toLocaleString('en-IN')}` : null;
}

/** The words that go out with a brand's share card — into WhatsApp as the
 *  image's caption, or wherever else it is posted. Built from what the store
 *  has right now, so it can never promise a range or a price that is gone.
 *  Kept short: WhatsApp folds anything long behind "Read more", and the link
 *  goes last, on its own line, where it is easiest to tap. */
export function brandShareMessage(brand: Brand, items: MarketplaceItem[], ownerName?: string | null): string {
  const sections = sectionsFor(brand, items).filter(sec => sec.id !== 'sold' && sec.id !== 'more');
  /* Short names, each once: two kinds of lacquer bangle are one thing to
     someone reading a WhatsApp message. */
  const names: string[] = [];
  for (const sec of sections) {
    const col = brand.collections.find(c => c.id === sec.id);
    const name = col?.short ?? sec.label.charAt(0).toLowerCase() + sec.label.slice(1);
    if (!names.includes(name)) names.push(name);
  }
  const range = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const from = fromPrice(items);
  const rawFirst = (ownerName ?? '').trim().split(/\s+/)[0] ?? '';
  const first = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1) : '';
  const what = [range || null, first ? `by ${first}` : null].filter(Boolean).join(' ');
  const line = [brand.tagline.replace(/[.!]+$/, ''), what || null].filter(Boolean).join(' — ');
  return [
    `${brand.name} is on Wecycle${brand.shareEmoji ? ` ${brand.shareEmoji}` : ''}`,
    `${line}${from ? `, from ${from}` : ''}. Order straight from the store:`,
    brandUrl(brand),
  ].join('\n');
}
