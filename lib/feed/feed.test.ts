/* Tests for the feed engine.
 *
 *   node --experimental-strip-types --test lib/feed/feed.test.ts
 *
 * Everything under test is pure over (catalogue, memory, clock, seed), which is
 * the property that makes these assertions possible at all — no DOM, no
 * network, no wall clock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ageHours, freshnessScore, newItemBoost, engagementProbability,
  qualityScore, proximityScore, sellerFairnessScore, explorationScore, relevanceScore,
} from './signals';
import { similarity, facetsOf, applyCaps, mmrRerank, priceBandOf } from './mmr';
import {
  emptyMemory, recordImpression, recordInteraction, recordSearch, startSession,
  decayMemory, fatigueScore, affinityProfile, sellerExposure,
  recordNotInterested, recordDwell, isHidden, UTILITY,
} from './memory';
import { estimateIntent, dominantIntent } from './intent';
import { currentPhase, semesterBoost } from './semester';
import { rankFeed, scoreItem, rotate, rng, sessionSeed, eligible, injectExploration } from './rank';
import { orchestrate, summariseSellers, applyModuleBudget, MODULES, shuffle } from './modules';
import type { MarketplaceItem, User } from '../mockData';

/* ── fixtures ───────────────────────────────────────── */

const T0 = Date.parse('2026-03-01T12:00:00Z');
const H = 3600_000;

function user(id: string, college = 'MIT'): User {
  return {
    id, name: `User ${id}`, initials: id.slice(0, 2).toUpperCase(), color: '#000',
    role: 'Student', community: 'Manipal', joinedDaysAgo: 30, itemsShared: 1,
    itemsReceived: 0, impactScore: 10, badges: [], isOnline: false, college,
  };
}

let seq = 0;
function item(over: Partial<MarketplaceItem> = {}): MarketplaceItem {
  seq++;
  return {
    id: `i${seq}`, title: `Item number ${seq}`, description: 'A reasonable description here.',
    category: 'Electronics', categoryId: 'electronics', listingType: 'sell', price: 500,
    condition: 'good', photoColor: '#fff', photoIcon: '📦', location: 'Meera Bhawan',
    user: user('u1'), saved: false, responses: 0, postedDaysAgo: 1, tags: [],
    photoUrls: ['a.jpg'], viewCount: 10, saveCount: 1,
    postedAt: new Date(T0 - 24 * H).toISOString(),
    ...over,
  };
}

const catOf = (it: MarketplaceItem) => it.categoryId ?? null;

/* ── signals ────────────────────────────────────────── */

test('ageHours prefers the exact timestamp over the day counter', () => {
  const it = item({ postedAt: new Date(T0 - 3 * H).toISOString(), postedDaysAgo: 5 });
  assert.equal(Math.round(ageHours(it, T0)), 3);
  const noStamp = item({ postedAt: undefined, postedDaysAgo: 2 });
  assert.equal(ageHours(noStamp, T0), 48);
});

test('freshness decays monotonically but never reaches zero', () => {
  const a = freshnessScore(0), b = freshnessScore(48), c = freshnessScore(24 * 60);
  assert.ok(a > b && b > c, 'should decay with age');
  assert.ok(c >= 0.05, 'floors so age alone cannot delete a listing');
  assert.ok(a <= 1);
});

test('new-item boost follows the ladder and then stops', () => {
  assert.equal(newItemBoost(1), 1.40);
  assert.equal(newItemBoost(6), 1.25);
  assert.equal(newItemBoost(20), 1.15);
  assert.equal(newItemBoost(48), 1.05);
  assert.equal(newItemBoost(200), 1.0);
});

test('engagement smoothing stops a 1-view item beating a proven one', () => {
  const lucky = engagementProbability({ viewCount: 1, saveCount: 1, responses: 0 });
  const proven = engagementProbability({ viewCount: 400, saveCount: 80, responses: 10 });
  assert.ok(proven > lucky, 'evidence should win over a 100% rate on one view');
});

