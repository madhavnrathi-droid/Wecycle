/* ── The homepage as modules ───────────────────────────────────────────────
 *
 * The storefront used to be a fixed sequence written into the JSX: fresh, then
 * popular, then budget, then college, then categories, then requests, then
 * services. Every visitor got that order, forever, and changing it meant
 * editing a component.
 *
 * Here the page is data. Modules declare where they may sit and how much they
 * want it; an orchestrator picks an order per visit. The component renders
 * whatever it is handed and knows nothing about why.
 *
 * CONSTRAINED, not free. Letting a ranker sort the page arbitrarily produces
 * chaos — search below the fold one day, categories above it the next — and a
 * homepage whose furniture moves is one people stop trusting. So modules live
 * in ZONES that express the page's information hierarchy:
 *
 *     zone 1  orientation      what is this, what is here, what is new
 *     zone 2  personal         what we think you specifically want
 *     zone 3  community        the people and businesses behind the listings
 *     zone 4  long tail        categories, older stock, exploration
 *
 * Order changes freely WITHIN a zone. A module may cross into an adjacent zone
 * only when intent justifies it — Services climbing into zone 1 for someone
 * visibly hunting a photographer — and never further. The user should feel
 * "there is always something new here", never "where did everything go".
 */

import type { MarketplaceItem, CommunityEvent, LostItem, User } from '../mockData';
import type { IntentWeights } from './intent';
import type { PhaseInfo } from './semester';

export type ModuleId =
  | 'picked_for_you' | 'fresh' | 'just_listed' | 'trending' | 'around_campus'
  | 'under_500' | 'free_stuff' | 'needs_a_home' | 'requests'
  | 'services' | 'student_businesses' | 'events' | 'lost_found'
  | 'categories' | 'wildcard';

export type ModuleKind = 'products' | 'services' | 'businesses' | 'events' | 'lostfound' | 'categories';

/** Which physical card a module draws with.
 *
 *  The module picks the format, not the component. One card size everywhere is
 *  what made the page read as the same template nine times over and made every
 *  row cost the same to scan — a row whose job is "consider this" and a row
 *  whose job is "scan forty of these" should not look identical.
 *
 *    featured  4:5 image, ~1.75 across   the lead row, rationed to one a page
 *    standard  1:1 image, ~2.3 across    the default
 *    micro     1:1 image, ~3.2 across    dense scanning, no metadata line
 *    wide      3:2 image, ~1.5 across    landscape art: posters, banners
 */
export type CardVariant = 'featured' | 'standard' | 'micro' | 'wide' | 'business';

/** Rail or list.
 *
 *  Not every module wants a carousel. A horizontal rail hides most of its
 *  contents behind a gesture, which is the right trade when the content is
 *  visual and browsing is casual, and the wrong one when someone is scanning
 *  for a specific thing — a lost phone case, a photographer free on Saturday.
 *  Those read faster in a column that shows everything at once. */
export type ModuleLayout = 'rail' | 'list';

export interface ModulePools {
  items: MarketplaceItem[];
  requests: MarketplaceItem[];
  opportunities: MarketplaceItem[];
  events: CommunityEvent[];
  lostFound: LostItem[];
  /** Ranked feed output — the personalised spine of the page. */
  ranked: MarketplaceItem[];
  sellers: SellerSummary[];
}

/** A seller as the homepage shows them.
 *
 *  Aggregated from listings rather than read from a businesses table, because
 *  there is no businesses table yet. A student running an actual venture is
 *  currently indistinguishable in the schema from someone selling their old
 *  desk, so "most active sellers" is the closest true statement the data
 *  supports. See the note in the orchestrator below. */
export interface SellerSummary {
  user: User;
  listingCount: number;
  serviceCount: number;
  categories: string[];
  newestAt: number;
}

export interface OrchestratorContext {
  intent: IntentWeights;
  phase: PhaseInfo;
  /** Viewer's college code, for the proximity row. Passed in rather than
   *  stamped onto every item, so nothing has to clone the catalogue. */
  viewerCollege?: string | null;
  /** False for a first-time visitor, where personalised rows are guesswork. */
  warm: boolean;
  signedIn: boolean;
  rand: () => number;
  now: number;
}

