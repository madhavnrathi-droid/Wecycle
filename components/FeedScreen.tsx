'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, Search, MapPin, Heart, X, CalendarDays, Users as UsersIcon, Eye } from 'lucide-react';
import { Wordmark } from './Brand';
import {
  MARKETPLACE_ITEMS, EVENTS, LOST_FOUND_ITEMS, CATEGORIES, closedLabelFor,
  type MarketplaceItem, type CommunityEvent, type LostItem,
} from '../lib/mockData';
import { resolveItemMedia, getAvatar, getEventPhoto, getLostFoundPhoto } from '../lib/photos';
import SavedSearchBar from './SavedSearchBar';
import { useAuth } from '../lib/AuthContext';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import {
  fetchMarketplaceItems, fetchRequests, fetchEvents, fetchLostFound,
  fetchSavedListingIds, toggleListingSave,
  onPostsChanged, searchUsers, type UserSearchHit,
} from '../lib/liveData';
import { getEventMetrics } from '../lib/metrics';
import { getSettings, onSettingsChange } from '../lib/settings';
import { getBlockedUserIds, onBlocksChange } from '../lib/moderation';
import { track, trackPostOpened, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import PhotoCarousel from './PhotoCarousel';
import EmptyState from './EmptyState';
import MarketingBanner, { type BannerSlide } from './MarketingBanner';
import UserSearchResults from './UserSearchResults';
import LiveCounter from './LiveCounter';

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
}