test('quality rewards a filled-in post and penalises an empty one', () => {
  const good = qualityScore(item({ photoUrls: ['a', 'b', 'c'], description: 'x'.repeat(100) }));
  const bare = qualityScore(item({ photoUrls: [], description: '', title: 'x', location: '', price: undefined }));
  assert.ok(good > 0.8, `expected a rich post to score high, got ${good}`);
  assert.ok(bare < 0.2, `expected an empty post to score low, got ${bare}`);
});

test('proximity tiers, and an unknown viewer is neutral rather than punished', () => {
  const it = item({ user: user('u2', 'MIT'), location: 'Meera Bhawan' });
  assert.equal(proximityScore(it, null), 0.5);
  assert.equal(proximityScore(it, { college: 'MIT', location: 'Meera Bhawan' }), 1.0);
  assert.ok(proximityScore(it, { college: 'MIT', location: 'Elsewhere' }) > 0.8);
  assert.ok(proximityScore(it, { college: 'OTHER', location: 'Elsewhere' }) < 0.5);
});

test('seller fairness and exploration both fall as exposure rises', () => {
  assert.ok(sellerFairnessScore(0) > sellerFairnessScore(50));
  assert.ok(explorationScore(0) > explorationScore(40));
  assert.ok(explorationScore(0) <= 1);
});

test('relevance follows affinity and discounts over-budget items', () => {
  const profile = { categoryAffinity: { electronics: 1, books: 0.1 }, priceCeiling: 500 };
  const loved = relevanceScore(item({ categoryId: 'electronics', price: 400 }), profile, catOf);
  const meh = relevanceScore(item({ categoryId: 'books', price: 400 }), profile, catOf);
  const pricey = relevanceScore(item({ categoryId: 'electronics', price: 5000 }), profile, catOf);
  assert.ok(loved > meh);
  assert.ok(pricey < loved, 'well over budget should be discounted');
  assert.ok(pricey > 0, 'but never excluded outright');
});

/* ── diversity ──────────────────────────────────────── */

test('similarity weighs the same seller above the same category', () => {
  const a = facetsOf(item({ user: user('u1'), categoryId: 'electronics' }), catOf);
  const sameSeller = facetsOf(item({ user: user('u1'), categoryId: 'books', price: 9000 }), catOf);
  const sameCat = facetsOf(item({ user: user('u9'), categoryId: 'electronics', price: 9000 }), catOf);
  assert.ok(similarity(a, sameSeller) > similarity(a, sameCat));
});

test('price bands bucket sensibly', () => {
  assert.equal(priceBandOf({ price: 0, listingType: 'free' }), 'free');
  assert.equal(priceBandOf({ price: 150, listingType: 'sell' }), '0-200');
  assert.equal(priceBandOf({ price: 9000, listingType: 'sell' }), '5000+');
  assert.equal(priceBandOf({ price: undefined, listingType: 'sell' }), 'unpriced');
});

test('MMR breaks up a run of near-identical listings', () => {
  const cameras = Array.from({ length: 6 }, () =>
    ({ item: item({ categoryId: 'electronics', user: user('u1') }), score: 0.9 }));
  const others = [
    { item: item({ categoryId: 'furniture', user: user('u2') }), score: 0.7 },
    { item: item({ categoryId: 'books', user: user('u3') }), score: 0.68 },
  ];
  const flat = [...cameras, ...others];
  const out = mmrRerank(flat, { categoryIdOf: catOf, lambda: 0.5, limit: 4 });
  const cats = out.map(o => o.item.categoryId);
  assert.ok(new Set(cats).size > 1, `expected mixed categories, got ${cats.join(',')}`);
});

