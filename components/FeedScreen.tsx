'use client';

import CategoryIcon from '../components/CategoryIcon';
import { CATEGORIES as CATEGORY_LIST, normalizeCategory } from '../lib/categories';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Search, MapPin, Heart, X, CalendarDays, Users as UsersIcon, Eye, ChevronRight } from 'lucide-react';
import { Wordmark } from './Brand';
import {
  MARKETPLACE_ITEMS, OPPORTUNITIES, EVENTS, LOST_FOUND_ITEMS, CATEGORIES, closedLabelFor,
  type MarketplaceItem, type CommunityEvent, type LostItem,
} from '../lib/mockData';
import { resolveItemMedia, getAvatar, resolveEventPhoto, resolveLostFoundPhoto } from '../lib/photos';
import NoPhoto from './NoPhoto';
import { opportunityCompLabel, oppRoleBadge } from '../lib/opportunity';
import SavedSearchBar from './SavedSearchBar';
import { useAuth } from '../lib/AuthContext';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import {
  fetchMarketplaceItems, fetchOpportunities, fetchRequests, fetchEvents, fetchLostFound,
  fetchSavedListingIds, toggleListingSave,
  onPostsChanged, searchUsers, type UserSearchHit,
  readFeedCache, writeFeedCache,
} from '../lib/liveData';
import { getEventMetrics } from '../lib/metrics';
import { getSettings, onSettingsChange } from '../lib/settings';
import { getBlockedUserIds, onBlocksChange } from '../lib/moderation';
import { track, trackPostOpened, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import EmptyState from './EmptyState';
import MarketingBanner, { type BannerSlide } from './MarketingBanner';
import UserSearchResults from './UserSearchResults';
import FitImage from './FitImage';
import { priceChip, fromListingType, DEAL_BY_ID } from '../lib/dealTypes';
import { useFeedEngine } from '../lib/feed/useFeedEngine';
import { useTap } from '../lib/useTap';
import { withViewTransition, transitionStyle } from '../lib/viewTransition';
import { shareLink } from '../lib/share';
import { shareUrl } from '../lib/shareUrl';
import type { SellerSummary, PlacedModule, ModuleId, CardVariant } from '../lib/feed/modules';
import SellerCard from './SellerCard';
import CompactRow from './CompactRow';
import CardMenu, { useLongPress } from './CardMenu';

interface FeedScreenProps {
  onPost: () => void;
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onOpenItem: (item: MarketplaceItem) => void;
  /** Open an event detail screen — used when an event card on the All tab is tapped. */
  onOpenEvent?: (event: CommunityEvent) => void;
  /** Open the Lost & Found sheet — used when an L&F card on the All tab is tapped. */
  onOpenLF?: (lf: LostItem) => void;
  /** Banner CTA — fired when a marketing-banner slide is tapped.
   *  kind = which feature the user wants to jump to. */
  onBannerAction?: (kind: 'share' | 'request' | 'events' | 'lost-found' | 'invite') => void;
  /** Fired when a user-search-result card is tapped. Routes to the
   *  matching storefront. */
  onOpenUser?: (userId: string) => void;
  /** Opens the sign-in dialog. Needed because saving is account-bound. */
  onRequireAuth?: () => void;
  /** Straight into the "offer a service" composer, skipping the post-type
   *  picker — the mid-storefront job CTA already answered which type. */
  onPostService?: () => void;
}

/* ── Rail filters ──────────────────────────────────────────────────────────
 *
 * One definition per merchandising rail, used BOTH to build the row and to
 * filter the page behind its "See all". That shared definition is the whole
 * point: the two were written separately, the row filtered and the page did
 * not, and a heading promising free things opened onto the full catalogue.
 *
 * `match` is the row's predicate. `compare` exists for the two rails that are
 * orderings rather than filters — "Just dropped" and "Most looked at" are every
 * item, arranged, so filtering them would empty a page that should simply be
 * sorted differently.
 */
type RailFilterId = 'fresh' | 'popular' | 'budget' | 'college' | 'free';

interface RailFilterCtx { myCollege: string | null }

const RAIL_FILTERS: Record<RailFilterId, {
  /** Shown back to the user as a removable chip. */
  label: string;
  match: (it: MarketplaceItem, ctx: RailFilterCtx) => boolean;
  compare?: (a: MarketplaceItem, b: MarketplaceItem) => number;
}> = {
  fresh:   { label: 'Just dropped',   match: () => true,
             compare: (a, b) => a.postedDaysAgo - b.postedDaysAgo },
  popular: { label: 'Most looked at', match: it => (it.viewCount ?? 0) > 0,
             compare: (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0) },
  budget:  { label: 'Under ₹500',
             /* Free counts as under the cap rather than being excluded on a
                technicality — same rule the row uses. */
             match: it => it.listingType === 'free'
               || (typeof it.price === 'number' && it.price > 0 && it.price <= 500) },
  college: { label: 'From your college',
             match: (it, ctx) => !!ctx.myCollege
               && (it.user as { college?: string | null }).college === ctx.myCollege },
  free:    { label: 'Free', match: it => it.listingType === 'free' },
};

export default function FeedScreen({
  onPost, onOpenMenu, onOpenAccount, onOpenItem, onOpenEvent, onOpenLF,
  onBannerAction, onOpenUser, onRequireAuth, onPostService,
}: FeedScreenProps) {
  const { profile, user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    getBlockedUserIds().then(ids => setBlocked(new Set(ids)));
    const off = onBlocksChange(() => getBlockedUserIds().then(ids => setBlocked(new Set(ids))));
    return off;
  }, []);

  const [activeCategory, setActiveCategory] = useState('all');
  /* Default tab = "All" — the storefront view (themed rails). FeedScreen
     unmounts when the user navigates to another bottom-nav screen, so the
     next visit reseeds this default — that's the "every new session starts
     on the storefront" behaviour. */
  const [activeType, setActiveType] = useState<'all' | 'requests' | 'shared' | 'services'>('all');
  /* Which merchandising rail "See all" came from.
   *
   * Every one of these rails used to hand off to setActiveType('shared') and
   * nothing else, so tapping See all under "Free & up for grabs 🎁" showed the
   * whole catalogue — the row promised free things and the page behind it
   * delivered everything, including the ₹4,500 monitor. The promise a rail
   * makes in its heading has to survive the tap, or the heading is decoration.
   *
   * Held as a name rather than a predicate so it can also be shown back to the
   * user and cleared; a filtered list with no visible reason for being filtered
   * is the other half of this bug. */
  const [railFilter, setRailFilter] = useState<RailFilterId | null>(null);

  /* One place that opens a rail's full list, so the tab and the filter can
     never be set apart from each other. */
  const openRail = (id: RailFilterId) => {
    setActiveType('shared');
    setRailFilter(id);
    setActiveCategory('all');
    track(EVT.feed_tab_changed, { tab: 'shared', rail: id });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [query, setQuery] = useState('');
  /* Faceted sub-filter for the Jobs & gigs tab only. Keeping the direction
     filter here — rather than as a second homepage rail — is what lets one
     board carry both jobs and services without crowding the home screen. */
  const [workFilter, setWorkFilter] = useState<'all' | 'hiring' | 'offering'>('all');
  /* Saved-listing IDs for the heart icon's filled state. Hydrated from
     Supabase on mount + after every post-change event (a delete drops
     stale saves from the server side, this resync keeps the heart in
     step). */
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /* Which card's long-press sheet is open. One at a time, held here rather than
     inside the card so opening a second closes the first for free. */
  const [menuItem, setMenuItem] = useState<MarketplaceItem | null>(null);

  /* Settings: hide-prices toggle (Settings → Marketplace). We subscribe so
     flipping the switch updates every card on the feed live, without reload. */
  const [hidePrice, setHidePrice] = useState(false);
  useEffect(() => {
    setHidePrice(getSettings().marketplace.hidePriceOnFeed);
    return onSettingsChange(s => setHidePrice(s.marketplace.hidePriceOnFeed));
  }, []);

  /* Source of truth for the cards on each tab. Marketplace + requests
     feed the dedicated tabs; events + L&F join only on the "All" tab
     (which is the default first view of every session). */
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [opportunities, setOpportunities] = useState<MarketplaceItem[]>([]);
  const [requests, setRequests] = useState<MarketplaceItem[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [lostFound, setLostFound] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    if (isDemoMode()) {
      setItems(MARKETPLACE_ITEMS);
      setOpportunities(OPPORTUNITIES);
      setRequests([]);
      setEvents(EVENTS);
      setLostFound(LOST_FOUND_ITEMS);
      setLoading(false);
      return;
    }
    if (!hasSupabaseEnv) {
      setItems([]);
      setOpportunities([]);
      setRequests([]);
      setEvents([]);
      setLostFound([]);
      setLoading(false);
      return;
    }

    const load = (isFirst: boolean) => {
      /* Stale-while-revalidate: on first open, paint the last cached feed
         instantly and skip the loading state; then refresh in the background.
         We only show "Loading the feed…" when there's nothing cached yet. */
      if (isFirst) {
        const cached = readFeedCache();
        if (cached) {
          setItems(cached.items);
          setOpportunities(cached.opportunities ?? []);
          setRequests(cached.requests);
          setEvents(cached.events);
          setLostFound(cached.lostFound);
        }
        setLoading(!cached);
      }
      /* Progressive load: paint each slice the moment its own query returns
         instead of blocking the whole feed on the slowest of the five. */
      const pItems  = fetchMarketplaceItems({ limit: 60 });
      const pOpps   = fetchOpportunities({ limit: 60 });
      const pReq    = fetchRequests({ limit: 60 });
      const pEvents = fetchEvents();
      const pLF     = fetchLostFound();
      pItems.then(rows  => { if (!cancelled) { setItems(rows); setLoading(false); } });
      pOpps.then(rows   => { if (!cancelled) setOpportunities(rows); });
      pReq.then(rows    => { if (!cancelled) setRequests(rows); });
      pEvents.then(rows => { if (!cancelled) setEvents(rows); });
      pLF.then(rows     => { if (!cancelled) setLostFound(rows); });
      /* Cache the fresh result + clear the spinner once everything settles. */
      Promise.all([pItems, pOpps, pReq, pEvents, pLF]).then(([i, o, r, e, l]) => {
        if (cancelled) return;
        setLoading(false);
        writeFeedCache({ items: i, opportunities: o, requests: r, events: e, lostFound: l });
      });
    };
    load(true);
    /* Refetch the instant someone posts (same tab) — no cache reseed/flicker. */
    const off = onPostsChanged(() => load(false));
    return () => { cancelled = true; off(); };
  }, [mounted]);

  /* Hydrate the user's existing saves so the heart shows filled for any
     post they've previously saved. Refetched on every post-change in case
     the underlying listings table changed (a delete cascades the saves). */
  useEffect(() => {
    if (!mounted || isDemoMode() || !hasSupabaseEnv || !user) return;
    let cancelled = false;
    const load = () => {
      fetchSavedListingIds(user.id).then(ids => { if (!cancelled) setSavedIds(ids); });
    };
    load();
    const off = onPostsChanged(load);
    return () => { cancelled = true; off(); };
  }, [mounted, user]);

  /* Single toggle handler shared by every card. Optimistically flips
     the local set, fires the Supabase RPC, and reverts on failure. Demo
     mode skips the RPC and just keeps the local heart state. */
  const handleToggleSave = (listingId: string) => {
    /* Saving is account-bound — it lives in the `saves` table. Flipping the
       heart locally for a signed-out visitor filled the icon and then dropped
       it on the next tab switch (savedIds only rehydrates for a signed-in
       user), which reads as the app quietly losing their data. Ask them to
       sign in instead of pretending it worked. */
    if (!user && !isDemoMode()) { onRequireAuth?.(); return; }
    const wasSaved = savedIds.has(listingId);
    /* Saving feels rewarding (success pop); un-saving is a quieter tick. */
    haptics.favorite(!wasSaved);
    track(EVT.save_toggled, { post_id: listingId, saved: !wasSaved });
    if (!wasSaved) {
      const it = [...items, ...requests, ...opportunities].find(i => i.id === listingId);
      if (it) engine.note('save', {
        itemId: it.id, sellerId: it.user?.id,
        categoryId: it.categoryId ?? normalizeCategory(it.category),
        price: it.price ?? null,
      });
    }
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
    if (isDemoMode() || !hasSupabaseEnv || !user) return;
    toggleListingSave(listingId).catch(() => {
      /* Revert on failure so the heart never lies about server state. */
      setSavedIds(prev => {
        const next = new Set(prev);
        if (next.has(listingId)) next.delete(listingId);
        else next.add(listingId);
        return next;
      });
    });
  };

  /* ── User search ──
     Debounced lookup against the profiles table. We only hit Supabase
     when the query has ≥2 characters AND we're in live mode — demo mode
     can't search a backend that isn't there. */
  const [userHits, setUserHits] = useState<UserSearchHit[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    if (isDemoMode() || !hasSupabaseEnv) { setUserHits([]); return; }
    const trimmed = query.trim();
    if (trimmed.length < 2) { setUserHits([]); setUserSearchLoading(false); return; }
    setUserSearchLoading(true);
    /* 250ms debounce — typing-friendly without making the user wait. */
    const t = setTimeout(() => {
      track(EVT.search_submitted, { query_length: trimmed.length });
      searchUsers(trimmed).then(hits => {
        setUserHits(hits);
        setUserSearchLoading(false);
        track(EVT.user_search_submitted, { query_length: trimmed.length, result_count: hits.length });
      }, () => {
        setUserHits([]);
        setUserSearchLoading(false);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, mounted]);


  /* The active tab decides which pool the GRID view renders (the storefront
     rails on the All tab ignore this and pull from every pool directly):
       - 'requests' → open requests only
       - 'shared'   → marketplace listings only (the "Shared" tab)
       - 'services' → service opportunities only */
  const pool =
    activeType === 'requests' ? requests
    : activeType === 'services'
      ? (workFilter === 'all'
          ? opportunities
          /* Legacy rows carry no direction; group them with offers so they stay
             reachable instead of disappearing from both facets. */
          : opportunities.filter(o => (o.oppRole ?? 'offering') === workFilter))
    : items;
  const source = pool.filter(item => !blocked.has(item.user.id));
  /* Declared here rather than beside the college rail further down: `filtered`
     reads it, and a const is in its temporal dead zone until its own line has
     run. Leaving it below meant every render threw ReferenceError before the
     feed could paint — and TypeScript does not catch this one. */
  const myCollege = (profile as { college?: string | null } | null)?.college ?? null;

  /* ── The ranking + orchestration engine ──
     Everything it needs is already in this component's state; it returns an
     ordered list of modules and the callbacks that let it learn. The homepage
     below renders whatever it is handed and does not decide the order. */
  /* Memoised, and it matters: an object literal here would be a new reference
     on every render, so the engine's `useMemo` would see changed inputs every
     single time and re-rank the whole catalogue on each keystroke. */
  const viewer = useMemo(
    () => (user ? { id: user.id, college: myCollege, location: null } : null),
    [user?.id, myCollege],
  );
  const engine = useFeedEngine({
    items, requests, opportunities, events, lostFound, blocked,
    viewer,
    ready: mounted,
  });
  /* Feed the search to the ranker, debounced longer than the query itself.
     A search is the single strongest intent signal the app gets — it is the one
     moment someone says out loud what they came for — but recording every
     keystroke would make "photographer" read as nine separate searches, five of
     which are prefixes that mean nothing. 700ms is long enough that only
     finished words land. Deliberately outside the effect above, which returns
     early in demo mode and without Supabase; intent has to work in both. */
  useEffect(() => {
    if (!mounted) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) return;
    const t = setTimeout(() => engine.noteSearch(trimmed), 700);
    return () => clearTimeout(t);
  }, [query, mounted, engine]);

  const filtered = (() => {
    const base = source.filter(item => {
      if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
      if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
      /* The rail's own promise, applied to the whole catalogue rather than to
         the twelve items the row had space for. */
      if (railFilter && !RAIL_FILTERS[railFilter].match(item, { myCollege })) return false;
      return true;
    });
    const cmp = railFilter ? RAIL_FILTERS[railFilter].compare : undefined;
    return cmp ? [...base].sort(cmp) : base;
  })();

  /* ── "All" tab GRID entries (shown when a category/search narrows the
     storefront) ──────────────────────────────────────────────────────
     Mix every content type into a single list, ordered by recency. The
     discriminated union lets the renderer pick the right card component
     per kind. */
  type AllEntry =
    | { kind: 'item';        item: MarketplaceItem;    sortKey: number }
    | { kind: 'opportunity'; item: MarketplaceItem;    sortKey: number }
    | { kind: 'request';     item: MarketplaceItem;    sortKey: number }
    | { kind: 'event';       event: CommunityEvent;    sortKey: number }
    | { kind: 'lf';          lf: LostItem;             sortKey: number };

  const allEntries = useMemo<AllEntry[]>(() => {
    /* "Recent" sort key — older posts carry larger postedDaysAgo numbers,
       so smaller days-ago wins. For events we use the days-until-start so
       upcoming events feel "new". L&F uses position in the array since
       timeAgo is already a human string. */
    const itemEntries: AllEntry[] = items.filter(it => !blocked.has(it.user.id)).map((it, i) => ({
      kind: 'item' as const, item: it, sortKey: it.postedDaysAgo * 1000 + i,
    }));
    const opportunityEntries: AllEntry[] = opportunities.filter(it => !blocked.has(it.user.id)).map((it, i) => ({
      kind: 'opportunity' as const, item: it, sortKey: it.postedDaysAgo * 1000 + i,
    }));
    const requestEntries: AllEntry[] = requests.filter(it => !blocked.has(it.user.id)).map((it, i) => ({
      kind: 'request' as const, item: it, sortKey: it.postedDaysAgo * 1000 + i,
    }));
    const eventEntries: AllEntry[] = events.filter(ev => !blocked.has(ev.organizer.id)).map((ev, i) => ({
      kind: 'event' as const, event: ev, sortKey: -1000 + i,  /* events surface earliest */
    }));
    const lfEntries: AllEntry[] = lostFound.filter(lf => !blocked.has(lf.user.id)).map((lf, i) => ({
      kind: 'lf' as const, lf, sortKey: i * 1000,
    }));

    const merged = [...itemEntries, ...opportunityEntries, ...requestEntries, ...eventEntries, ...lfEntries];

    /* Filter by category + query — events skip the category filter since
       they don't carry one, but they still honour the title query. */
    const matchesQuery = (t: string) => !query || t.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = (cat?: string) =>
      activeCategory === 'all' || (cat ?? '').toLowerCase() === activeCategory;

    return merged
      .filter(e => {
        if (e.kind === 'item')        return matchesCategory(e.item.category) && matchesQuery(e.item.title);
        if (e.kind === 'opportunity') return matchesCategory(e.item.category) && matchesQuery(e.item.title);
        if (e.kind === 'request')     return matchesCategory(e.item.category) && matchesQuery(e.item.title);
        if (e.kind === 'event')       return matchesCategory(undefined)       && matchesQuery(e.event.title);
        return                               matchesCategory(e.lf.category)   && matchesQuery(e.lf.title);
      })
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [items, opportunities, requests, events, lostFound, activeCategory, query, blocked]);

  const greetingName = (profile?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0];

  /* The top strip is the first thing above the fold, and for a signed-OUT
     visitor it was spending that on "Hi, there 👋" and today's date — a
     greeting to nobody, and a fact they already knew. Nothing on the first
     screen said what this is or why to stay, which is a lot to ask of someone
     deciding in three seconds.
     Signed-in members keep the greeting: by then the name is warm rather than
     empty, and they already know what the app does. Rendered before mount too,
     so the value proposition is what paints first rather than arriving a beat
     late — the flash a member sees is one frame of a true sentence. */
  const showValueProp = !mounted || !user;

  /* ── What the modules draw from ─────────────────────────
     The themed rows themselves — fresh, popular, budget, college, free,
     requests, services, events, lost & found — used to be computed here, one
     `const` per row, and rendered in that order. They live in
     lib/feed/modules.ts now, so all that survives here is what the CATEGORY
     rails need: those are generated from the taxonomy rather than declared,
     so the component still owns them. */
  /* The ENGINE's pool, not a second filter built here. Computing eligibility
     twice is how a "not interested" item kept appearing: the engine dropped it
     from every module it owns, and these rails — which the screen builds from
     the taxonomy — never heard about it. One source of truth. */
  const liveItems = engine.items;

  /* Match on the category ID, not the display label. `item.category` carries
     the LABEL, so this compared "art" against "art & stationery" and every
     multi-word category silently produced an empty rail — which is why only
     Electronics and Fashion had one, those being the two whose label happens to
     equal its id. normalizeCategory covers rows that predate the id. */
  const itemsByCat = (cat: string) =>
    liveItems.filter(it => (it.categoryId ?? normalizeCategory(it.category)) === cat).slice(0, 12);

  /* Category rails, generated from the taxonomy rather than a hand-picked
     subset of it. A category that fills up earns a rail automatically, which is
     what makes the storefront keep working as people post.

     Two is still the floor: a rail holding one card reads as broken. */
  const categoryRails = CATEGORY_LIST
    .map(c => ({ id: c.id, title: c.rail.title, sub: c.rail.sub, list: itemsByCat(c.id) }))
    .filter(r => r.list.length >= 2);

  /* Storefront when nothing is narrowing the view; a product grid the
     moment a category, a type tab, or a search takes over. */
  const showStorefront = activeType === 'all' && activeCategory === 'all' && !query.trim();

  /* One card renderer for every marketplace-shaped post (item / request /
     opportunity), so rails and the grid stay visually identical. */
  const renderProduct = (
    it: MarketplaceItem,
    source: string,
    badgeKind?: 'request' | 'opportunity' | 'free',
    key?: string,
  ) => (
    <ProductCard
      key={key}
      item={it}
      isSaved={savedIds.has(it.id)}
      hidePrice={hidePrice}
      badgeKind={badgeKind}
      onToggleSave={() => handleToggleSave(it.id)}
      onLongPress={() => setMenuItem(it)}
      onClick={() => {
        trackPostOpened('item', it.id, { source, is_request: !!it.isRequest });
        /* The strongest per-item signal the feed gets. Opening a listing is
           what teaches category affinity and the price band. */
        engine.note('click', {
          itemId: it.id, sellerId: it.user?.id,
          /* normalizeCategory, not the raw field. categoryId is absent on any
             item that did not come from the listings mapper — demo fixtures,
             cached rows predating the column — and passing null there meant
             category affinity never accumulated at all: the profile stayed
             permanently cold and "Picked for you" could never unlock. The
             label is always present, and normalising it is what the rest of
             this file already does to find a category. */
          categoryId: it.categoryId ?? normalizeCategory(it.category),
          price: it.price ?? null,
        });
        if (it.kind === 'opportunity') engine.noteSignal('service_view');
        /* The photo the reader just tapped becomes the detail hero rather than
           being replaced by it. Falls straight through to onOpenItem where the
           browser has no View Transitions support. */
        withViewTransition(() => onOpenItem(it));
      }}
    />
  );

  /* A rail cell that also reports itself as seen. The observer lives in the
     engine; this only hands it the node. */
  const railCell = (it: MarketplaceItem, node: React.ReactNode, key?: string) => (
    <div
      className="rail-item"
      key={key ?? it.id}
      ref={el => engine.observe(el, it.id, it.user?.id ?? '')}
    >
      {node}
    </div>
  );

  /* ── Where each row's "See all" goes ──
     A rail's heading is a promise and the tap has to keep it: "Under ₹500"
     must not open the whole catalogue. Kept as a table beside the modules so a
     new row cannot quietly ship without one. */
  const seeAllFor: Partial<Record<ModuleId, () => void>> = {
    fresh:          () => openRail('fresh'),
    just_listed:    () => openRail('fresh'),
    trending:       () => openRail('popular'),
    around_campus:  () => openRail('college'),
    under_500:      () => openRail('budget'),
    free_stuff:     () => openRail('free'),
    requests:       () => setActiveType('requests'),
    services:       () => setActiveType('services'),
    events:         () => onBannerAction?.('events'),
    lost_found:     () => onBannerAction?.('lost-found'),
    picked_for_you: () => { setActiveType('shared'); setRailFilter(null); },
    needs_a_home:   () => { setActiveType('shared'); setRailFilter(null); },
    wildcard:       () => { setActiveType('shared'); setRailFilter(null); },
  };

  /* ── Module renderer ──
     The orchestrator decides WHICH rows appear and in WHAT ORDER; this decides
     only how each kind looks. That separation is the point of the rewrite:
     adding a row is now a table entry in lib/feed/modules.ts, and reordering
     the page touches no JSX at all. */
  const renderModule = (m: PlacedModule): React.ReactNode => {
    const { spec, content } = m;
    const seeAll = seeAllFor[spec.id];

    if (spec.kind === 'categories') {
      /* One module, many rails — the taxonomy decides how many. */
      /* One module, many rails — the taxonomy decides how many, so the UI
         budget upstream sees a single entry and cannot break up the run. Left
         alone that produced five identical standard rails in a row, which is
         exactly the monotony the budget exists to prevent. Alternating here is
         where that rhythm has to come from. */
      return (
        <Fragment key={spec.id}>
          {categoryRails.map((r, i) => (
            <Rail key={`cat-${r.id}`} title={r.title} sub={r.sub}
                  variant={i % 2 === 0 ? 'standard' : 'micro'}
                  onSeeAll={() => { setActiveCategory(r.id); track(EVT.category_filter_changed, { category: r.id }); }}>
              {r.list.map(it => railCell(it, renderProduct(it, `feed_cat_${r.id}`), `${r.id}-${it.id}`))}
            </Rail>
          ))}
        </Fragment>
      );
    }

    if (spec.kind === 'businesses') {
      return (
        <Rail key={spec.id} title={spec.title} sub={spec.sub} variant="business">
          {(content as SellerSummary[]).map(sel => (
            <div className="rail-item" key={sel.user.id}>
              <SellerCard
                seller={sel}
                onClick={() => {
                  engine.noteSignal('storefront_view');
                  track(EVT.user_card_opened, { user_id: sel.user.id, source: 'feed_businesses' });
                  onOpenUser?.(sel.user.id);
                }}
              />
            </div>
          ))}
        </Rail>
      );
    }

    if (spec.kind === 'events') {
      return (
        <Rail key={spec.id} title={spec.title} sub={spec.sub} variant={spec.variant} onSeeAll={seeAll}>
          {(content as CommunityEvent[]).map(ev => (
            <div className="rail-item" key={ev.id}>
              <EventCard event={ev} onClick={() => { trackPostOpened('event', ev.id, { source: 'feed_events_rail' }); onOpenEvent?.(ev); }} />
            </div>
          ))}
        </Rail>
      );
    }

    if (spec.kind === 'lostfound') {
      /* A list, not a wall of large photographs.
         The question a reader is answering here is "is that mine", and that is
         settled by a name and a place — so the row leads with those and keeps
         the photo at 88px. It also halves the height each entry costs, which
         matters for a section nobody wants to scroll past twice. */
      const lf = content as LostItem[];
      const lost = lf.filter(l => l.status === 'lost');
      const found = lf.filter(l => l.status === 'found');
      const openLF = (l: LostItem, source: string) => {
        trackPostOpened('lostfound', l.id, { source, lf_status: l.status });
        onOpenLF?.(l);
      };
      /* Both sections are already single-status, so the word "Lost" was landing
         three times on one row: in the heading, in the title the poster typed,
         and again as the bold line. Strip the prefix and drop the status line —
         what a reader actually needs next is WHERE, which is now the line that
         gets the weight. The status still reaches assistive tech through the
         label. */
      const strip = (t: string) => t.replace(/^\s*(lost|found)\s*[:\u2013-]\s*/i, '');
      const row = (l: LostItem, source: string) => (
        <CompactRow
          key={l.id}
          title={strip(l.title)}
          lead={l.lastSeen || undefined}
          leadTone={l.status === 'lost' ? 'lost' : 'found'}
          /* lastSeen is free text the poster wrote, and they often put the time
             in it — "Drawing Hall, 3 days ago". Repeating our own "3d ago"
             beside it reads as a stutter, so the post age is dropped when they
             have already said it. */
          meta={/\bago\b/i.test(l.lastSeen ?? '') ? undefined : l.timeAgo}
          imageUrl={resolveLostFoundPhoto(l.id, l.photoUrls)}
          fallbackTint={tintFor(l.photoColor)}
          onClick={() => openLF(l, source)}
          ariaLabel={`${l.status === 'lost' ? 'Lost' : 'Found'}: ${strip(l.title)}`}
        />
      );
      return (
        <Fragment key={spec.id}>
          {lost.length > 0 && (
            <section className="rail">
              <div className="rail-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="rail-title">Lost on campus 👀</h2>
                  <p className="rail-sub">Anything here look like yours?</p>
                </div>
                <button type="button" className="rail-seeall" onClick={() => onBannerAction?.('lost-found')}>
                  All lost <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>
              <div className="crow-list">{lost.slice(0, 4).map(l => row(l, 'feed_lost_list'))}</div>
            </section>
          )}
          {found.length > 0 && (
            <section className="rail">
              <div className="rail-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="rail-title">Found &amp; waiting 🙌</h2>
                  <p className="rail-sub">Someone’s looking for these — is one yours?</p>
                </div>
                {seeAll && (
                  <button type="button" className="rail-seeall" onClick={seeAll}>
                    See all <ChevronRight size={14} strokeWidth={2.2} />
                  </button>
                )}
              </div>
              <div className="crow-list">{found.slice(0, 4).map(l => row(l, 'feed_found_list'))}</div>
            </section>
          )}
        </Fragment>
      );
    }

    if (spec.layout === 'list') {
      /* Services. A gig rarely photographs as a "thing", so the big image well
         a product card reserves gets filled with a banner, an avatar or
         nothing at all — and three of them cost a whole screen. */
      return (
        <section className="rail" key={spec.id}>
          <div className="rail-head">
            <div style={{ minWidth: 0 }}>
              <h2 className="rail-title">{spec.title}</h2>
              <p className="rail-sub">{spec.sub}</p>
            </div>
            {seeAll && (
              <button type="button" className="rail-seeall" onClick={seeAll}>
                See all <ChevronRight size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
          <div className="crow-list">
            {(content as MarketplaceItem[]).slice(0, 5).map(it => (
              <div key={it.id} ref={el => engine.observe(el, it.id, it.user?.id ?? '')}>
                <CompactRow
                  title={it.title}
                  lead={opportunityCompLabel(it)}
                  location={it.location || undefined}
                  meta={it.user?.name ? `by ${it.user.name}` : undefined}
                  /* The provider's face, not a stock photo of nothing.
                     A service usually has no product to photograph, so the
                     media resolver fell back to a category image — and every
                     one of the five rows came out carrying the SAME picture,
                     which is worse than no picture at all. Only a genuinely
                     uploaded photo is shown; otherwise this is the person you
                     would be hiring, which is the useful thing anyway. */
                  portrait={!it.photoUrls?.length}
                  imageUrl={it.photoUrls?.length
                    ? coverImage(it).url ?? null
                    : getAvatar(it.user?.id || it.user?.name || it.id, 96)}
                  fallbackTint={tintFor(it.photoColor)}
                  onClick={() => {
                    trackPostOpened('item', it.id, { source: `feed_${spec.id}`, is_request: false });
                    engine.note('click', {
                      itemId: it.id, sellerId: it.user?.id,
                      categoryId: it.categoryId ?? normalizeCategory(it.category),
                      price: it.price ?? null,
                    });
                    engine.noteSignal('service_view');
                    onOpenItem(it);
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      );
    }

    /* products + services */
    const badge = spec.id === 'requests' ? 'request'
      : spec.kind === 'services' ? 'opportunity'
      : spec.id === 'free_stuff' ? 'free'
      : undefined;
    /* The card format is the MODULE's decision, taken in lib/feed/modules.ts
       and already passed through the UI budget — which rations featured rows
       and breaks up runs of the same shape. The component only renders what it
       is handed. */
    return (
      <Rail key={spec.id} title={spec.title} sub={spec.sub} variant={spec.variant} onSeeAll={seeAll}>
        {(content as MarketplaceItem[]).map(it =>
          railCell(it, renderProduct(it, `feed_${spec.id}`, badge), `${spec.id}-${it.id}`))}
      </Rail>
    );
  };

  /* Grid renderer for a mixed All-tab entry (used when a filter narrows the
     storefront into a product grid). */
  const renderEntry = (entry: AllEntry) => {
    if (entry.kind === 'item' || entry.kind === 'request' || entry.kind === 'opportunity') {
      const badge = entry.kind === 'request' ? 'request' : entry.kind === 'opportunity' ? 'opportunity' : undefined;
      return renderProduct(entry.item, 'feed_all', badge, `${entry.kind}-${entry.item.id}`);
    }
    if (entry.kind === 'event') {
      return (
        <EventCard
          key={`event-${entry.event.id}`}
          event={entry.event}
          onClick={() => { trackPostOpened('event', entry.event.id, { source: 'feed_all' }); onOpenEvent?.(entry.event); }}
        />
      );
    }
    return (
      <LostFoundCard
        key={`lf-${entry.lf.id}`}
        lf={entry.lf}
        onClick={() => { trackPostOpened('lostfound', entry.lf.id, { source: 'feed_all', lf_status: entry.lf.status }); onOpenLF?.(entry.lf); }}
      />
    );
  };

  /* Marketing banner slides — promote each Wecycle use case to first-time
     visitors. Hand-drawn / abstract aesthetic: each card uses a Wecycle
     accent gradient + a Twemoji illustration (loaded via Iconify CDN) that
     reads as loose, flat, hand-crafted artwork rather than a literal photo.
     The same `slides` array feeds both the compact (mobile) banner next to
     the greeting and the wide (desktop) banner below the search bar. */
  const bannerSlides: BannerSlide[] = [
    {
      id: 'share',
      image: '/banners/share.webp',
      illustration: 'twemoji:wrapped-gift',
      title: 'Share what you don’t use',
      subtitle: 'Give it a second life nearby',
      detail: 'Drop a photo, name your price (or free) — the right neighbour finds it in minutes.',
      gradient:
        'linear-gradient(135deg, rgba(34,197,94,0.92) 0%, rgba(13,148,136,0.85) 100%)',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'share' }); onBannerAction?.('share'); },
    },
    {
      id: 'request',
      image: '/banners/request.webp',
      illustration: 'twemoji:raising-hand',
      title: 'Ask for what you need',
      subtitle: 'Borrow before you buy',
      detail: 'Post a request and let the community come to you — books, tools, a kettle, anything.',
      gradient:
        'linear-gradient(135deg, rgba(245,132,0,0.92) 0%, rgba(244,63,94,0.88) 100%)',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'request' }); onBannerAction?.('request'); },
    },
    {
      id: 'events',
      image: '/banners/events.webp',
      illustration: 'twemoji:tear-off-calendar',
      title: 'Join local events',
      subtitle: 'Repair cafés, swaps, cleanups',
      detail: 'See what your community is hosting this week. RSVP in one tap.',
      gradient:
        'linear-gradient(135deg, rgba(99,102,241,0.92) 0%, rgba(168,85,247,0.88) 100%)',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'events' }); onBannerAction?.('events'); },
    },
    {
      id: 'lost-found',
      image: '/banners/lost-found.webp',
      illustration: 'twemoji:magnifying-glass-tilted-left',
      title: 'Lost something?',
      subtitle: 'Or help return what you found',
      detail: 'A second board, side-by-side with the marketplace. Verified by the community.',
      gradient:
        'linear-gradient(135deg, rgba(234,179,8,0.92) 0%, rgba(217,119,6,0.88) 100%)',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'lost-found' }); onBannerAction?.('lost-found'); },
    },
    {
      /* New slide: the Jobs & gigs tab had no promotion anywhere on the home
         screen, and its rail carries one post — the surface nobody knows exists
         is the one that stays empty. This points at the tab rather than the post
         form, because browsing what is already there is the lower-commitment
         first step. */
      id: 'jobs',
      image: '/banners/jobs.webp',
      illustration: 'twemoji:briefcase',
      title: 'Get paid for what you’re good at',
      subtitle: 'Design, tutoring, photography',
      detail: 'Small paid work on campus — post a gig, or take one on this week.',
      gradient:
        'linear-gradient(135deg, rgba(245,132,0,0.92) 0%, rgba(244,63,94,0.88) 100%)',
      ariaLabel: 'Get paid for what you’re good at — browse jobs and gigs',
      onClick: () => {
        track(EVT.marketing_banner_tapped, { slide: 'jobs' });
        setActiveType('services');
      },
    },
    {
      id: 'whatsapp',
      image: '/banners/whatsapp.webp',
      illustration: 'twemoji:graduation-cap',
      /* Not "For MAHE, by MAHE". Wecycle is independent — /copyright states
           plainly that it is not affiliated with, endorsed by, or sponsored by
           any university. A banner written in the institution's own voice
           contradicts that, and App Review asks submitters to prove they are
           authorised to use protected third-party material. Students
           describing themselves claims nothing on anyone else's behalf. */
        title: 'Better than the group chat',
      subtitle: 'Searchable, and still here tomorrow',
      detail: 'No scrolling four hundred messages to find who was selling a kettle.',
      gradient:
        'linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(168,85,247,0.9) 55%, rgba(34,197,94,0.9) 100%)',
      ariaLabel: 'Better than the group chat — invite a friend to Wecycle',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'whatsapp' }); onBannerAction?.('invite'); },
    },
  ];

  return (
    <div className="screen-transition" style={{ paddingBottom: 120, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        /* Solid card background — no liquid-glass blur. */
        background: 'var(--bg-card)',
        padding: '14px 16px 10px',
      }} className="mobile-only-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="theme-toggle"
            style={{ marginLeft: -8 }}
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Wordmark height={30} />
          </span>
          <button
            aria-label="Your profile"
            onClick={onOpenAccount}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--bg-inset)',
              border: 'none', cursor: 'pointer',
              padding: 0, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            suppressHydrationWarning
          >
            {mounted && (
              <img
                src={getAvatar(user?.id ?? 'guest')}
                alt=""
                width={34}
                height={34}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </button>
        </div>
      </header>

      {/* ── GREETING + MARKETING BANNER + DESKTOP-INLINE SEARCH ── */}
      <section className="feed-greeting-row" style={{ padding: '14px 20px 16px' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 12,
          flexWrap: 'wrap',
          minWidth: 0,
          flex: 1,
        }}
          className="feed-greeting-text"
        >
          <div style={{ minWidth: 0, flexShrink: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{
              margin: 0,
              fontSize: 26, fontWeight: 600,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              lineHeight: 1.15,
            }} suppressHydrationWarning>
              {showValueProp
                ? 'Buy, borrow and give away on campus'
                : <>Hi, {greetingName} <span aria-hidden="true">👋</span></>}
            </h1>
            <p style={{
              margin: '4px 0 0',
              fontSize: 13, color: 'var(--text-muted)',
            }} suppressHydrationWarning>
              {showValueProp
                ? 'Free to use, no commission — just verified Manipal students.'
                : mounted && new Date().toLocaleDateString('en-US', {
                    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
                  })}
            </p>
          </div>

        </div>

        {/* Search lives inline with the greeting on desktop */}
        <div className="feed-greeting-search desktop-only" style={{ position: 'relative' }}>
          <Search size={14} strokeWidth={1.8} style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search items, materials…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-pill"
            aria-label="Search items"
            style={{ width: '100%' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </section>

      {/* ── MOBILE MARKETING BANNER ── */}
      <section className="marketing-banner-mount-mobile" style={{ padding: '0 16px 16px' }}>
        <MarketingBanner slides={bannerSlides} variant="wide" />
      </section>

      {/* ── DESKTOP MARKETING BANNER ── */}
      <section className="marketing-banner-mount-desktop" style={{ padding: '0 16px 20px' }}>
        <MarketingBanner slides={bannerSlides} variant="wide" />
      </section>

      {/* ── MOBILE SEARCH (under banner) ── */}
      <section className="mobile-only" style={{ padding: '0 16px 14px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} strokeWidth={1.8} style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search items, materials…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-pill"
            aria-label="Search items"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </section>

      {/* ── USER SEARCH RESULTS ── */}
      <UserSearchResults
        results={userHits}
        query={query}
        loading={userSearchLoading}
        onPick={(hit) => { track(EVT.user_card_opened, { user_id: hit.id, source: 'feed_search' }); onOpenUser?.(hit.id); }}
      />

      {/* ── TYPE TABS: all / requests / shared / services & opportunities ── */}
      <section style={{ padding: '0 16px 14px' }}>
        <div className="segmented segmented--scroll">
          <button
            onClick={() => { setActiveType('all'); setRailFilter(null); track(EVT.feed_tab_changed, { tab: 'all' }); }}
            aria-pressed={activeType === 'all'}
            data-active={activeType === 'all' || undefined}
          >
            All
          </button>
          <button
            onClick={() => { setActiveType('requests'); setRailFilter(null); track(EVT.feed_tab_changed, { tab: 'requests' }); }}
            aria-pressed={activeType === 'requests'}
            data-active={activeType === 'requests' || undefined}
          >
            Requests
          </button>
          <button
            onClick={() => { setActiveType('shared'); setRailFilter(null); track(EVT.feed_tab_changed, { tab: 'shared' }); }}
            aria-pressed={activeType === 'shared'}
            data-active={activeType === 'shared' || undefined}
          >
            Shared
          </button>
          <button
            onClick={() => { setActiveType('services'); setRailFilter(null); track(EVT.feed_tab_changed, { tab: 'services' }); }}
            aria-pressed={activeType === 'services'}
            data-active={activeType === 'services' || undefined}
          >
            Jobs &amp; gigs
          </button>
        </div>
      </section>

      {/* ── Active rail filter ────────────────────────────────────────────
         Shown because a list that has been narrowed must say so. Arriving from
         "Free & up for grabs" into a page of nine items with no explanation
         reads as a broken catalogue, not as a filter — and there would be no
         way back to the rest of it. The chip is the label the rail promised,
         and tapping it returns the full list. */}
      {railFilter && (
        <section style={{ padding: '0 16px 12px' }}>
          <button
            type="button"
            onClick={() => { haptics.selection(); setRailFilter(null); }}
            aria-label={`Clear the ${RAIL_FILTERS[railFilter].label} filter`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              minHeight: 36, padding: '7px 12px 7px 14px',
              borderRadius: 999, border: 'none', cursor: 'pointer',
              background: 'var(--text-primary)', color: '#fff',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {RAIL_FILTERS[railFilter].label}
            <X size={14} strokeWidth={2.6} aria-hidden="true" />
          </button>
          <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </span>
        </section>
      )}

      {/* ── HIRING / OFFERING FACETS (Jobs & gigs tab only) ──
         The board holds two opposite things; this is where you narrow to one.
         It lives on the dedicated tab rather than the homepage precisely so the
         storefront doesn't sprout another row of chips. */}
      {activeType === 'services' && (
        <section style={{ padding: '0 16px 14px' }}>
          <div style={{ display: 'flex', gap: 7 }}>
            {([
              ['all', 'Everything'],
              ['hiring', 'Hiring'],
              ['offering', 'Offering'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`pill ${workFilter === id ? 'pill-active' : ''}`}
                aria-pressed={workFilter === id}
                onClick={() => setWorkFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── SAVED SEARCH / NOTIFY-ME (Requests tab only) ── */}
      {activeType === 'requests' && (
        <SavedSearchBar
          requests={requests}
          currentQuery={query}
          onRunSearch={setQuery}
        />
      )}

      {/* ── CATEGORY TILES ──
         E-commerce-style shortcut strip. Tapping a tile filters the whole
         page down to that category (which flips the storefront into a
         product grid); "All" brings the storefront back. */}
      <section style={{ padding: '2px 0 16px' }}>
        <div className="cat-strip">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              className="cat-tile"
              data-active={activeCategory === cat.id || undefined}
              onClick={() => { setActiveCategory(cat.id); track(EVT.category_filter_changed, { category: cat.id }); }}
            >
              <span className="cat-tile-ico" aria-hidden="true">
                <CategoryIcon id={cat.id} src={(cat as { iconSrc?: string }).iconSrc} emoji={cat.icon} size={56} />
              </span>
              <span className="cat-tile-label">{(cat as { short?: string }).short ?? cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {showStorefront ? (
        /* ══ STOREFRONT: themed rails ══ */
        <div className="storefront">
          {loading && engine.modules.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
              Setting up the storefront…
            </div>
          )}

          {/* ── The page, as decided by the orchestrator ──
              Every row below used to be written out here in a fixed order, so
              every visitor got the same one forever and changing it meant
              editing this file. The sequence now comes from lib/feed/modules.ts:
              zones hold the information hierarchy steady while order inside
              them responds to what this person is actually doing.

              The CTA is injected after the third row rather than being a module
              of its own — it is an interruption by design, and its job is to
              break the longest run of identical rails wherever that run
              happens to fall today. */}
          {engine.modules.map((m, idx) => (
            <Fragment key={`mod-${m.spec.id}`}>
              {renderModule(m)}
              {idx === 2 && (
                <StorefrontCTA onPostJob={() => {
                  track(EVT.marketing_banner_tapped, { slide: 'post_job_cta' });
                  (onPostService ?? onPost)();
                }} />
              )}
            </Fragment>
          ))}

          {!loading && engine.modules.length === 0 && (
            <EmptyState
              prompt="Looks like the feed's just sprouting. Be the first to share something!"
              sub="Post a free find, a borrow request, or an event — your community's waiting."
              cta={{ label: 'Post the first thing', onClick: onPost }}
            />
          )}
        </div>
      ) : (
        /* ══ PRODUCT GRID: category / search / focused tab ══ */
        <section className="pgrid-shell">
          <div className="pgrid">
            {activeType === 'all'
              ? allEntries.map(entry => renderEntry(entry))
              : filtered.map(item => renderProduct(
                  item,
                  `feed_${activeType}`,
                  activeType === 'requests' ? 'request' : activeType === 'services' ? 'opportunity' : undefined,
                  item.id,
                ))}
          </div>

          {(() => {
            const isAll = activeType === 'all';
            const visibleCount = isAll ? allEntries.length : filtered.length;
            const poolCount    = isAll
              ? items.length + opportunities.length + requests.length + events.length + lostFound.length
              : source.length;

            if (loading && visibleCount === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
                  Loading the feed…
                </div>
              );
            }
            if (visibleCount > 0) return null;

            if (poolCount === 0) {
              if (activeType === 'requests') {
                return (
                  <EmptyState
                    icon="🙋"
                    prompt="No open requests yet. Need something? Ask away!"
                    sub="Posting a request is usually faster (and cheaper) than buying new."
                    cta={{ label: 'Post a request', onClick: onPost }}
                  />
                );
              }
              if (activeType === 'services') {
                return (
                  <EmptyState
                    icon="🤝"
                    prompt="Nothing on the board yet."
                    sub="Hire someone for a job, or put your own skill up. Paid, unpaid or volunteer."
                    cta={{ label: 'Post a job or a skill', onClick: onPost }}
                  />
                );
              }
              return (
                <EmptyState
                  prompt="Looks like the feed's just sprouting. Be the first to share something!"
                  sub="Post a free find, a borrow request, or an event — your community's waiting."
                  cta={{ label: 'Post the first thing', onClick: onPost }}
                />
              );
            }

            /* Filter / search returned no rows — softer "no match" copy. */
            return (
              <EmptyState
                icon="🔍"
                prompt="No matches for that search."
                sub="Try a different keyword or tap “All” to clear the category."
                compact
              />
            );
          })()}
        </section>
      )}

      {/* The long-press sheet. Mounted once at the screen root rather than per
          card: one sheet can only ever be open, and a card that scrolls out of
          view cannot take its own menu with it. */}
      {menuItem && (
        <CardMenu
          title={menuItem.title}
          sellerName={menuItem.user?.name}
          onClose={() => setMenuItem(null)}
          onNotInterested={() => {
            engine.noteNotInterested({
              itemId: menuItem.id,
              sellerId: menuItem.user?.id,
              categoryId: menuItem.categoryId ?? normalizeCategory(menuItem.category),
              scope: 'item',
            });
            haptics.selection();
            track(EVT.feed_tab_changed, { tab: 'not_interested', post_id: menuItem.id });
          }}
          onHideSeller={menuItem.user?.id ? () => {
            engine.noteNotInterested({
              itemId: menuItem.id,
              sellerId: menuItem.user?.id,
              categoryId: null,
              scope: 'seller',
            });
            haptics.selection();
          } : undefined}
          onShare={() => {
            track(EVT.share_clicked, { post_id: menuItem.id, source: 'card_menu' });
            void shareLink({ title: menuItem.title, url: shareUrl(menuItem.id) });
          }}
        />
      )}
    </div>
  );
}

/* ── Layout: a themed horizontal rail ───────────────────
   `variant` only changes the card size/aspect (via CSS custom properties on
   the rail), so neighbouring rails read as different shelves of one shop
   rather than the same template nine times over:
     'featured' — hero row, biggest cards
     'wide'     — landscape frame for poster/banner art
     undefined  — the standard portrait product card */
function Rail({
  title, sub, onSeeAll, variant, children,
}: {
  title: string;
  sub: string;
  onSeeAll?: () => void;
  /** Card format, chosen by the module. 'standard' is the default and needs no
   *  class of its own. */
  variant?: CardVariant;
  children: React.ReactNode;
}) {
  return (
    <section className={`rail${variant && variant !== 'standard' ? ` rail--${variant}` : ''}`}>
      <div className="rail-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="rail-title">{title}</h2>
          <p className="rail-sub">{sub}</p>
        </div>
        {onSeeAll && (
          <button type="button" className="rail-seeall" onClick={onSeeAll}>
            See all <ChevronRight size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <div className="rail-track">{children}</div>
    </section>
  );
}

/* ── Mid-storefront CTA ────────────────────────────────
   A promo strip, the way a shop interrupts its category rows. Not a card and
   not a bordered box — one soft tint, one floating pill — so it reads as a
   different kind of thing from everything around it. */
function StorefrontCTA({ onPostJob }: { onPostJob: () => void }) {
  return (
    <section className="sf-cta">
      <span className="sf-cta-emoji" aria-hidden="true">🤝</span>
      <div className="sf-cta-copy">
        {/* One positioning, stated symmetrically, because the board holds both
            directions and the composer's first question is which one you are.
            The previous copy picked a side ("Got a skill? Put it up") and then
            contradicted itself with a "Post a job" button. Examples are
            deliberately not the four safe ones — tattoos and crochet say
            "anything you can actually do" in a way tutoring and design don't. */}
        <h2 className="sf-cta-title">Hire someone, or get hired</h2>
        <p className="sf-cta-sub">
          Tattoos, crochet, gym training, tutoring. Paid, unpaid or volunteer.
        </p>
      </div>
      <button type="button" className="sf-cta-btn" onClick={onPostJob}>
        Post a job or a skill
      </button>
    </section>
  );
}

/* ── The Lost marquee: a slow, seamless auto-scroll loop ──
   Lost items drift past on their own so nobody has to actively hunt for
   what they lost. Two identical copies of the list sit side by side; the
   track translates left by exactly one copy's width and repeats, so the
   seam is invisible. Speed is held constant (px/sec) regardless of how
   many items there are, and pauses on hover/focus. `prefers-reduced-motion`
   turns it into an ordinary scroll strip. */
function LostMarquee({ items, onOpen }: { items: LostItem[]; onOpen: (lf: LostItem) => void }) {
  const firstRef = useRef<HTMLDivElement | null>(null);
  const secondRef = useRef<HTMLDivElement | null>(null);
  const [vars, setVars] = useState<React.CSSProperties>({});

  /* Repeat the base list until a single copy is wide enough to fill a phone,
     so short lists (1–2 lost items) still loop without a visible gap. */
  const reps = Math.max(1, Math.ceil(8 / Math.max(1, items.length)));
  const loop = Array.from({ length: reps }).flatMap((_, r) =>
    items.map((lf, i) => ({ lf, key: `${r}-${i}-${lf.id}` })),
  );

  useEffect(() => {
    const measure = () => {
      const a = firstRef.current, b = secondRef.current;
      if (!a || !b) return;
      /* offsetLeft is layout-space (unaffected by the running transform), so
         the gap between the two copies IS one copy's width — exactly the
         distance to translate for a seamless loop. */
      const dist = b.offsetLeft - a.offsetLeft;
      if (dist <= 0) return;
      const SPEED = 26; /* px per second — slow and ambient */
      setVars({
        ['--loop']: `-${dist}px`,
        ['--dur']: `${Math.max(24, Math.round(dist / SPEED))}s`,
      } as React.CSSProperties);
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && firstRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(firstRef.current);
    }
    return () => ro?.disconnect();
  }, [loop.length]);

  return (
    <div className="lost-marquee">
      <div className="lost-marquee-track" style={vars}>
        <div className="lost-marquee-copy" ref={firstRef}>
          {loop.map(({ lf, key }) => (
            <div className="lost-marquee-item" key={`a-${key}`}>
              <LostFoundCard lf={lf} onClick={() => onOpen(lf)} />
            </div>
          ))}
        </div>
        <div className="lost-marquee-copy" ref={secondRef} aria-hidden="true">
          {loop.map(({ lf, key }) => (
            <div className="lost-marquee-item" key={`b-${key}`}>
              <LostFoundCard lf={lf} onClick={() => onOpen(lf)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Product card — the one uniform card, used in every rail and the grid ──
   Image on top, then title, price, and location beneath on a solid card:
   the e-commerce shape, not the Pinterest photo-with-overlay. Handles
   items, requests and service opportunities (the price line + badge adapt). */
function ProductCard({
  item, isSaved, onToggleSave, onClick, onLongPress, hidePrice, badgeKind,
}: {
  item: MarketplaceItem;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
  /** Opens the contextual sheet. Optional: cards outside the feed (search
   *  results, a storefront) have no ranker to teach. */
  onLongPress?: () => void;
  hidePrice: boolean;
  /** Small corner badge, shown when the card sits in a mixed context (the
   *  grid, or a rail whose theme isn't already the answer). */
  badgeKind?: 'request' | 'opportunity' | 'free';
}) {
  const cover = coverImage(item);
  const isPriced = item.listingType === 'sell' && typeof item.price === 'number';
  const isOpportunity = item.kind === 'opportunity';

  /* Routed through the shared chip so rent finally reads as a RATE. The last
     branch here used to be `listingType[0].toUpperCase() + slice(1)`, which
     turned a ₹200-per-day rental into the word "Borrow" — the price, the period
     and the fact that it comes back were all in the database and none of them
     reached the card. */
  const deal = fromListingType(item.listingType);
  const priceLabel = item.isRequest
    ? (item.urgent ? 'Urgent' : 'Wanted')
    : isOpportunity
      ? (hidePrice && item.comp === 'paid' ? 'Paid' : opportunityCompLabel(item))
    /* The "hide prices on feed" preference suppresses the NUMBER, not the kind
       of deal — someone who hides prices still needs to know a thing is for
       rent rather than for sale. */
    : hidePrice && (deal === 'sell' || deal === 'rent') ? DEAL_BY_ID[deal].badge
    : priceChip({ deal, price: item.price, ratePeriod: item.ratePeriod });

  const priceTone = item.isRequest ? 'wanted'
    : (!isOpportunity && deal === 'free') ? 'free'
    : undefined;

  /* An opportunity's badge comes from its DIRECTION, not its compensation.
     "Marketing Specialist Needed" is a job ad; badging it "Service" (which is
     what happened when comp was the only signal) told the reader the opposite
     of the truth. Volunteer still wins as a label when nobody's being paid,
     since that's the more useful thing to know at a glance. */
  const badgeLabel = badgeKind === 'request' ? 'Wanted'
    : badgeKind === 'opportunity'
      ? (item.comp === 'volunteer' ? 'Volunteer' : oppRoleBadge(item.oppRole))
    : badgeKind === 'free' ? 'Free'
    : null;
  /* Hiring posts get their own badge colour so the two directions are
     separable at a glance inside one shared rail. */
  const badgeTone = badgeKind === 'opportunity' && item.oppRole === 'hiring'
    ? 'hiring' : badgeKind;

  const closedLabel = item.isClosed ? closedLabelFor(item) : null;
  const cut = cover.url ? isCutoutUrl(cover.url) : false;

  /* Not onClick. A click fires whenever a press and a release land on this
     button, including at the end of a drag and when a finger stops a coasting
     page — which is how scrolling the feed came to open listings. See
     lib/useTap.ts; the press state drives the visual feedback too, so a card
     no longer lights up while it is merely being scrolled past. */
  const press = useLongPress(() => onLongPress?.(), !!onLongPress);
  /* A press that has already opened the sheet must not also navigate on
     release — otherwise the menu appears and the detail page opens behind it. */
  const tap = useTap(() => { if (press.consumed()) { press.reset(); return; } onClick(); });

  return (
    <article className="pcard" data-closed={item.isClosed || undefined} data-pressed={tap.pressed || undefined}>
      <button
        type="button"
        className="pcard-open"
        aria-label={`Open ${item.title}`}
        onPointerDown={e => { tap.onPointerDown(e); press.handlers.onPointerDown?.(e); }}
        onPointerMove={e => { tap.onPointerMove(e); press.handlers.onPointerMove?.(e); }}
        onPointerUp={e => { tap.onPointerUp(e); press.handlers.onPointerUp?.(); }}
        onPointerCancel={() => { tap.onPointerCancel(); press.handlers.onPointerCancel?.(); }}
        onContextMenu={press.handlers.onContextMenu}
        onClick={tap.onClick}
      >
        <span className="pcard-media" style={transitionStyle(item.id)}>
          {cover.url
            ? <FitImage src={cover.url} cutout={cut} />
            : <NoPhoto tint={tintFor(item.photoColor)} />}
        </span>
        <span className="pcard-body">
          <span className="pcard-title">{item.title}</span>
          <span className="pcard-price" data-tone={priceTone}>{priceLabel}</span>
          {!item.isRequest && item.location && (
            <span className="pcard-meta">
              <MapPin size={11} strokeWidth={2} />
              <span className="pcard-meta-text">{item.location}</span>
            </span>
          )}
        </span>
      </button>

      {badgeLabel && <span className="pcard-badge" data-kind={badgeTone}>{badgeLabel}</span>}

      <button
        type="button"
        className="pcard-save"
        data-saved={isSaved || undefined}
        aria-label={isSaved ? 'Unsave' : 'Save'}
        aria-pressed={isSaved}
        onClick={e => { e.stopPropagation(); onToggleSave(); }}
      >
        <Heart size={17} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
      </button>

      {closedLabel && <span className="pcard-closed"><span>{closedLabel}</span></span>}
    </article>
  );
}

/* ── Lost & Found card ─────────────────────────────────
   Same shell as ProductCard, with a status badge (rose = lost, green =
   found) and last-seen / time meta instead of a price. */
function LostFoundCard({ lf, onClick }: { lf: LostItem; onClick: () => void }) {
  const photo = resolveLostFoundPhoto(lf.id, lf.photoUrls);
  const isLost = lf.status === 'lost';
  const cut = isCutoutUrl(photo);
  return (
    <article className="pcard">
      <button type="button" className="pcard-open" onClick={onClick} aria-label={`Open ${lf.title}`}>
        <span className="pcard-media">
          {photo ? <FitImage src={photo} cutout={cut} /> : <NoPhoto tint={tintFor(lf.photoColor)} />}
        </span>
        <span className="pcard-body">
          <span className="pcard-title">{lf.title}</span>
          {/* Where and when on ONE line — a second meta row would grow the
              caption at the photo's expense. */}
          <span className="pcard-meta">
            <MapPin size={10} strokeWidth={2} />
            <span className="pcard-meta-text">{lf.lastSeen}</span>
            <span aria-hidden="true">·</span>
            <span style={{ flexShrink: 0 }}>{lf.timeAgo}</span>
          </span>
        </span>
      </button>
      <span className="pcard-badge" data-kind={isLost ? 'lost' : 'found'}>{lf.status}</span>
    </article>
  );
}

/* ── Event card ────────────────────────────────────────
   Same shell, purple Event badge, date as the "price" line, and a small
   RSVP / views meta row. */
function EventCard({ event, onClick }: { event: CommunityEvent; onClick: () => void }) {
  const photo = resolveEventPhoto(event);
  /* Live events show REAL counts only — the hash-fake fallback is for demo
     fixtures, never for a live event that simply has zero views yet. */
  const demo = isDemoMode();
  const metrics = demo ? getEventMetrics(event.id) : null;
  const rsvps = demo ? (event.attendees || metrics!.rsvps) : event.attendees;
  const views = demo ? (event.viewCount ?? metrics!.views) : (event.viewCount ?? 0);
  const cut = isCutoutUrl(photo);
  return (
    <article className="pcard">
      <button type="button" className="pcard-open" onClick={onClick} aria-label={`Open event ${event.title}`}>
        <span className="pcard-media">
          {photo ? <FitImage src={photo} cutout={cut} /> : <NoPhoto />}
        </span>
        <span className="pcard-body">
          <span className="pcard-title">{event.title}</span>
          <span className="pcard-price pcard-price--soft">{event.date.split(' ').slice(0, 3).join(' ')}</span>
          <span className="pcard-meta">
            <UsersIcon size={10} strokeWidth={2} /> {rsvps}
            <Eye size={10} strokeWidth={2} style={{ marginLeft: 8 }} /> {views}
          </span>
        </span>
      </button>
      <span className="pcard-badge" data-kind="event">
        <CalendarDays size={9} strokeWidth={2.4} style={{ marginRight: 3, verticalAlign: '-1px' }} />Event
      </span>
      {event.hasForm && <span className="pcard-badge pcard-badge--second" data-kind="opportunity">Register</span>}
    </article>
  );
}

/* ── Media + colour helpers ───────────────────────────── */

/** First usable cover image for a listing (uploaded media → hardcoded demo
 *  set), or nothing so the card falls back to its emoji-on-tint placeholder. */
function coverImage(item: MarketplaceItem): { url?: string } {
  const media = resolveItemMedia(item);
  return { url: coverUrl(media[0]) };
}

/** A hex photoColor becomes a soft tint for the placeholder tile; a named
 *  colour or nothing falls back to the inset surface. */
function tintFor(color?: string): string {
  if (!color) return 'var(--bg-inset)';
  return color.startsWith('#') ? `${color}22` : color;
}

/** A bg-removed photo is stored as a transparent .png — those get a white
 *  fill + contain fit so the cut-out doesn't sit on a dark void. */
const isCutoutUrl = (u: unknown): boolean => typeof u === 'string' && /\.png(\?|$)/i.test(u);
const coverUrl = (p: unknown): string | undefined =>
  typeof p === 'string' ? p : ((p as { poster?: string; src?: string } | null)?.poster ?? (p as { src?: string } | null)?.src);
