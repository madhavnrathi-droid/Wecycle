/* ── The ranking pipeline ──────────────────────────────────────────────────
 *
 *   eligibility → scoring → exploration → MMR → caps → page
 *
 * Ordered that way for a reason. Scoring is pointwise and cannot see the page
 * it is building; MMR is pairwise and can; the caps are absolute and must be
 * able to overrule both. Running them in any other order lets an earlier stage
 * undo a later one — put the caps before MMR, for instance, and MMR happily
 * reintroduces the very clustering the caps just removed.
 *
 * The whole thing is synchronous and pure over its inputs, including the clock
 * and the random seed. That is what makes a feed testable: the same catalogue,
 * memory and seed produce the same feed every time, so "why is this item
 * fourth" has an answer you can reproduce.
 */

import type { MarketplaceItem } from '../mockData';
import {
  ageHours, freshnessScore, newItemBoost, engagementProbability, qualityScore,
  proximityScore, sellerFairnessScore, explorationScore, relevanceScore, clamp01,
} from './signals';
import { mmrRerank, applyCaps, facetsOf, type Scored, type Facets } from './mmr';
import { fatigueScore, affinityProfile, isHidden, type FeedMemory } from './memory';
import { currentPhase, semesterBoost, type PhaseInfo } from './semester';

/* ── Weights ────────────────────────────────────────────
 *
 * The brief's V1 table, summing to 1 so a score is always 0..1 before the
 * multipliers. Keep them summing to 1 when tuning: the multipliers below are
 * calibrated against that range, and a weight table summing to 1.4 silently
 * turns the fatigue penalty into a rounding error. */
export const WEIGHTS = {
  relevance: 0.25,
  freshness: 0.20,
  proximity: 0.15,
  engagement: 0.15,
  sellerFairness: 0.10,
  exploration: 0.10,
  quality: 0.05,
} as const;

/** How hard fatigue bites. At 0.35, an item seen to saturation loses about a
 *  third of its score — enough to sink it well down the page, not enough to
 *  remove it, which is the distinction the fatigue term exists to make. */
const FATIGUE_WEIGHT = 0.35;

export interface RankContext {
  memory: FeedMemory;
  viewer: { college?: string | null; location?: string | null } | null;
  now: number;
  categoryIdOf: (it: MarketplaceItem) => string | null;
  phase?: PhaseInfo;
  /** Stable per session+page, so a re-render does not reshuffle the page under
   *  the reader's thumb. */
  seed?: number;
}

export interface Explained extends Scored {
  parts: Record<string, number>;
}

/* ── Deterministic randomness ───────────────────────── */

/** mulberry32 — small, fast, and seeded, which is the only property that
 *  matters here: exploration has to be reproducible or the feed cannot be
 *  debugged and every re-render reshuffles the page. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed that is stable for a session but different between them, so the feed
 *  is steady while you scroll it and genuinely different tomorrow. */
export function sessionSeed(sessionAt: number, page = 0): number {
  return (Math.floor(sessionAt / 60_000) * 2654435761 + page * 40503) >>> 0;
}

/* ── Eligibility ────────────────────────────────────── */

export interface EligibilityOptions {
  blocked: Set<string>;
  /** Hide the viewer's own posts from discovery — they own an Inventory tab. */
  selfId?: string | null;
  includeClosed?: boolean;
  /** Memory + clock, so "not interested" is honoured here rather than as a
   *  score penalty. A rejection is an instruction, and an instruction that a
   *  high enough relevance score can overrule is a suggestion. */
  memory?: FeedMemory;
  now?: number;
}

export function eligible(items: MarketplaceItem[], o: EligibilityOptions): MarketplaceItem[] {
  const now = o.now ?? Date.now();
  return items.filter(it => {
    if (!it || !it.id) return false;
    if (o.blocked.has(it.user?.id ?? '')) return false;
    if (!o.includeClosed && it.isClosed) return false;
    if (o.selfId && it.user?.id === o.selfId) return false;
    if (o.memory && isHidden(o.memory, it.id, it.user?.id ?? '', now)) return false;
    return true;
  });
}

/* ── Scoring ────────────────────────────────────────── */

export function scoreItem(item: MarketplaceItem, ctx: RankContext): Explained {
  const { memory, viewer, now, categoryIdOf } = ctx;
  const profile = affinityProfile(memory);
  const hours = ageHours(item, now);
  const cat = categoryIdOf(item);
  const sellerId = item.user?.id ?? '';

  const parts = {
    relevance: relevanceScore(item, profile.warm ? profile : null, categoryIdOf),
    freshness: freshnessScore(hours),
    proximity: proximityScore(item, viewer),
    engagement: engagementProbability(item),
    sellerFairness: sellerFairnessScore(memory.sellers[sellerId]?.imp ?? 0),
    exploration: explorationScore(memory.items[item.id]?.imp ?? 0),
    quality: qualityScore(item),
  };

  let score = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    score += WEIGHTS[k] * parts[k];
  }

  /* Multipliers, applied after the weighted sum so they scale the whole
     judgement rather than competing with one term of it. */
  const boostNew = newItemBoost(hours);
  const boostSeason = semesterBoost(cat, ctx.phase ?? currentPhase(new Date(now)));
  score *= boostNew * boostSeason;

  /* …and the penalty last, so nothing can multiply it back up. */
  const fatigue = fatigueScore(memory, item.id, now);
  score *= 1 - FATIGUE_WEIGHT * fatigue;

  return {
    item,
    score: clamp01(score),
    parts: { ...parts, boostNew, boostSeason, fatigue },
  };
}