export interface ModuleSpec {
  id: ModuleId;
  kind: ModuleKind;
  title: string;
  sub: string;
  zone: 1 | 2 | 3 | 4;
  /** Base priority within its zone. Higher sits earlier. */
  priority: number;
  /** How many items before the row is worth drawing. A rail of one reads as
   *  broken; the floor is what stops a young catalogue looking derelict. */
  min: number;
  /** How far the module may stray from its home zone, in zones. */
  mobility: 0 | 1;
  /** Card format. Defaults to standard. */
  variant?: CardVariant;
  /** Rail (default) or a vertical list of compact rows. */
  layout?: ModuleLayout;
  /** Intent modes that pull this module up, and by how much. */
  affinity?: Partial<Record<keyof IntentWeights, number>>;
  /** Skip entirely unless the viewer is personalisable / signed in. */
  needsWarm?: boolean;
  needsSignIn?: boolean;
  build: (p: ModulePools, c: OrchestratorContext) => unknown[];
}

const take = <T,>(xs: T[], n = 12) => xs.slice(0, n);

/* ── The library ────────────────────────────────────── */

export const MODULES: ModuleSpec[] = [
  {
    id: 'picked_for_you', kind: 'products', zone: 2, priority: 95, min: 3, mobility: 1, variant: 'standard',
    title: 'Picked for you', sub: 'Based on what you have been opening',
    affinity: { shopping: 25, browsing: 5 },
    needsWarm: true,
    build: p => take(p.ranked),
  },
  {
    id: 'fresh', kind: 'products', zone: 1, priority: 90, min: 3, mobility: 1, variant: 'featured',
    title: 'Just dropped ✨', sub: 'Fresh off your batch, before anyone else',
    affinity: { browsing: 10, shopping: 8 },
    build: (p, c) => take(byNewest(p.items, c.now)),
  },
  {
    id: 'just_listed', kind: 'products', zone: 1, priority: 70, min: 3, mobility: 1, variant: 'standard',
    title: 'Listed today', sub: 'Posted in the last 24 hours',
    affinity: { shopping: 12 },
    build: (p, c) => take(byNewest(p.items, c.now).filter(i => hoursOld(i, c.now) < 24)),
  },
  {
    id: 'trending', kind: 'products', zone: 2, priority: 80, min: 3, mobility: 1, variant: 'micro',
    title: 'Most looked at 👀', sub: "What everyone's been opening this week",
    affinity: { browsing: 12, shopping: 6 },
    build: p => take([...p.items].filter(i => (i.viewCount ?? 0) > 0)
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))),
  },
  {
    id: 'around_campus', kind: 'products', zone: 2, priority: 85, min: 2, mobility: 1, variant: 'standard',
    title: 'From your college 🎓', sub: 'Same campus, shorter walk',
    affinity: { shopping: 10 },
    needsSignIn: true,
    build: (p, c) => c.viewerCollege
      ? take(p.items.filter(i => (i.user as { college?: string | null }).college === c.viewerCollege))
      : [],
  },
  {
    id: 'under_500', kind: 'products', zone: 4, priority: 60, min: 2, mobility: 1, variant: 'micro',
    title: 'Under ₹500 💸', sub: 'Cheaper than a night out',
    affinity: { browsing: 8, shopping: 6 },
    build: p => take(p.items.filter(i =>
      i.listingType === 'free' || (typeof i.price === 'number' && i.price > 0 && i.price <= 500))),
  },
  {
    id: 'free_stuff', kind: 'products', zone: 4, priority: 58, min: 2, mobility: 1, variant: 'standard',
    title: 'Free & up for grabs 🎁', sub: '₹0. Yes, really.',
    affinity: { browsing: 8 },
    build: p => take(p.items.filter(i => i.listingType === 'free')),
  },
  {
    id: 'needs_a_home', kind: 'products', zone: 4, priority: 40, min: 2, mobility: 0, variant: 'standard',
    title: 'Still looking for someone', sub: 'Posted a while back and worth a second look',
    affinity: { browsing: 6 },
    /* The inventory-health row: good listings the feed has under-served.
       Sorted by age, filtered to things nobody has opened much. */
    build: (p, c) => take([...p.items]
      .filter(i => hoursOld(i, c.now) > 72 && (i.viewCount ?? 0) < 15)
      .sort((a, b) => (a.viewCount ?? 0) - (b.viewCount ?? 0))),
  },
  {
    id: 'requests', kind: 'products', zone: 3, priority: 55, min: 1, mobility: 1, variant: 'micro',
    title: 'Wanted on campus 🙋', sub: "Got one gathering dust? Make someone's week.",
    affinity: { selling: 20, browsing: 4 },
    build: p => take(p.requests),
  },
  {
    id: 'services', kind: 'services', zone: 3, priority: 75, min: 1, mobility: 1, layout: 'list',
    title: 'Hire a classmate 💼', sub: 'Skills, gigs and services on campus',
    affinity: { service: 40, business: 10 },
    build: p => take(p.opportunities),
  },
  {
    id: 'student_businesses', kind: 'businesses', zone: 3, priority: 72, min: 2, mobility: 1,
    title: 'Student businesses 🏪', sub: 'Ventures run by people on your campus',
    affinity: { business: 40, service: 15 },
    build: p => take(p.sellers, 10),
  },
  {
    id: 'events', kind: 'events', zone: 3, priority: 50, min: 1, mobility: 0, variant: 'wide',
    title: 'Happening soon 📅', sub: 'Around campus this week',
    affinity: { browsing: 8 },
    build: p => take(p.events),
  },
  {
    id: 'lost_found', kind: 'lostfound', zone: 3, priority: 45, min: 1, mobility: 0, layout: 'list',
    title: 'Help return these 🙌', sub: 'Items your campus is trying to recover',
    build: p => take(p.lostFound),
  },
  {
    id: 'categories', kind: 'categories', zone: 4, priority: 65, min: 1, mobility: 0,
    title: 'Browse by category', sub: 'Everything, sorted',
    affinity: { browsing: 14 },
    build: () => [],
  },
  {
    id: 'wildcard', kind: 'products', zone: 4, priority: 30, min: 3, mobility: 0, variant: 'micro',
    title: 'Something else entirely', sub: 'A corner of Wecycle you have not seen',
    affinity: { browsing: 10 },
    /* Deliberately unranked. This is the one row allowed to be arbitrary — it
       exists so the catalogue's long tail gets an occasional airing that no
       amount of relevance scoring would ever grant it. */
    build: (p, c) => take(shuffle(p.items, c.rand), 10),
  },
];

