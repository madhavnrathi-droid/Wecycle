'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, MapPin, Heart, Share2, Mail, MessageCircle, IndianRupee } from 'lucide-react';
import type { MarketplaceItem, User } from '../lib/mockData';
import { getItemPhotos, getAvatar } from '../lib/photos';
import PhotoCarousel from './PhotoCarousel';
import OnlineBadge from './OnlineBadge';
import CommentsSection from './CommentsSection';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useAuth } from '../lib/AuthContext';
import { buildContactLinks, itemAction, actionLabel, type ContactLink } from '../lib/contactUser';

interface ItemDetailScreenProps {
  item: MarketplaceItem;
  onBack: () => void;
  /** Invoked when an unauthenticated viewer tries to contact the owner. */
  onRequireAuth: () => void;
  /** Optional: tap an avatar/owner name to open their storefront. */
  onOpenStorefront?: (user: User) => void;
}

/* WhatsApp logo glyph — lucide doesn't ship a brand icon, so we inline a minimal one.
   Stroke matches the other action buttons. */
function WhatsAppGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export default function ItemDetailScreen({ item, onBack, onRequireAuth, onOpenStorefront }: ItemDetailScreenProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const photos = getItemPhotos(item.id, item.category);
  const isPriced = item.listingType === 'sell';
  const priceLabel = isPriced ? `₹${item.price}` : item.listingType === 'free' ? 'Free' : item.listingType[0].toUpperCase() + item.listingType.slice(1);
  const desc = item.description ?? '';
  const shouldClamp = desc.length > 140;
  const { isDesktop } = useBreakpoint();
  const { user, profile } = useAuth();

  /* Resolve contact channels the owner has accepted. We compute these
     unconditionally so logged-out viewers see the right *number* of buttons
     (just blurred behind an auth prompt); only the actual link is gated. */
  const contactLinks: ContactLink[] = useMemo(() => buildContactLinks({
    owner: {
      name:    item.user.name,
      email:   item.user.email,
      phone:   item.user.phone,
      contact: item.user.contact,
    },
    action: itemAction(item),
    item,
    viewerName: profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined,
  }), [item, profile, user]);

  const primaryActionLabel = actionLabel(itemAction(item));

  const handleContactClick = (link: ContactLink) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    /* In-place navigation — opens the OS mail/WhatsApp handler reliably on
       iOS and Android, and a new tab on desktop browsers. */
    if (link.channel === 'whatsapp') {
      /* Always open WhatsApp in a new tab so we don't lose context. */
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link.href;
    }
  };

  /* Convenience: when only one channel is on, the primary CTA carries the
     action label ("Request to borrow"). When both, we surface two named
     buttons ("Email Aditya" + "WhatsApp Aditya") side by side. */
  const hasBoth = contactLinks.length >= 2;

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
        onRequireAuth={onRequireAuth}
        onOpenStorefront={onOpenStorefront}
        contactLinks={contactLinks}
        primaryActionLabel={primaryActionLabel}
        handleContactClick={handleContactClick}
        hasBoth={hasBoth}
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
          {/* Tappable owner row → storefront. Wrapped as a button for keyboard a11y. */}
          {onOpenStorefront && (
            <button
              type="button"
              onClick={() => onOpenStorefront(item.user)}
              aria-label={`View ${item.user.name}'s profile`}
              className="theme-toggle"
              style={{ marginRight: -4 }}
            >
              <MessageCircle size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </section>

      {/* ── COMMENTS (mobile) ── */}
      <section style={{ padding: '20px 20px 0' }}>
        <CommentsSection postId={item.id} onRequireAuth={onRequireAuth} />
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
          {/* When the owner accepts both email + WhatsApp we surface two
              clearly-labelled buttons. When only one channel is on, the single
              CTA carries the action verb ("Request to borrow"). */}
          {hasBoth ? (
            contactLinks.map(link => (
              <button
                key={link.channel}
                onClick={() => handleContactClick(link)}
                aria-label={link.ariaLabel}
                style={{
                  flex: 1, height: 52, borderRadius: 999,
                  background: link.channel === 'whatsapp' ? '#25D366' : 'var(--text-primary)',
                  color: link.channel === 'whatsapp' ? '#0B141A' : 'var(--bg-base)',
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  letterSpacing: '-0.01em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {link.channel === 'whatsapp' ? <WhatsAppGlyph size={15} /> : <Mail size={15} strokeWidth={2} />}
                {link.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
              </button>
            ))
          ) : (
            <button
              onClick={() => contactLinks[0] && handleContactClick(contactLinks[0])}
              disabled={contactLinks.length === 0}
              aria-label={contactLinks[0]?.ariaLabel ?? primaryActionLabel}
              style={{
                flex: 1, height: 52, borderRadius: 999,
                background: contactLinks[0]?.channel === 'whatsapp' ? '#25D366' : 'var(--text-primary)',
                color: contactLinks[0]?.channel === 'whatsapp' ? '#0B141A' : 'var(--bg-base)',
                border: 'none', cursor: contactLinks.length ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 600,
                letterSpacing: '-0.01em',
                opacity: contactLinks.length ? 1 : 0.6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {contactLinks[0]?.channel === 'whatsapp' && <WhatsAppGlyph size={15} />}
              {primaryActionLabel}
            </button>
          )}
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
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
  contactLinks: ContactLink[];
  primaryActionLabel: string;
  handleContactClick: (link: ContactLink) => void;
  hasBoth: boolean;
}

function DesktopLayout({
  item, photos, saved, setSaved, expanded, setExpanded,
  shouldClamp, desc, isPriced, priceLabel, onBack, onRequireAuth, onOpenStorefront,
  contactLinks, primaryActionLabel, handleContactClick, hasBoth,
}: DesktopLayoutProps) {
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

          {/* Owner card — tappable to open the storefront */}
          <button
            type="button"
            onClick={() => onOpenStorefront?.(item.user)}
            aria-label={`View ${item.user.name}'s profile`}
            style={{
              all: 'unset', cursor: onOpenStorefront ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 14,
            }}
          >
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
          </button>

          {/* Action buttons — inline on desktop, no fixed bar.
              When both channels are accepted we show two named buttons.
              When only one, the single CTA carries the action verb. */}
          <div style={{
            display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap',
          }}>
            {hasBoth ? (
              contactLinks.map(link => (
                <button
                  key={link.channel}
                  onClick={() => handleContactClick(link)}
                  aria-label={link.ariaLabel}
                  style={{
                    flex: '1 1 220px', minWidth: 0, height: 52, borderRadius: 14,
                    background: link.channel === 'whatsapp' ? '#25D366' : 'var(--text-primary)',
                    color: link.channel === 'whatsapp' ? '#0B141A' : 'var(--bg-base)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 15, fontWeight: 600,
                    letterSpacing: '-0.01em',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {link.channel === 'whatsapp' ? <WhatsAppGlyph size={16} /> : <Mail size={16} strokeWidth={2} />}
                  {link.channel === 'whatsapp' ? `WhatsApp ${item.user.name.split(' ')[0]}` : `Email ${item.user.name.split(' ')[0]}`}
                </button>
              ))
            ) : (
              <button
                onClick={() => contactLinks[0] && handleContactClick(contactLinks[0])}
                disabled={contactLinks.length === 0}
                aria-label={contactLinks[0]?.ariaLabel ?? primaryActionLabel}
                style={{
                  flex: 1, height: 52, borderRadius: 14,
                  background: contactLinks[0]?.channel === 'whatsapp' ? '#25D366' : 'var(--text-primary)',
                  color: contactLinks[0]?.channel === 'whatsapp' ? '#0B141A' : 'var(--bg-base)',
                  border: 'none', cursor: contactLinks.length ? 'pointer' : 'not-allowed',
                  fontSize: 15, fontWeight: 600,
                  letterSpacing: '-0.01em',
                  opacity: contactLinks.length ? 1 : 0.6,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {contactLinks[0]?.channel === 'whatsapp'
                  ? <WhatsAppGlyph size={16} />
                  : <MessageCircle size={16} strokeWidth={2} />}
                {primaryActionLabel}
              </button>
            )}
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

          {/* Comments thread — full width below the right column on desktop */}
          <div style={{ marginTop: 8 }}>
            <CommentsSection postId={item.id} onRequireAuth={onRequireAuth} />
          </div>
        </div>
      </div>
    </div>
  );
}
