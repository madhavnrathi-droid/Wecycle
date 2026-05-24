'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, Search, MapPin, Heart, X } from 'lucide-react';
import { MARKETPLACE_ITEMS, CATEGORIES, type MarketplaceItem } from '../lib/mockData';
import { resolveItemMedia, getAvatar } from '../lib/photos';
import { useAuth } from '../lib/AuthContext';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import { fetchMarketplaceItems, fetchRequests, onPostsChanged, searchUsers, type UserSearchHit } from '../lib/liveData';
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
  /** Banner CTA — fired when a marketing-banner slide is tapped.
   *  kind = which feature the user wants to jump to. */
  onBannerAction?: (kind: 'share' | 'request' | 'events' | 'lost-found') => void;
  /** Fired when a user-search-result card is tapped. Routes to the
   *  matching storefront. */
  onOpenUser?: (userId: string) => void;
}

export default function FeedScreen({ onPost, onOpenMenu, onOpenAccount, onOpenItem, onBannerAction, onOpenUser }: FeedScreenProps) {
  const { profile, user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [activeCategory, setActiveCategory] = useState('all');
  const [activeType, setActiveType] = useState<'all' | 'requests' | 'uploads'>('uploads');
  const [query, setQuery] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  /* Settings: hide-prices toggle (Settings → Marketplace). We subscribe so
     flipping the switch updates every card on the feed live, without reload. */
  const [hidePrice, setHidePrice] = useState(false);
  useEffect(() => {
    setHidePrice(getSettings().marketplace.hidePriceOnFeed);
    return onSettingsChange(s => setHidePrice(s.marketplace.hidePriceOnFeed));
  }, []);

  /* Source of truth for the marketplace cards:
       - demo mode → the seeded mock catalogue
       - live (Supabase env) → real listings, refetched whenever a post lands
       - neither → empty (first-mover prompt) */
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [requests, setRequests] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    if (isDemoMode()) {
      setItems(MARKETPLACE_ITEMS);
      setRequests([]);
      setLoading(false);
      return;
    }
    if (!hasSupabaseEnv) {
      setItems([]);
      setRequests([]);
      setLoading(false);
      return;
    }

    const load = () => {
      setLoading(true);
      Promise.all([
        fetchMarketplaceItems({ limit: 60 }),
        fetchRequests({ limit: 60 }),
      ])
        .then(([listingRows, requestRows]) => {
          if (cancelled) return;
          setItems(listingRows);
          setRequests(requestRows);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    load();
    /* Refetch the instant someone posts (same tab) */
    const off = onPostsChanged(load);
    return () => { cancelled = true; off(); };
  }, [mounted]);

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

  /* The active tab decides which pool we render. Uploads → listings,
     Requests → open requests. */
  const source = activeType === 'requests' ? requests : items;
  const filtered = source.filter(item => {
    if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
    if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

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

      {/* ── PILL TABS: requests / uploads ── */}
      <section style={{ padding: '0 16px 14px' }}>
        <div className="segmented">
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
         the .app-container already gives us the outer gutter. */}
      <section className="masonry-shell" style={{ padding: '0 8px' }}>
        <div className="masonry-2">
          {filtered.map((item, idx) => (
            <FeedCard
              key={item.id}
              item={item}
              /* Pinterest-style: cycle through 5 aspect ratios so the waterfall
                 has the irregular puzzle-piece flow instead of a 2-state stripe. */
              variant={(['xtall','tall','portrait','square','landscape'] as const)[idx % 5]}
              isSaved={savedIds.has(item.id)}
              hidePrice={hidePrice}
              onToggleSave={() => {
                setSavedIds(prev => {
                  const next = new Set(prev);
                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                  return next;
                });
              }}
              onClick={() => onOpenItem(item)}
            />
          ))}
        </div>

        {loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading the feed…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          source.length === 0 ? (
            /* Truly empty pool — first-mover prompt, tab-aware copy. */
            activeType === 'requests' ? (
              <EmptyState
                icon="🙋"
                prompt="No open requests yet. Need something? Ask away!"
                sub="Posting a request is usually faster (and cheaper) than buying new."
                cta={{ label: 'Post a request', onClick: onPost }}
              />
            ) : (
              <EmptyState
                icon="🌱"
                prompt="Looks like the feed's just sprouting. Be the first to share something!"
                sub="Post a free find, a borrow request, or an event — your community's waiting."
                cta={{ label: 'Post the first thing', onClick: onPost }}
              />
            )
          ) : (
            /* Filter / search returned no rows — softer "no match" copy. */
            <EmptyState
              icon="🔍"
              prompt="No matches for that search."
              sub="Try a different keyword or clear the category filter."
              compact
            />
          )
        )}
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
  item, variant, isSaved, onToggleSave, onClick, hidePrice,
}: {
  item: MarketplaceItem;
  variant: FeedCardVariant;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
  /** Settings → Marketplace → "Hide prices on feed" — when true we still
   *  show the listing type chip (Free / Borrow / Swap) but suppress numbers. */
  hidePrice: boolean;
}) {
  /* Use the media (photo+video) gallery so cards autoplay videos inline
     when the user swipes to a video slide. Real listings carry their own
     uploaded URLs; mock items fall back to the hardcoded sets. */
  const photos = resolveItemMedia(item);
  const isPriced = item.listingType === 'sell';
  const ar = VARIANT_RATIOS[variant];

  return (
    <div className="feed-card" style={{ aspectRatio: ar, padding: 0 }} aria-label={`Open ${item.title}`}>
      <PhotoCarousel
        photos={photos}
        aspectRatio={ar}
        showArrows={false}
        dotsPosition="top"
        onClick={onClick}
        overlay={
          <>
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
                  {item.isRequest
                    /* Requests show "Wanted" (or "Urgent" when flagged) — never
                       a price or a listing-type verb. */
                    ? (item.urgent ? 'Urgent' : 'Wanted')
                    : isPriced && hidePrice
                      ? 'Sell'
                      : isPriced
                        ? `₹${item.price}`
                        : item.listingType === 'free'
                          ? 'Free'
                          : item.listingType[0].toUpperCase() + item.listingType.slice(1)}
                </span>
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}
