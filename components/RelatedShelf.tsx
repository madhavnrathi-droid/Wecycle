'use client';

/* Related-items shelf at the bottom of every product detail page.
 *
 * Five rails, fetched in parallel, rendered in priority order. Empty rails
 * skip themselves entirely — no mock content ever appears.
 *
 *   1. More from {sellerName}            — same user's other active listings
 *   2. Similar items                     — same category, different sellers
 *   3. Help return these  · Sponsored    — Lost & Found native ad slot
 *   4. Free in your community            — listing_type=free, cross-category
 *   5. You recently viewed               — localStorage history
 *
 * Each fetcher returns [] in demo mode / without Supabase, so the shelf
 * gracefully collapses to nothing while the seller seeds content.
 */

import { useEffect, useState } from 'react';
import RelatedRail, { type RailCard } from './RelatedRail';
import {
  fetchSellerListings,
  fetchSimilarListings,
  fetchFreeListings,
  fetchRecentlyViewedListings,
  fetchLostFoundForAds,
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
}

const INITIAL: ShelfData = {
  loading: true,
  fromSeller: [], similar: [], free: [], recent: [], lostFound: [],
};

export default function RelatedShelf({ item, onOpenItem, onOpenLF, onOpenSeller }: RelatedShelfProps) {
  const [data, setData] = useState<ShelfData>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setData(INITIAL);

    /* mapListingRow now threads `categoryId` (UUID) through MarketplaceItem
       so the same-category query works against the DB. Without an id the
       "Similar items" rail simply returns [] and skips. */
    const categoryKey = item.categoryId ?? null;

    /* Resilience: each rail's fetch settles independently so a single
       failure (e.g. an RLS edge case or a missing index) can't blank
       the entire shelf. */
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    Promise.all([
      safe(fetchSellerListings(item.user.id, item.id, 8)),
      safe(fetchSimilarListings(categoryKey, item.id, item.user.id, 10)),
      safe(fetchFreeListings(item.id, 10)),
      safe(fetchRecentlyViewedListings(item.id, 10)),
      safe(fetchLostFoundForAds(6)),
    ]).then(([fromSeller, similar, free, recent, lostFound]) => {
      if (cancelled) return;
      setData({ loading: false, fromSeller, similar, free, recent, lostFound });
    });

    return () => { cancelled = true; };
  }, [item.id, item.user.id, item.category]);

  const toListingCards = (items: MarketplaceItem[]): RailCard[] =>
    items.map(it => ({ kind: 'listing' as const, item: it, onClick: () => onOpenItem(it) }));

  const toLFCards = (items: (LostItem & { photoUrls?: string[] })[]): RailCard[] =>
    items.map(it => ({ kind: 'lostfound' as const, item: it, onClick: () => onOpenLF(it) }));

  const sellerFirstName = item.user.name.split(' ')[0] || item.user.name;

  return (
    <>
      <RelatedRail
        title={`More from ${sellerFirstName}`}
        subtitle={data.fromSeller.length
          ? `${data.fromSeller.length} other active listing${data.fromSeller.length === 1 ? '' : 's'}`
          : undefined}
        cta={data.fromSeller.length && onOpenSeller ? { label: 'See storefront', onClick: onOpenSeller } : undefined}
        cards={toListingCards(data.fromSeller)}
        loading={data.loading}
      />

      <RelatedRail
        title={item.isRequest ? 'Similar open requests' : 'Similar items'}
        subtitle={item.category ? `In ${item.category}` : undefined}
        cards={toListingCards(data.similar)}
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
        cards={toListingCards(data.free)}
        loading={data.loading}
      />

      <RelatedRail
        title="You recently viewed"
        cards={toListingCards(data.recent)}
        loading={data.loading}
      />
    </>
  );
}