test('seller caps: no more than 2 of the first 20, and a 5-slot gap while alternatives exist', () => {
  const hog = Array.from({ length: 12 }, (_, i) =>
    ({ item: item({ user: user('hog'), categoryId: `c${i % 4}` }), score: 0.9 }));
  /* Enough other sellers that the caps stay satisfiable the whole way down —
     see the next test for what happens when they are not. */
  const rest = Array.from({ length: 60 }, (_, i) =>
    ({ item: item({ user: user(`u${i}`), categoryId: `c${i % 5}` }), score: 0.5 }));
  const out = applyCaps([...hog, ...rest], { categoryIdOf: catOf });

  const first20 = out.slice(0, 20).filter(o => o.item.user.id === 'hog').length;
  assert.ok(first20 <= 2, `hog took ${first20} of the first 20`);

  /* The guarantee is over the WINDOW — the stretch a reader actually sees.
     Past it the caps are best-effort by design, because the tail of any finite
     catalogue eventually contains only one seller's remaining stock and no
     interleaving is possible. See the next test. */
  const ids = out.slice(0, 20).map(o => o.item.user.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < Math.min(i + 5, ids.length); j++) {
      assert.notEqual(ids[i] === 'hog' && ids[j] === 'hog', true,
        `same seller at ${i} and ${j}, closer than the 5-slot gap`);
    }
  }
});

test('when one seller is all that is left, the caps bend instead of dropping stock', () => {
  /* The tail of a thin catalogue: after the other sellers run out there is
     nothing to interleave with, so the gap is unsatisfiable by construction.
     The contract is that the feed still renders and still contains everything —
     a visible repeat at the bottom of the page beats a shorter catalogue. */
  const hog = Array.from({ length: 12 }, (_, i) =>
    ({ item: item({ user: user('hog'), categoryId: `c${i % 4}` }), score: 0.9 }));
  const rest = Array.from({ length: 6 }, (_, i) =>
    ({ item: item({ user: user(`u${i}`), categoryId: `c${i % 5}` }), score: 0.5 }));
  const out = applyCaps([...hog, ...rest], { categoryIdOf: catOf });

  assert.equal(out.length, 18, 'nothing dropped');
  assert.equal(new Set(out.map(o => o.item.id)).size, 18, 'nothing duplicated');
  const firstSix = out.slice(0, 6).filter(o => o.item.user.id === 'hog').length;
  assert.ok(firstSix <= 2, 'and the window rule still holds where it can');
});

test('caps defer rather than delete — every item still comes out', () => {
  const all = Array.from({ length: 15 }, (_, i) =>
    ({ item: item({ user: user('same'), categoryId: 'electronics' }), score: 1 - i / 100 }));
  const out = applyCaps(all, { categoryIdOf: catOf });
  assert.equal(out.length, 15, 'nothing may be dropped');
  assert.equal(new Set(out.map(o => o.item.id)).size, 15, 'and nothing duplicated');
});

/* ── memory ─────────────────────────────────────────── */

test('impressions accumulate per item and per seller', () => {
  const m = emptyMemory(T0);
  recordImpression(m, 'i1', 's1', T0);
  recordImpression(m, 'i1', 's1', T0);
  assert.equal(m.items.i1.imp, 2);
  assert.equal(m.sellers.s1.imp, 2);
});

test('utility weights make a contact worth more than ten scroll-pasts', () => {
  assert.ok(UTILITY.message > UTILITY.impression * 5);
  assert.ok(UTILITY.transaction > UTILITY.save * 5);
  const m = emptyMemory(T0);
  recordInteraction(m, 'message', { itemId: 'i1', sellerId: 's1', categoryId: 'books', price: 300 }, T0);
  assert.equal(m.items.i1.util, UTILITY.message);
  assert.equal(m.categories.books, UTILITY.message);
});

test('fatigue rises with repeat views and is capped', () => {
  const m = emptyMemory(T0);
  assert.equal(fatigueScore(m, 'i1', T0), 0);
  for (let i = 0; i < 3; i++) recordImpression(m, 'i1', 's1', T0);
  const after3 = fatigueScore(m, 'i1', T0);
  for (let i = 0; i < 10; i++) recordImpression(m, 'i1', 's1', T0);
  const after13 = fatigueScore(m, 'i1', T0);
  assert.ok(after3 > 0 && after3 < after13);
  assert.ok(after13 <= 1, 'must saturate');
});

