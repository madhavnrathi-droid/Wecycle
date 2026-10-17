'use client';

/* Where a brand shows up outside its own page.
 *
 *   BrandStrip      on each of the brand's product pages, in place of the
 *                   plain seller row: "Visit the Foku store" — Amazon's
 *                   "Visit the … Store" link, which is how people find the
 *                   rest of a range after landing on one thing.
 *   BrandSpotlight  on the home feed: the brand, three of its things, one
 *                   way in. Promotion the team chose (lib/brands.ts), so it
 *                   is allowed to be the loudest card on the page — but it
 *                   holds still. A colour-cycling card in a scrolling feed
 *                   would pull at the eye every four seconds; the motion
 *                   lives on the brand page, where someone chose to look.
 *
 * Both use the brand's first two colours as the gradient and its mascot, so
 * the jump from either into the brand page is a continuation, not a change of
 * scene. */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight } from '@/lib/icons';
import { BRANDS, picksFor, type Brand } from '../../lib/brands';
import type { MarketplaceItem } from '../../lib/mockData';
import { resolveItemMedia } from '../../lib/photos';
import { haptics } from '../../lib/haptics';
import BrandWordmark from './BrandWordmark';
import { fetchListingsByUser } from '../../lib/liveData';

const vars = (b: Brand) => ({
  ['--bp-ink' as string]: b.palette.ink,
  ['--bp-c0' as string]: b.palette.fields[0],
  ['--bp-c1' as string]: b.palette.fields[1 % b.palette.fields.length],
});

/** Marks the element once it has been on screen, for the mascot's one bounce. */
function useArrived<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return [ref, inView] as const;
}

export function BrandStrip({ brand, count, onOpen }: { brand: Brand; count: number | null; onOpen: () => void }) {
  const [ref, inView] = useArrived<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      className="bp bp--strip"
      data-in={inView || undefined}
      style={vars(brand)}
      onClick={() => { haptics.light(); onOpen(); }}
      aria-label={`Visit the ${brand.name} store${count ? `, ${count} products` : ''}`}
    >
      <img src={brand.assets.mascot} alt="" className="bp-mascot" draggable={false} />
      <span className="bp-text">
        <BrandWordmark src={brand.assets.wordmark} name={brand.name} className="bp-mark" decorative />
        <span className="bp-line">
          Visit the store{count && count > 1 ? ` · ${count} products` : ''}
        </span>
      </span>
      <span className="bp-go" aria-hidden="true"><ChevronRight size={18} strokeWidth={2.2} /></span>
    </button>
  );
}

/* The home spotlight: a slim strip, not a hero. The brand on the left (or
   on top, on a phone), and a carousel of its products you can open straight
   from the feed — each a small sticker with its price, the way the brand
   shows its things on its own poster. The last card goes to the store.
   Fixed card sizes, so the strip is the same height on a phone and on a wide
   desktop, where it used to grow with the screen. */
