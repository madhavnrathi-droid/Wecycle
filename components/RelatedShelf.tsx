'use client';

/* Related-items shelf at the bottom of every product detail page.
 *
 * Five rails, fetched in parallel, rendered in priority order. Each specific
 * rail falls back to the generic pool when empty, so the shelf is never blank
 * as long as any other listings exist in the community.
 *
 *   1. More from {sellerName}  → fallback: "Discover other sellers"
 *   2. Similar items           → fallback: "More on Wecycle"
 *   3. Help return these       · Sponsored — Lost & Found native ad slot
 *   4. Free in your community  — hide entirely if no free items (don't fake it)
 *   5. You recently viewed     — hide if empty (user-history specific)
 *
 * Dedup: once an item appears in an earlier rail it is excluded from all
 * subsequent rails via a Set<string> of already-rendered IDs.
 *
 * Shuffle key: per-day salt so the same visitor sees a slightly different
 * mix each calendar day without jarring mid-session reshuffles.
 */

import { useEffect, useState } from 'react';
import RelatedRail, { type RailCard } from './RelatedRail';
import {
  fetchSellerListings,
  fetchSimilarListings,
  fetchFreeListings,
  fetchRecentlyViewedListings,
  fetchLostFoundForAds,
  fetchAnyOtherListings,
} from '../lib/liveData';
import type { MarketplaceItem, LostItem } from '../lib/mockData';

interface RelatedShelfProps {
  item: MarketplaceItem;
  onOpenItem: (item: MarketplaceItem) => void;
  onOpenLF: (item: LostItem & { photoUrls?: string[] }) => void;
  /** Visit the seller's storefront via the "More from" rail's See all link. */
  onOpenSeller?: () => void;
}

interface ShelfData {
  loading: boolean;
  fromSeller: MarketplaceItem[];
  similar: MarketplaceItem[];
  free: MarketplaceItem[];
  recent: MarketplaceItem[];
  lostFound: (LostItem & { photoUrls?: string[] })[];
  /** Generic pool for fallbacks — already shuffled by day-key. */
  pool: MarketplaceItem[];
}

const INITIAL: ShelfData = {
  loading: true,
  fromSeller: [], similar: [], free: [], recent: [], lostFound: [], pool: [],
};

/* Deterministic per-id shuffle key — same item bucket stays stable across
   re-mounts of the same page but varies across product pages because the
   pool composition changes. (Date-of-day salt to refresh once a day.) */
