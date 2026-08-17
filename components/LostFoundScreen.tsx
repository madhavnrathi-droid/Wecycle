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
  Mail, X, Trash2, Save, RotateCcw, Loader2, Camera, ImagePlus, Share2,
} from 'lucide-react';
import { LOST_FOUND_ITEMS, type LostItem, type User } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import { fetchLostFound, onPostsChanged, updateLostFoundMedia } from '../lib/liveData';
import PhotoEditDialog from './PhotoEditDialog';
import EmptyState from './EmptyState';
import ShareCardModal from './ShareCardModal';
import type { ShareCardSpec } from '../lib/shareCard';
import { Logomark } from './Brand';
import { useAuth } from '../lib/AuthContext';
import { useBreakpoint } from '../lib/useBreakpoint';
import { track, trackContactClicked, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import { buildContactLinks, contactGate, type ContactLink } from '../lib/contactUser';
import { useOwnerContact } from '../lib/useOwnerContact';
import { getAvatar, getLostFoundPhoto } from '../lib/photos';
import OnlineBadge from './OnlineBadge';
import { Z_LAYER, zPanel } from '../lib/zLayers';
import { shareUrl } from '../lib/shareUrl';
import { PhotoViewer } from './PhotoCarousel';
import { WA_FILL, WA_INK } from '../lib/whatsapp';

interface LostFoundScreenProps {
  onReport: (defaultStatus?: 'lost' | 'found') => void;
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
  /** When provided, tapping a card delegates open-detail to the parent
   *  (so the same sheet can be triggered from the Inventory screen too).
   *  When undefined, the screen falls back to its internal openItem state. */
  onOpenLF?: (item: LostItem) => void;
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
  onReport, onOpenMenu, onOpenAccount, onRequireAuth, onOpenStorefront, onOpenLF,
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
          /* Opaque. --bg-overlay is 88% alpha, so the feed showed
             through the header as it scrolled past. */
          background: 'var(--bg-card)',
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
              onClick={() => (onOpenLF ? onOpenLF(item) : setOpenItem(item))}
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

export interface LostFoundDetailSheetProps {
  item: LostItem;
  onClose: () => void;
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
  viewerName?: string;
  /** Owner controls — when supplied the sheet renders inline-editable fields
   *  with Save changes / Save & repost / Delete CTAs at the bottom. */
  isOwner?: boolean;
  onSaveChanges?: (patch: LFSavePatch) => Promise<void> | void;
  onSaveAndRepost?: (patch: LFSavePatch) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

export interface LFSavePatch {
  title: string;
  description: string;
  status: 'lost' | 'found';
  lastSeen: string;
  reward: string;
}

export function LostFoundDetailSheet({
  item, onClose, onRequireAuth, onOpenStorefront, viewerName,
  isOwner, onSaveChanges, onSaveAndRepost, onDelete,
}: LostFoundDetailSheetProps) {
  const { user } = useAuth();
  const { isDesktop } = useBreakpoint();
  const isLost = item.status === 'lost';
  /* Owner (reporter) contact resolved on demand — raw columns are locked down. */
  const ownerContact = useOwnerContact(item.user.id, { email: item.user.email, phone: item.user.phone });
  const accent = isLost ? 'var(--accent-rose)' : '#16A34A';

  /* Photo editing — only relevant when isOwner. */
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  /* Full-screen viewer for the detail hero. This sheet renders a bare <img>
     rather than a PhotoCarousel, so it does not inherit the carousel's viewer
     and opens one itself. */
  const [viewerOpen, setViewerOpen] = useState(false);

  /* Share card (Spotify-style). Spec is built lower, after displayPhotoUrl. */
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [localPhotoUrls, setLocalPhotoUrls] = useState<string[] | null>(null);
  const currentPhotoUrls: string[] = (item as { photoUrls?: string[] }).photoUrls ?? [];
  const displayPhotoUrl: string | undefined =
    (localPhotoUrls !== null ? localPhotoUrls[0] : undefined) ??
    getLostFoundPhoto(item.id, item.photoIcon, item.photoUrls);
  const handleSaveLFPhotos = async (photoUrls: string[]) => {
    await updateLostFoundMedia(item.id, photoUrls);
    setLocalPhotoUrls(photoUrls);
  };

  const shareCardSpec: ShareCardSpec = {
    kind: item.status === 'found' ? 'found' : 'lost',
    title: item.title,
    imageUrls: displayPhotoUrl && /^https?:|^\//.test(displayPhotoUrl) ? [displayPhotoUrl] : [],
    location: item.lastSeen,
    reward: item.reward,
    description: item.description,
    byName: item.user.name,
    byInitials: item.user.initials,
    byColor: item.user.color,
    verified: item.verified,
    byEmail: ownerContact.email,
    byPhone: ownerContact.phone,
    url: shareUrl(item.id),
  };
  const handleShareLF = () => {
    track(EVT.share_clicked, { post_id: item.id, post_kind: 'lostfound' });
    setShareCardOpen(true);
  };

  /* Inline-edit state — only meaningful when isOwner. */
  const [eTitle, setETitle] = useState(item.title);
  const [eDescription, setEDescription] = useState(item.description ?? '');
  const [eStatus, setEStatus] = useState<'lost' | 'found'>(
    item.status === 'lost' || item.status === 'found' ? item.status : 'lost',
  );
  const [eLastSeen, setELastSeen] = useState(item.lastSeen ?? '');
  const [eReward, setEReward] = useState(item.reward ?? '');
  useEffect(() => {
    setETitle(item.title);
    setEDescription(item.description ?? '');
    setEStatus(item.status === 'lost' || item.status === 'found' ? item.status : 'lost');
    setELastSeen(item.lastSeen ?? '');
    setEReward(item.reward ?? '');
  }, [item.id, item.title, item.description, item.status, item.lastSeen, item.reward]);

  /* Escape closes the detail sheet — matches the shared Modal so keyboard users
     aren't trapped (the sheet has a Close button but no key handler otherwise). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDirty =
    eTitle !== item.title ||
    eDescription !== (item.description ?? '') ||
    eStatus !== item.status ||
    eLastSeen !== (item.lastSeen ?? '') ||
    eReward !== (item.reward ?? '');

  const [saving, setSaving] = useState<null | 'save' | 'repost'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const buildPatch = (): LFSavePatch => ({
    title: eTitle, description: eDescription,
    status: eStatus, lastSeen: eLastSeen, reward: eReward,
  });
  const runSave = async (kind: 'save' | 'repost') => {
    if (!isDirty || saving) return;
    setSaving(kind);
    setSaveError(null);
    try {
      if (kind === 'save') await onSaveChanges?.(buildPatch());
      else                  await onSaveAndRepost?.(buildPatch());
    } catch (e) {
      setSaveError((e as Error).message ?? 'Could not save');
    } finally {
      setSaving(null);
    }
  };
  const discard = () => {
    setETitle(item.title);
    setEDescription(item.description ?? '');
    setEStatus(item.status === 'lost' || item.status === 'found' ? item.status : 'lost');
    setELastSeen(item.lastSeen ?? '');
    setEReward(item.reward ?? '');
  };

  /* Build email/WhatsApp links targeted at the reporter. */
  const contactLinks: ContactLink[] = useMemo(() => buildContactLinks({
    owner: {
      name: item.user.name,
      email: ownerContact.email,
      phone: ownerContact.phone,
      contact: item.user.contact,
    },
    action: isLost ? 'general' : 'general',
    /* We re-use the item-shaped quote for the body since LostItem has a title */
    item: { title: item.title, category: 'Lost & Found', listingType: 'free' },
    viewerName,
  }), [item, viewerName, isLost, ownerContact.email, ownerContact.phone]);

  /* No standalone "claim" button anymore — viewers route their claim through
     email or WhatsApp so the reporter can verify identity off-platform. */
  const introLine = isLost
    ? `If you've spotted this, reach out to ${item.user.name.split(' ')[0]} so they can collect it.`
    : `If this is yours, message ${item.user.name.split(' ')[0]} below with a quick detail only you'd know.`;

  const handleContact = (link: ContactLink) => {
    if (!user) { onRequireAuth(); return; }
    haptics.medium();
    trackContactClicked(link.channel, 'lostfound', item.id, {
      owner_id: item.user.id,
      lf_status: item.status,
    });
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
          zIndex: Z_LAYER.content,
        }}
      />
      <div role="dialog" aria-label={item.title} style={
        isDesktop ? {
          /* Desktop: centered 2-column modal — image left, content right —
             matching the look of ItemDetailScreen / EventDetailScreen so all
             three detail surfaces feel like the same family. */
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(1080px, 94vw)',
          maxHeight: '90vh',
          background: 'var(--bg-card)',
          borderRadius: 24,
          padding: 0,
          zIndex: zPanel(Z_LAYER.content),
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
        } : {
          /* Mobile: original bottom-sheet behaviour. */
          position: 'fixed', left: '50%', bottom: 0,
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: 520,
          background: 'var(--bg-card)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: '14px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          zIndex: zPanel(Z_LAYER.content),
          maxHeight: '88svh',
          overflowY: 'auto',
        }
      }>
        {/* Desktop: hero image fills the left column. */}
        {isDesktop && (
          <div style={{
            position: 'relative',
            background: 'var(--bg-inset)',
            minHeight: '70vh',
            overflow: 'hidden',
          }}>
            {displayPhotoUrl ? (
              <img
                src={displayPhotoUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: /\.png(\?|$)/i.test(displayPhotoUrl) ? '#fff' : undefined }}
              />
            ) : isOwner ? (
              <button
                type="button"
                onClick={() => setPhotoEditOpen(true)}
                aria-label="Add photo"
                style={{
                  width: '100%', height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                <ImagePlus size={36} strokeWidth={1.4} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>+ Add photo</span>
              </button>
            ) : null}
            {displayPhotoUrl && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: 14, right: 14, zIndex: 6,
                width: 40, height: 40, borderRadius: 999,
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Logomark size={28} alt="" />
              </span>
            )}
            {isOwner && displayPhotoUrl && (
              <button
                type="button"
                onClick={() => setPhotoEditOpen(true)}
                aria-label="Edit photo"
                style={{
                  position: 'absolute', bottom: 12, right: 12,
                  zIndex: 10,
                  width: 36, height: 36, borderRadius: 999,
                  background: 'var(--bg-overlay)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'var(--text-primary)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Camera size={16} strokeWidth={1.8} />
              </button>
            )}
          </div>
        )}

        {/* Right column on desktop / whole sheet on mobile. Owns the scroll. */}
        <div style={{
          padding: isDesktop ? '22px 26px 26px' : 0,
          overflowY: isDesktop ? 'auto' : 'visible',
          maxHeight: isDesktop ? '90vh' : undefined,
          display: 'flex', flexDirection: 'column',
        }}>
        {!isDesktop && (
          <div style={{
            width: 38, height: 4, background: 'var(--border-default)',
            borderRadius: 999, margin: '0 auto 14px',
          }} aria-hidden="true" />
        )}

        <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{
            background: isLost ? 'rgba(237,46,80,0.12)' : 'rgba(34,197,94,0.12)',
            color: accent,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 999,
          }}>{isOwner ? eStatus : item.status}</span>
          {!isOwner && (
            <h2 style={{
              margin: 0, fontSize: isDesktop ? 22 : 18, fontWeight: 600,
              letterSpacing: '-0.025em', color: 'var(--text-primary)',
              flex: 1, minWidth: 0,
            }}>{item.title}</h2>
          )}
          {isOwner && <span style={{ flex: 1 }} />}
          <button onClick={handleShareLF} aria-label="Share" className="theme-toggle">
            <Share2 size={17} strokeWidth={1.8} />
          </button>
          <button onClick={onClose} aria-label="Close" className="theme-toggle">
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>

        {/* Mobile image (desktop renders it in the left column already). */}
        {!isDesktop && (
          <div style={{
            position: 'relative',
            aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden',
            background: 'var(--bg-inset)',
            marginBottom: 14,
          }}>
            {displayPhotoUrl ? (
              <img
                src={displayPhotoUrl}
                alt=""
                  onClick={() => setViewerOpen(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer', background: /\.png(\?|$)/i.test(displayPhotoUrl) ? '#fff' : undefined }}
              />
            ) : isOwner ? (
              <button
                type="button"
                onClick={() => setPhotoEditOpen(true)}
                aria-label="Add photo"
                style={{
                  width: '100%', height: '100%', minHeight: 140,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'none', border: '2px dashed var(--border-default)',
                  borderRadius: 16, cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                <ImagePlus size={28} strokeWidth={1.5} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>+ Add photo</span>
              </button>
            ) : null}
            {displayPhotoUrl && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: 10, right: 10, zIndex: 6,
                width: 36, height: 36, borderRadius: 999,
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Logomark size={25} alt="" />
              </span>
            )}
            {isOwner && displayPhotoUrl && (
              <button
                type="button"
                onClick={() => setPhotoEditOpen(true)}
                aria-label="Edit photo"
                style={{
                  position: 'absolute', bottom: 8, right: 8,
                  zIndex: 5,
                  width: 32, height: 32, borderRadius: 999,
                  background: 'var(--bg-overlay)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'var(--text-primary)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Camera size={14} strokeWidth={1.8} />
              </button>
            )}
          </div>
        )}

        {isOwner ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
            <LFEditField label="Title">
              <input
                value={eTitle}
                onChange={e => setETitle(e.target.value)}
                placeholder="What was lost / found?"
                className="inline-edit inline-edit--h1"
                aria-label="Title"
              />
            </LFEditField>
            <LFEditField label="Status">
              <div className="listing-type-segmented" role="radiogroup" aria-label="Status">
                {(['lost','found'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={eStatus === opt}
                    data-active={eStatus === opt || undefined}
                    onClick={() => setEStatus(opt)}
                    className="listing-type-chip"
                  >
                    {opt === 'lost' ? 'Lost' : 'Found'}
                  </button>
                ))}
              </div>
            </LFEditField>
            <LFEditField label="Last seen">
              <input
                value={eLastSeen}
                onChange={e => setELastSeen(e.target.value)}
                placeholder="e.g. KMC Library, 2nd floor"
                className="inline-edit inline-edit--input"
                aria-label="Last seen"
              />
            </LFEditField>
            <LFEditField label="Reward (optional)">
              <input
                value={eReward}
                onChange={e => setEReward(e.target.value)}
                placeholder="e.g. ₹500 or a coffee on me"
                className="inline-edit inline-edit--input"
                aria-label="Reward"
              />
            </LFEditField>
            <LFEditField label="Description">
              <textarea
                value={eDescription}
                onChange={e => setEDescription(e.target.value)}
                placeholder="Distinguishing details — colour, condition, exact spot…"
                className="inline-edit inline-edit--body"
                aria-label="Description"
                rows={4}
              />
            </LFEditField>
          </div>
        ) : (
          <p style={{
            margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
          }}>{item.description}</p>
        )}

        {/* Reporter card + intro + contact buttons are for VIEWERS only. The
           owner sees their own dirty-state CTAs at the bottom of the sheet. */}
        {!isOwner && (
          <>
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

            <p style={{
              margin: '0 0 12px',
              fontSize: 13, lineHeight: 1.5,
              color: 'var(--text-secondary)',
              letterSpacing: '-0.005em',
            }}>
              {introLine}
            </p>
          </>
        )}

        {/* Owner save error toast — sits above the action row. */}
        {isOwner && saveError && (
          <div role="alert" style={{
            margin: '0 0 10px', padding: '8px 10px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 10,
            color: 'var(--accent-rose)',
            fontSize: 12, fontWeight: 500, textAlign: 'center',
          }}>{saveError}</div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isOwner ? (
            isDirty ? (
              <>
                <button
                  type="button"
                  onClick={discard}
                  disabled={!!saving}
                  aria-label="Discard changes"
                  style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: saving ? 'not-allowed' : 'pointer', flexShrink: 0,
                  }}
                >
                  <RotateCcw size={16} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => runSave('save')}
                  disabled={!!saving}
                  style={{
                    flex: '1 1 140px', minWidth: 0, height: 48, borderRadius: 14,
                    background: 'var(--bg-surface)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {saving === 'save'
                    ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite' }} />Saving…</>
                    : <><Save size={15} strokeWidth={2} />Save changes</>}
                </button>
                <button
                  type="button"
                  onClick={() => runSave('repost')}
                  disabled={!!saving}
                  style={{
                    flex: '1 1 140px', minWidth: 0, height: 48, borderRadius: 14,
                    background: 'var(--text-primary)', color: 'var(--bg-base)',
                    border: 'none',
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {saving === 'repost'
                    ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--bg-base)' }} />Reposting…</>
                    : <>Save &amp; repost</>}
                </button>
              </>
            ) : (
              <button
                onClick={async () => {
                  if (typeof window !== 'undefined' && !window.confirm('Delete this post permanently?')) return;
                  try { await onDelete?.(); } finally { onClose(); }
                }}
                style={{
                  flex: 1, height: 48, padding: '0 18px', borderRadius: 14,
                  background: 'transparent', color: 'var(--accent-rose)',
                  border: '1px solid var(--accent-rose)', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Trash2 size={16} strokeWidth={2} /> Delete post
              </button>
            )
          ) : null}
        </div>
        {!isOwner && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(() => {
            /* Sort so email is always shown first when both exist. */
            const ordered = [...contactLinks].sort((a, b) =>
              a.channel === 'email' ? -1 : b.channel === 'email' ? 1 : 0,
            );
            if (ordered.length === 0) {
              /* Signed out is NOT the same as "no channel". get_contact needs
                 auth, so an empty list here usually just means we haven't been
                 allowed to look yet — telling a visitor the reporter can't be
                 reached would be plainly false. */
              if (contactGate(!!user, contactLinks) === 'sign-in') {
                return (
                  <button
                    onClick={onRequireAuth}
                    aria-label={`Sign in to contact ${item.user.name}`}
                    style={{
                      flex: '1 1 160px', minWidth: 0,
                      height: 48, borderRadius: 14,
                      background: 'var(--text-primary)', color: 'var(--bg-base)',
                      border: 'none', cursor: 'pointer',
                      fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Mail size={16} strokeWidth={2} />
                    Contact reporter
                  </button>
                );
              }
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
                    /* White label, as asked. That forces the fill to change:
                       white on WhatsApp's brand #25D366 is 1.98:1, which is not
                       readable text by any measure. #00863C is the brightest
                       colour at WhatsApp's own hue (142deg) that carries white
                       at 4.69:1, so it still reads as the WhatsApp button —
                       reinforced by the glyph and the word next to it — while
                       the label is actually legible. */
                    background: isWa ? WA_FILL : 'var(--text-primary)',
                    color: isWa ? WA_INK : 'var(--bg-base)',
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
        )}
        </div>{/* /right column */}
      </div>
      {isOwner && (
        <PhotoEditDialog
          open={photoEditOpen}
          onOpenChange={setPhotoEditOpen}
          initialUrls={currentPhotoUrls}
          bucket="lost-found"
          allowVideo={false}
          onSave={handleSaveLFPhotos}
        />
      )}
      <ShareCardModal open={shareCardOpen} onOpenChange={setShareCardOpen} spec={shareCardSpec} />
      {viewerOpen && displayPhotoUrl && (
        <PhotoViewer photos={[displayPhotoUrl]} index={0} onClose={() => setViewerOpen(false)} />
      )}
    </>
  );
}

/* Owner-edit field row inside the L&F sheet — label above input, matches the
 * inline-edit rhythm used on item + event detail screens. */
function LFEditField({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-secondary)',
      }}>{label}</span>
      {children}
    </div>
  );
}
