/* ── What the feed remembers ───────────────────────────────────────────────
 *
 * Impressions, engagements, category affinity and the fatigue that falls out of
 * them. All of it lives on the device.
 *
 * On-device is a real design decision, not a shortcut. Fatigue and affinity are
 * per-VIEWER quantities — "have I already been shown this desk four times
 * today" is a question about one person's screen, and answering it server-side
 * would mean writing a row every time a card scrolls past, which is the single
 * highest-volume event the app can generate and worth nothing to anyone else.
 * The trade is that it does not follow a user between devices; for a campus
 * marketplace where nearly everyone is on one phone, that is the right side of
 * the trade. The seller-fairness counters are the exception in principle — they
 * are a property of the marketplace, not the viewer — but a local approximation
 * from one device is still far better than the alternative, which is no
 * fairness term at all.
 *
 * Everything here is a pure function over a plain object. Persistence is three
 * functions at the bottom and nothing above them touches storage, which is what
 * makes the decay and scoring logic testable without a browser.
 */

/** What an interaction is worth, straight from the brief.
 *
 *  The ratios are the whole point. A save is five impressions; contacting a
 *  seller is ten; a completed exchange is thirty. This is what stops the feed
 *  optimising for scrolling: a listing with 200 views and 15 saves scores 275,
 *  while one with 40 views and 4 enquiries scores 80 on a fifth of the
 *  attention — and it is the second one the marketplace actually wants more of.
 *  Engagement and transaction are not the same objective and this table is
 *  where we say so. */
export const UTILITY = {
  impression: 1,
  /** A card that stayed on screen long enough to be read rather than scrolled
   *  past. Worth more than an impression and far less than a tap — it is the
   *  difference between "shown" and "considered", and it is the only positive
   *  signal available for the majority of items nobody ever taps. */
  dwell: 2,
  click: 3,
  save: 5,
  message: 10,
  transaction: 30,
  /** Explicit rejection. Negative, and heavier than a save is positive: a
   *  person who takes the trouble to say "not this" is giving a much clearer
   *  instruction than one who taps, and the feed should believe them. */
  notInterested: -12,
} as const;

export type Interaction = keyof typeof UTILITY;

export interface ItemStat {
  /** Times shown to this viewer. */
  imp: number;
  /** Impressions in the current session. */
  sessionImp: number;
  /** ms timestamps of recent impressions, newest last, capped. */
  seen: number[];
  /** Accumulated utility from this viewer's interactions. */
  util: number;
}

export interface FeedMemory {
  v: 1;
  /** Listing ids the viewer has explicitly rejected. */
  hiddenItems: Record<string, number>;
  /** Seller ids the viewer has explicitly hidden. */
  hiddenSellers: Record<string, number>;
  /** Per listing. */
  items: Record<string, ItemStat>;
  /** Per seller, for the fairness term. */
  sellers: Record<string, { imp: number; util: number }>;
  /** Category id → accumulated interaction utility. */
  categories: Record<string, number>;
  /** Prices of listings this viewer engaged with, newest last, capped. */
  prices: number[];
  /** Recent search strings, newest last, capped. */
  searches: { q: string; at: number }[];
  /** Interaction counts in the current session, for intent estimation. */
  session: Record<string, number>;
  /** When the current session began. */
  sessionAt: number;
  /** Last decay sweep. */
  decayedAt: number;
}

export function emptyMemory(now = Date.now()): FeedMemory {
  return {
    v: 1,
    items: {}, sellers: {}, categories: {}, prices: [], searches: [],
    hiddenItems: {}, hiddenSellers: {},
    session: {}, sessionAt: now, decayedAt: now,
  };
}

const MAX_SEEN = 12;
const MAX_PRICES = 40;
const MAX_SEARCHES = 20;

/* ── Recording ──────────────────────────────────────── */

function statFor(m: FeedMemory, id: string): ItemStat {
  return (m.items[id] ??= { imp: 0, sessionImp: 0, seen: [], util: 0 });
}

/** A card was actually shown. Cheap and very frequent — keep it O(1). */
export function recordImpression(m: FeedMemory, itemId: string, sellerId: string, now: number): FeedMemory {
  const st = statFor(m, itemId);
  st.imp += 1;
  st.sessionImp += 1;
  st.seen.push(now);
  if (st.seen.length > MAX_SEEN) st.seen.splice(0, st.seen.length - MAX_SEEN);
  st.util += UTILITY.impression;
  if (sellerId) {
    const s = (m.sellers[sellerId] ??= { imp: 0, util: 0 });
    s.imp += 1;
    s.util += UTILITY.impression;
  }
  return m;
}

