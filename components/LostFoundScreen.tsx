'use client';

import { useState } from 'react';
import {
  AlertCircle, CheckCircle, MapPin, MessageCircle, Plus,
  Search,
} from 'lucide-react';
import { LOST_FOUND_ITEMS, type LostItem } from '../lib/mockData';

interface LostFoundScreenProps {
  onReport: (defaultStatus?: 'lost' | 'found') => void;
}

export default function LostFoundScreen({ onReport }: LostFoundScreenProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [query, setQuery] = useState('');

  const filtered = LOST_FOUND_ITEMS.filter(item => {
    if (activeFilter !== 'all' && item.status !== activeFilter) return false;
    if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const lostCount = LOST_FOUND_ITEMS.filter(i => i.status === 'lost').length;
  const foundCount = LOST_FOUND_ITEMS.filter(i => i.status === 'found').length;

  return (
    <div className="screen-transition" style={{ paddingBottom: 100, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER (mobile) ── */}
      <header className="mobile-only-nav" style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: 0, fontSize: 20, fontWeight: 700,
              letterSpacing: '-0.025em', color: 'var(--text-primary)',
            }}>
              Lost &amp; Found
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Help reunite items with their owners
            </p>
          </div>
          <button
            onClick={() => onReport()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--accent-lime)', color: '#0C0C0B',
              border: 'none', padding: '9px 14px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Report
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={14} strokeWidth={2} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search lost or found items…"
            className="form-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 34 }}
            aria-label="Search lost and found items"
          />
        </div>
      </header>

      {/* ── STATS PAIR ── */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        padding: '18px 18px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <button
          onClick={() => setActiveFilter('lost')}
          aria-pressed={activeFilter === 'lost'}
          style={{
            paddingRight: 14, borderRight: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            color: 'inherit',
          }}
        >
          <AlertCircle size={22} strokeWidth={2} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
          <div>
            <p style={{
              margin: 0, fontSize: 22, fontWeight: 700,
              letterSpacing: '-0.025em', color: 'var(--text-primary)',
              lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
            }}>
              {lostCount}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Lost items
            </p>
          </div>
        </button>
        <button
          onClick={() => setActiveFilter('found')}
          aria-pressed={activeFilter === 'found'}
          style={{
            paddingLeft: 14,
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            color: 'inherit',
          }}
        >
          <CheckCircle size={22} strokeWidth={2} style={{ color: 'var(--accent-lime-dim)', flexShrink: 0 }} />
          <div>
            <p style={{
              margin: 0, fontSize: 22, fontWeight: 700,
              letterSpacing: '-0.025em', color: 'var(--text-primary)',
              lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
            }}>
              {foundCount}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Found items
            </p>
          </div>
        </button>
      </section>

      {/* ── FILTER CHIPS ── */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 6 }}>
        {(['all', 'lost', 'found'] as const).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
            aria-pressed={activeFilter === f}
          >
            {f === 'all' ? 'All' : f === 'lost' ? '😟 Lost' : '🎉 Found'}
          </button>
        ))}
      </div>

      {/* ── ITEMS ── */}
      <div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              No items match
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Try a different filter or report a new item
            </p>
          </div>
        ) : (
          filtered.map(item => (
            <LostFoundRow key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function LostFoundRow({ item }: { item: LostItem }) {
  const isLost = item.status === 'lost';
  const accent = isLost ? 'var(--accent-rose)' : 'var(--accent-lime-dim)';

  return (
    <article style={{
      padding: '16px 16px',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 14,
          background: item.photoColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, flexShrink: 0, position: 'relative',
        }}>
          {item.photoIcon}
          {item.verified && (
            <div style={{
              position: 'absolute', bottom: -3, right: -3,
              width: 18, height: 18, borderRadius: '50%',
              background: '#22C55E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2.5px solid var(--bg-base)',
            }} aria-label="Verified">
              <CheckCircle size={9} strokeWidth={3} style={{ color: '#fff' }} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <h3 style={{
              margin: 0, fontSize: 14, fontWeight: 700,
              color: 'var(--text-primary)', flex: 1, lineHeight: 1.25, letterSpacing: '-0.01em',
            }}>
              {item.title}
            </h3>
            <span style={{
              background: isLost ? 'rgba(237,46,80,0.12)' : 'rgba(168,221,0,0.18)',
              color: accent,
              fontSize: 10, fontWeight: 600,
              padding: '3px 9px', borderRadius: 999, flexShrink: 0,
              letterSpacing: '-0.01em',
            }}>
              {isLost ? 'Lost' : 'Found'}
            </span>
          </div>
          <p style={{
            margin: '0 0 8px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.description}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={11} strokeWidth={1.8} /> {item.lastSeen}
            </span>
            <span aria-hidden="true">·</span>
            <span>{item.user.name.split(' ')[0]} · {item.timeAgo}</span>
            {item.reward && (
              <>
                <span aria-hidden="true">·</span>
                <span style={{
                  background: 'rgba(245,132,0,0.14)', color: 'var(--accent-amber)',
                  padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                }}>
                  Reward · {item.reward}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          style={{
            flex: 1, background: 'var(--text-primary)', color: 'var(--bg-base)',
            border: 'none', borderRadius: 999,
            padding: '10px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            letterSpacing: '-0.01em',
          }}
        >
          {isLost ? 'I found this' : "It's mine"}
        </button>
        <button
          aria-label="Message reporter"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)', borderRadius: 999,
            padding: '10px 14px',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MessageCircle size={15} strokeWidth={1.8} />
        </button>
      </div>
    </article>
  );
}