test('fatigue fades once the session ends and the views age out', () => {
  const m = emptyMemory(T0);
  for (let i = 0; i < 4; i++) recordImpression(m, 'i1', 's1', T0);
  const hot = fatigueScore(m, 'i1', T0);
  startSession(m, T0 + 8 * 24 * H);
  const cold = fatigueScore(m, 'i1', T0 + 8 * 24 * H);
  assert.ok(cold < hot, `expected fatigue to fade: ${hot} → ${cold}`);
});

test('decay halves counters over the half-life and forgets noise', () => {
  const m = emptyMemory(T0);
  recordInteraction(m, 'save', { categoryId: 'books' }, T0);
  const before = m.categories.books;
  decayMemory(m, T0 + 7 * 24 * H, 7);
  assert.ok(Math.abs(m.categories.books - before / 2) < 0.01, 'should halve at one half-life');
});

test('affinity normalises to the strongest category, and price uses p75', () => {
  const m = emptyMemory(T0);
  for (let i = 0; i < 5; i++) recordInteraction(m, 'save', { categoryId: 'electronics', price: 300 }, T0);
  recordInteraction(m, 'click', { categoryId: 'books', price: 40000 }, T0);
  const p = affinityProfile(m);
  assert.equal(p.categoryAffinity.electronics, 1);
  assert.ok(p.categoryAffinity.books < 1);
  assert.ok(p.priceCeiling !== null && p.priceCeiling < 40000,
    'one curious tap must not drag the ceiling to the outlier');
});

test('seller exposure floors the denominator so three impressions prove nothing', () => {
  const m = emptyMemory(T0);
  recordImpression(m, 'i1', 'tiny', T0);
  recordInteraction(m, 'transaction', { sellerId: 'tiny' }, T0);
  assert.ok(sellerExposure(m, 'tiny') <= (UTILITY.impression + UTILITY.transaction) / 10 + 0.001);
});

/* ── explicit rejection + dwell ─────────────────────── */

test('"not interested" removes an item from the feed entirely, not just its score', () => {
  const m = emptyMemory(T0);
  const target = item({ id: 'nope', user: user('seller-a') });
  const other = item({ id: 'fine', user: user('seller-b') });
  recordNotInterested(m, { itemId: 'nope', sellerId: 'seller-a', categoryId: 'electronics', scope: 'item' }, T0);

  const out = eligible([target, other], { blocked: new Set(), memory: m, now: T0 });
  assert.deepEqual(out.map(i => i.id), ['fine'],
    'a rejection a high score can overrule is a suggestion, not an instruction');
});

test('hiding a seller hides everything of theirs, not just the one card', () => {
  const m = emptyMemory(T0);
  recordNotInterested(m, { itemId: 'x', sellerId: 'spam', scope: 'seller' }, T0);
  const theirs = [item({ user: user('spam') }), item({ user: user('spam') })];
  const mine = item({ user: user('ok') });
  const out = eligible([...theirs, mine], { blocked: new Set(), memory: m, now: T0 });
  assert.equal(out.length, 1);
  assert.equal(out[0].user.id, 'ok');
});

test('rejection expires — a term later the catalogue has turned over anyway', () => {
  const m = emptyMemory(T0);
  recordNotInterested(m, { itemId: 'old', sellerId: 's', scope: 'item' }, T0);
  assert.equal(isHidden(m, 'old', 's', T0 + 30 * 24 * H), true, 'still hidden a month later');
  assert.equal(isHidden(m, 'old', 's', T0 + 200 * 24 * H), false, 'but not forever');
});

