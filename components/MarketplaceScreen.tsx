'use client';

import CategoryIcon from './CategoryIcon';
import { matchesCategoryFilter } from '../lib/categories';
import { useEffect, useMemo, useState } from 'react';
import {
  Search, SlidersHorizontal, Heart, MapPin, MessageCircle,
  X, Check, ArrowUpDown, Grid3X3, List, Clock, ArrowRight, ShoppingBag, Package,
} from '@/lib/icons';
import { MARKETPLACE_ITEMS, CATEGORIES, LISTING_TYPES, type MarketplaceItem } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import { resolveItemMedia } from '../lib/photos';
import EmptyState from './EmptyState';
import NoPhoto from './NoPhoto';

type ViewMode = 'grid' | 'list';

/* A listing's kind is a word with a dot of colour, on a frosted label — the
   badge every other card wears (.pcard-badge). Four filled pills in four
   colours made each photo compete with its own price tag. */
const TYPE_CONFIG: Record<string, { label: string; dot: string }> = {
  free:   { label: 'Free',   dot: 'var(--status-free)' },
  borrow: { label: 'Borrow', dot: 'var(--status-opportunity)' },
  swap:   { label: 'Swap',   dot: 'var(--status-event)' },
  sell:   { label: 'Sell',   dot: 'var(--ink)' },
};

const CONDITION_LABEL: Record<string, string> = {
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
};

/* The listing's own first photo (a video's poster), or nothing — in which
   case the card shows the honest "No photo" placeholder, never an emoji. */
function photoOf(item: MarketplaceItem): string | undefined {
  const first = resolveItemMedia(item)[0];
  return typeof first === 'string' ? first : (first?.poster ?? first?.src);
}

function Photo({ item }: { item: MarketplaceItem }) {
  const src = photoOf(item);
  return src
    ? <img src={src} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    : <NoPhoto />;
}

