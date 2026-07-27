'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, SlidersHorizontal, Heart, MapPin, MessageCircle,
  X, Check, ArrowUpDown, Grid3X3, List, Clock, ArrowRight,
} from 'lucide-react';
import { MARKETPLACE_ITEMS, CATEGORIES, LISTING_TYPES, type MarketplaceItem } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import EmptyState from './EmptyState';

type ViewMode = 'grid' | 'list';

const TYPE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  free:   { label: 'Free',   bg: 'rgba(34,197,94,0.92)',   color: '#fff' },
  borrow: { label: 'Borrow', bg: 'rgba(139,133,255,0.92)', color: '#fff' },
  swap:   { label: 'Swap',   bg: 'rgba(61,214,245,0.92)',  color: '#0C0C0B' },
  sell:   { label: 'Sell',   bg: 'rgba(255,154,64,0.92)',  color: '#0C0C0B' },
};

const CONDITION_LABEL: Record<string, string> = {
  like_new: '✦ Like New',
  good: 'Good',
  fair: 'Fair',
};

export default function MarketplaceScreen() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeType, setActiveType] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set(['m2']));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const toggleSave = (id: string) => {
    setSavedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const items = useMemo<MarketplaceItem[]>(
    () => (mounted && isDemoMode() ? MARKETPLACE_ITEMS : []),
    [mounted],
  );
  const filtered = items.filter(item => {
    if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
    if (activeType !== 'all' && item.listingType !== activeType) return false;
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const featured = filtered.find(i => i.condition === 'like_new') ?? filtered[0];
  const rest = featured ? filtered.filter(i => i.id !== featured.id) : filtered;

  return (
    <div className="screen-transition" style={{ paddingBottom: 100, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER (mobile) ── */}
      <header className="mobile-only-nav" style={{
        position: 'sticky', top: 0, zIndex: 30,
        /* Opaque. --bg-overlay is 88% alpha, so content showed
           through the header as it scrolled past. */
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '14px 16px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            letterSpacing: '-0.025em', color: 'var(--text-primary)', flex: 1,
          }}>
            Market
          </h1>
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="theme-toggle"
            aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          >
            {viewMode === 'grid'
              ? <List size={17} strokeWidth={2} />
              : <Grid3X3 size={17} strokeWidth={2} />}
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className="theme-toggle"
            style={activeType !== 'all' ? {
              background: 'var(--accent-lime)',
              color: 'var(--text-on-accent)',
            } : undefined}
            aria-label="Filter"
          >
            <SlidersHorizontal size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} strokeWidth={2} style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search 1,847 items…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
            style={{ paddingLeft: 38 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4,
            }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`filter-chip ${activeCategory === cat.id ? 'active' : ''}`}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── TYPE FILTER TABS ── */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none',
        background: 'var(--bg-base)',
      }}>
        {LISTING_TYPES.map(type => (
          <button
            key={type.id}
            onClick={() => setActiveType(type.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '12px 16px',
              fontSize: 12, fontWeight: 800,
              color: activeType === type.id ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${activeType === type.id ? 'var(--accent-lime)' : 'transparent'}`,
              whiteSpace: 'nowrap', transition: 'all 0.15s',
              letterSpacing: '0.02em',
            }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* ── RESULTS HEADER ── */}
      <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
          {filtered.length} items near you
        </span>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
        }}>
          <ArrowUpDown size={12} strokeWidth={1.8} /> Sort
        </button>
      </div>

      {/* ── CONTENT ── */}
      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon="🛍️"
            prompt="The marketplace is wide open."
            sub="Be the one who breaks the seal — share or sell something your community could use."
          />
        ) : (
          <EmptyState
            icon="🔍"
            prompt="No items match those filters."
            sub="Try a different category or clear the search."
            compact
          />
        )
      ) : viewMode === 'grid' ? (
        <>
          {/* Featured — full bleed */}
          {featured && (
            <div style={{ marginTop: 14 }}>
              <FeaturedCard
                item={featured}
                isSaved={savedItems.has(featured.id)}
                onSave={() => toggleSave(featured.id)}
              />
            </div>
          )}

          {/* Section header */}
          <div style={{ padding: '24px 16px 12px' }}>
            <h3 style={{
              margin: 0, fontSize: 15, fontWeight: 600,
              letterSpacing: '-0.015em', color: 'var(--text-primary)',
            }}>
              All items
            </h3>
          </div>

          {/* Grid */}
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {rest.map(item => (
              <GridItemCard
                key={item.id}
                item={item}
                isSaved={savedItems.has(item.id)}
                onSave={() => toggleSave(item.id)}
              />
            ))}
          </div>
        </>
      ) : (
        // List view — edge-to-edge with dividers
        <div>
          {filtered.map(item => (
            <ListItemCard
              key={item.id}
              item={item}
              isSaved={savedItems.has(item.id)}
              onSave={() => toggleSave(item.id)}
            />
          ))}
        </div>
      )}

      {/* ── SHARE BANNER ── */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{
          background: 'var(--accent-lime)',
          borderRadius: 'var(--radius-2xl)',
          padding: '18px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 90% 50%, rgba(255,255,255,0.18), transparent 50%)',
            pointerEvents: 'none',
          }} />
          <div style={{ fontSize: 36, position: 'relative' }}>📦</div>
          <div style={{ flex: 1, position: 'relative' }}>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 900, color: '#0C0C0B', letterSpacing: '-0.02em' }}>
              Got something to give?
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(0,0,0,0.6)', fontWeight: 600 }}>
              Share with your community in 30 seconds
            </p>
          </div>
          <button style={{
            background: '#0C0C0B', color: 'var(--accent-lime)',
            border: 'none', padding: '9px 14px', borderRadius: 'var(--radius-pill)',
            fontSize: 11, fontWeight: 900, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            position: 'relative', letterSpacing: '0.04em', textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            Share <ArrowRight size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── FILTER SHEET ── */}
      {filterOpen && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setFilterOpen(false)} />
          <div className="bottom-sheet">
            <div className="sheet-handle" />
            <div style={{ padding: '16px 20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{
                  margin: 0, fontSize: 20, fontWeight: 900,
                  letterSpacing: '-0.02em', color: 'var(--text-primary)', flex: 1,
                }}>
                  Filter
                </h2>
                <button
                  onClick={() => { setActiveType('all'); setFilterOpen(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}
                >
                  Reset
                </button>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Listing Type
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                {LISTING_TYPES.filter(t => t.id !== 'all').map(type => (
                  <button
                    key={type.id}
                    onClick={() => setActiveType(type.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: activeType === type.id ? 'rgba(168,221,0,0.08)' : 'var(--bg-inset)',
                      border: `1.5px solid ${activeType === type.id ? 'rgba(168,221,0,0.5)' : 'transparent'}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', fontSize: 14, fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {type.label}
                    {activeType === type.id && <Check size={16} strokeWidth={2.5} color="var(--accent-lime)" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setFilterOpen(false)} className="btn btn-primary" style={{ width: '100%', padding: 14 }}>
                Show {filtered.length} Results
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   FEATURED — full-bleed editorial card
══════════════════════════════════════════════════ */

function FeaturedCard({ item, isSaved, onSave }: { item: MarketplaceItem; isSaved: boolean; onSave: () => void }) {
  const tc = TYPE_CONFIG[item.listingType];
  const priceLabel = item.listingType === 'sell' ? `₹${item.price}` : tc.label;

  return (
    <div style={{ position: 'relative', cursor: 'pointer' }}>
      {/* Full-bleed photo */}
      <div style={{
        height: 360,
        background: item.photoColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 110,
        position: 'relative',
      }}>
        {item.photoIcon}

        {/* Bottom gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.78) 100%)',
        }} />

        {/* Featured label — quiet */}
        <div style={{
          position: 'absolute', top: 16, left: 16,
          background: 'rgba(0,0,0,0.5)', color: '#fff',
          backdropFilter: 'blur(8px)',
          borderRadius: 'var(--radius-pill)',
          padding: '4px 10px',
          fontSize: 11, fontWeight: 500, letterSpacing: '-0.01em',
        }}>
          Featured
        </div>

        {/* Save */}
        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(0,0,0,0.4)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(8px)',
            color: isSaved ? 'var(--accent-rose)' : '#fff',
          }}
        >
          <Heart size={18} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
        </button>

        {/* Bottom info */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '20px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{
                margin: '0 0 6px', fontSize: 24, fontWeight: 900,
                color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1,
              }}>
                {item.title}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: item.user.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, color: '#fff',
                }}>
                  {item.user.initials[0]}
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
                  {item.user.name.split(' ')[0]}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>·</span>
                <MapPin size={11} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                  {item.location}
                </span>
              </div>
            </div>
            <div style={{
              background: tc.bg, color: tc.color,
              fontSize: 14, fontWeight: 900,
              padding: '8px 14px', borderRadius: 'var(--radius-pill)',
              letterSpacing: '-0.01em', flexShrink: 0,
              backdropFilter: 'blur(8px)',
            }}>
              {priceLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: item.condition === 'like_new' ? 'var(--accent-lime-dim)' : 'var(--text-muted)',
        }}>
          {CONDITION_LABEL[item.condition]}
        </span>
        <span className="ticker-dot" style={{ color: 'var(--text-muted)' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
          <Clock size={11} strokeWidth={2} /> {item.postedDaysAgo === 0 ? 'today' : `${item.postedDaysAgo}d ago`}
        </span>
        <div style={{ flex: 1 }} />
        {item.responses > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            <MessageCircle size={11} strokeWidth={2} /> {item.responses} interested
          </span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   GRID CARD — minimal border, photo-led
══════════════════════════════════════════════════ */

function GridItemCard({ item, isSaved, onSave }: { item: MarketplaceItem; isSaved: boolean; onSave: () => void }) {
  const tc = TYPE_CONFIG[item.listingType];
  const priceLabel = item.listingType === 'sell' ? `₹${item.price}` : tc.label;

  return (
    <div style={{ cursor: 'pointer' }} className="press-scale-sm">
      {/* Photo */}
      <div style={{
        aspectRatio: '1 / 1.15',
        background: item.photoColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 56, position: 'relative',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginBottom: 8,
      }}>
        {item.photoIcon}

        {/* Save */}
        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', backdropFilter: 'blur(8px)',
            color: isSaved ? 'var(--accent-rose)' : '#fff',
          }}
        >
          <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
        </button>

        {/* Type pill */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: tc.bg, color: tc.color,
          fontSize: 10, fontWeight: 900,
          padding: '4px 9px', borderRadius: 'var(--radius-pill)',
          letterSpacing: '-0.01em',
          backdropFilter: 'blur(6px)',
        }}>
          {priceLabel}
        </div>
      </div>

      {/* Caption */}
      <h3 style={{
        margin: '0 0 4px', fontSize: 13, fontWeight: 800,
        color: 'var(--text-primary)', letterSpacing: '-0.01em',
        display: '-webkit-box', WebkitLineClamp: 1,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
        lineHeight: 1.3,
      }}>
        {item.title}
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
          {item.user.name.split(' ')[0]}
        </span>
        <span className="ticker-dot" style={{ color: 'var(--text-muted)' }} />
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: item.condition === 'like_new' ? 'var(--accent-lime-dim)' : 'var(--text-muted)',
        }}>
          {item.condition === 'like_new' ? '✦ New' : item.condition === 'good' ? 'Good' : 'Fair'}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   LIST CARD — edge-to-edge with hairline divider
══════════════════════════════════════════════════ */

function ListItemCard({ item, isSaved, onSave }: { item: MarketplaceItem; isSaved: boolean; onSave: () => void }) {
  const tc = TYPE_CONFIG[item.listingType];
  const priceLabel = item.listingType === 'sell' ? `₹${item.price}` : tc.label;

  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      cursor: 'pointer',
    }} className="press-scale-sm">
      {/* Photo */}
      <div style={{
        width: 96, height: 96, borderRadius: 'var(--radius-md)',
        background: item.photoColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 38, flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        {item.photoIcon}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <h3 style={{
            margin: 0, fontSize: 14, fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.01em', flex: 1,
            display: '-webkit-box', WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.title}
          </h3>
          <span style={{
            background: tc.bg, color: tc.color,
            fontSize: 11, fontWeight: 900,
            padding: '3px 9px', borderRadius: 'var(--radius-pill)', flexShrink: 0,
          }}>
            {priceLabel}
          </span>
        </div>

        <p style={{
          margin: '0 0 6px', fontSize: 12,
          color: 'var(--text-secondary)', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.description}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            background: item.user.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 800, color: '#fff',
          }}>
            {item.user.initials[0]}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {item.user.name.split(' ')[0]}
          </span>
          <span className="ticker-dot" style={{ color: 'var(--text-muted)' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
            <MapPin size={10} strokeWidth={2} /> {item.location}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={e => { e.stopPropagation(); onSave(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: isSaved ? 'var(--accent-rose)' : 'var(--text-muted)',
          }}>
            <Heart size={15} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}
