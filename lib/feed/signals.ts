/* ── Ranking signals ───────────────────────────────────────────────────────
 *
 * One function per signal, every one returning 0..1.
 *
 * The 0..1 contract is the whole reason this file exists separately from the
 * scorer. Weights are only interpretable if the things they weigh share a
 * scale: "freshness 0.20" means nothing if freshness can return 4000 and
 * quality tops out at 1. Keeping normalisation here — rather than letting each
 * signal invent its own range and correcting for it in the weights — is what
 * makes the weight table in rank.ts readable and tunable by hand.
 *
 * Every function takes the clock as an argument instead of calling Date.now().
 * These are the parts of the system most worth testing and a signal that reads
 * the wall clock cannot be tested at all.
 */

import type { MarketplaceItem } from '../mockData';

/* ── Time ───────────────────────────────────────────── */

export const HOUR_MS = 3600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Age in hours. Prefers the exact timestamp and falls back to the day counter
 *  the older mappers produce, because half this file's usefulness — the launch
 *  window boost especially — lives inside the first day, where `postedDaysAgo`
 *  is just 0 and cannot tell 5 minutes from 20 hours. */
export function ageHours(item: Pick<MarketplaceItem, 'postedAt' | 'postedDaysAgo'>, now: number): number {
  if (item.postedAt) {
    const t = Date.parse(item.postedAt);
    if (Number.isFinite(t)) return Math.max(0, (now - t) / HOUR_MS);
  }
  return Math.max(0, (item.postedDaysAgo ?? 0) * 24);
}

/**
 * Exponential freshness decay, e^(-age/τ).
 *
 * τ is in DAYS and is deliberately generous. A τ of 1 would put a three-day-old
 * listing at 0.05 and effectively delete it from the feed, which is wrong for a
 * campus marketplace: a good desk posted last week is still a good desk, and
 * unlike a social post it has not been "seen already" by the person who needs
 * it. Freshness here is a thumb on the scale, not a sort order — it decays to
 * a floor rather than to zero, so an old-but-excellent listing can still win on
 * relevance and quality.
 */
export function freshnessScore(hours: number, tauDays = 7): number {
  const decayed = Math.exp(-(hours / 24) / tauDays);
  /* Floor at 0.05 so age alone can never zero a listing out. */
  return 0.05 + 0.95 * decayed;
}

/**
 * The launch window every new listing gets, as a multiplier.
 *
 * This is not the same idea as freshness and does not collapse into it. Decay
 * describes how interesting an item is; this is a deliberate redistribution of
 * attention. Without it the feed is a rich-get-richer loop — items that were
 * seen get engagement, engagement earns ranking, ranking earns more views — and
 * a first-time seller posting into a catalogue of established listings is never
 * seen at all, so never gets a second post out of them.
 */
export function newItemBoost(hours: number): number {
  if (hours < 2) return 1.40;
  if (hours < 12) return 1.25;
  if (hours < 24) return 1.15;
  if (hours < 72) return 1.05;
  return 1.0;
}

/* ── Engagement ─────────────────────────────────────── */

/**
 * How likely this listing is to earn a real interaction.
 *
 * Laplace-smoothed rather than a raw ratio, and that smoothing is the point.
 * A listing with 1 view and 1 save has a raw save rate of 100%, which would
 * beat something with 400 views and 80 saves every single time — the feed would
 * be ranked by which items had the least evidence. Adding a prior of PRIOR_VIEWS
 * pseudo-views at PRIOR_RATE pulls low-evidence items toward the average and
 * lets confident ones separate from it, which is the cheap version of what a
 * Bayesian bandit does properly later.
 */
const PRIOR_VIEWS = 12;
const PRIOR_RATE = 0.08;

export function engagementProbability(item: Pick<MarketplaceItem, 'viewCount' | 'saveCount' | 'responses'>): number {
  const views = Math.max(0, item.viewCount ?? 0);
  /* Responses count alongside saves: a comment or an enquiry is a stronger
     signal of intent than a save, and both are rarer than a view. */
  const acts = Math.max(0, (item.saveCount ?? 0) + (item.responses ?? 0));
  const rate = (acts + PRIOR_VIEWS * PRIOR_RATE) / (views + PRIOR_VIEWS);
  /* Rates live in a narrow band near zero; the square root spreads the useful
     range out so the weight has something to bite on. */
  return clamp01(Math.sqrt(Math.min(1, rate / 0.5)));
}

/* ── Quality ────────────────────────────────────────── */

/**
 * Whether the post was actually filled in.
 *
 * Entirely computed from what the poster supplied, never from engagement — it
 * has to be able to score a listing that nobody has seen yet, which is exactly
 * the listing that most needs a fair reading. A photo is weighted highest
 * because a marketplace card with no image is barely a card.
 */