/* ── Orchestration ──────────────────────────────────── */

export interface PlacedModule {
  spec: ModuleSpec;
  content: unknown[];
  score: number;
}

/**
 * Choose the page.
 *
 * Two passes: score every module, then place them zone by zone. Zones are
 * emitted in order and a module may only shift by its `mobility`, which is what
 * keeps the page recognisable between visits while still letting it respond.
 */
export function orchestrate(pools: ModulePools, ctx: OrchestratorContext): PlacedModule[] {
  const scored = MODULES
    .filter(spec => {
      if (spec.needsWarm && !ctx.warm) return false;
      if (spec.needsSignIn && !ctx.signedIn) return false;
      return true;
    })
    .map(spec => {
      const content = spec.build(pools, ctx);
      let score = spec.priority;
      for (const [mode, bonus] of Object.entries(spec.affinity ?? {})) {
        score += (ctx.intent[mode as keyof IntentWeights] ?? 0) * (bonus as number);
      }
      /* A small deterministic jitter so two visits with identical signals still
         differ a little. Small enough that it can only reorder near-ties — the
         page should feel alive, not randomised. */
      score += ctx.rand() * 4;
      return { spec, content, score };
    })
    .filter(m => m.content.length >= m.spec.min || m.spec.kind === 'categories');

  /* Effective zone: a module with mobility may climb one zone when intent is
     strongly behind it. Only upward — nothing gets demoted out of its band, so
     the page can promote what you want without burying what you expect. */
  const withZone = scored.map(m => {
    const lift = m.spec.mobility && m.score >= m.spec.priority + 18 ? 1 : 0;
    const zone = Math.max(1, m.spec.zone - lift) as 1 | 2 | 3 | 4;
    return { ...m, zone };
  });

  const out: PlacedModule[] = [];
  for (const zone of [1, 2, 3, 4] as const) {
    out.push(...withZone.filter(m => m.zone === zone).sort((a, b) => b.score - a.score));
  }
  return applyModuleBudget(out.map(({ spec, content, score }) => ({ spec, content, score })));
}