test('rejecting one item nudges its category down without disowning it', () => {
  const m = emptyMemory(T0);
  for (let i = 0; i < 4; i++) recordInteraction(m, 'save', { categoryId: 'furniture' }, T0);
  const before = m.categories.furniture;
  recordNotInterested(m, { itemId: 'lamp', categoryId: 'furniture', scope: 'item' }, T0);
  assert.ok(m.categories.furniture < before, 'should count against the category');
  assert.ok(m.categories.furniture > 0,
    'one ugly lamp is not a renunciation of furniture');
});

test('dwell separates a card that was read from one that was scrolled past', () => {
  const m = emptyMemory(T0);
  recordDwell(m, 'skim', 's1', 400, T0);
  assert.equal(m.items.skim, undefined, 'under a second is a scroll, not a look');

  recordDwell(m, 'read', 's1', 3000, T0);
  assert.ok(m.items.read.util > 0, 'three seconds is evidence');
});

test('dwell is capped so a phone left face-up is not a rave review', () => {
  const m = emptyMemory(T0);
  recordDwell(m, 'a', 's', 4000, T0);
  recordDwell(m, 'b', 's', 600_000, T0);
  assert.ok(m.items.b.util <= m.items.a.util * 2,
    'ten minutes must not outweigh four seconds by a hundredfold');
});

test('the utility table ranks a rejection heavier than a save', () => {
  assert.ok(UTILITY.notInterested < 0, 'rejection must be negative');
  assert.ok(Math.abs(UTILITY.notInterested) > UTILITY.save,
    'someone taking the trouble to say no is clearer than someone tapping a heart');
  assert.ok(UTILITY.dwell > UTILITY.impression && UTILITY.dwell < UTILITY.click,
    'a considered look sits between being shown and being opened');
});

/* ── intent ─────────────────────────────────────────── */

test('a service search moves intent to service', () => {
  const m = emptyMemory(T0);
  recordSearch(m, 'graphic design poster', T0);
  recordSearch(m, 'photographer for shoot', T0);
  const w = estimateIntent(m, T0);
  assert.equal(dominantIntent(w), 'service');
});

test('an empty session is browsing, not shopping', () => {
  assert.equal(dominantIntent(estimateIntent(emptyMemory(T0), T0)), 'browsing');
});

test('opening and saving listings reads as shopping', () => {
  const m = emptyMemory(T0);
  for (let i = 0; i < 4; i++) recordInteraction(m, 'click', { itemId: `i${i}` }, T0);
  recordInteraction(m, 'save', { itemId: 'i1' }, T0);
  recordInteraction(m, 'message', { itemId: 'i1' }, T0);
  assert.equal(dominantIntent(estimateIntent(m, T0)), 'shopping');
});