export function qualityScore(item: MarketplaceItem): number {
  let s = 0;
  const photos = item.photoUrls?.length ?? 0;
  if (photos >= 1) s += 0.40;
  if (photos >= 3) s += 0.10;
  const desc = (item.description ?? '').trim().length;
  if (desc >= 20) s += 0.15;
  if (desc >= 80) s += 0.10;
  if ((item.title ?? '').trim().length >= 12) s += 0.10;
  if ((item.location ?? '').trim()) s += 0.05;
  /* Priced, free, or an explicit swap ask all count — what is penalised is a
     sell listing with no number on it, which is the one that stalls. */
  if (item.listingType !== 'sell' || typeof item.price === 'number') s += 0.10;
  return clamp01(s);
}

/* ── Proximity ──────────────────────────────────────── */

/**
 * How near the seller is.
 *
 * The brief asks for e^(-distance/τ) and we cannot compute that: nothing in the
 * schema carries coordinates, only a college code and a free-text location like
 * "Meera Bhawan". So this is a tiered proxy over what exists, and it is
 * deliberately coarse rather than pretending to a precision it does not have.
 * If listings ever carry a lat/long, replace the body and leave the signature.
 */
export function proximityScore(
  item: MarketplaceItem,
  viewer: { college?: string | null; location?: string | null } | null,
): number {
  if (!viewer) return 0.5;                       /* unknown → neutral, not penalised */
  const theirCollege = (item.user as { college?: string | null }).college ?? null;
  const sameCollege = !!viewer.college && theirCollege === viewer.college;
  const loc = (item.location ?? '').trim().toLowerCase();
  const mine = (viewer.location ?? '').trim().toLowerCase();
  const sameSpot = !!loc && !!mine && (loc === mine || loc.includes(mine) || mine.includes(loc));
  if (sameCollege && sameSpot) return 1.0;
  if (sameCollege) return 0.85;
  if (sameSpot) return 0.7;
  if (theirCollege && viewer.college) return 0.3; /* known, and known to differ */
  return 0.5;
}

/* ── Seller fairness ────────────────────────────────── */

/**
 * Compensation for sellers the feed has already spent its attention on.
 *
 * Exposure is counted per SELLER rather than per listing on purpose. Counting
 * per listing lets one prolific seller take an unbounded share of the feed
 * simply by posting more often — every individual listing looks under-exposed
 * while the seller as a whole dominates. This is the marketplace-health signal:
 * it is not about what the viewer wants, it is about the catalogue staying
 * worth showing up to.
 */
export function sellerFairnessScore(sellerImpressions: number, medianImpressions = 20): number {
  const m = Math.max(1, medianImpressions);
  /* 1 for a seller nobody has seen, decaying past the median. */
  return clamp01(1 / (1 + sellerImpressions / m));
}

/* ── Exploration ────────────────────────────────────── */

/**
 * How much the system still does not know about this listing.
 *
 * High for items with few impressions, and this is genuinely a different
 * quantity from freshness: a two-week-old listing that has somehow never been
 * shown is maximally uncertain and maximally stale at the same time. Ranking
 * only on what we already know can never correct an early mistake, because the
 * item never gets the impressions that would prove us wrong.
 */
export function explorationScore(impressions: number): number {
  return clamp01(1 / (1 + impressions / 8));
}

/* ── Relevance ──────────────────────────────────────── */

/**
 * How well the listing matches this viewer's revealed interests.
 *
 * Weighted toward category affinity, which is the signal we can actually
 * measure from behaviour, with price fit as a secondary term: someone who only
 * ever opens sub-₹500 listings should not be shown a ₹40,000 camera just
 * because it is in a category they like.
 */
export function relevanceScore(
  item: MarketplaceItem,
  profile: { categoryAffinity: Record<string, number>; priceCeiling: number | null } | null,
  categoryIdOf: (it: MarketplaceItem) => string | null,
): number {
  if (!profile) return 0.5;
  const cat = categoryIdOf(item);
  const affinity = cat ? (profile.categoryAffinity[cat] ?? 0) : 0;
  let s = 0.35 + 0.65 * clamp01(affinity);

  if (profile.priceCeiling != null && typeof item.price === 'number' && item.price > 0) {
    /* Soft, not a filter: over budget is a discount, never an exclusion, since
       a ceiling inferred from a handful of taps is a guess. */
    if (item.price > profile.priceCeiling * 2) s *= 0.6;
    else if (item.price > profile.priceCeiling) s *= 0.85;
  }
  return clamp01(s);
}

/* ── util ───────────────────────────────────────────── */

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