export function BrandSpotlight({ brand, items, onOpen, onOpenItem }: {
  brand: Brand;
  items: MarketplaceItem[];
  onOpen: () => void;
  onOpenItem?: (item: MarketplaceItem) => void;
}) {
  const [ref, inView] = useArrived<HTMLElement>();
  const cards = items
    .map(it => {
      const m = resolveItemMedia(it)[0];
      return { it, photo: typeof m === 'string' ? m : m?.poster ?? null };
    })
    .filter((c): c is { it: MarketplaceItem; photo: string } => !!c.photo)
    .slice(0, 8);
  return (
    <div className="bp-wrap">
      <section
        ref={ref}
        className="bp bp--spot"
        data-in={inView || undefined}
        style={vars(brand)}
        aria-label={`${brand.name}, a student brand on Wecycle`}
      >
        <button type="button" className="bp-spot-head" onClick={() => { haptics.light(); onOpen(); }}
          aria-label={`Visit the ${brand.name} store — ${brand.tagline} ${items.length} products`}>
          <img src={brand.assets.mascot} alt="" className="bp-mascot" draggable={false} />
          <span className="bp-text">
            <span className="bp-kicker">Student brand</span>
            <BrandWordmark src={brand.assets.wordmark} name={brand.name} className="bp-mark" decorative />
            <span className="bp-line">{brand.tagline}</span>
          </span>
          <span className="bp-cta" aria-hidden="true">Visit <ArrowRight size={14} strokeWidth={2.4} /></span>
        </button>
        <ul className="bp-rail" role="list">
          {cards.map(({ it, photo }, i) => (
            <li key={it.id} className="bp-card" style={{ ['--i' as string]: i }}>
              <button
                type="button"
                className="bp-card-hit"
                onClick={() => { haptics.light(); (onOpenItem ?? (() => onOpen()))(it); }}
                aria-label={`${it.title}${it.listingType === 'sell' && typeof it.price === 'number' ? `, ₹${it.price}` : ''} — from ${brand.name}`}
              >
                <span className="bp-card-photo"><img src={photo} alt="" loading="lazy" draggable={false} /></span>
                {it.listingType === 'sell' && typeof it.price === 'number' && (
                  <span className="bp-card-price">₹{it.price.toLocaleString('en-IN')}</span>
                )}
              </button>
            </li>
          ))}
          <li className="bp-card bp-card--more">
            <button type="button" className="bp-card-hit bp-more" onClick={() => { haptics.light(); onOpen(); }}>
              <span className="bp-more-n">{items.length}</span>
              <span className="bp-more-l">products</span>
              <span className="bp-more-go">See all <ArrowRight size={13} strokeWidth={2.4} /></span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

/** On a product page: the brand strip when the seller is a featured brand,
 *  with the number of things the store has — read once, quietly. */
export function BrandStoreLink({ brand, onOpen }: { brand: Brand; onOpen: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchListingsByUser(brand.ownerId)
      .then(rows => { if (live) setCount(rows.filter(r => !r.isClosed && !r.isRequest).length); })
      .catch(() => { /* the strip works without a count */ });
    return () => { live = false; };
  }, [brand.ownerId]);
  return <BrandStrip brand={brand} count={count} onOpen={onOpen} />;
}

/* The brand's range for the home spotlight, read once and kept for a few
   minutes: the feed only loads the newest posts, and a brand should not drop
   off the home page because it has not posted this week. The read goes
   through the normal room scoping, so a brand outside the viewer's room has
   nothing to show and its spotlight stays away. */
const SPOT_TTL = 5 * 60_000;
const spotCache = new Map<string, { at: number; items: MarketplaceItem[] }>();

export function BrandSpotlightSlot({ onOpen, onOpenItem }: {
  onOpen: (brand: Brand) => void;
  onOpenItem?: (item: MarketplaceItem, brand: Brand) => void;
}) {
  const [spot, setSpot] = useState<{ brand: Brand; items: MarketplaceItem[] } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      for (const b of BRANDS) {
        const hit = spotCache.get(b.handle);
        let rows = hit && Date.now() - hit.at < SPOT_TTL ? hit.items : null;
        if (!rows) {
          try { rows = await fetchListingsByUser(b.ownerId); } catch { rows = []; }
          spotCache.set(b.handle, { at: Date.now(), items: rows });
        }
        const open = rows.filter(r => !r.isClosed && !r.isRequest);
        if (open.length >= 3) {
          const picks = picksFor(b, open, 3);
          if (live) setSpot({ brand: b, items: [...picks, ...open.filter(i => !picks.includes(i))] });
          return;
        }
      }
      if (live) setSpot(null);
    })();
    return () => { live = false; };
  }, []);
  if (!spot) return null;
  return (
    <BrandSpotlight
      brand={spot.brand}
      items={spot.items}
      onOpen={() => onOpen(spot.brand)}
      onOpenItem={onOpenItem ? (it) => onOpenItem(it, spot.brand) : undefined}
    />
  );
}