test('intent weights are a normalised distribution', () => {
  const w = estimateIntent(emptyMemory(T0), T0);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights should sum to 1, got ${sum}`);
});

/* ── semester ───────────────────────────────────────── */

test('phases map to the academic calendar', () => {
  assert.equal(currentPhase(new Date('2026-08-01')).phase, 'term_start');
  assert.equal(currentPhase(new Date('2026-06-15')).phase, 'break');
  assert.equal(currentPhase(new Date('2026-11-15')).phase, 'term_end');
});

test('the seasonal boost is real but small enough not to overrule intent', () => {
  const start = currentPhase(new Date('2026-08-01'));
  const b = semesterBoost('furniture', start);
  assert.ok(b > 1, 'furniture should lift at move-in');
  assert.ok(b <= 1.15, `boost must stay capped, got ${b}`);
  assert.equal(semesterBoost(null, start), 1);
});

test('the new-year window wraps December into January', () => {
  assert.equal(currentPhase(new Date('2026-12-28')).phase, 'break');
  assert.equal(currentPhase(new Date('2026-01-02')).phase, 'break');
});

/* ── pipeline ───────────────────────────────────────── */

function ctx(over: Record<string, unknown> = {}) {
  return {
    memory: emptyMemory(T0),
    viewer: { college: 'MIT', location: 'Meera Bhawan' },
    now: T0,
    categoryIdOf: catOf,
    seed: 42,
    ...over,
  } as Parameters<typeof rankFeed>[1];
}

test('eligibility drops blocked, closed and the viewer\'s own posts', () => {
  const pool = [
    item({ user: user('blocked') }),
    item({ isClosed: true }),
    item({ user: user('me') }),
    item({ user: user('ok') }),
  ];
  const out = eligible(pool, { blocked: new Set(['blocked']), selfId: 'me' });
  assert.equal(out.length, 1);
  assert.equal(out[0].user.id, 'ok');
});

test('the pipeline is deterministic for a given seed', () => {
  const pool = Array.from({ length: 30 }, (_, i) =>
    item({ user: user(`u${i % 7}`), categoryId: `c${i % 5}`, viewCount: i * 3 }));
  const a = rankFeed(pool, ctx());
  const b = rankFeed(pool, ctx());
  assert.deepEqual(a.items.map(i => i.id), b.items.map(i => i.id));
});

test('a different seed produces a different page from the same catalogue', () => {
  const pool = Array.from({ length: 40 }, (_, i) =>
    item({ user: user(`u${i % 9}`), categoryId: `c${i % 6}`, viewCount: i }));
  const a = rankFeed(pool, ctx({ seed: 1 }));
  const b = rankFeed(pool, ctx({ seed: 999 }));
  assert.notDeepEqual(a.items.map(i => i.id), b.items.map(i => i.id));
});

test('a brand-new listing outranks an identical week-old one', () => {
  const old = item({ postedAt: new Date(T0 - 7 * 24 * H).toISOString() });
  const brandNew = item({ postedAt: new Date(T0 - 30 * 60_000).toISOString() });
  const c = ctx();
  assert.ok(scoreItem(brandNew, c).score > scoreItem(old, c).score);
});

test('a fatigued listing sinks but is not removed', () => {
  const it = item();
  const m = emptyMemory(T0);
  const fresh = scoreItem(it, ctx({ memory: m }));
  for (let i = 0; i < 8; i++) recordImpression(m, it.id, it.user.id, T0);
  const tired = scoreItem(it, ctx({ memory: m }));
  assert.ok(tired.score < fresh.score, 'repeated views should cost it');
  assert.ok(tired.score > 0, 'but it must stay in the running');
});

test('exploration reserves slots and keeps them out of the top two', () => {
  const ranked = Array.from({ length: 20 }, (_, i) =>
    ({ item: item({ id: `top${i}` }), score: 0.9 - i / 100, parts: { exploration: 0 } }));
  const bench = Array.from({ length: 10 }, (_, i) =>
    ({ item: item({ id: `new${i}` }), score: 0.2, parts: { exploration: 1 } }));
  const out = injectExploration(ranked, [...ranked, ...bench], {
    pageSize: 20, rate: 0.1, rand: rng(7),
  });
  assert.equal(out.length, 20);
  const injected = out.filter(o => o.item.id.startsWith('new'));
  assert.ok(injected.length >= 1, 'exploration must actually get slots');
  assert.ok(!out.slice(0, 2).some(o => o.item.id.startsWith('new')),
    'never in the first two slots');
});

test('rotation keeps most of the page and refreshes the rest', () => {
  const prev = Array.from({ length: 20 }, (_, i) => item({ id: `p${i}` }));
  const next = Array.from({ length: 20 }, (_, i) => item({ id: `n${i}` }));
  const out = rotate(prev, next, { rand: rng(3) });
  assert.equal(out.length, 20);
  const kept = out.filter(i => i.id.startsWith('p')).length;
  assert.ok(kept >= 12 && kept <= 15, `expected ~65% stable, kept ${kept}`);
  assert.ok(out.slice(0, 5).every(i => i.id.startsWith('p')),
    'the top of the page must not move under the reader');
});

test('sessionSeed is stable within a minute and moves between sessions', () => {
  assert.equal(sessionSeed(T0, 0), sessionSeed(T0 + 5_000, 0));
  assert.notEqual(sessionSeed(T0, 0), sessionSeed(T0 + 10 * 60_000, 0));
  assert.notEqual(sessionSeed(T0, 0), sessionSeed(T0, 1));
});

/* ── orchestration ──────────────────────────────────── */

function pools(over: Record<string, unknown> = {}) {
  const items = Array.from({ length: 24 }, (_, i) =>
    item({ user: user(`u${i % 6}`), categoryId: `c${i % 4}`, viewCount: i * 2,
           price: i * 100, postedAt: new Date(T0 - i * H).toISOString() }));
  return {
    items,
    requests: [item({ isRequest: true })],
    opportunities: [item({ kind: 'opportunity' }), item({ kind: 'opportunity' })],
    events: [], lostFound: [],
    ranked: items.slice(0, 12),
    sellers: summariseSellers(items, [], T0),
    ...over,
  } as Parameters<typeof orchestrate>[0];
}

function octx(over: Record<string, unknown> = {}) {
  return {
    intent: { shopping: 0.2, service: 0.2, business: 0.2, browsing: 0.2, selling: 0.2 },
    phase: currentPhase(new Date(T0)),
    warm: true, signedIn: true, rand: rng(5), now: T0,
    ...over,
  } as Parameters<typeof orchestrate>[1];
}

test('modules come back in zone order — the hierarchy never inverts', () => {
  const out = orchestrate(pools(), octx());
  const zones = out.map(m => m.spec.zone);
  const sorted = [...zones].sort((a, b) => a - b);
  assert.deepEqual(zones, sorted, `zones out of order: ${zones.join(',')}`);
});

test('rows below their minimum are dropped rather than drawn half-empty', () => {
  const out = orchestrate(pools({ opportunities: [], requests: [], ranked: [] }), octx());
  const ids = out.map(m => m.spec.id);
  assert.ok(!ids.includes('services'), 'a services row with nothing in it must not render');
  assert.ok(!ids.includes('picked_for_you'));
});

test('high service intent lifts Services up the page', () => {
  const neutral = orchestrate(pools(), octx());
  const servicey = orchestrate(pools(), octx({
    intent: { shopping: 0.05, service: 0.8, business: 0.05, browsing: 0.05, selling: 0.05 },
  }));
  const posOf = (o: ReturnType<typeof orchestrate>) => o.findIndex(m => m.spec.id === 'services');
  assert.ok(posOf(servicey) < posOf(neutral),
    `services should climb: ${posOf(neutral)} → ${posOf(servicey)}`);
});

test('the zone lift is reachable from real behaviour, not just from a synthetic 0.8', () => {
  /* The threshold is priority + 18, and a 5-way normalised distribution with a
     browsing floor caps how high any one mode can get. This pins the mechanism
     to what a person can actually do: four service searches and nothing else,
     which is a realistic "I came here to find a designer" session. If a tuning
     change ever makes the lift unreachable in practice, this fails while the
     synthetic-intent test above keeps passing. */
  const m = emptyMemory(T0);
  for (const q of ['graphic design poster', 'video editing freelance',
                   'photographer portfolio', 'illustrator commission']) {
    recordSearch(m, q, T0);
  }
  const intent = estimateIntent(m, T0);
  assert.equal(dominantIntent(intent), 'service');

  const placed = orchestrate(pools(), octx({ intent }));
  const services = placed.find(x => x.spec.id === 'services');
  assert.ok(services, 'services row should render');
  /* Declared in zone 3; must actually be sitting in zone 2 or better. */
  assert.equal(services!.spec.zone, 3, 'the declared zone is unchanged');
  const zonesAbove = placed.slice(0, placed.indexOf(services!)).map(x => x.spec.zone);
  assert.ok(zonesAbove.every(z => z <= 2),
    `services should have climbed out of zone 3; rows above it are in zones ${zonesAbove.join(',')}`);
});

test('a cold visitor gets no personalised row', () => {
  const out = orchestrate(pools(), octx({ warm: false, signedIn: false }));
  assert.ok(!out.some(m => m.spec.id === 'picked_for_you'));
  assert.ok(!out.some(m => m.spec.id === 'around_campus'));
  assert.ok(out.length > 0, 'but the page must still be worth showing');
});

test('every module in the library declares a zone and a floor', () => {
  for (const m of MODULES) {
    assert.ok(m.zone >= 1 && m.zone <= 4, `${m.id} has no valid zone`);
    assert.ok(m.min >= 1 || m.kind === 'categories', `${m.id} has no minimum`);
    assert.ok(m.title.trim().length > 0, `${m.id} has no title`);
  }
});

test('seller summaries need more than one listing and rank services higher', () => {
  const solo = summariseSellers([item({ user: user('once') })], [], T0);
  assert.equal(solo.length, 0, 'one listing is not a business');

  const many = summariseSellers(
    [item({ user: user('shop') }), item({ user: user('shop') })],
    [item({ user: user('svc'), kind: 'opportunity' }), item({ user: user('svc'), kind: 'opportunity' })],
    T0,
  );
  assert.equal(many[0].user.id, 'svc', 'services should weigh heavier than objects');
});

/* ── the UI budget ──────────────────────────────────── */

function fake(id: string, kind: 'products'|'services'|'businesses'|'events', variant?: string, zone = 4) {
  return { spec: { id, kind, variant, zone, title: id, sub: '', priority: 50, min: 1,
                   mobility: 0 as const, build: () => [] }, content: [1], score: 50 } as never;
}

test('the budget breaks a run of three product modules', () => {
  const out = applyModuleBudget([
    fake('a', 'products', 'standard'), fake('b', 'products', 'micro'),
    fake('c', 'products', 'standard'), fake('d', 'services', 'wide'),
  ]);
  const kinds = out.map(m => m.spec.kind);
  assert.notDeepEqual(kinds.slice(0, 3), ['products', 'products', 'products'],
    `three product rows in a row survived: ${kinds.join(',')}`);
});

test('only one featured row survives per page; the rest are demoted, not dropped', () => {
  const out = applyModuleBudget([
    fake('a', 'products', 'featured'), fake('b', 'services', 'wide'),
    fake('c', 'products', 'featured'), fake('d', 'events', 'wide'),
    fake('e', 'products', 'featured'),
  ]);
  assert.equal(out.length, 5, 'nothing may be dropped');
  assert.equal(out.filter(m => m.spec.variant === 'featured').length, 1,
    'a large row is only large relative to the others');
});

test('the budget never reorders across zones', () => {
  const out = applyModuleBudget([
    fake('z1', 'products', 'standard', 1), fake('z1b', 'products', 'standard', 1),
    fake('z2', 'products', 'standard', 2), fake('z4', 'services', 'wide', 4),
  ]);
  const zones = out.map(m => m.spec.zone);
  assert.deepEqual(zones, [...zones].sort((a, b) => a - b),
    `the information hierarchy must survive the budget: ${zones.join(',')}`);
});

test('every content module declares a shape — a card variant or a list', () => {
  /* One or the other, never neither: a module with no declared shape falls
     back to the default card everywhere, which is how the page ends up as the
     same template repeated. A list needs no card variant because it does not
     draw cards. */
  for (const m of MODULES) {
    if (m.kind === 'products' || m.kind === 'services' || m.kind === 'events') {
      assert.ok(m.variant || m.layout === 'list',
        `${m.id} declares neither a card variant nor a list layout`);
    }
    if (m.layout === 'list') {
      assert.ok(!m.variant, `${m.id} is a list; a card variant on it would be dead configuration`);
    }
  }
});

test('featured is rationed at the source too — not every row may ask for it', () => {
  const asking = MODULES.filter(m => m.variant === 'featured').length;
  assert.ok(asking <= 2, `${asking} modules want the hero format; that defeats the point of it`);
});

test('shuffle is a permutation, not a filter', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(xs, rng(11));
  assert.equal(out.length, xs.length);
  assert.deepEqual([...out].sort((a, b) => a - b), xs);
});