/** Something stronger than a scroll-past. */
export function recordInteraction(
  m: FeedMemory,
  kind: Interaction,
  meta: { itemId?: string; sellerId?: string; categoryId?: string | null; price?: number | null },
  now: number,
): FeedMemory {
  const w = UTILITY[kind];
  if (meta.itemId) statFor(m, meta.itemId).util += w;
  if (meta.sellerId) (m.sellers[meta.sellerId] ??= { imp: 0, util: 0 }).util += w;
  if (meta.categoryId) m.categories[meta.categoryId] = (m.categories[meta.categoryId] ?? 0) + w;
  if (typeof meta.price === 'number' && meta.price > 0 && kind !== 'impression') {
    m.prices.push(meta.price);
    if (m.prices.length > MAX_PRICES) m.prices.splice(0, m.prices.length - MAX_PRICES);
  }
  m.session[kind] = (m.session[kind] ?? 0) + 1;
  m.sessionAt ||= now;
  return m;
}

/**
 * "Not interested", and its stronger sibling "hide this seller".
 *
 * The most valuable personalisation signal there is, and the one a click-based
 * system can never collect: taps tell you what someone opened, which includes
 * everything they opened by mistake or out of idle curiosity. Only an explicit
 * rejection tells you what they do NOT want, and it arrives with no ambiguity.
 *
 * Recorded with a timestamp rather than as a boolean so it can expire. A
 * marketplace's stock turns over completely in a term, and "I don't want this
 * desk" should not still be suppressing furniture next semester.
 */
export function recordNotInterested(
  m: FeedMemory,
  meta: { itemId?: string; sellerId?: string; categoryId?: string | null; scope: 'item' | 'seller' },
  now: number,
): FeedMemory {
  if (meta.itemId) m.hiddenItems[meta.itemId] = now;
  if (meta.scope === 'seller' && meta.sellerId) m.hiddenSellers[meta.sellerId] = now;
  /* A rejected item also argues, gently, against its category — but only
     gently. Someone dismissing one ugly lamp has not disowned furniture. */
  if (meta.categoryId) {
    m.categories[meta.categoryId] = (m.categories[meta.categoryId] ?? 0) + UTILITY.notInterested * 0.25;
  }
  if (meta.itemId) statFor(m, meta.itemId).util += UTILITY.notInterested;
  if (meta.sellerId) (m.sellers[meta.sellerId] ??= { imp: 0, util: 0 }).util += UTILITY.notInterested;
  m.session.notInterested = (m.session.notInterested ?? 0) + 1;
  return m;
}

/** Hidden things stay hidden for a term, then come back. */
const HIDE_TTL_MS = 120 * 86_400_000;

export function isHidden(m: FeedMemory, itemId: string, sellerId: string, now: number): boolean {
  const i = m.hiddenItems[itemId];
  if (i && now - i < HIDE_TTL_MS) return true;
  const s = m.hiddenSellers[sellerId];
  if (s && now - s < HIDE_TTL_MS) return true;
  return false;
}

/**
 * A card that was actually read.
 *
 * Someone who sees a card for under a second and scrolls on has told you
 * nothing; someone whose eye rested on it for three has told you something,
 * even though neither of them tapped. Since most items are never tapped, this
 * is the only positive evidence most of the catalogue will ever generate.
 */
export function recordDwell(
  m: FeedMemory,
  itemId: string,
  sellerId: string,
  ms: number,
  now: number,
): FeedMemory {
  /* Under a second is a scroll, not a look. */
  if (ms < 1000) return m;
  /* Capped: a card left on screen while someone answers the door is not
     a stronger endorsement than one genuinely studied. */
  const weight = Math.min(3, ms / 2000) * UTILITY.dwell;
  statFor(m, itemId).util += weight;
  if (sellerId) (m.sellers[sellerId] ??= { imp: 0, util: 0 }).util += weight;
  m.session.dwell = (m.session.dwell ?? 0) + 1;
  return m;
}

export function recordSearch(m: FeedMemory, q: string, now: number): FeedMemory {
  const t = q.trim().toLowerCase();
  if (!t) return m;
  m.searches.push({ q: t, at: now });
  if (m.searches.length > MAX_SEARCHES) m.searches.splice(0, m.searches.length - MAX_SEARCHES);
  m.session.search = (m.session.search ?? 0) + 1;
  return m;
}

/** A new visit. Session counters reset; long-term memory does not. */
export function startSession(m: FeedMemory, now: number): FeedMemory {
  m.session = {};
  m.sessionAt = now;
  for (const id of Object.keys(m.items)) m.items[id].sessionImp = 0;
  return m;
}

/* ── Decay ──────────────────────────────────────────── */

/**
 * Age the long-term counters.
 *
 * Without this the profile calcifies: someone who spent Freshers' Week buying
 * furniture is still shown furniture in March, because a counter that only ever
 * increases can only ever describe the past. Halving roughly weekly means about
 * a month of history meaningfully shapes the feed and everything older fades to
 * a whisper — which matches how quickly a student's needs actually turn over.
 */
