'use client';

/* Lost & Found — restyled to mirror the Marketplace surface.
 *
 *   - Same sticky top bar pattern (logo / menu / avatar slot)
 *   - Same chip-row filters underneath (All / Lost / Found)
 *   - Same masonry grid of image-first cards
 *   - Custom buttons per-card: "I found this" (lost), "It's mine" (found),
 *     and a contact action that routes through the email/WhatsApp helper.
 *
 * Cards are clickable and open a lightweight detail sheet. Contact actions
 * gate behind auth via the shared onRequireAuth + onOpenStorefront props. */

import { useEffect, useMemo, useState } from 'react';
import {
  Menu, Search, Plus, MapPin, AlertCircle, CheckCircle,
  Mail, X,
} from 'lucide-react';
import { LOST_FOUND_ITEMS, type LostItem, type User } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import { fetchLostFound, onPostsChanged } from '../lib/liveData';
import EmptyState from './EmptyState';
import { useAuth } from '../lib/AuthContext';
import { buildContactLinks, type ContactLink } from '../lib/contactUser';
import { getAvatar, getLostFoundPhoto } from '../lib/photos';
import OnlineBadge from './OnlineBadge';

interface LostFoundScreenProps {
  onReport: (defaultStatus?: 'lost' | 'found') => void;
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
}

type StatusFilter = 'all' | 'lost' | 'found';

function WhatsAppGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export default function LostFoundScreen({
  onReport, onOpenMenu, onOpenAccount, onRequireAuth, onOpenStorefront,
}: LostFoundScreenProps) {
  const { user, profile } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [openItem, setOpenItem] = useState<LostItem | null>(null);

  /* In production the L&F pool starts empty and grows as people report
     things. Demo mode keeps the seeded items so screenshots stay full. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [liveItems, setLiveItems] = useState<LostItem[]>([]);
  useEffect(() => {
    if (!mounted || isDemoMode() || !hasSupabaseEnv) return;
    let cancelled = false;
    const load = () => { fetchLostFound().then(rows => { if (!cancelled) setLiveItems(rows); }); };
    load();
    const off = onPostsChanged(load);
    return () => { cancelled = true; off(); };
  }, [mounted]);

  const allItems: LostItem[] = useMemo(
    () => (mounted && isDemoMode() ? LOST_FOUND_ITEMS : liveItems),
    [mounted, liveItems],
  );

  const filtered = useMemo(() => {
    return allItems.filter(it => {
      if (filter !== 'all' && it.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${it.title} ${it.description} ${it.lastSeen}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allItems, filter, query]);

  const counts = useMemo(() => ({
    lost:  allItems.filter(i => i.status === 'lost').length,
    found: allItems.filter(i => i.status === 'found').length,
  }), [allItems]);

  return (
    <div className="screen-transition" style={{ paddingBottom: 120, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── TOP BAR ── */}
      <header
        className="mobile-only-nav"
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '14px 16px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="theme-toggle"
            style={{ width: 38, height: 38 }}
          >
            <Menu size={18} strokeWidth={1.8} />
          </button>
          <h1 style={{
            margin: 0, flex: 1, textAlign: 'center',
            fontSize: 15, fontWeight: 600,
            letterSpacing: '-0.01em', color: 'var(--text-primary)',
          }}>
            Lost &amp; Found
          </h1>
          <button
            onClick={onOpenAccount}
            aria-label="Account"
            className="theme-toggle"
            style={{
              width: 38, height: 38, borderRadius: '50%', overflow: 'hidden',
              background: profile?.avatar_color ?? 'var(--bg-inset)',
              padding: 0,
            }}
          >
            {user ? (
              <img
                src={getAvatar(user.id)}
                alt=""
                width={38} height={38}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 14 }}>·</span>
            )}
          </button>
        </div>
      </header>

      {/* ── GREETING + ACTION ── */}
      <section className="feed-greeting-row" style={{ padding: '14px 20px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontSize: 22, fontWeight: 600,
            letterSpacing: '-0.025em', color: 'var(--text-primary)',
          }}>
            Reunite lost things
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {counts.lost} lost · {counts.found} found in your community
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
            placeholder="Search lost or found…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-pill"
            aria-label="Search lost and found"
            style={{ width: '100%' }}
          />
        </div>
      </section>

      {/* Mobile search */}
      <section className="mobile-only" style={{ padding: '0 16px 12px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} strokeWidth={1.8} style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search lost or found…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-pill"
            aria-label="Search lost and found"
          />
        </div>
      </section>

      {/* ── REPORT BUTTONS (two custom, prominent) ── */}
      <section style={{ padding: '0 16px 14px', display: 'flex', gap: 10 }}>
        <button
          onClick={() => { if (!user) { onRequireAuth(); return; } onReport('lost'); }}
          style={{
            flex: 1, height: 44, borderRadius: 999,
            background: 'rgba(237,46,80,0.10)',
            color: 'var(--accent-rose)',
            border: '1px solid rgba(237,46,80,0.22)',
            cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            letterSpacing: '-0.01em',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <AlertCircle size={14} strokeWidth={2} />
          Report lost
        </button>
        <button
          onClick={() => { if (!user) { onRequireAuth(); return; } onReport('found'); }}
          style={{
            flex: 1, height: 44, borderRadius: 999,
            background: 'rgba(34,197,94,0.10)',
            color: '#16A34A',
            border: '1px solid rgba(34,197,94,0.22)',
            cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            letterSpacing: '-0.01em',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <CheckCircle size={14} strokeWidth={2} />
          Report found
        </button>
      </section>

      {/* ── FILTER CHIPS ── */}
      <section style={{ padding: '0 0 12px' }}>
        <div className="chip-row">
          {([
            { id: 'all',   label: 'All'   },
            { id: 'lost',  label: 'Lost'  },
            { id: 'found', label: 'Found' },
          ] as Array<{ id: StatusFilter; label: string }>).map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`pill ${filter === c.id ? 'pill-active' : ''}`}
              aria-pressed={filter === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── MASONRY GRID ── */}
      <section className="masonry-shell" style={{ padding: '0 8px' }}>
        <div className="masonry-2">
          {filtered.map((item, idx) => (
            <LostFoundCard
              key={item.id}
              item={item}
              variant={(['portrait','square','landscape','tall','portrait'] as const)[idx % 5]}
              onClick={() => setOpenItem(item)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          allItems.length === 0 ? (
            <EmptyState
              icon="🔍"
              prompt="No lost or found items yet — that's a good sign!"
              sub="If something goes missing, posting here can get it back faster than you'd think."
              cta={{
                label: 'Report something',
                onClick: () => { if (!user) { onRequireAuth(); return; } onReport(); },
              }}
            />
          ) : (
            <EmptyState
              icon="🔍"
              prompt="Nothing matches that search."
              sub="Try a different filter or clear the query."
              compact
            />
          )
        )}
      </section>

      {openItem && (
        <LostFoundDetailSheet
          item={openItem}
          onClose={() => setOpenItem(null)}
          onRequireAuth={onRequireAuth}
          onOpenStorefront={onOpenStorefront}
          viewerName={profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined}
        />
      )}
    </div>
  );
}

/* ── Card ──────────────────────────────────────── */

type Variant = 'tall' | 'portrait' | 'square' | 'landscape';
const RATIOS: Record<Variant, string> = {
  tall: '0.72', portrait: '0.82', square: '1.00', landscape: '1.20',
};

function LostFoundCard({
  item, variant, onClick,
}: { item: LostItem; variant: Variant; onClick: () => void }) {
  const isLost = item.status === 'lost';
  const accent = isLost ? 'var(--accent-rose)' : '#16A34A';
  const bg = isLost ? 'rgba(237,46,80,0.10)' : 'rgba(34,197,94,0.10)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="feed-card"
      style={{ aspectRatio: RATIOS[variant], padding: 0 }}
      aria-label={`Open ${item.title}`}
    >
      {/* Real photo hero — same Marketplace card look. The lower gradient is
          baked into .feed-card-overlay so titles stay legible. */}
      <img
        src={getLostFoundPhoto(item.id, item.photoIcon, item.photoUrls)}
        alt=""
        loading="lazy"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      <span style={{
        position: 'absolute', top: 8, left: 8,
        background: bg,
        color: accent,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        borderRadius: 999,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}>
        {item.status}
      </span>
      {item.verified && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(255,255,255,0.92)',
          color: '#16A34A',
          padding: 4, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }} aria-label="Verified">
          <CheckCircle size={12} strokeWidth={2.5} />
        </span>
      )}
      <div className="feed-card-overlay">
        <p className="feed-card-title">{item.title}</p>
        <div className="feed-card-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MapPin size={10} strokeWidth={2} /> {item.lastSeen}
          </span>
          {item.reward && (
            <span className="feed-card-price">
              {item.reward}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── Detail sheet ──────────────────────────────── */

function LostFoundDetailSheet({
  item, onClose, onRequireAuth, onOpenStorefront, viewerName,
}: {
  item: LostItem;
  onClose: () => void;
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
  viewerName?: string;
}) {
  const { user } = useAuth();
  const isLost = item.status === 'lost';
  const accent = isLost ? 'var(--accent-rose)' : '#16A34A';

  /* Build email/WhatsApp links targeted at the reporter. */
  const contactLinks: ContactLink[] = useMemo(() => buildContactLinks({
    owner: {
      name: item.user.name,
      email: item.user.email,
      phone: item.user.phone,
      contact: item.user.contact,
    },
    action: isLost ? 'general' : 'general',
    /* We re-use the item-shaped quote for the body since LostItem has a title */
    item: { title: item.title, category: 'Lost & Found', listingType: 'free' },
    viewerName,
  }), [item, viewerName, isLost]);

  /* No standalone "claim" button anymore — viewers route their claim through
     email or WhatsApp so the reporter can verify identity off-platform. */
  const introLine = isLost
    ? `If you've spotted this, reach out to ${item.user.name.split(' ')[0]} so they can collect it.`
    : `If this is yours, message ${item.user.name.split(' ')[0]} below with a quick detail only you'd know.`;

  const handleContact = (link: ContactLink) => {
    if (!user) { onRequireAuth(); return; }
    if (link.channel === 'whatsapp') {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link.href;
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 100,
        }}
      />
      <div role="dialog" aria-label={item.title} style={{
        position: 'fixed', left: '50%', bottom: 0,
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 520,
        background: 'var(--bg-card)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '14px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
        zIndex: 101,
        maxHeight: '88svh',
        overflowY: 'auto',
      }}>
        <div style={{
          width: 38, height: 4, background: 'var(--border-default)',
          borderRadius: 999, margin: '0 auto 14px',
        }} aria-hidden="true" />

        <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{
            background: isLost ? 'rgba(237,46,80,0.12)' : 'rgba(34,197,94,0.12)',
            color: accent,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 999,
          }}>{item.status}</span>
          <h2 style={{
            margin: 0, fontSize: 18, fontWeight: 600,
            letterSpacing: '-0.025em', color: 'var(--text-primary)',
            flex: 1, minWidth: 0,
          }}>{item.title}</h2>
          <button onClick={onClose} aria-label="Close" className="theme-toggle">
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>

        <div style={{
          aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden',
          background: 'var(--bg-inset)',
          marginBottom: 14,
        }}>
          <img
            src={getLostFoundPhoto(item.id, item.photoIcon, item.photoUrls)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        <p style={{
          margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
        }}>{item.description}</p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14,
          padding: '12px 14px', background: 'var(--bg-inset)', borderRadius: 14,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', overflow: 'hidden',
            background: item.user.color, flexShrink: 0,
          }}>
            <img
              src={getAvatar(item.user.id)}
              alt=""
              width={38} height={38}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenStorefront?.(item.user)}
            style={{
              all: 'unset', cursor: onOpenStorefront ? 'pointer' : 'default',
              flex: 1, minWidth: 0,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
            }}>
              <span>{item.user.name}</span>
              <OnlineBadge isOnline={item.user.isOnline} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <MapPin size={11} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
              {item.lastSeen} · {item.timeAgo}
            </div>
          </button>
          {item.reward && (
            <span style={{
              background: 'rgba(245,132,0,0.14)', color: 'var(--accent-amber)',
              padding: '4px 10px', borderRadius: 999, fontWeight: 600, fontSize: 12,
            }}>
              {item.reward}
            </span>
          )}
        </div>

        {/* Intro line — explains why you're contacting, status-aware. */}
        <p style={{
          margin: '0 0 12px',
          fontSize: 13, lineHeight: 1.5,
          color: 'var(--text-secondary)',
          letterSpacing: '-0.005em',
        }}>
          {introLine}
        </p>

        {/* Just two buttons: Email and WhatsApp. We use a consistent visual
            language (primary dark button for the email path, WhatsApp brand
            green for the messaging path) so the choice is obvious. When the
            reporter only enabled one channel we still show only that one. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(() => {
            /* Sort so email is always shown first when both exist. */
            const ordered = [...contactLinks].sort((a, b) =>
              a.channel === 'email' ? -1 : b.channel === 'email' ? 1 : 0,
            );
            if (ordered.length === 0) {
              return (
                <p style={{
                  margin: 0, padding: 12,
                  background: 'var(--bg-inset)', borderRadius: 12,
                  fontSize: 12, color: 'var(--text-muted)',
                  width: '100%',
                }}>
                  This reporter hasn't enabled any contact channel yet.
                </p>
              );
            }
            return ordered.map(link => {
              const isWa = link.channel === 'whatsapp';
              return (
                <button
                  key={link.channel}
                  onClick={() => handleContact(link)}
                  aria-label={link.ariaLabel}
                  style={{
                    flex: '1 1 160px', minWidth: 0,
                    height: 48, borderRadius: 14,
                    background: isWa ? '#25D366' : 'var(--text-primary)',
                    color: isWa ? '#0B141A' : 'var(--bg-base)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 14, fontWeight: 600,
                    letterSpacing: '-0.01em',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {isWa ? <WhatsAppGlyph size={16} /> : <Mail size={16} strokeWidth={2} />}
                  {isWa ? 'WhatsApp' : 'Email'}
                </button>
              );
            });
          })()}
        </div>
      </div>
    </>
  );
}
