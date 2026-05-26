'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, Search, MapPin, Heart, X, CalendarDays, Users as UsersIcon, Eye } from 'lucide-react';
import {
  MARKETPLACE_ITEMS, EVENTS, LOST_FOUND_ITEMS, CATEGORIES,
  type MarketplaceItem, type CommunityEvent, type LostItem,
} from '../lib/mockData';
import { resolveItemMedia, getAvatar, getEventPhoto, getLostFoundPhoto } from '../lib/photos';
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
import PhotoCarousel from './PhotoCarousel';
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
  onBannerAction?: (kind: 'share' | 'request' | 'events' | 'lost-found') => void;
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

  const [activeCategory, setActiveCategory] = useState('all');
  /* Default tab = "All" — a chronological mix of every Wecycle activity
     (uploads, requests, events, lost-found). FeedScreen unmounts when the
     user navigates to another bottom-nav screen, so the next visit reseeds
     this default — that's the "every new session starts on All" behaviour. */
  const [activeType, setActiveType] = useState<'all' | 'requests' | 'uploads'>('all');
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
      searchUsers(trimmed).then(hits => {
        setUserHits(hits);
        setUserSearchLoading(false);
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
       - 'uploads'  → marketplace listings only */
  const source = activeType === 'requests' ? requests : items;
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
    const itemEntries: AllEntry[] = items.map((it, i) => ({
      kind: 'item' as const, item: it, sortKey: it.postedDaysAgo * 1000 + i,
    }));
    const requestEntries: AllEntry[] = requests.map((it, i) => ({
      kind: 'request' as const, item: it, sortKey: it.postedDaysAgo * 1000 + i,
    }));
    const eventEntries: AllEntry[] = events.map((ev, i) => ({
      kind: 'event' as const, event: ev, sortKey: -1000 + i,  /* events surface earliest */
    }));
    const lfEntries: AllEntry[] = lostFound.map((lf, i) => ({
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
      illustration: 'twemoji:wrapped-gift',
      title: 'Share what you don’t use',
      subtitle: 'Give it a second life nearby',
      detail: 'Drop a photo, name your price (or free) — the right neighbour finds it in minutes.',
      gradient:
        'linear-gradient(135deg, rgba(34,197,94,0.92) 0%, rgba(13,148,136,0.85) 100%)',
      onClick: () => onBannerAction?.('share'),
    },
    {
      id: 'request',
      illustration: 'twemoji:raising-hand',
      title: 'Ask for what you need',
      subtitle: 'Borrow before you buy',
      detail: 'Post a request and let the community come to you — books, tools, a kettle, anything.',
      gradient:
        'linear-gradient(135deg, rgba(245,132,0,0.92) 0%, rgba(244,63,94,0.88) 100%)',
      onClick: () => onBannerAction?.('request'),
    },
    {
      id: 'events',
      illustration: 'twemoji:tear-off-calendar',
      title: 'Join local events',
      subtitle: 'Repair cafés, swaps, cleanups',
      detail: 'See what your community is hosting this week. RSVP in one tap.',
      gradient:
        'linear-gradient(135deg, rgba(99,102,241,0.92) 0%, rgba(168,85,247,0.88) 100%)',
      onClick: () => onBannerAction?.('events'),
    },
    {
      id: 'lost-found',
      illustration: 'twemoji:magnifying-glass-tilted-left',
      title: 'Lost something?',
      subtitle: 'Or help return what you found',
      detail: 'A second board, side-by-side with the marketplace. Verified by the community.',
      gradient:
        'linear-gradient(135deg, rgba(234,179,8,0.92) 0%, rgba(217,119,6,0.88) 100%)',
      onClick: () => onBannerAction?.('lost-found'),
    },
  ];

  return (
    <div className="screen-transition" style={{ paddingBottom: 120, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
          <span style={{
            flex: 1, textAlign: 'center',
            fontWeight: 600, fontSize: 18,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            wecycle
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
        <div className="feed-greeting-text" style={{ minWidth: 0 }}>
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

      {/* ── MOBILE MARKETING BANNER ──
         Wide variant sized down for mobile. Sits BETWEEN the greeting and
         the search bar so it reads like a hero strip. Hidden on desktop —
         the desktop mount below the search row takes over there. */}
      <section className="marketing-banner-mount-mobile" style={{ padding: '0 16px 16px' }}>
        <MarketingBanner slides={bannerSlides} variant="wide" />
      </section>

      {/* ── DESKTOP MARKETING BANNER ──
         Wider, richer variant of the carousel. Sits below the search row so
         the marketing strip gets its own real estate on big screens. */}
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

      {/* ── USER SEARCH RESULTS ──
         Appears above the tabs whenever the query yields one or more user
         matches. Clicking a card opens that user's storefront. */}
      <UserSearchResults
        results={userHits}
        query={query}
        loading={userSearchLoading}
        onPick={(hit) => onOpenUser?.(hit.id)}
      />

      {/* ── PILL TABS: all / requests / uploads ── */}
      <section style={{ padding: '0 16px 14px' }}>
        <div className="segmented">
          <button
            onClick={() => setActiveType('all')}
            aria-pressed={activeType === 'all'}
            data-active={activeType === 'all' || undefined}
          >
            All
          </button>
          <button
            onClick={() => setActiveType('requests')}
            aria-pressed={activeType === 'requests'}
            data-active={activeType === 'requests' || undefined}
          >
            Requests
          </button>
          <button
            onClick={() => setActiveType('uploads')}
            aria-pressed={activeType === 'uploads'}
            data-active={activeType === 'uploads' || undefined}
          >
            Uploads
          </button>
        </div>
      </section>

      {/* ── CATEGORY CHIPS ── */}
      <section style={{ padding: '0 0 12px' }}>
        <div className="chip-row">
          {CATEGORIES.slice(0, 7).map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
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
                      onClick={() => onOpenItem(it)}
                    />
                  );
                }
                if (entry.kind === 'event') {
                  return (
                    <EventFeedCard
                      key={`event-${entry.event.id}`}
                      event={entry.event}
                      variant={variant}
                      onClick={() => onOpenEvent?.(entry.event)}
                    />
                  );
                }
                return (
                  <LostFoundFeedCard
                    key={`lf-${entry.lf.id}`}
                    lf={entry.lf}
                    variant={variant}
                    onClick={() => onOpenLF?.(entry.lf)}
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
                onClick={() => onOpenItem(item)}
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
                icon="🌱"
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
    : isPriced                                ? `₹${item.price}`
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
        style={{ padding: 0, position: 'relative', overflow: 'hidden' }}
      >
        {strokeKind && (
          <span
            className="feed-card-type-chip"
            data-kind={strokeKind}
            aria-hidden="true"
          >
            {strokeKind === 'request' ? 'Request' : 'Upload'}
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
            <span>
              {item.isRequest ? null : (
                <>
                  <MapPin size={10} strokeWidth={2} />
                  {item.location}
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

  return (
    <div
      className="feed-card"
      data-stroke={strokeKind}
      style={{ aspectRatio: ar, padding: 0 }}
      aria-label={`Open ${item.title}`}
    >
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
                dedicated Uploads/Requests tabs don't need redundant
                labels because the tab itself answers the question. */}
            {strokeKind && (
              <span
                className="feed-card-type-chip"
                data-kind={strokeKind}
                aria-hidden="true"
              >
                {strokeKind === 'request' ? 'Request' : 'Upload'}
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <MapPin size={10} strokeWidth={2} />
                  {item.location}
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