export function decayMemory(m: FeedMemory, now: number, halfLifeDays = 7): FeedMemory {
  const elapsedDays = (now - m.decayedAt) / 86_400_000;
  if (elapsedDays < 0.5) return m;
  const k = Math.pow(0.5, elapsedDays / halfLifeDays);

  for (const [id, st] of Object.entries(m.items)) {
    st.imp *= k;
    st.util *= k;
    st.seen = st.seen.filter(t => now - t < 7 * 86_400_000);
    /* Forget items entirely once they are noise — otherwise this object grows
       without bound and eventually blows the storage quota. */
    if (st.imp < 0.1 && st.util < 0.5 && !st.seen.length) delete m.items[id];
  }
  for (const [id, s] of Object.entries(m.sellers)) {
    s.imp *= k; s.util *= k;
    if (s.imp < 0.1 && s.util < 0.5) delete m.sellers[id];
  }
  for (const [id, v] of Object.entries(m.categories)) {
    const nv = v * k;
    if (nv < 0.5) delete m.categories[id]; else m.categories[id] = nv;
  }
  for (const [id, at] of Object.entries(m.hiddenItems)) {
    if (now - at > HIDE_TTL_MS) delete m.hiddenItems[id];
  }
  for (const [id, at] of Object.entries(m.hiddenSellers)) {
    if (now - at > HIDE_TTL_MS) delete m.hiddenSellers[id];
  }
  m.decayedAt = now;
  return m;
}

/* ── Derived: fatigue ───────────────────────────────── */

/**
 * How tired this viewer is of this listing, 0..1.
 *
 * Weighted by recency, straight from the brief: what was on screen ten minutes
 * ago matters far more than what was on screen on Tuesday. The result is a
 * PENALTY and not a filter, which is the important part — a fatigued item sinks
 * and then recovers as the timestamps age out, so the desk you scrolled past
 * three times today can come back next week rather than being suppressed
 * forever by a flag nothing ever clears.
 */
export function fatigueScore(m: FeedMemory, itemId: string, now: number): number {
  const st = m.items[itemId];
  if (!st) return 0;
  let last24 = 0, last7d = 0;
  for (const t of st.seen) {
    const age = now - t;
    if (age < 86_400_000) last24 += 1;
    else if (age < 7 * 86_400_000) last7d += 1;
  }
  const raw = st.sessionImp * 1.0 + last24 * 0.5 + last7d * 0.2;
  /* Saturating, so a runaway count cannot swamp every other term. */
  return Math.min(1, raw / 6);
}

/* ── Derived: affinity ──────────────────────────────── */

export interface AffinityProfile {
  /** Category id → 0..1 preference, normalised against the strongest. */
  categoryAffinity: Record<string, number>;
  /** Typical price this viewer engages at, or null when unknown. */
  priceCeiling: number | null;
  /** True once there is enough behaviour to personalise on at all. */
  warm: boolean;
}

export function affinityProfile(m: FeedMemory): AffinityProfile {
  const entries = Object.entries(m.categories);
  const max = entries.reduce((a, [, v]) => Math.max(a, v), 0);
  const categoryAffinity: Record<string, number> = {};
  if (max > 0) for (const [k, v] of entries) categoryAffinity[k] = v / max;

  /* The 75th percentile, not the mean. One curious tap on a ₹40,000 camera
     would drag a mean far above everything the person actually engages with,
     and the ceiling is meant to describe their normal range. */
  let priceCeiling: number | null = null;
  if (m.prices.length >= 4) {
    const sorted = [...m.prices].sort((a, b) => a - b);
    priceCeiling = sorted[Math.floor(sorted.length * 0.75)];
  }
  const engagements = Object.entries(m.session).filter(([k]) => k !== 'impression').length;
  return { categoryAffinity, priceCeiling, warm: entries.length > 0 || engagements > 0 };
}

/**
 * Seller exposure relative to what that exposure has returned.
 *
 * The brief's expected_value / max(impressions, floor). A seller shown ten
 * thousand times without producing an exchange is being subsidised by everyone
 * else's attention; the floor keeps a seller with three impressions from being
 * declared brilliant on no evidence.
 */
export function sellerExposure(m: FeedMemory, sellerId: string, minImpressions = 10): number {
  const s = m.sellers[sellerId];
  if (!s) return 1;
  return s.util / Math.max(s.imp, minImpressions);
}

/* ── Persistence ────────────────────────────────────── */

const KEY = 'wecycle.feed.memory.v1';

export function loadMemory(now = Date.now()): FeedMemory {
  if (typeof window === 'undefined') return emptyMemory(now);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyMemory(now);
    const parsed = JSON.parse(raw) as FeedMemory;
    if (parsed?.v !== 1) return emptyMemory(now);
    /* Fill in anything a partial write left out rather than trusting the shape. */
    return {
      ...emptyMemory(now),
      ...parsed,
      items: parsed.items ?? {},
      sellers: parsed.sellers ?? {},
      categories: parsed.categories ?? {},
      prices: parsed.prices ?? [],
      searches: parsed.searches ?? [],
      hiddenItems: parsed.hiddenItems ?? {},
      hiddenSellers: parsed.hiddenSellers ?? {},
    };
  } catch {
    return emptyMemory(now);
  }
}

export function saveMemory(m: FeedMemory): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* Quota or private mode. The feed degrades to un-personalised, which is a
       working feed — never let this throw into a render. */
  }
}

export function clearMemory(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
