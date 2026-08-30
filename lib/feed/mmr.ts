/* ── Diversity: MMR, seller caps, category caps ────────────────────────────
 *
 * Ranking alone produces a correct and unusable feed. Sort a marketplace by
 * relevance and someone who looked at two cameras gets twenty cameras: every
 * one of them is individually the best available answer, and the page as a
 * whole tells them nothing they did not already know. The failure is that
 * pointwise scoring has no way to express "good, but I have already shown you
 * this" — the second camera's score does not know the first one exists.
 *
 * Maximal Marginal Relevance fixes exactly that by scoring each candidate
 * against what has already been picked rather than in isolation:
 *
 *     MMR(i) = relevance(i) − λ · max similarity(i, already chosen)
 *
 * MAX similarity, not mean. Mean similarity dilutes: the fifth camera compared
 * against a list of one camera and four unrelated things averages out to
 * "different enough", and cameras keep landing. Max asks the question that
 * actually matters — is this too close to ANYTHING I have already shown — so
 * one near-duplicate is enough to push it down.
 *
 * The hard caps below sit after MMR because they encode rules MMR expresses
 * only as a preference. "No seller may take more than two of the first twenty
 * slots" is a promise about what a marketplace IS; a λ term can always be
 * outvoted by a high enough score, and a promise that can be outvoted is not
 * one.
 */

import type { MarketplaceItem } from '../mockData';

export interface Scored {
  item: MarketplaceItem;
  score: number;
}

/** Everything the similarity function compares. Extracted once per item rather
 *  than recomputed inside an O(n²) loop. */
export interface Facets {
  category: string | null;
  sellerId: string;
  priceBand: string;
  kind: string;
}

export function facetsOf(
  item: MarketplaceItem,
  categoryIdOf: (it: MarketplaceItem) => string | null,
): Facets {
  return {
    category: categoryIdOf(item),
    sellerId: item.user?.id ?? '',
    priceBand: priceBandOf(item),
    kind: item.isRequest ? 'request' : item.kind === 'opportunity' ? 'service' : 'item',
  };
}

export function priceBandOf(item: Pick<MarketplaceItem, 'price' | 'listingType'>): string {
  if (item.listingType === 'free') return 'free';
  const p = item.price;
  if (typeof p !== 'number') return 'unpriced';
  if (p <= 200) return '0-200';
  if (p <= 500) return '200-500';
  if (p <= 1500) return '500-1500';
  if (p <= 5000) return '1500-5000';
  return '5000+';
}

/**
 * 0 = unrelated, 1 = effectively the same listing.
 *
 * Same seller weighs heaviest. Two different desks from two different people
 * is a working marketplace; two different desks from the same person is that
 * person's storefront, and the whole point of the feed is that it is not one.
 */
export function similarity(a: Facets, b: Facets): number {
  let s = 0;
  if (a.sellerId && a.sellerId === b.sellerId) s += 0.50;
  if (a.category && a.category === b.category) s += 0.30;
  if (a.kind === b.kind) s += 0.10;
  if (a.priceBand === b.priceBand) s += 0.10;
  return Math.min(1, s);
}

/** A candidate plus its precomputed facets and a taken flag, so the selection
 *  loop never rebuilds facets and never mutates the caller's array. */
type PoolEntry = Scored & { facets: Facets; taken: boolean };

export interface MmrOptions {
  /** 0 = pure relevance, 1 = pure novelty. */
  lambda?: number;
  limit?: number;
  categoryIdOf: (it: MarketplaceItem) => string | null;
  /** Facets of items already on screen from earlier pages, so page 2 diversifies
   *  against page 1 instead of starting the argument over. */
  seed?: Facets[];
}

