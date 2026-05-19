'use client';

import { useState } from 'react';
import { ChevronLeft, MapPin, Heart, Share2, MessageCircle, IndianRupee } from 'lucide-react';
import type { MarketplaceItem } from '../lib/mockData';
import { getItemPhotos, getAvatar } from '../lib/photos';
import PhotoCarousel from './PhotoCarousel';
import OnlineBadge from './OnlineBadge';
import { useBreakpoint } from '../lib/useBreakpoint';

interface ItemDetailScreenProps {
  item: MarketplaceItem;
  onBack: () => void;
  onContact: () => void;
}

export default function ItemDetailScreen({ item, onBack, onContact }: ItemDetailScreenProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const photos = getItemPhotos(item.id, item.category);
  const isPriced = item.listingType === 'sell';
  const priceLabel = isPriced ? `₹${item.price}` : item.listingType === 'free' ? 'Free' : item.listingType[0].toUpperCase() + item.listingType.slice(1);
  const desc = item.description ?? '';
  const shouldClamp = desc.length > 140;
  const { isDesktop } = useBreakpoint();

  /* Desktop (≥1024px) gets an Amazon-style 2-column layout:
     photos on the left, title + meta + actions on the right.
     Mobile keeps the original stacked flow with the fixed bottom action bar. */
  if (isDesktop) {
    return (
      <DesktopLayout
        item={item}
        photos={photos}
        saved={saved}
        setSaved={setSaved}
        expanded={expanded}
        setExpanded={setExpanded}
        shouldClamp={shouldClamp}
        desc={desc}
        isPriced={isPriced}
        priceLabel={priceLabel}
        onBack={onBack}
        onContact={onContact}
      />
    );
  }

  return (
    <div className="screen-transition" style={{ paddingBottom: 120, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER (mobile back) ── */}
      <header
        className="mobile-only-nav"
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="theme-toggle"
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <span style={{
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>
          {item.category}
        </span>
        <button
          onClick={() => setSaved(s => !s)}
          aria-label={saved ? 'Unsave' : 'Save'}
          aria-pressed={saved}
          className="theme-toggle"
        >
          <Heart size={18} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} color={saved ? '#ED2E50' : undefined} />
        </button>
      </header>

      {/* ── PHOTO CAROUSEL ── */}
      <section style={{ padding: '12px 16px 0' }}>
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 5',
          borderRadius: 24,
          overflow: 'hidden',
          background: 'var(--bg-inset)',
        }}>
          <PhotoCarousel
            photos={photos}
            aspectRatio="4 / 5"
            dotsPosition="bottom"
            radius={24}
          />
        </div>
      </section>

      {/* ── TITLE + META ── */}
      <section style={{ padding: '20px 20px 0' }}>
        <h1 style={{
          margin: 0,
          fontSize: 22, fontWeight: 600,
          letterSpacing: '-0.025em',
          color: 'var(--text-primary)',
          lineHeight: 1.2,
        }}>
          {item.title}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
            <MapPin size={14} strokeWidth={1.8} />
            <span>{item.location}</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 14, fontWeight: 600,
            color: isPriced ? 'var(--accent-amber)' : '#16A34A',
            background: isPriced ? 'rgba(245,132,0,0.10)' : 'rgba(34,197,94,0.10)',
            padding: '5px 12px',
            borderRadius: 999,
          }}>
            {isPriced && <IndianRupee size={12} strokeWidth={2.2} />}
            <span>{isPriced ? item.price : priceLabel}</span>
          </div>
        </div>
      </section>

      {/* ── DESCRIPTION ── */}
      <section style={{ padding: '20px 20px 0' }}>
        <p style={{
          margin: 0,
          fontSize: 14,
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          display: shouldClamp && !expanded ? '-webkit-box' : 'block',
          WebkitLineClamp: shouldClamp && !expanded ? 4 : undefined,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {desc}
        </p>
        {shouldClamp && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              marginTop: 6,
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </section>

      {/* ── OWNER ── */}
      <section style={{ padding: '20px 20px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            overflow: 'hidden',
            background: item.user.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 600, fontSize: 13,
            flexShrink: 0,
          }}>
            <img
              src={getAvatar(item.user.id)}
              alt=""
              width={40}
              height={40}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <p style={{
              margin: 0, display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.user.name}
              </span>
              <OnlineBadge isOnline={item.user.isOnline} />
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {item.user.role}
            </p>
          </div>
          <button
            onClick={onContact}
            aria-label="Message owner"
            className="theme-toggle"
            style={{ marginRight: -4 }}
          >
            <MessageCircle size={16} strokeWidth={1.8} />
          </button>
        </div>
      </section>

      {/* ── ACTION BAR ── */}
      <section style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to bottom, transparent, var(--bg-base) 40%, var(--bg-base) 100%)',
      }}>
        <div style={{
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={() => setSaved(s => !s)}
            aria-label={saved ? 'Saved' : 'Save'}
            aria-pressed={saved}
            style={{
              width: 52, height: 52, borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: saved ? '#ED2E50' : 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Heart size={18} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
          </button>
          <button
            aria-label="Share"
            style={{
              width: 52, height: 52, borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Share2 size={18} strokeWidth={1.8} />
          </button>
          <button
            onClick={onContact}
            style={{
              flex: 1, height: 52, borderRadius: 999,
              background: 'var(--text-primary)',
              color: 'var(--bg-base)',
              border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {item.listingType === 'free' ? "I'll take it" :
             item.listingType === 'borrow' ? 'Request to borrow' :
             item.listingType === 'swap' ? 'Offer a swap' :
             'Contact seller'}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ── DESKTOP LAYOUT (≥1024px) ──
   Photos column (sticky) on the left, info + actions on the right —
   matches the mental model people built browsing Amazon / Etsy. */

interface DesktopLayoutProps {
  item: MarketplaceItem;
  photos: string[];
  saved: boolean;
  setSaved: (v: boolean | ((prev: boolean) => boolean)) => void;
  expanded: boolean;
  setExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  shouldClamp: boolean;
  desc: string;
  isPriced: boolean;
  priceLabel: string;
  onBack: () => void;
  onContact: () => void;
}

function DesktopLayout({
  item, photos, saved, setSaved, expanded, setExpanded,
  shouldClamp, desc, isPriced, priceLabel, onBack, onContact,
}: DesktopLayoutProps) {
  const actionLabel =
    item.listingType === 'free'   ? "I'll take it" :
    item.listingType === 'borrow' ? 'Request to borrow' :
    item.listingType === 'swap'   ? 'Offer a swap' :
                                    'Contact seller';
  return (
    <div className="screen-transition" style={{ background: 'var(--bg-base)', minHeight: '100%' }}>
      {/* Slim top bar with back button */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Marketplace
          <span style={{ margin: '0 6px', opacity: 0.5 }}>›</span>
          <span style={{ color: 'var(--text-secondary)' }}>{item.category}</span>
        </span>
      </header>

      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '28px 32px 48px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)',
        gap: 48,
        alignItems: 'start',
      }}>
        {/* ── LEFT: Photo carousel (sticky so it stays visible while reading) ── */}
        <div style={{
          position: 'sticky',
          top: 76,
          alignSelf: 'start',
        }}>
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            aspectRatio: '4 / 5',
            borderRadius: 20,
            overflow: 'hidden',
            background: 'var(--bg-inset)',
          }}>
            <PhotoCarousel
              photos={photos}
              aspectRatio="4 / 5"
              dotsPosition="bottom"
              radius={20}
            />
          </div>

          {/* Thumbnails strip below — quick jump for many photos */}
          {photos.length > 1 && (
            <div style={{
              display: 'flex', gap: 8, marginTop: 12,
              maxWidth: 560, margin: '12px auto 0',
              flexWrap: 'wrap',
            }}>
              {photos.map((p, i) => (
                <div key={i} style={{
                  width: 64, height: 80,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Title, price, description, owner, actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

          <div style={{
            display: 'inline-flex', alignSelf: 'flex-start',
            padding: '4px 10px',
            background: 'var(--bg-inset)', borderRadius: 999,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
            color: 'var(--text-secondary)',
          }}>
            {item.category}
          </div>

          <h1 style={{
            margin: 0,
            fontSize: 30, fontWeight: 600,
            letterSpacing: '-0.025em',
            color: 'var(--text-primary)',
            lineHeight: 1.18,
          }}>
            {item.title}
          </h1>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 14 }}>
              <MapPin size={14} strokeWidth={1.8} />
              <span>{item.location}</span>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 18, fontWeight: 700,
              color: isPriced ? 'var(--accent-amber)' : '#16A34A',
              background: isPriced ? 'rgba(245,132,0,0.10)' : 'rgba(34,197,94,0.10)',
              padding: '6px 14px',
              borderRadius: 999,
              letterSpacing: '-0.01em',
            }}>
              {isPriced && <IndianRupee size={14} strokeWidth={2.2} />}
              <span>{isPriced ? item.price : priceLabel}</span>
            </div>
          </div>

          {desc && (
            <div>
              <h2 style={{
                margin: '0 0 8px',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-secondary)',
              }}>About this item</h2>
              <p style={{
                margin: 0,
                fontSize: 15,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                display: shouldClamp && !expanded ? '-webkit-box' : 'block',
                WebkitLineClamp: shouldClamp && !expanded ? 5 : undefined,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{desc}</p>
              {shouldClamp && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  style={{
                    marginTop: 6,
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          {/* Owner card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              overflow: 'hidden',
              background: item.user.color,
              flexShrink: 0,
            }}>
              <img
                src={getAvatar(item.user.id)}
                alt=""
                width={44} height={44}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <p style={{
                margin: 0, display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.user.name}
                </span>
                <OnlineBadge isOnline={item.user.isOnline} />
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                {item.user.role}
              </p>
            </div>
          </div>

          {/* Action buttons — inline on desktop, no fixed bar */}
          <div style={{
            display: 'flex', gap: 10, marginTop: 4,
          }}>
            <button
              onClick={onContact}
              style={{
                flex: 1, height: 52, borderRadius: 14,
                background: 'var(--text-primary)',
                color: 'var(--bg-base)',
                border: 'none', cursor: 'pointer',
                fontSize: 15, fontWeight: 600,
                letterSpacing: '-0.01em',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <MessageCircle size={16} strokeWidth={2} />
              {actionLabel}
            </button>
            <button
              onClick={() => setSaved(s => !s)}
              aria-label={saved ? 'Saved' : 'Save'}
              aria-pressed={saved}
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: saved ? '#ED2E50' : 'var(--text-secondary)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Heart size={18} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
            </button>
            <button
              aria-label="Share"
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Share2 size={18} strokeWidth={1.8} />
            </button>
          </div>

          {/* Trust strip */}
          <ul style={{
            margin: '6px 0 0', padding: 0, listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}>
            {[
              { title: 'Pickup in person', sub: 'Verified pickup point' },
              { title: 'Community-vetted', sub: 'Posted by a member' },
              { title: 'No platform fee',  sub: 'Wecycle stays free' },
            ].map(b => (
              <li key={b.title} style={{
                padding: '12px 14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{b.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.sub}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