/* Frosted price/kind label for a photo. */
function KindLabel({ item, large }: { item: MarketplaceItem; large?: boolean }) {
  const tc = TYPE_CONFIG[item.listingType];
  const priced = item.listingType === 'sell';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: large ? '7px 12px 7px 10px' : '4px 9px 4px 8px',
      borderRadius: 'var(--radius-pill)',
      background: 'rgba(255, 255, 255, 0.86)',
      WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)',
      color: '#111110',
      ...(priced
        ? { fontSize: `calc(${large ? 17 : 13}px * var(--text-scale))`, fontWeight: 600, letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums' as const }
        : { fontFamily: 'var(--font-mono)', fontSize: `calc(${large ? 11 : 9.5}px * var(--text-scale))`, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const }),
    }}>
      {!priced && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: tc.dot }} />}
      {priced ? `₹${item.price}` : tc.label}
    </span>
  );
}

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
    /* The label is not the id — see categoryIdOf. */
    if (!matchesCategoryFilter(item, activeCategory)) return false;
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
        padding: '14px 16px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h1 className="t-large-title" style={{
            margin: 0, color: 'var(--text-primary)', flex: 1,
          }}>
            Market
          </h1>
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="theme-toggle"
            aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          >
            {viewMode === 'grid'
              ? <List size={22} />
              : <Grid3X3 size={22} />}
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className="theme-toggle"
            style={activeType !== 'all' ? {
              background: 'var(--ink)',
              color: '#FFFFFF',
            } : undefined}
            aria-label="Filter"
            aria-pressed={activeType !== 'all'}
          >
            <SlidersHorizontal size={22} />
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
              <span className="filter-chip-ico">
                <CategoryIcon id={cat.id} src={(cat as { iconSrc?: string }).iconSrc} emoji={cat.icon} size={20} />
              </span>
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── TYPE FILTER — a scrolling row of words; the chosen one is ink ── */}
      <div style={{ padding: '4px 16px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div className="segmented segmented--scroll" style={{ display: 'flex', width: 'max-content' }}>
          {LISTING_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => setActiveType(type.id)}
              aria-pressed={activeType === type.id}
              data-active={activeType === type.id || undefined}
              style={{ whiteSpace: 'nowrap' }}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── RESULTS HEADER ── */}
      <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)', flex: 1 }}>
          {filtered.length} items near you
        </span>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, color: 'var(--brand-ink)',
        }}>
          <ArrowUpDown size={16} /> Sort
        </button>
      </div>

      {/* ── CONTENT ── */}
      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={40} />}
            prompt="The marketplace is wide open."
            sub="Be the one who breaks the seal — share or sell something your community could use."
          />
        ) : (
          <EmptyState
            icon={<Search size={32} />}
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
              margin: 0, fontSize: 'calc(20px * var(--text-scale))', fontWeight: 600,
              letterSpacing: '-0.022em', color: 'var(--text-primary)',
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

      {/* ── SHARE BANNER — one of our posts: the meadow bloom under grain ── */}
      <div style={{ padding: '32px 16px 0' }}>
        <div className="tex tex--meadow" style={{
          borderRadius: 20,
          padding: '16px 16px 16px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          overflow: 'hidden',
        }}>
          <span style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-primary)',
          }}>
            <Package size={24} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 2px', fontSize: 'calc(17px * var(--text-scale))', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
              Got something to give?
            </p>
            <p style={{ margin: 0, fontSize: 'calc(13px * var(--text-scale))', color: 'rgba(17, 17, 16, 0.72)' }}>
              Share with your community in 30 seconds
            </p>
          </div>
          <button style={{
            background: 'var(--ink)', color: '#FFFFFF',
            border: 'none', padding: '9px 14px', borderRadius: 'var(--radius-pill)',
            fontSize: 'calc(13px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.006em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            flexShrink: 0,
          }}>
            Share <ArrowRight size={14} />
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
                  margin: 0, fontSize: 'calc(20px * var(--text-scale))', fontWeight: 600,
                  letterSpacing: '-0.02em', color: 'var(--text-primary)', flex: 1,
                }}>
                  Filter
                </h2>
                <button
                  onClick={() => { setActiveType('all'); setFilterOpen(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-ink)', fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, letterSpacing: '-0.015em' }}
                >
                  Reset
                </button>
              </div>
              <p className="t-label" style={{ margin: '0 0 10px' }}>
                Listing type
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                {LISTING_TYPES.filter(t => t.id !== 'all').map(type => (
                  <button
                    key={type.id}
                    onClick={() => setActiveType(type.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: activeType === type.id ? '#FFFFFF' : 'var(--bg-inset)',
                      border: 'none',
                      boxShadow: `inset 0 0 0 1.5px ${activeType === type.id ? 'var(--ink)' : 'transparent'}`,
                      borderRadius: 14,
                      cursor: 'pointer', fontSize: 'calc(15px * var(--text-scale))', fontWeight: activeType === type.id ? 600 : 500,
                      letterSpacing: '-0.015em', color: 'var(--text-primary)',
                    }}
                  >
                    {type.label}
                    {activeType === type.id && <Check size={18} weight="regular" />}
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
  const hasPhoto = !!photoOf(item);
  return (
    <div style={{ position: 'relative', cursor: 'pointer', padding: '0 16px' }}>
      <div style={{
        height: 360,
        background: 'var(--bg-inset)',
        position: 'relative', overflow: 'hidden',
        borderRadius: 20,
      }}>
        <Photo item={item} />

        {/* Bottom scrim — only over a photo, where white type needs it. */}
        {hasPhoto && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.62) 100%)',
          }} />
        )}

        <span className="t-label" style={{
          position: 'absolute', top: 14, left: 14,
          background: 'rgba(255, 255, 255, 0.86)', color: '#111110',
          WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)',
          borderRadius: 'var(--radius-pill)',
          padding: '5px 10px',
          fontSize: 'calc(10px * var(--text-scale))',
        }}>
          Featured
        </span>

        {/* Save — a frosted disc */}
        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          aria-label={isSaved ? 'Unsave' : 'Save'}
          aria-pressed={isSaved}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.82)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)',
            color: isSaved ? 'var(--accent-rose)' : '#111110',
          }}
        >
          <Heart size={20} fill={isSaved ? 'currentColor' : 'none'} />
        </button>

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '18px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, color: hasPhoto ? '#fff' : 'var(--text-primary)' }}>
              <h3 style={{
                margin: '0 0 4px', fontSize: 'calc(22px * var(--text-scale))', fontWeight: 600,
                letterSpacing: '-0.022em', lineHeight: 1.15,
              }}>
                {item.title}
              </h3>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 'calc(13px * var(--text-scale))',
                opacity: hasPhoto ? 0.85 : 1, color: hasPhoto ? undefined : 'var(--text-secondary)',
              }}>
                <span>{item.user.name.split(' ')[0]}</span>
                <span aria-hidden="true">·</span>
                <MapPin size={14} />
                <span>{item.location}</span>
              </div>
            </div>
            <KindLabel item={item} large />
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{
        padding: '10px 2px 0',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)',
      }}>
        <span style={{ color: item.condition === 'like_new' ? 'var(--brand-ink)' : undefined }}>
          {CONDITION_LABEL[item.condition]}
        </span>
        <span aria-hidden="true">·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={14} /> {item.postedDaysAgo === 0 ? 'today' : `${item.postedDaysAgo}d ago`}
        </span>
        <div style={{ flex: 1 }} />
        {item.responses > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MessageCircle size={14} /> {item.responses} interested
          </span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   GRID CARD — the photo is the card
══════════════════════════════════════════════════ */

function GridItemCard({ item, isSaved, onSave }: { item: MarketplaceItem; isSaved: boolean; onSave: () => void }) {
  return (
    <div style={{ cursor: 'pointer' }} className="press-scale-sm">
      <div style={{
        aspectRatio: '1 / 1.15',
        background: 'var(--bg-inset)',
        position: 'relative',
        borderRadius: 'var(--radius-media)',
        overflow: 'hidden',
        marginBottom: 9,
      }}>
        <Photo item={item} />

        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          aria-label={isSaved ? 'Unsave' : 'Save'}
          aria-pressed={isSaved}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.82)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)',
            color: isSaved ? 'var(--accent-rose)' : '#111110',
          }}
        >
          <Heart size={16} fill={isSaved ? 'currentColor' : 'none'} />
        </button>

        <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
          <KindLabel item={item} />
        </div>
      </div>

      <h3 style={{
        margin: '0 0 2px', fontSize: 'calc(14px * var(--text-scale))', fontWeight: 400,
        color: 'var(--text-primary)', letterSpacing: '-0.012em',
        display: '-webkit-box', WebkitLineClamp: 1,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
        lineHeight: 1.3,
      }}>
        {item.title}
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)' }}>
        <span>{item.user.name.split(' ')[0]}</span>
        <span aria-hidden="true">·</span>
        <span style={{ color: item.condition === 'like_new' ? 'var(--brand-ink)' : undefined }}>
          {CONDITION_LABEL[item.condition]}
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
      display: 'flex', gap: 14, padding: '12px 16px',
      borderBottom: '0.5px solid var(--hairline)',
      cursor: 'pointer',
    }} className="press-scale-sm">
      <div style={{
        width: 96, height: 96, borderRadius: 12,
        background: 'var(--bg-inset)',
        flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <Photo item={item} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <h3 style={{
            margin: 0, fontSize: 'calc(15px * var(--text-scale))', fontWeight: 500,
            color: 'var(--text-primary)', letterSpacing: '-0.015em', flex: 1,
            display: '-webkit-box', WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.title}
          </h3>
          <span style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
          }}>
            {item.listingType !== 'sell' && (
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: tc.dot }} />
            )}
            {priceLabel}
          </span>
        </div>

        <p style={{
          margin: '0 0 6px', fontSize: 'calc(13px * var(--text-scale))',
          color: 'var(--text-secondary)', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.description}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {item.user.name.split(' ')[0]}
          </span>
          <span aria-hidden="true">·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <MapPin size={13} /> {item.location}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={e => { e.stopPropagation(); onSave(); }}
            aria-label={isSaved ? 'Unsave' : 'Save'}
            aria-pressed={isSaved}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: isSaved ? 'var(--accent-rose)' : 'var(--text-muted)',
            }}
          >
            <Heart size={18} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}
