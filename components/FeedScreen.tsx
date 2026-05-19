'use client';

import { useEffect, useState } from 'react';
import { Menu, Search, MapPin, Heart, X } from 'lucide-react';
import { MARKETPLACE_ITEMS, CATEGORIES, type MarketplaceItem } from '../lib/mockData';
import { getItemPhotos, getAvatar } from '../lib/photos';
import { useAuth } from '../lib/AuthContext';
import PhotoCarousel from './PhotoCarousel';

interface FeedScreenProps {
  onPost: () => void;
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onOpenItem: (item: MarketplaceItem) => void;
}

export default function FeedScreen({ onOpenMenu, onOpenAccount, onOpenItem }: FeedScreenProps) {
  const { profile, user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [activeCategory, setActiveCategory] = useState('all');
  const [activeType, setActiveType] = useState<'all' | 'requests' | 'uploads'>('uploads');
  const [query, setQuery] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(['m2']));

  const filtered = MARKETPLACE_ITEMS.filter(item => {
    if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
    if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const greetingName = (profile?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0];

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

      {/* ── GREETING + DESKTOP-INLINE SEARCH ── */}
      <section className="feed-greeting-row" style={{ padding: '14px 20px 16px' }}>
        <div style={{ minWidth: 0 }}>
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

      {/* ── MOBILE SEARCH (under greeting) ── */}
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

      {/* ── MASONRY 2-COL GRID ── */}
      <section style={{ padding: '0 12px' }}>
        <div className="masonry-2">
          {filtered.map((item, idx) => (
            <FeedCard
              key={item.id}
              item={item}
              tall={idx % 5 === 0 || idx % 5 === 3}
              isSaved={savedIds.has(item.id)}
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

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              No items match
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Try a different search or category
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── CARD ──────────────────────────────────────── */

function FeedCard({
  item, tall, isSaved, onToggleSave, onClick,
}: {
  item: MarketplaceItem;
  tall: boolean;
  isSaved: boolean;
  onToggleSave: () => void;
  onClick: () => void;
}) {
  const photos = getItemPhotos(item.id, item.category);
  const isPriced = item.listingType === 'sell';
  const ar = tall ? '0.72' : '0.92';

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
                <span className="feed-card-price">
                  {isPriced ? `₹${item.price}` : item.listingType === 'free' ? 'Free' : item.listingType[0].toUpperCase() + item.listingType.slice(1)}
                </span>
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}