/* ── Exploration ────────────────────────────────────── */

/**
 * Swap a slice of the page for under-exposed listings.
 *
 * Reserved slots, not a probability applied to every slot. Rolling a die per
 * item gives no guarantee at all — a page can legitimately come up with zero
 * exploration, and the items that most need impressions are exactly the ones a
 * fair coin keeps declining. Reserving a fixed share means new and unseen
 * listings get a floor of exposure on every single page, which is the property
 * that makes it a discovery mechanism rather than a hopeful gesture.
 */
export function injectExploration(
  ranked: Explained[],
  pool: Explained[],
  opts: { rate?: number; pageSize: number; rand: () => number },
): Explained[] {
  const { rate = 0.10, pageSize, rand } = opts;
  const slots = Math.max(1, Math.round(pageSize * rate));
  const head = ranked.slice(0, pageSize);
  if (head.length < 3) return head;

  const chosen = new Set(head.map(r => r.item.id));
  /* Candidates the ranking did not choose, most-uncertain first. */
  const bench = pool
    .filter(r => !chosen.has(r.item.id))
    .sort((a, b) => (b.parts.exploration ?? 0) - (a.parts.exploration ?? 0))
    .slice(0, slots * 6);
  if (!bench.length) return head;

  const out = [...head];
  for (let i = 0; i < slots && bench.length; i++) {
    const pick = bench.splice(Math.floor(rand() * Math.min(bench.length, slots * 3)), 1)[0];
    if (!pick) break;
    /* Never the first two slots. The top of the page is what a returning user
       judges the whole app on, and it should be the best answer we have — the
       cost of exploration belongs further down, where the reader is already
       browsing rather than deciding. */
    const at = 2 + Math.floor(rand() * Math.max(1, out.length - 2));
    out.splice(at, 0, pick);
  }
  return out.slice(0, pageSize);
}

/* ── The pipeline ───────────────────────────────────── */

export interface RankOptions extends RankContext {
  pageSize?: number;
  page?: number;
  lambda?: number;
  explorationRate?: number;
  /** Facets already shown on earlier pages, so page 2 diversifies against
   *  page 1 rather than repeating its shape. */
  seenFacets?: Facets[];
}

export interface RankResult {
  items: MarketplaceItem[];
  explained: Explained[];
  /** Facets of what was returned — feed straight back in as `seenFacets`. */
  facets: Facets[];
}

export function rankFeed(candidates: MarketplaceItem[], o: RankOptions): RankResult {
  const pageSize = o.pageSize ?? 20;
  const phase = o.phase ?? currentPhase(new Date(o.now));
  const ctx: RankContext = { ...o, phase };

  const scored = candidates.map(it => scoreItem(it, ctx));
  scored.sort((a, b) => b.score - a.score);

  /* MMR over a generous head of the list rather than all of it: the tail
     cannot win a slot anyway and the loop is O(n·k). */
  const headroom = Math.min(scored.length, Math.max(pageSize * 4, 60));
  const diversified = mmrRerank(scored.slice(0, headroom), {
    lambda: o.lambda ?? 0.35,
    limit: headroom,
    categoryIdOf: o.categoryIdOf,
    seed: o.seenFacets,
  }) as Explained[];

  const capped = applyCaps(diversified, { categoryIdOf: o.categoryIdOf }) as Explained[];

  const rand = rng(o.seed ?? sessionSeed(o.memory.sessionAt, o.page ?? 0));
  const withExploration = injectExploration(capped, scored, {
    rate: o.explorationRate,
    pageSize,
    rand,
  });

  return {
    items: withExploration.map(r => r.item),
    explained: withExploration,
    facets: withExploration.map(r => facetsOf(r.item, o.categoryIdOf)),
  };
}

/* ── Rotation ───────────────────────────────────────── */

/**
 * Blend a freshly computed page with the one already on screen.
 *
 * Recomputing from scratch on every batch is correct and awful to use: the
 * reader looks away, looks back, and the row they were about to tap is
 * somewhere else. Keeping a stable majority and rotating the rest is what makes
 * the page feel alive rather than unreliable — "there is always something new
 * here" instead of "I have no idea where anything is".
 *
 * 65% stable by default, the middle of the brief's 60–70% range.
 */
export function rotate(
  previous: MarketplaceItem[],
  next: MarketplaceItem[],
  opts: { stableRatio?: number; rand: () => number },
): MarketplaceItem[] {
  const { stableRatio = 0.65, rand } = opts;
  if (!previous.length) return next;

  const keepCount = Math.round(previous.length * stableRatio);
  /* Keep by position, not by score: the reader's memory of the page is spatial,
     so preserving where things were is the thing that buys the stability. */
  const kept = previous.slice(0, keepCount);
  const keptIds = new Set(kept.map(i => i.id));
  const incoming = next.filter(i => !keptIds.has(i.id));

  const out = [...kept];
  for (const item of incoming) {
    if (out.length >= previous.length) break;
    /* Slot new arrivals into the back half, where a change reads as fresh
       inventory rather than as the page moving under you. */
    const at = Math.floor(keepCount + rand() * Math.max(1, out.length - keepCount + 1));
    out.splice(Math.min(at, out.length), 0, item);
  }
  return out;
}
