'use client';

/* ── What else is on Wecycle, under an event ───────────────────────────────
 *
 * The partner offer will bring people here who have never used Wecycle and are
 * not looking for a sofa — they came for a discount code on a conference
 * ticket. Left alone, that visit ends the moment the code is copied, and the
 * app has spent a partnership to acquire a clipboard.
 *
 * So the page does not end at the RSVP. Below it are real listings from real
 * students, which is the only honest way to answer "what is this app" — a
 * marketing paragraph about circular economies would be read by nobody, while
 * a ₹3,000 desk two buildings away explains the whole product in one glance.
 *
 * ── Why this is not RelatedShelf ──
 *
 * RelatedShelf is built around a listing: same seller, same category, similar
 * price. An event has none of those, and forcing one in would produce rails
 * that claim a relationship that does not exist. This shelf claims nothing —
 * its heading says "while you're here", because that is the actual
 * relationship between a conference ticket and a second-hand kettle.
 *
 * ── Why two rails and not one long grid ──
 *
 * A grid at the bottom of a detail page reads as "the page continues forever"
 * and people stop scrolling. Two short, named rails read as a sample.
 */

import { useEffect, useState } from 'react';
import RelatedRail, { type RailCard } from './RelatedRail';
import { fetchMarketplaceItems } from '../lib/liveData';
import type { MarketplaceItem } from '../lib/mockData';
import { track, EVT } from '../lib/analytics';

export interface EventDiscoverShelfProps {
  onOpenItem: (item: MarketplaceItem) => void;
  /** "See everything" — sends them to the feed proper. */
  onBrowseAll?: () => void;
}

/** Small enough to read as a sample, big enough that the rail scrolls. */
const PER_RAIL = 8;

export default function EventDiscoverShelf({ onOpenItem, onBrowseAll }: EventDiscoverShelfProps) {
  const [items, setItems] = useState<MarketplaceItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMarketplaceItems({})
      .then(rows => { if (alive) setItems(rows); })
      /* A failed fetch renders nothing at all rather than an error — this is a
         bonus shelf under the real content, and an apology for the absence of
         something the visitor never asked for is worse than the absence. */
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  const loading = items === null;
  const pool = items ?? [];

  /* Free things first. For someone who has never used the app, "people give
     things away here" is a more surprising and more memorable answer to "what
     is this" than "people sell things here", which they already assumed. */
  const free = pool.filter(i => i.listingType === 'free' && !i.isClosed).slice(0, PER_RAIL);
  const freeIds = new Set(free.map(i => i.id));
  const rest = pool.filter(i => !i.isClosed && !freeIds.has(i.id)).slice(0, PER_RAIL);

  if (!loading && free.length === 0 && rest.length === 0) return null;

  const toCards = (list: MarketplaceItem[], rail: string): RailCard[] =>
    list.map(item => ({
      kind: 'listing' as const,
      item,
      onClick: () => {
        track(EVT.offer_discover_tapped, { rail });
        onOpenItem(item);
      },
    }));

  return (
    <>
      {(loading || free.length > 0) && (
        <RelatedRail
          title="Free on campus right now"
          subtitle="Students giving things a second life"
          cards={toCards(free, 'free')}
          loading={loading}
        />
      )}
      {(loading || rest.length > 0) && (
        <RelatedRail
          title="While you're here"
          subtitle="Buy, borrow and swap with people at MAHE"
          cards={toCards(rest, 'recent')}
          loading={loading}
          cta={onBrowseAll ? { label: 'Browse all', onClick: onBrowseAll } : undefined}
        />
      )}
    </>
  );
}