/* ── The UI budget ─────────────────────────────────────────────────────────
 *
 * Governance over the ranker, and it exists because a ranker optimising for
 * relevance will happily produce five product rails in a row. Each one is
 * individually the best available module; together they are a page that says
 * nothing new after the first screen, and a marketplace that appears to sell
 * only objects — no services, no businesses, no events.
 *
 * These are constraints the score is not allowed to buy its way out of:
 *
 *   - at most 2 product modules in a row
 *   - at most 1 featured row per page, because a large row is only large
 *     relative to the others; make them all large and none of them reads as
 *     important
 *   - no two adjacent rows in the same card variant, so the page has a visible
 *     rhythm rather than one template repeated
 *
 * The reordering is a LOCAL swap: a violating module trades places with the
 * nearest later one that fixes it, inside the same zone. Zones are the page's
 * information hierarchy and the budget is not permitted to break them — it
 * shuffles within a band, never across.
 */
export function applyModuleBudget(modules: PlacedModule[]): PlacedModule[] {
  const out = [...modules];
  const isProduct = (m: PlacedModule) => m.spec.kind === 'products';
  let featuredUsed = 0;

  for (let i = 0; i < out.length; i++) {
    const m = out[i];

    /* Featured is rationed. A demoted row keeps its content and its position —
       only its card size changes, which costs the reader nothing. */
    if (m.spec.variant === 'featured') {
      if (featuredUsed >= 1) {
        out[i] = { ...m, spec: { ...m.spec, variant: 'standard' } };
      } else {
        featuredUsed++;
      }
    }

    if (i < 2) continue;
    const a = out[i - 2], b = out[i - 1], c = out[i];
    const threeProducts = isProduct(a) && isProduct(b) && isProduct(c);
    const sameVariant = variantOf(b) === variantOf(c);
    if (!threeProducts && !sameVariant) continue;

    /* Look ahead inside the same zone for something that breaks the run. */
    const swap = out.findIndex((cand, j) =>
      j > i
      && cand.spec.zone === c.spec.zone
      && (threeProducts ? !isProduct(cand) : true)
      && variantOf(cand) !== variantOf(b));
    if (swap > i) {
      const tmp = out[i];
      out[i] = out[swap];
      out[swap] = tmp;
    }
    /* No candidate: the page genuinely has nothing else to offer here, and a
       repeated variant beats an empty slot. */
  }
  return out;
}

/* A list is a different shape from every rail, whatever card it holds, so it
   counts as its own variant for the run-breaking check. */
function variantOf(m: PlacedModule): string {
  if (m.spec.layout === 'list') return 'list';
  return m.spec.variant ?? m.spec.kind;
}

/* ── helpers ────────────────────────────────────────── */

function hoursOld(i: MarketplaceItem, now: number): number {
  if (i.postedAt) {
    const t = Date.parse(i.postedAt);
    if (Number.isFinite(t)) return Math.max(0, (now - t) / 3600_000);
  }
  return (i.postedDaysAgo ?? 0) * 24;
}

function byNewest(items: MarketplaceItem[], now: number): MarketplaceItem[] {
  return [...items].sort((a, b) => hoursOld(a, now) - hoursOld(b, now));
}

/** Fisher-Yates against the supplied RNG, so the wildcard row is stable within
 *  a session and different in the next one. */
export function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Roll up sellers from the listings already loaded.
 *
 *  A stand-in for a real business entity, and worth naming as one: a student
 *  running a print shop and a student selling one old chair are the same row in
 *  the same table today. Ranked by breadth and recency, which is the closest
 *  proxy the schema allows for "this is somebody's venture" — several live
 *  listings across categories, posted recently. */
export function summariseSellers(
  items: MarketplaceItem[],
  opportunities: MarketplaceItem[],
  now: number,
): SellerSummary[] {
  const by = new Map<string, SellerSummary>();
  const add = (it: MarketplaceItem, isService: boolean) => {
    const u = it.user;
    if (!u?.id) return;
    const s = by.get(u.id) ?? { user: u, listingCount: 0, serviceCount: 0, categories: [], newestAt: 0 };
    if (isService) s.serviceCount++; else s.listingCount++;
    const cat = it.category;
    if (cat && !s.categories.includes(cat)) s.categories.push(cat);
    s.newestAt = Math.max(s.newestAt, now - hoursOld(it, now) * 3600_000);
    by.set(u.id, s);
  };
  for (const it of items) add(it, false);
  for (const it of opportunities) add(it, true);

  return [...by.values()]
    .filter(s => s.listingCount + s.serviceCount >= 2)
    /* Services weigh double: offering a skill is a far stronger sign of running
       something than listing two objects. */
    .sort((a, b) =>
      (b.serviceCount * 2 + b.listingCount) - (a.serviceCount * 2 + a.listingCount)
      || b.newestAt - a.newestAt)
    .slice(0, 12);
}