export function mmrRerank(scored: Scored[], opts: MmrOptions): Scored[] {
  const { lambda = 0.35, limit = scored.length, categoryIdOf, seed = [] } = opts;
  const pool: PoolEntry[] = scored.map(s => ({ ...s, facets: facetsOf(s.item, categoryIdOf), taken: false }));
  const chosen: PoolEntry[] = [];
  const chosenFacets: Facets[] = [...seed];

  while (chosen.length < Math.min(limit, pool.length)) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (c.taken) continue;
      let maxSim = 0;
      for (const f of chosenFacets) {
        const sim = similarity(c.facets, f);
        if (sim > maxSim) maxSim = sim;
        if (maxSim === 1) break;
      }
      const val = c.score - lambda * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    const picked = pool[bestIdx];
    picked.taken = true;
    chosen.push(picked);
    chosenFacets.push(picked.facets);
  }
  return chosen.map(({ item, score }) => ({ item, score }));
}

/* ── Hard caps ──────────────────────────────────────── */

export interface CapOptions {
  /** Most slots one seller may hold in the opening stretch. */
  maxPerSellerInWindow?: number;
  /** How long that opening stretch is. */
  window?: number;
  /** Minimum gap between two listings from the same seller. */
  minSellerGap?: number;
  /** Most slots one category may hold in any run of `window` items. */
  maxPerCategoryInWindow?: number;
  categoryIdOf: (it: MarketplaceItem) => string | null;
}

/**
 * Enforce the caps by deferral, never by deletion.
 *
 * An item that would break a rule is skipped and reconsidered for the next
 * slot rather than dropped, so a seller with ten good listings still gets all
 * ten into the feed — spread out. Dropping them would quietly shrink the
 * catalogue, which on a young marketplace is the more expensive failure: at
 * this size there is no surplus to throw away.
 *
 * THE GUARANTEE IS OVER THE WINDOW, not the whole list. Inside the first
 * `window` slots the caps hold absolutely; past it they are best-effort, and
 * that is not a bug to fix. The tail of any finite catalogue eventually holds
 * nothing but one seller's remaining stock, at which point the gap rule is
 * unsatisfiable and the only choices are a visible repeat or a shorter feed.
 * A repeat at position 68 costs almost nothing; silently dropping inventory
 * costs a seller their listing.
 */
export function applyCaps(items: Scored[], opts: CapOptions): Scored[] {
  const {
    maxPerSellerInWindow = 2,
    window = 20,
    minSellerGap = 5,
    maxPerCategoryInWindow = 5,
    categoryIdOf,
  } = opts;

  const out: Scored[] = [];
  /* Kept in score order. An item that cannot be placed at this position simply
     stays in the list and is reconsidered at the next one — which is what makes
     this deferral rather than deletion. */
  const pending = [...items];

  const sellerAt: string[] = [];
  const catAt: (string | null)[] = [];

  const canPlace = (s: Scored, pos: number): boolean => {
    const seller = s.item.user?.id ?? '';
    const cat = categoryIdOf(s.item);
    if (seller) {
      for (let i = Math.max(0, pos - minSellerGap); i < pos; i++) {
        if (sellerAt[i] === seller) return false;
      }
      if (pos < window) {
        let n = 0;
        for (let i = 0; i < Math.min(pos, window); i++) if (sellerAt[i] === seller) n++;
        if (n >= maxPerSellerInWindow) return false;
      }
    }
    if (cat) {
      let n = 0;
      for (let i = Math.max(0, pos - window); i < pos; i++) if (catAt[i] === cat) n++;
      if (n >= maxPerCategoryInWindow) return false;
    }
    return true;
  };

  while (pending.length) {
    const pos = out.length;
    /* pending is score-ordered, so the first placeable entry is the best one
       that does not break a cap. */
    let idx = pending.findIndex(s => canPlace(s, pos));
    /* Nothing fits — every remaining candidate is from a capped seller or
       category. Take the best one and accept the violation rather than
       looping: a feed that renders with a repeat beats a feed that does not
       render, and on a young catalogue this is reachable with three listings. */
    if (idx < 0) idx = 0;

    const placed = pending.splice(idx, 1)[0];
    out.push(placed);
    sellerAt.push(placed.item.user?.id ?? '');
    catAt.push(categoryIdOf(placed.item));
  }
  return out;
}
