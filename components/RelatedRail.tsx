'use client';

/* Horizontal scrolling rail of related items — the building block for the
 * Amazon/Flipkart-style "More from this seller", "Similar items", "Recently
 * viewed", "Help return these" strips at the bottom of every product page.
 *
 * Design borrowed from:
 *   - Amazon ("Customers who viewed this item also viewed") — title above,
 *     left-pinned, peek of the next card to suggest more content.
 *   - Flipkart ("Sponsored" + "More from Brand X") — small Sponsored chip
 *     on ad slots, native card style (no banner-ad colour change).
 *   - Etsy ("You may also like") — generous gutter between cards, square
 *     aspect ratio, price below title.
 *
 * One generic rail handles all of them. The card variants ("listing"
 * vs "lostfound") swap badge colours + price treatment but reuse the
 * same skeleton so the rail feels homogeneous (the "ad" looks like a
 * sibling, not a banner-style interruption).
 */

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Search } from 'lucide-react';
import { closedLabelFor, type MarketplaceItem, type LostItem } from '../lib/mockData';
import { opportunityCompLabel } from '../lib/opportunity';
import { resolveItemMedia } from '../lib/photos';
import NoPhoto from './NoPhoto';

export type RailCard =
  | { kind: 'listing'; item: MarketplaceItem; onClick: () => void }
  | { kind: 'lostfound'; item: LostItem & { photoUrls?: string[] }; onClick: () => void };

interface RelatedRailProps {
  /** Section title — left-aligned, bold. e.g. "More from Aditya". */
  title: string;
  /** Optional secondary line ("Same student · 8 active listings"). */
  subtitle?: string;
  /** Right-aligned link button. Hidden when undefined. */
  cta?: { label: string; onClick: () => void };
  /** Cards to render. Pass [] to skip rendering the whole rail. */
  cards: RailCard[];
  /** Adds a small "Sponsored" chip next to the title. Used for L&F rails. */
  sponsored?: boolean;
  /** When true, renders a skeleton placeholder. */
  loading?: boolean;
}

const CARD_W = 156;   /* matches the typical e-com thumbnail */
const CARD_GAP = 12;

