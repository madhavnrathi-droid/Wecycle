'use client';

import { useState } from 'react';
import {
  Search, SlidersHorizontal, Heart, MapPin, MessageCircle,
  Star, ChevronRight, X, Check, ArrowUpDown, Grid3X3, List,
} from 'lucide-react';
import { MARKETPLACE_ITEMS, CATEGORIES, LISTING_TYPES, type MarketplaceItem } from '../lib/mockData';

type ViewMode = 'grid' | 'list';

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

  const filtered = MARKETPLACE_ITEMS.filter(item => {
    if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory) return false;
    if (activeType !== 'all' && item.listingType !== activeType) return false;
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="screen-transition" style={{ paddingBottom: 100 }}>
      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h1 style={{
            margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800,
            letterSpacing: '-0.02em', color: 'var(--text-primary)', flex: 1,
          }}>
            Marketplace
          </h1>

          {/* View toggle */}
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="btn-icon"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            {viewMode === 'grid' ? <List size={16} strokeWidth={2} /> : <Grid3X3 size={16} strokeWidth={2} />}
          </button>

          {/* Filter */}
          <button
            onClick={() => setFilterOpen(true)}
            className="btn-icon"
            style={{
              borderRadius: 'var(--radius-md)',
              background: filterOpen || activeType !== 'all' ? 'var(--accent-lime)' : undefined,
              borderColor: filterOpen || activeType !== 'all' ? 'var(--accent-lime)' : undefined,
              color: filterOpen || activeType !== 'all' ? 'var(--text-on-accent)' : undefined,
            }}
          >
            <SlidersHorizontal size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search
            size={15} strokeWidth={2}
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="search"
            placeholder="Search items…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          paddingBottom: 2, scrollbarWidth: 'none',
        }}>
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
        padding: '0 16px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {LISTING_TYPES.map(type => (
          <button
            key={type.id}
            onClick={() => setActiveType(type.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 14px',
              fontSize: 'var(--text-xs)', fontWeight: 700,
              color: activeType === type.id ? 'var(--accent-lime)' : 'var(--text-muted)',
              borderBottom: `2px solid ${activeType === type.id ? 'var(--accent-lime)' : 'transparent'}`,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* ── RESULTS COUNT ── */}
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center' }}>
        <p style={{
          margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, flex: 1,
        }}>
          {filtered.length} items near you
        </p>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
        }}>
          <ArrowUpDown size={12} /> Sort
        </button>
      </div>

      {/* ── ITEMS ── */}
      <div style={{ padding: '0 16px' }}>
        {viewMode === 'grid' ? (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          }}>
            {filtered.map(item => (
              <GridItemCard
                key={item.id}
                item={item}
                isSaved={savedItems.has(item.id)}
                onSave={() => toggleSave(item.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              No items match your search
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 4 }}>
              Try adjusting your filters
            </p>
          </div>
        )}
      </div>

      {/* ── SHARE BANNER ── */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--accent-lime-surface), var(--bg-card))',
          border: '1.5px solid var(--accent-lime)30',
          borderRadius: 'var(--radius-xl)',
          padding: '16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 36 }}>📦</div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 2px', fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-primary)' }}>
              Got something to give?
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Share it with your community in 30 seconds
            </p>
          </div>
          <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
            Share
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
                <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary)', flex: 1 }}>
                  Filter
                </h2>
                <button
                  onClick={() => { setActiveType('all'); setFilterOpen(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                >
                  Reset
                </button>
              </div>

              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Listing Type
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                {LISTING_TYPES.filter(t => t.id !== 'all').map(type => (
                  <button
                    key={type.id}
                    onClick={() => setActiveType(type.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: activeType === type.id ? 'var(--accent-lime-surface)' : 'var(--bg-inset)',
                      border: `1.5px solid ${activeType === type.id ? 'var(--accent-lime)40' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
                      color: activeType === type.id ? 'var(--accent-lime-dim)' : 'var(--text-primary)',
                    }}
                  >
                    {type.label}
                    {activeType === type.id && <Check size={16} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setFilterOpen(false)}
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                Show {filtered.length} Results
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── GRID CARD ── */

const TYPE_CONFIG = {
  free: { label: 'Free', bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  borrow: { label: 'Borrow', bg: 'rgba(108,99,255,0.15)', color: '#8B85FF' },
  swap: { label: 'Swap', bg: 'rgba(61,214,245,0.15)', color: '#3DD6F5' },
  sell: { label: '', bg: 'rgba(255,154,64,0.15)', color: '#FF9A40' },
};

function GridItemCard({ item, isSaved, onSave }: { item: MarketplaceItem; isSaved: boolean; onSave: () => void }) {
  const tc = TYPE_CONFIG[item.listingType];
  const typeLabel = item.listingType === 'sell' ? `₹${item.price}` : tc.label;

  return (
    <div
      className="card"
      style={{ overflow: 'hidden', cursor: 'pointer' }}
    >
      {/* Photo */}
      <div style={{
        height: 110, background: item.photoColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40, position: 'relative',
      }}>
        {item.photoIcon}
        {/* Save button */}
        <button
          onClick={e => { e.stopPropagation(); onSave(); }}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(0,0,0,0.35)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: isSaved ? 'var(--accent-rose)' : '#fff',
          }}
        >
          <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
        {/* Type badge */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: tc.bg, color: tc.color,
          fontSize: 10, fontWeight: 700,
          padding: '3px 7px', borderRadius: 'var(--radius-pill)',
        }}>
          {typeLabel}
        </div>
      </div>

      <div style={{ padding: '10px' }}>
        <h3 style={{
          margin: '0 0 2px', fontSize: 'var(--text-xs)', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.01em',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          lineHeight: 1.3,
        }}>
          {item.title}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <div
            style={{
              width: 16, height: 16, borderRadius: '50%',
              background: item.user.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}
          >
            {item.user.initials[0]}
          </div>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.user.name.split(' ')[0]}
          </p>
          {item.responses > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-muted)' }}>
              <MessageCircle size={10} /> {item.responses}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── LIST CARD ── */

function ListItemCard({ item, isSaved, onSave }: { item: MarketplaceItem; isSaved: boolean; onSave: () => void }) {
  const tc = TYPE_CONFIG[item.listingType];
  const typeLabel = item.listingType === 'sell' ? `₹${item.price}` : tc.label;

  return (
    <div className="card" style={{ padding: '12px', display: 'flex', gap: 12, cursor: 'pointer' }}>
      {/* Photo */}
      <div style={{
        width: 72, height: 72, borderRadius: 'var(--radius-md)',
        background: item.photoColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 30, flexShrink: 0,
        position: 'relative',
      }}>
        {item.photoIcon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{
            margin: '0 0 2px', fontSize: 'var(--text-sm)', fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.01em', flex: 1,
            display: '-webkit-box', WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.title}
          </h3>
          <span style={{
            background: tc.bg, color: tc.color,
            fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 'var(--radius-pill)', flexShrink: 0,
          }}>
            {typeLabel}
          </span>
        </div>

        <p style={{
          margin: '0 0 6px', fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)', lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.description}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: item.user.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 800, color: '#fff',
            }}>
              {item.user.initials[0]}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {item.user.name.split(' ')[0]}
            </span>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
            <MapPin size={10} /> {item.location}
          </span>
          {item.responses > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
              <MessageCircle size={10} /> {item.responses}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={e => { e.stopPropagation(); onSave(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: isSaved ? 'var(--accent-rose)' : 'var(--text-muted)',
          }}>
            <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}
