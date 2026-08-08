'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Search, MapPin, Heart, X, CalendarDays, Users as UsersIcon, Eye, ChevronRight } from 'lucide-react';
import { Wordmark } from './Brand';
import {
  MARKETPLACE_ITEMS, OPPORTUNITIES, EVENTS, LOST_FOUND_ITEMS, CATEGORIES, closedLabelFor,
  type MarketplaceItem, type CommunityEvent, type LostItem,
} from '../lib/mockData';
import { resolveItemMedia, getAvatar, getEventPhoto, getLostFoundPhoto } from '../lib/photos';
import { opportunityCompLabel } from '../lib/opportunity';
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
}

export default function FeedScreen({
  onPost, onOpenMenu, onOpenAccount, onOpenItem, onOpenEvent, onOpenLF,
  onBannerAction, onOpenUser, onRequireAuth,
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
  const [query, setQuery] = useState('');
  /* Saved-listing IDs for the heart icon's filled state. Hydrated from
     Supabase on mount + after every post-change event (a delete drops
     stale saves from the server side, this resync keeps the heart in
     step). */
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

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
    if (wasSaved) haptics.selection(); else haptics.success();
    track(EVT.save_toggled, { post_id: listingId, saved: !wasSaved });
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
    : activeType === 'services' ? opportunities
    : items;
  const source = pool.filter(item => !blocked.has(item.user.id));
  const filtered = source.filter(item => {
    if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
    if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

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

  /* ── Storefront rails (the "All" home view) ─────────────────────────
     Segregate the mixed feed into themed, horizontally-scrolling rows —
     an e-commerce storefront rather than a Pinterest wall. Each rail is
     computed from the already-loaded pools, filtered for blocks + closed
     posts, and only rendered when it has enough to fill a row. */
  const liveItems    = items.filter(it => !blocked.has(it.user.id) && !it.isClosed);
  const freshItems   = useMemo(
    () => [...liveItems].sort((a, b) => a.postedDaysAgo - b.postedDaysAgo).slice(0, 12),
    [liveItems],
  );
  const freeItems    = liveItems.filter(it => it.listingType === 'free').slice(0, 12);
  const openRequests = requests.filter(it => !blocked.has(it.user.id) && !it.isClosed).slice(0, 12);
  const services     = opportunities.filter(it => !blocked.has(it.user.id) && !it.isClosed).slice(0, 12);
  const upcoming     = events.filter(ev => !blocked.has(ev.organizer.id)).slice(0, 12);
  const lostItems    = lostFound.filter(lf => !blocked.has(lf.user.id) && lf.status === 'lost');
  const foundItems   = lostFound.filter(lf => !blocked.has(lf.user.id) && lf.status === 'found').slice(0, 12);
  const itemsByCat   = (cat: string) => liveItems.filter(it => (it.category || '').toLowerCase() === cat).slice(0, 12);

  /* Category rails, each with its own bit of copy. Only the ones with a
     couple of items to show survive — a rail of one looks broken. */
  const CATEGORY_RAILS = [
    { id: 'furniture',   title: 'Dorm glow-up',       sub: 'Desks, chairs, the whole set-up' },
    { id: 'electronics', title: 'Gently-used gadgets', sub: 'Half the price, all the specs' },
    { id: 'books',       title: 'Passed-down reads',   sub: 'Someone survived this syllabus' },
    { id: 'sports',      title: 'Game on',             sub: 'Gear after a second player' },
    { id: 'kitchen',     title: 'Midnight-Maggi kit',  sub: 'Kettles, pans, mugs and more' },
    { id: 'tools',       title: 'Borrow the toolbox',  sub: 'Fix it without buying it' },
  ] as const;
  const categoryRails = CATEGORY_RAILS
    .map(r => ({ ...r, list: itemsByCat(r.id) }))
    .filter(r => r.list.length >= 2);

  /* Storefront when nothing is narrowing the view; a product grid the
     moment a category, a type tab, or a search takes over. */
  const showStorefront = activeType === 'all' && activeCategory === 'all' && !query.trim();
  const railCount =
    (lostItems.length ? 1 : 0) + (foundItems.length ? 1 : 0) +
    (freshItems.length >= 3 ? 1 : 0) + (freeItems.length >= 2 ? 1 : 0) +
    categoryRails.length + (openRequests.length ? 1 : 0) +
    (services.length ? 1 : 0) + (upcoming.length ? 1 : 0);

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
      onClick={() => { trackPostOpened('item', it.id, { source, is_request: !!it.isRequest }); onOpenItem(it); }}
    />
  );

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
      image: '/banners/share.png',
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
      image: '/banners/request.jpg',
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
      image: '/banners/events.jpg',
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
      image: '/banners/lost-found.jpg',
      illustration: 'twemoji:magnifying-glass-tilted-left',
      title: 'Lost something?',
      subtitle: 'Or help return what you found',
      detail: 'A second board, side-by-side with the marketplace. Verified by the community.',
      gradient:
        'linear-gradient(135deg, rgba(234,179,8,0.92) 0%, rgba(217,119,6,0.88) 100%)',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'lost-found' }); onBannerAction?.('lost-found'); },
    },
    {
      id: 'mahe',
      image: '/banners/mahe.jpg',
      illustration: 'twemoji:graduation-cap',
      title: 'For MAHE, by MAHE',
      subtitle: 'Built for our campus',
      detail: 'Invite a friend — the more of us here, the more there is to share.',
      gradient:
        'linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(168,85,247,0.9) 55%, rgba(34,197,94,0.9) 100%)',
      ariaLabel: 'For MAHE, by MAHE — invite a friend to Wecycle',
      onClick: () => { track(EVT.marketing_banner_tapped, { slide: 'mahe' }); onBannerAction?.('invite'); },
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
              width: 34, height: 34, borderRadius: '50%',
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
              Hi, {mounted ? greetingName : 'there'} <span aria-hidden="true">👋</span>
            </h1>
            <p style={{
              margin: '4px 0 0',
              fontSize: 13, color: 'var(--text-muted)',
            }} suppressHydrationWarning>
              {mounted && new Date().toLocaleDateString('en-US', {
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
            onClick={() => { setActiveType('all'); track(EVT.feed_tab_changed, { tab: 'all' }); }}
            aria-pressed={activeType === 'all'}
            data-active={activeType === 'all' || undefined}
          >
            All
          </button>
          <button
            onClick={() => { setActiveType('requests'); track(EVT.feed_tab_changed, { tab: 'requests' }); }}
            aria-pressed={activeType === 'requests'}
            data-active={activeType === 'requests' || undefined}
          >
            Requests
          </button>
          <button
            onClick={() => { setActiveType('shared'); track(EVT.feed_tab_changed, { tab: 'shared' }); }}
            aria-pressed={activeType === 'shared'}
            data-active={activeType === 'shared' || undefined}
          >
            Shared
          </button>
          <button
            onClick={() => { setActiveType('services'); track(EVT.feed_tab_changed, { tab: 'services' }); }}
            aria-pressed={activeType === 'services'}
            data-active={activeType === 'services' || undefined}
          >
            Services &amp; Opportunities
          </button>
        </div>
      </section>

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
              <span className="cat-tile-ico" aria-hidden="true">{cat.icon}</span>
              <span className="cat-tile-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {showStorefront ? (
        /* ══ STOREFRONT: themed rails ══ */
        <div className="storefront">
          {loading && railCount === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
              Setting up the storefront…
            </div>
          )}

          {/* LOST — slow auto-scrolling loop so it takes zero effort to spot yours */}
          {lostItems.length > 0 && (
            <section className="rail">
              <div className="rail-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="rail-title">Lost on campus 👀</h2>
                  <p className="rail-sub">No effort needed — just glance as it drifts by</p>
                </div>
                <button type="button" className="rail-seeall" onClick={() => onBannerAction?.('lost-found')}>
                  All lost <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>
              <LostMarquee
                items={lostItems}
                onOpen={lf => { trackPostOpened('lostfound', lf.id, { source: 'feed_lost_marquee', lf_status: lf.status }); onOpenLF?.(lf); }}
              />
            </section>
          )}

          {/* FOUND — its own row */}
          {foundItems.length > 0 && (
            <Rail title="Found & waiting 🙌" sub="Someone’s looking for these — is one yours?" onSeeAll={() => onBannerAction?.('lost-found')}>
              {foundItems.map(lf => (
                <div className="rail-item" key={lf.id}>
                  <LostFoundCard lf={lf} onClick={() => { trackPostOpened('lostfound', lf.id, { source: 'feed_found_rail', lf_status: lf.status }); onOpenLF?.(lf); }} />
                </div>
              ))}
            </Rail>
          )}

          {/* JUST DROPPED — newest shared items */}
          {freshItems.length >= 3 && (
            <Rail title="Just dropped ✨" sub="Fresh off your batch, before anyone else" onSeeAll={() => setActiveType('shared')}>
              {freshItems.map(it => <div className="rail-item" key={it.id}>{renderProduct(it, 'feed_fresh')}</div>)}
            </Rail>
          )}

          {/* FREE */}
          {freeItems.length >= 2 && (
            <Rail title="Free & up for grabs 🎁" sub="₹0. Yes, really." onSeeAll={() => setActiveType('shared')}>
              {freeItems.map(it => <div className="rail-item" key={it.id}>{renderProduct(it, 'feed_free', 'free')}</div>)}
            </Rail>
          )}

          {/* CATEGORY RAILS */}
          {categoryRails.map(r => (
            <Rail key={r.id} title={r.title} sub={r.sub} onSeeAll={() => { setActiveCategory(r.id); track(EVT.category_filter_changed, { category: r.id }); }}>
              {r.list.map(it => <div className="rail-item" key={it.id}>{renderProduct(it, `feed_cat_${r.id}`)}</div>)}
            </Rail>
          ))}

          {/* WANTED (requests) */}
          {openRequests.length > 0 && (
            <Rail title="Wanted on campus 🙋" sub="Got one gathering dust? Make someone’s week." onSeeAll={() => setActiveType('requests')}>
              {openRequests.map(it => <div className="rail-item" key={it.id}>{renderProduct(it, 'feed_requests', 'request')}</div>)}
            </Rail>
          )}

          {/* SERVICES */}
          {services.length > 0 && (
            <Rail title="Skills for hire 🛠️" sub="Tutors, fixers, photographers — your people" onSeeAll={() => setActiveType('services')}>
              {services.map(it => <div className="rail-item" key={it.id}>{renderProduct(it, 'feed_services', 'opportunity')}</div>)}
            </Rail>
          )}

          {/* EVENTS */}
          {upcoming.length > 0 && (
            <Rail title="Happening soon 📅" sub="RSVP in a tap" onSeeAll={() => onBannerAction?.('events')}>
              {upcoming.map(ev => (
                <div className="rail-item" key={ev.id}>
                  <EventCard event={ev} onClick={() => { trackPostOpened('event', ev.id, { source: 'feed_events_rail' }); onOpenEvent?.(ev); }} />
                </div>
              ))}
            </Rail>
          )}

          {!loading && railCount === 0 && (
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
                    icon="🛠️"
                    prompt="Nothing here yet. Got a skill or some time to give?"
                    sub="Tutoring, repairs, photography, or rallying volunteers — paid or free, offer it to your community."
                    cta={{ label: 'Offer a service', onClick: onPost }}
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
    </div>
  );
}

/* ── Layout: a themed horizontal rail ─────────────────── */
function Rail({
  title, sub, onSeeAll, children,
}: { title: string; sub: string; onSeeAll?: () => void; children: React.ReactNode }) {
  return (
    <section className="rail">
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
  item, isSaved, onToggleSave, onClick, hidePrice, badgeKind,
}: {
  item: MarketplaceItem;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
  hidePrice: boolean;
  /** Small corner badge, shown when the card sits in a mixed context (the
   *  grid, or a rail whose theme isn't already the answer). */
  badgeKind?: 'request' | 'opportunity' | 'free';
}) {
  const cover = coverImage(item);
  const isPriced = item.listingType === 'sell' && typeof item.price === 'number';
  const isOpportunity = item.kind === 'opportunity';

  const priceLabel = item.isRequest
    ? (item.urgent ? 'Urgent' : 'Wanted')
    : isOpportunity
      ? (hidePrice && item.comp === 'paid' ? 'Paid' : opportunityCompLabel(item))
    : isPriced && hidePrice                        ? 'Sell'
    : isPriced                                      ? `₹${item.price!.toLocaleString('en-IN')}`
    : item.listingType === 'sell'                   ? 'Selling'
    : item.listingType === 'free'                   ? 'Free'
    : item.listingType[0].toUpperCase() + item.listingType.slice(1);

  const priceTone = item.isRequest ? 'wanted'
    : (!isOpportunity && item.listingType === 'free') ? 'free'
    : undefined;

  const badgeLabel = badgeKind === 'request' ? 'Wanted'
    : badgeKind === 'opportunity' ? (item.comp === 'volunteer' ? 'Volunteer' : 'Service')
    : badgeKind === 'free' ? 'Free'
    : null;

  const closedLabel = item.isClosed ? closedLabelFor(item) : null;
  const cut = cover.url ? isCutoutUrl(cover.url) : false;

  return (
    <article className="pcard" data-closed={item.isClosed || undefined}>
      <button type="button" className="pcard-open" onClick={onClick} aria-label={`Open ${item.title}`}>
        <span className="pcard-media">
          {cover.url
            ? <img src={cover.url} alt="" loading="lazy" style={cut ? { background: '#fff', objectFit: 'contain' } : undefined} />
            : <span className="pcard-ph" style={{ background: tintFor(item.photoColor) }} aria-hidden="true">{item.photoIcon || '📦'}</span>}
        </span>
        <span className="pcard-body">
          <span className="pcard-title">{item.title}</span>
          <span className="pcard-price" data-tone={priceTone}>{priceLabel}</span>
          {!item.isRequest && item.location && (
            <span className="pcard-meta">
              <MapPin size={10} strokeWidth={2} />
              <span className="pcard-meta-text">{item.location}</span>
            </span>
          )}
        </span>
      </button>

      {badgeLabel && <span className="pcard-badge" data-kind={badgeKind}>{badgeLabel}</span>}

      <button
        type="button"
        className="pcard-save"
        data-saved={isSaved || undefined}
        aria-label={isSaved ? 'Unsave' : 'Save'}
        aria-pressed={isSaved}
        onClick={e => { e.stopPropagation(); onToggleSave(); }}
      >
        <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
      </button>

      {closedLabel && <span className="pcard-closed"><span>{closedLabel}</span></span>}
    </article>
  );
}

/* ── Lost & Found card ─────────────────────────────────
   Same shell as ProductCard, with a status badge (rose = lost, green =
   found) and last-seen / time meta instead of a price. */
function LostFoundCard({ lf, onClick }: { lf: LostItem; onClick: () => void }) {
  const photo = getLostFoundPhoto(lf.id, lf.photoIcon, lf.photoUrls);
  const isLost = lf.status === 'lost';
  const cut = isCutoutUrl(photo);
  return (
    <article className="pcard">
      <button type="button" className="pcard-open" onClick={onClick} aria-label={`Open ${lf.title}`}>
        <span className="pcard-media">
          <img src={photo} alt="" loading="lazy" style={cut ? { background: '#fff', objectFit: 'contain' } : undefined} />
        </span>
        <span className="pcard-body">
          <span className="pcard-title">{lf.title}</span>
          <span className="pcard-meta">
            <MapPin size={10} strokeWidth={2} />
            <span className="pcard-meta-text">{lf.lastSeen}</span>
          </span>
          <span className="pcard-meta pcard-meta--dim">{lf.timeAgo}</span>
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
  const uploaded = (event as { photoUrls?: string[] }).photoUrls;
  const photo = uploaded && uploaded.length > 0 ? uploaded[0] : getEventPhoto(event.id, event.eventType);
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
          <img src={photo} alt="" loading="lazy" style={cut ? { background: '#fff', objectFit: 'contain' } : undefined} />
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