export default function FeedScreen({
  onPost, onOpenMenu, onOpenAccount, onOpenItem, onOpenEvent, onOpenLF,
  onBannerAction, onOpenUser,
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
  /* Default tab = "All" — a chronological mix of every Wecycle activity
     (shared items, requests, events, lost-found). FeedScreen unmounts when
     the user navigates to another bottom-nav screen, so the next visit
     reseeds this default — that's the "every new session starts on All"
     behaviour. */
  const [activeType, setActiveType] = useState<'all' | 'requests' | 'shared'>('all');
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
      setRequests([]);
      setEvents(EVENTS);
      setLostFound(LOST_FOUND_ITEMS);
      setLoading(false);
      return;
    }
    if (!hasSupabaseEnv) {
      setItems([]);
      setRequests([]);
      setEvents([]);
      setLostFound([]);
      setLoading(false);
      return;
    }

    const load = () => {
      setLoading(true);
      Promise.all([
        fetchMarketplaceItems({ limit: 60 }),
        fetchRequests({ limit: 60 }),
        fetchEvents(),
        fetchLostFound(),
      ])
        .then(([listingRows, requestRows, eventRows, lfRows]) => {
          if (cancelled) return;
          setItems(listingRows);
          setRequests(requestRows);
          setEvents(eventRows);
          setLostFound(lfRows);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    load();
    /* Refetch the instant someone posts (same tab) */
    const off = onPostsChanged(load);
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

  /* Single toggle handler shared by every FeedCard. Optimistically flips
     the local set, fires the Supabase RPC, and reverts on failure. Demo
     mode skips the RPC and just keeps the local heart state. */
  const handleToggleSave = (listingId: string) => {
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

  /* The active tab decides which pool we render:
       - 'all'      → mixed feed of items + requests + events + L&F by recency
       - 'requests' → open requests only
       - 'shared'   → marketplace listings only (the "Shared" tab) */
  const source = (activeType === 'requests' ? requests : items).filter(item => !blocked.has(item.user.id));
  const filtered = source.filter(item => {
    if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
    if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  /* ── "All" tab entries ──────────────────────────────
     Mix every content type into a single masonry, ordered by recency. The
     discriminated union lets the renderer pick the right tile component
     per kind. Each entry carries a sortKey so we can interleave items
     chronologically; live rows have real timestamps, demo rows fall back
     to a positional sort. */
  type AllEntry =
    | { kind: 'item';    item: MarketplaceItem;    sortKey: number }
    | { kind: 'request'; item: MarketplaceItem;    sortKey: number }
    | { kind: 'event';   event: CommunityEvent;    sortKey: number }
    | { kind: 'lf';      lf: LostItem;             sortKey: number };

  const allEntries = useMemo<AllEntry[]>(() => {
    /* "Recent" sort key — older posts carry larger postedDaysAgo numbers,
       so smaller days-ago wins. For events we use the days-until-start so
       upcoming events feel "new". L&F uses position in the array since
       timeAgo is already a human string. */
    const itemEntries: AllEntry[] = items.filter(it => !blocked.has(it.user.id)).map((it, i) => ({
      kind: 'item' as const, item: it, sortKey: it.postedDaysAgo * 1000 + i,
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

    const merged = [...itemEntries, ...requestEntries, ...eventEntries, ...lfEntries];

    /* Filter by category + query — events / L&F skip the category filter
       since they don't carry one, but they still honour the title query. */
    const matchesQuery = (t: string) => !query || t.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = (cat?: string) =>
      activeCategory === 'all' || (cat ?? '').toLowerCase() === activeCategory;

    return merged
      .filter(e => {
        /* Items + requests carry categories — respect the active filter.
         * Events and L&F don't have a category field, so they're always
         * visible regardless of the chip the user picked. This avoids
         * the "lost football vanishes under the Sports filter" trap
         * the user flagged: an L&F post without a category shouldn't
         * disappear just because there's no category to match against. */
        if (e.kind === 'item')    return matchesCategory(e.item.category) && matchesQuery(e.item.title);
        if (e.kind === 'request') return matchesCategory(e.item.category) && matchesQuery(e.item.title);
        if (e.kind === 'event')   return matchesQuery(e.event.title);
        return                              matchesQuery(e.lf.title);
      })
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [items, requests, events, lostFound, activeCategory, query]);

  const greetingName = (profile?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0];

  /* Marketing banner slides — promote each Wecycle use case to first-time
     visitors. Hand-drawn / abstract aesthetic: each card uses a Wecycle
     accent gradient + a Twemoji illustration (loaded via Iconify CDN) that
     reads as loose, flat, hand-crafted artwork rather than a literal photo.
     The same `slides` array feeds both the compact (mobile) banner next to
     the greeting and the wide (desktop) banner below the search bar. */
  const bannerSlides: BannerSlide[] = [
    {
      id: 'share',
      image: '/banners/share.jpg',
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
            data-tour="topnav-account"
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
        {/* Greeting text + live-counter widget sit side-by-side at equal
            height. On very narrow screens (<380 px) they stack vertically via
            flex-wrap — the widget takes a full row of its own. */}
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
          {/* Left: greeting text block — centered vertically so it reads level
              with the counter widget beside it. */}
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

          {/* Right: Live Activities widget. On mobile, sits inline with the
              greeting (current home-feed look). On desktop, this slot is
              hidden — the counter is mounted alongside the marketing banner
              below so the greeting row stays clean (greeting + search only). */}
          {mounted && (
            <div className="mobile-only" style={{ display: 'flex', alignSelf: 'stretch', flex: 1, minWidth: 0 }}>
              <LiveCounter />
            </div>
          )}
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
            data-tour="feed-search"
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

      {/* ── MOBILE MARKETING BANNER ──
         Wide variant sized down for mobile. Sits BETWEEN the greeting and
         the search bar so it reads like a hero strip. Hidden on desktop —
         the desktop mount below the search row takes over there. */}
      <section className="marketing-banner-mount-mobile" style={{ padding: '0 16px 16px' }}>
        <MarketingBanner slides={bannerSlides} variant="wide" />
      </section>

      {/* ── DESKTOP MARKETING BANNER + LIVE COUNTER ──
         Side-by-side row on desktop. Smaller banner (so it doesn't dominate
         the feed) with the live counter widget filling the remaining width
         to its right. Mobile uses the separate banner mount above + the
         inline counter inside the greeting row. */}
      <section className="marketing-banner-mount-desktop" style={{ padding: '0 16px 20px' }}>
        <div className="feed-hero-row">
          <MarketingBanner slides={bannerSlides} variant="wide" />
          {mounted && <LiveCounter />}
        </div>
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

      {/* ── USER SEARCH RESULTS ──
         Appears above the tabs whenever the query yields one or more user
         matches. Clicking a card opens that user's storefront. */}
      <UserSearchResults
        results={userHits}
        query={query}
        loading={userSearchLoading}
        onPick={(hit) => { track(EVT.user_card_opened, { user_id: hit.id, source: 'feed_search' }); onOpenUser?.(hit.id); }}
      />

      {/* ── PILL TABS: all / requests / shared ── */}
      <section style={{ padding: '0 16px 14px' }} data-tour="feed-tabs">
        <div className="segmented">
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
        </div>
      </section>

      {/* ── SAVED SEARCH / NOTIFY-ME (Requests tab only) ──
         Lets a student say "ping me when a cycle is posted" and shows a live
         banner when open requests already match — the retention hook for a
         board that's empty more often than not early on. */}
      {activeType === 'requests' && (
        <SavedSearchBar
          requests={requests}
          currentQuery={query}
          onRunSearch={setQuery}
        />
      )}

      {/* ── CATEGORY CHIPS ── */}
      <section style={{ padding: '0 0 12px' }}>
        <div className="chip-row">
          {CATEGORIES.slice(0, 7).map(cat => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); track(EVT.category_filter_changed, { category: cat.id }); }}
              className={`pill ${activeCategory === cat.id ? 'pill-active' : ''}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── MASONRY (Pinterest-style waterfall) ──
         Tight side padding so the grid reads as edge-to-edge on desktop —
         the .app-container already gives us the outer gutter. The "All" tab
         renders a mixed feed (items + requests + events + L&F); other tabs
         render their dedicated pool. */}
      <section className="masonry-shell" style={{ padding: '0 8px' }}>
        <div className="masonry-2">
          {activeType === 'all'
            ? allEntries.map((entry, idx) => {
                /* Cycle aspect-ratio variants so the masonry stays
                   irregular and the user's eye keeps moving. */
                const variant = (['xtall','tall','portrait','square','landscape'] as const)[idx % 5];
                if (entry.kind === 'item' || entry.kind === 'request') {
                  const it = entry.item;
                  return (
                    <FeedCard
                      key={`${entry.kind}-${it.id}`}
                      item={it}
                      variant={variant}
                      isSaved={savedIds.has(it.id)}
                      hidePrice={hidePrice}
                      /* Green stroke for both marketplace + requests so the
                         All-tab masonry colour-codes every post-type at a
                         glance (events purple, L&F amber, posts green). */
                      strokeKind={entry.kind === 'request' ? 'request' : 'marketplace'}
                      onToggleSave={() => handleToggleSave(it.id)}
                      onClick={() => { trackPostOpened(entry.kind === 'request' ? 'item' : 'item', it.id, { source: 'feed_all', is_request: !!it.isRequest }); onOpenItem(it); }}
                    />
                  );
                }
                if (entry.kind === 'event') {
                  return (
                    <EventFeedCard
                      key={`event-${entry.event.id}`}
                      event={entry.event}
                      variant={variant}
                      onClick={() => { trackPostOpened('event', entry.event.id, { source: 'feed_all' }); onOpenEvent?.(entry.event); }}
                    />
                  );
                }
                return (
                  <LostFoundFeedCard
                    key={`lf-${entry.lf.id}`}
                    lf={entry.lf}
                    variant={variant}
                    onClick={() => { trackPostOpened('lostfound', entry.lf.id, { source: 'feed_all', lf_status: entry.lf.status }); onOpenLF?.(entry.lf); }}
                  />
                );
              })
            : filtered.map((item, idx) => (
              <FeedCard
                key={item.id}
                item={item}
                variant={(['xtall','tall','portrait','square','landscape'] as const)[idx % 5]}
                isSaved={savedIds.has(item.id)}
                hidePrice={hidePrice}
                onToggleSave={() => handleToggleSave(item.id)}
                onClick={() => { trackPostOpened('item', item.id, { source: `feed_${activeType}`, is_request: !!item.isRequest }); onOpenItem(item); }}
              />
            ))}
        </div>

        {(() => {
          /* Decide which "is this empty?" pipeline to use for the empty
             state. The "All" tab merges 4 sources, so we check the merged
             entries; other tabs check their single source/filtered pair. */
          const isAll = activeType === 'all';
          const visibleCount = isAll ? allEntries.length : filtered.length;
          const poolCount    = isAll
            ? items.length + requests.length + events.length + lostFound.length
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
            /* Truly empty pool — first-mover prompt, tab-aware copy. */
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
              sub="Try a different keyword or clear the category filter."
              compact
            />
          );
        })()}
      </section>
    </div>
  );
}

/* ── CARD ──────────────────────────────────────── */

type FeedCardVariant = 'xtall' | 'tall' | 'portrait' | 'square' | 'landscape';

const VARIANT_RATIOS: Record<FeedCardVariant, string> = {
  xtall:     '0.58',   /* ~3:5  — dramatic vertical */
  tall:      '0.72',   /* ~4:5.5 */
  portrait:  '0.82',
  square:    '1.00',
  landscape: '1.20',   /* short, wide-ish */
};

function FeedCard({
  item, variant, isSaved, onToggleSave, onClick, hidePrice, strokeKind,
}: {
  item: MarketplaceItem;
  variant: FeedCardVariant;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
  /** Settings → Marketplace → "Hide prices on feed" — when true we still
   *  show the listing type chip (Free / Borrow / Swap) but suppress numbers. */
  hidePrice: boolean;
  /** When set, paints a coloured stroke around the card. Used on the
   *  All-tab feed to colour-code listings + requests (green) alongside
   *  events (purple) and L&F (amber). Undefined on the dedicated tabs
   *  so they're not redundantly stroked. */
  strokeKind?: 'marketplace' | 'request';
}) {
  /* Use the media (photo+video) gallery so cards autoplay videos inline
     when the user swipes to a video slide. Real listings carry their own
     uploaded URLs; mock items fall back to the hardcoded sets. */
  const photos = resolveItemMedia(item);
  const hasMedia = photos.length > 0;
  const isPriced = item.listingType === 'sell' && typeof item.price === 'number';
  const ar = VARIANT_RATIOS[variant];

  /* Build the price/status label once so both layouts (image + text-only)
     stay in sync. */
  const priceLabel = item.isRequest
    ? (item.urgent ? 'Urgent' : 'Wanted')
    : isPriced && hidePrice                  ? 'Sell'
    : isPriced                                ? `₹${item.price!.toLocaleString('en-IN')}`
    : item.listingType === 'sell'             ? 'Selling'
    : item.listingType === 'free'             ? 'Free'
    : item.listingType[0].toUpperCase() + item.listingType.slice(1);

  /* ── Text-only card ──
     When a post has no media we render a plain card with a clear hierarchy
     instead of stretching an empty image frame. The title is the biggest
     element, followed by the author's name + small avatar, then the
     description, and finally the location/price meta on the footer line.
     This is what the user spec'd: "name biggest, then person, description
     last; plain card if no image". */
  if (!hasMedia) {
    /* No aspect-ratio for text-only — the card sizes to its content
       (with a small min-height so very short text still feels card-like).
       This is what fixes the "huge empty space below the text" issue:
       columns in the masonry pack tightly around shorter cards. */
    return (
      <article
        className="feed-card feed-card--text"
        data-stroke={strokeKind}
        data-closed={item.isClosed || undefined}
        style={{ padding: 0, position: 'relative', overflow: 'hidden' }}
      >
        {item.isClosed && (
          <span className="feed-card-closed-ribbon" aria-hidden="true">{closedLabelFor(item)}</span>
        )}
        {strokeKind && (
          <span
            className="feed-card-type-chip"
            data-kind={strokeKind}
            aria-hidden="true"
          >
            {strokeKind === 'request' ? 'Request' : 'Shared'}
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${item.title}`}
          className="feed-card-text-button"
        >
          <span className="feed-card-text-body">
            <span className="feed-card-text-title">{item.title}</span>
            <span className="feed-card-text-author">
              <span
                className="feed-card-text-avatar"
                style={{ background: item.user.color }}
                aria-hidden="true"
              >
                <img src={getAvatar(item.user.id)} alt="" width={22} height={22} draggable={false} />
              </span>
              <span className="feed-card-text-author-name">{item.user.name}</span>
            </span>
            {item.description && (
              <span className="feed-card-text-desc">{item.description}</span>
            )}
          </span>
          <span className="feed-card-text-meta">
            <span className="feed-card-loc">
              {item.isRequest ? null : (
                <>
                  <MapPin size={10} strokeWidth={2} />
                  <span className="feed-card-loc-text">{item.location}</span>
                </>
              )}
            </span>
            <span
              className="feed-card-text-price"
              style={item.isRequest && item.urgent ? { color: '#F58400' } : undefined}
            >
              {priceLabel}
            </span>
          </span>
        </button>
        {/* Save heart stays in the top-right corner, same affordance as
           image cards. */}
        <span
          onClick={e => { e.stopPropagation(); onToggleSave(); }}
          role="button"
          tabIndex={0}
          aria-label={isSaved ? 'Unsave' : 'Save'}
          aria-pressed={isSaved}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSave(); } }}
          className="feed-card-save"
          data-saved={isSaved || undefined}
          style={{ zIndex: 3 }}
        >
          <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
        </span>
      </article>
    );
  }

  const closedLabel = item.isClosed ? closedLabelFor(item) : null;

  return (
    <div
      className="feed-card"
      data-stroke={strokeKind}
      data-closed={item.isClosed || undefined}
      style={{ aspectRatio: ar, padding: 0 }}
      aria-label={closedLabel ? `${item.title} — ${closedLabel}` : `Open ${item.title}`}
    >
      {closedLabel && (
        <span className="feed-card-closed-ribbon" aria-hidden="true">{closedLabel}</span>
      )}
      <PhotoCarousel
        photos={photos}
        aspectRatio={ar}
        showArrows={false}
        dotsPosition="top"
        onClick={onClick}
        overlay={
          <>
            {/* Top-left type sticker — matches the LOST/FOUND badge on
                L&F cards + the calendar chip on event cards so users can
                scan the masonry without having to read each card. Only
                paints when strokeKind is set (i.e. on the All tab); the
                dedicated Shared/Requests tabs don't need redundant
                labels because the tab itself answers the question. */}
            {strokeKind && (
              <span
                className="feed-card-type-chip"
                data-kind={strokeKind}
                aria-hidden="true"
              >
                {strokeKind === 'request' ? 'Request' : 'Shared'}
              </span>
            )}
            <span
              onClick={e => { e.stopPropagation(); onToggleSave(); }}
              role="button"
              tabIndex={0}
              aria-label={isSaved ? 'Unsave' : 'Save'}
              aria-pressed={isSaved}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSave(); }}}
              className="feed-card-save"
              data-saved={isSaved || undefined}
              style={{ zIndex: 3 }}
            >
              <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
            </span>

            <div className="feed-card-overlay">
              <p className="feed-card-title">{item.title}</p>
              <div className="feed-card-meta">
                <span className="feed-card-loc">
                  <MapPin size={10} strokeWidth={2} />
                  <span className="feed-card-loc-text">{item.location}</span>
                </span>
                <span
                  className="feed-card-price"
                  style={item.isRequest && item.urgent ? { color: '#F58400' } : undefined}
                >
                  {priceLabel}
                </span>
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}

/* ── Event tile (All-tab variant) ──────────────────
   Mirrors the inventory event card shape but uses the public organizer
   info + RSVP/attendee snippet. Purple data-stroke so the All tab still
   colour-codes by post type. */
function EventFeedCard({
  event, variant, onClick,
}: { event: CommunityEvent; variant: FeedCardVariant; onClick: () => void }) {
  const ar = VARIANT_RATIOS[variant];
  const uploaded = (event as { photoUrls?: string[] }).photoUrls;
  const photo = uploaded && uploaded.length > 0
    ? uploaded[0]
    : getEventPhoto(event.id, event.eventType);
  const metrics = getEventMetrics(event.id);
  return (
    <button
      type="button"
      onClick={onClick}
      className="feed-card feed-card--event"
      data-stroke="event"
      style={{ aspectRatio: ar, padding: 0 }}
      aria-label={`Open event ${event.title}`}
    >
      <img src={photo} alt="" className="feed-card-img" loading="lazy" />
      <span style={{
        position: 'absolute', top: 10, left: 10,
        background: 'rgba(168,85,247,0.92)', color: '#fff',
        backdropFilter: 'blur(8px)', borderRadius: 999,
        padding: '4px 10px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase',
        display: 'inline-flex', alignItems: 'center', gap: 4, zIndex: 3,
      }}>
        <CalendarDays size={10} strokeWidth={2} /> Event
      </span>
      <div className="feed-card-overlay">
        <p className="feed-card-title">{event.title}</p>
        <div className="feed-card-meta" style={{ gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <UsersIcon size={10} strokeWidth={2} /> {metrics.rsvps}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Eye size={10} strokeWidth={2} /> {metrics.views}
          </span>
          <span className="feed-card-price">{event.date.split(' ').slice(0, 3).join(' ')}</span>
        </div>
      </div>
    </button>
  );
}

/* ── Lost & Found tile (All-tab variant) ──────────────
   Orange-stroked card mirroring the inventory L&F tile but rendered in the
   public feed flow. Status badge top-left (rose for Lost, green for Found). */
function LostFoundFeedCard({
  lf, variant, onClick,
}: { lf: LostItem; variant: FeedCardVariant; onClick: () => void }) {
  const ar = VARIANT_RATIOS[variant];
  const photo = getLostFoundPhoto(lf.id, lf.photoIcon, lf.photoUrls);
  const isLost = lf.status === 'lost';
  return (
    <button
      type="button"
      onClick={onClick}
      className="feed-card feed-card--lostfound"
      data-stroke="lostfound"
      style={{ aspectRatio: ar, padding: 0 }}
      aria-label={`Open ${lf.title}`}
    >
      <img src={photo} alt="" className="feed-card-img" loading="lazy" />
      <span style={{
        position: 'absolute', top: 10, left: 10,
        background: isLost ? 'rgba(237,46,80,0.92)' : 'rgba(34,197,94,0.92)',
        color: '#fff', borderRadius: 999,
        padding: '4px 10px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase', zIndex: 3,
      }}>
        {lf.status}
      </span>
      <div className="feed-card-overlay">
        <p className="feed-card-title">{lf.title}</p>
        <div className="feed-card-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MapPin size={10} strokeWidth={2} /> {lf.lastSeen}
          </span>
          <span className="feed-card-price">{lf.timeAgo}</span>
        </div>
      </div>
    </button>
  );
}