export default function RelatedRail({
  title, subtitle, cta, cards, sponsored, loading,
}: RelatedRailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* Empty rails skip themselves entirely so the page never shows a "0 items"
     dead slot — per the user spec (no mock content). */
  if (!loading && cards.length === 0) return null;

  const scrollBy = (dx: number) => {
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  return (
    <section
      aria-label={title}
      style={{ padding: '20px 0 4px', borderTop: '1px solid var(--border-default)' }}
    >
      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        padding: '0 16px 12px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontSize: 'calc(16px * var(--text-scale))', fontWeight: 700,
            letterSpacing: '-0.02em', color: 'var(--text-primary)',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            {title}
            {sponsored && (
              <span style={{
                fontSize: 'calc(10px * var(--text-scale))', fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-default)',
                borderRadius: 4, padding: '2px 6px',
                lineHeight: 1,
              }}>
                Sponsored
              </span>
            )}
          </h2>
          {subtitle && (
            <p style={{
              margin: '2px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)',
              letterSpacing: '-0.005em',
            }}>
              {subtitle}
            </p>
          )}
        </div>
        {cta && (
          <button
            onClick={cta.onClick}
            style={{
              all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
              fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500,
              color: 'var(--text-secondary)',
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '4px 4px',
              borderRadius: 6,
            }}
            aria-label={cta.label}
          >
            {cta.label}
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        )}
      </header>

      {/* ── Scroller ── */}
      <div style={{ position: 'relative' }}>
        {/* Desktop scroll buttons. CSS hides them under 768px (touch). */}
        <ScrollNub direction="left" onClick={() => scrollBy(-CARD_W * 3 - CARD_GAP * 3)} />
        <ScrollNub direction="right" onClick={() => scrollBy(CARD_W * 3 + CARD_GAP * 3)} />

        <div
          ref={scrollRef}
          className="rail-scroller"
          style={{
            display: 'flex', gap: CARD_GAP,
            overflowX: 'auto',
            overflowY: 'visible',
            scrollSnapType: 'x proximity',
            padding: '0 16px 16px',
            scrollbarWidth: 'none',           /* Firefox */
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : cards.map((c, i) => (
                c.kind === 'listing'
                  ? <ListingCard key={c.item.id + i} item={c.item} onClick={c.onClick} />
                  : <LostFoundCard key={c.item.id + i} item={c.item} onClick={c.onClick} />
              ))
          }
        </div>
      </div>

      <style jsx>{`
        .rail-scroller::-webkit-scrollbar { display: none; }
        :global(.rail-nub) {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s;
        }
        section:hover :global(.rail-nub) {
          opacity: 1;
          pointer-events: auto;
        }
        @media (max-width: 768px) {
          :global(.rail-nub) { display: none; }
        }
      `}</style>
    </section>
  );
}

/* ── Desktop scroll arrow (fades in on rail hover) ── */
function ScrollNub({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      className="rail-nub"
      onClick={onClick}
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
      style={{
        position: 'absolute', top: '50%',
        [direction]: 8,
        transform: 'translateY(-50%)',
        zIndex: 2,
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {direction === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Card variants
   ══════════════════════════════════════════════════════════════════ */

function CardShell({ children, onClick, ariaLabel }: {
  children: React.ReactNode; onClick: () => void; ariaLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
        flex: `0 0 ${CARD_W}px`,
        width: CARD_W,
        background: 'transparent',
        borderRadius: 14,
        scrollSnapAlign: 'start',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {children}
    </button>
  );
}

function ListingCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  const media = resolveItemMedia(item);
  const photo = media.find(m => typeof m === 'string') as string | undefined
              ?? (typeof media[0] === 'string' ? media[0] as string : undefined);
  const fallbackBg = item.photoColor || '#1C1C1A';
  const priceLabel =
    item.isRequest
      ? 'Request'
      : item.kind === 'opportunity'
        ? opportunityCompLabel(item)
      : item.listingType === 'free'
        ? 'Free'
        : typeof item.price === 'number'
          ? `₹${item.price.toLocaleString('en-IN')}`
          : item.listingType === 'borrow' ? 'Borrow' : item.listingType === 'swap' ? 'Swap' : '';
  const closed = !!item.isClosed;

  return (
    <CardShell onClick={onClick} ariaLabel={`Open ${item.title}`}>
      <div style={{
        position: 'relative',
        width: CARD_W, height: CARD_W,
        borderRadius: 14, overflow: 'hidden',
        background: fallbackBg,
        marginBottom: 8,
        border: '1px solid var(--border-subtle)',
        filter: closed ? 'grayscale(0.6)' : 'none',
      }}>
        {photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : <NoPhoto />}
        {/* Type/status badge */}
        {(item.isRequest || item.listingType === 'free' || item.kind === 'opportunity' || closed) && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            fontSize: 'calc(10px * var(--text-scale))', fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#fff',
            background: closed ? 'rgba(20,20,20,0.7)'
              : item.isRequest ? 'var(--accent-blue, #3B82F6)'
              : item.kind === 'opportunity' ? '#8B5CF6'
              : 'var(--accent-green, #14B86C)',
            padding: '3px 8px',
            borderRadius: 999,
            backdropFilter: 'blur(6px)',
          }}>
            {closed ? closedLabelFor(item)
              : item.isRequest ? 'Request'
              : item.kind === 'opportunity' ? (item.comp === 'volunteer' ? 'Volunteer' : 'Service')
              : 'Free'}
          </span>
        )}
      </div>

      <p style={{
        margin: 0, fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500,
        color: 'var(--text-primary)',
        lineHeight: 1.3,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
        letterSpacing: '-0.005em',
        minHeight: '2.6em',
      }}>
        {item.title}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        {priceLabel && (
          <span style={{
            fontSize: 'calc(13px * var(--text-scale))', fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}>
            {priceLabel}
          </span>
        )}
        {item.location && !item.isRequest && (
          <span style={{
            fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0,
          }}>
            · {item.location}
          </span>
        )}
      </div>
    </CardShell>
  );
}

function LostFoundCard({ item, onClick }: { item: LostItem & { photoUrls?: string[] }; onClick: () => void }) {
  const photo = item.photoUrls?.[0];
  const lost = item.status === 'lost';

  return (
    <CardShell onClick={onClick} ariaLabel={`${lost ? 'Lost' : 'Found'}: ${item.title}`}>
      <div style={{
        position: 'relative',
        width: CARD_W, height: CARD_W,
        borderRadius: 14, overflow: 'hidden',
        background: '#1C1C1A',
        marginBottom: 8,
        border: '1px solid var(--border-subtle)',
      }}>
        {photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}>
            <Search size={32} strokeWidth={1.6} />
          </div>
        )}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          fontSize: 'calc(10px * var(--text-scale))', fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: '#fff',
          background: lost ? '#ED2E50' : '#F59E0B',
          padding: '3px 8px',
          borderRadius: 999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>
          {lost ? 'Lost' : 'Found'}
        </span>
      </div>

      <p style={{
        margin: 0, fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500,
        color: 'var(--text-primary)',
        lineHeight: 1.3,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
        letterSpacing: '-0.005em',
        minHeight: '2.6em',
      }}>
        {item.title}
      </p>
      {item.lastSeen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
          fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)',
        }}>
          <MapPin size={11} strokeWidth={1.8} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.lastSeen}
          </span>
        </div>
      )}
    </CardShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Skeleton (used during the initial fetch)
   ══════════════════════════════════════════════════════════════════ */

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        flex: `0 0 ${CARD_W}px`,
        width: CARD_W,
        scrollSnapAlign: 'start',
      }}
    >
      <div
        style={{
          width: CARD_W, height: CARD_W, borderRadius: 14, marginBottom: 8,
          background: 'linear-gradient(110deg, var(--bg-card) 8%, var(--bg-inset) 18%, var(--bg-card) 33%)',
          backgroundSize: '200% 100%',
          animation: 'rail-shimmer 1.4s ease-in-out infinite',
        }}
      />
      <div
        style={{
          height: 11, borderRadius: 4,
          background: 'var(--bg-inset)',
          marginBottom: 6,
        }}
      />
      <div
        style={{
          height: 11, borderRadius: 4, width: '60%',
          background: 'var(--bg-inset)',
        }}
      />
      <style jsx>{`
        @keyframes rail-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