function shuffleKey(id: string): number {
  const salt = Math.floor(Date.now() / 86_400_000);
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

/** Return `src` sorted by the day-keyed shuffle, then sliced to `limit`. */
function shuffled(src: MarketplaceItem[], limit: number): MarketplaceItem[] {
  return [...src]
    .map(it => ({ it, k: shuffleKey(it.id) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, limit)
    .map(x => x.it);
}

export default function RelatedShelf({ item, onOpenItem, onOpenLF, onOpenSeller }: RelatedShelfProps) {
  const [data, setData] = useState<ShelfData>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setData(INITIAL);

    const categoryKey = item.categoryId ?? null;
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

    Promise.all([
      safe(fetchSellerListings(item.user.id, item.id, 8)),
      safe(fetchSimilarListings(categoryKey, item.id, item.user.id, 10)),
      safe(fetchFreeListings(item.id, 10)),
      safe(fetchRecentlyViewedListings(item.id, 10)),
      safe(fetchLostFoundForAds(6)),
      /* Wider pool than needed — fallbacks draw from this. */
      safe(fetchAnyOtherListings(item.id, undefined, 20)),
    ]).then(([fromSeller, similar, free, recent, lostFound, pool]) => {
      if (cancelled) return;
      setData({ loading: false, fromSeller, similar, free, recent, lostFound, pool });
    });

    return () => { cancelled = true; };
  }, [item.id, item.user.id, item.category]);

  const toListingCards = (items: MarketplaceItem[]): RailCard[] =>
    items.map(it => ({ kind: 'listing' as const, item: it, onClick: () => onOpenItem(it) }));

  const toLFCards = (items: (LostItem & { photoUrls?: string[] })[]): RailCard[] =>
    items.map(it => ({ kind: 'lostfound' as const, item: it, onClick: () => onOpenLF(it) }));

  /* ── Build rails with fallbacks + dedup ── */

  const rendered = new Set<string>();

  /** Pull items from `src`, skip already-rendered ids, register newly shown ones. */
  function consume(src: MarketplaceItem[], max = src.length): MarketplaceItem[] {
    const out: MarketplaceItem[] = [];
    for (const it of src) {
      if (out.length >= max) break;
      if (!rendered.has(it.id)) { out.push(it); rendered.add(it.id); }
    }
    return out;
  }

  /* Pool items not from the current seller (for "Discover other sellers"). */
  const poolOtherSellers = data.pool.filter(it => it.user.id !== item.user.id);

  /* Rail 1 — More from <Seller> or "Discover other sellers" */
  let sellerRailItems: MarketplaceItem[];
  let sellerTitle: string;
  let sellerSubtitle: string | undefined;
  let sellerCta: { label: string; onClick: () => void } | undefined;

  const sellerFirstName = item.user.name.split(' ')[0] || item.user.name;

  if (data.fromSeller.length > 0) {
    sellerRailItems = consume(data.fromSeller);
    sellerTitle = `More from ${sellerFirstName}`;
    sellerSubtitle = `${sellerRailItems.length} other active listing${sellerRailItems.length === 1 ? '' : 's'}`;
    sellerCta = onOpenSeller ? { label: 'See storefront', onClick: onOpenSeller } : undefined;
  } else {
    /* Fallback: other sellers from the pool, day-shuffled */
    sellerRailItems = consume(shuffled(poolOtherSellers, 8));
    sellerTitle = 'Discover other sellers';
    sellerSubtitle = undefined;
    sellerCta = undefined;
  }

  /* Rail 2 — Similar items or "More on Wecycle" */
  let similarRailItems: MarketplaceItem[];
  let similarTitle: string;
  let similarSubtitle: string | undefined;

  if (data.similar.length > 0) {
    similarRailItems = consume(data.similar);
    similarTitle = item.isRequest ? 'Similar open requests' : 'Similar items';
    similarSubtitle = item.category ? `In ${item.category}` : undefined;
  } else {
    /* Fallback: anything from pool not already rendered */
    similarRailItems = consume(shuffled(data.pool, 10));
    similarTitle = 'More on Wecycle';
    similarSubtitle = undefined;
  }

  /* Rail 3 — Help return these (no fallback, L&F-specific) */
  /* Rail 4 — Free in your community (hide if empty — don't fake generosity) */
  const freeRailItems = consume(data.free);

  /* Rail 5 — Recently viewed (hide if empty — user-history specific) */
  const recentRailItems = consume(data.recent);

  return (
    <>
      <RelatedRail
        title={sellerTitle}
        subtitle={sellerSubtitle}
        cta={sellerCta}
        cards={toListingCards(sellerRailItems)}
        loading={data.loading}
      />

      <RelatedRail
        title={similarTitle}
        subtitle={similarSubtitle}
        cards={toListingCards(similarRailItems)}
        loading={data.loading}
      />

      <RelatedRail
        title="Help return these"
        subtitle="Items your campus is trying to recover"
        cards={toLFCards(data.lostFound)}
        sponsored
        loading={data.loading}
      />

      <RelatedRail
        title="Free in your community"
        subtitle="No money changes hands — just pick up"
        cards={toListingCards(freeRailItems)}
        loading={data.loading}
      />

      <RelatedRail
        title="You recently viewed"
        cards={toListingCards(recentRailItems)}
        loading={data.loading}
      />
    </>
  );
}
