'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Heart, Share2, Mail, MessageCircle, IndianRupee, Trash2, RotateCcw, Save, Loader2 } from 'lucide-react';
import type { MarketplaceItem, User } from '../lib/mockData';
import { resolveItemMedia, getAvatar } from '../lib/photos';
import PhotoCarousel from './PhotoCarousel';
import OnlineBadge from './OnlineBadge';
import CommentsSection from './CommentsSection';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useAuth } from '../lib/AuthContext';
import { buildContactLinks, itemAction, actionLabel, type ContactLink } from '../lib/contactUser';
import {
  incrementListingView, toggleListingSave,
  updateListingFields, repostListing,
  updateRequestFields, repostRequest,
} from '../lib/liveData';
import { isDemoMode } from '../lib/demoMode';
import { updateDemoPost, repostDemoPost } from '../lib/demoInventory';
import { CATEGORIES } from '../lib/mockData';

interface ItemDetailScreenProps {
  item: MarketplaceItem;
  onBack: () => void;
  /** Invoked when an unauthenticated viewer tries to contact the owner. */
  onRequireAuth: () => void;
  /** Optional: tap an avatar/owner name to open their storefront. */
  onOpenStorefront?: (user: User) => void;
  /** When the viewer owns this post, inline editing turns on (fields become
   *  inputs in place, dirty-state CTAs replace Delete). No standalone Edit
   *  button — the post detail IS the editor. */
  onDelete?: () => void | Promise<void>;
  /** True when the viewer is the post's author. Drives the inline-edit branch.
   *  Distinct from isAdmin which is cross-account moderation. */
  isOwner?: boolean;
  /** When the viewer is the wecycle admin — adds an "Admin" delete affordance
   *  on every post, even posts they don't own. Shown alongside contact bar. */
  isAdmin?: boolean;
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

export default function ItemDetailScreen({ item, onBack, onRequireAuth, onOpenStorefront, onDelete, isOwner, isAdmin }: ItemDetailScreenProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(item.saved);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /* "Manage" UI = the owner's inline-edit fields + Delete bar. Admin
     moderation renders INSIDE the regular contact bar so admins still
     see contact CTAs alongside their delete affordance. */
  const canManage = !!isOwner && !!onDelete;
  const photos = resolveItemMedia(item);

  /* ── Inline edit state ──────────────────────────────────
     Hydrated from the item; tracks dirty by comparison to the snapshot. */
  const [eTitle, setETitle]             = useState(item.title);
  const [eDescription, setEDescription] = useState(item.description ?? '');
  const [eLocation, setELocation]       = useState(item.location ?? '');
  const [ePriceStr, setEPriceStr]       = useState(
    typeof item.price === 'number' ? String(item.price) : '',
  );
  const [eListingType, setEListingType] = useState<'free' | 'sell' | 'borrow' | 'swap'>(
    item.listingType ?? 'free',
  );
  const [eCategory, setECategory]       = useState((item.category || '').toLowerCase());
  const [eUrgent, setEUrgent]           = useState(!!item.urgent);

  /* Re-hydrate when the item prop changes (e.g. after server refetch). We
     deliberately reset edits on incoming changes — local edits don't survive
     a fresh fetch, which prevents stale conflicts. */
  useEffect(() => {
    setETitle(item.title);
    setEDescription(item.description ?? '');
    setELocation(item.location ?? '');
    setEPriceStr(typeof item.price === 'number' ? String(item.price) : '');
    setEListingType(item.listingType ?? 'free');
    setECategory((item.category || '').toLowerCase());
    setEUrgent(!!item.urgent);
  }, [item.id, item.title, item.description, item.location, item.price, item.listingType, item.category, item.urgent]);

  const isRequestPost = !!item.isRequest;
  const isDirty = useMemo(() => {
    if (eTitle !== item.title) return true;
    if (eDescription !== (item.description ?? '')) return true;
    if (!isRequestPost && eLocation !== (item.location ?? '')) return true;
    if (!isRequestPost) {
      const origPriceStr = typeof item.price === 'number' ? String(item.price) : '';
      if (ePriceStr !== origPriceStr) return true;
      if (eListingType !== (item.listingType ?? 'free')) return true;
    }
    if (eCategory !== (item.category || '').toLowerCase()) return true;
    if (isRequestPost && eUrgent !== !!item.urgent) return true;
    return false;
  }, [eTitle, eDescription, eLocation, ePriceStr, eListingType, eCategory, eUrgent, item, isRequestPost]);

  const [saving, setSaving] = useState<null | 'save' | 'repost'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Save handlers — separated into request vs listing branches so each
     constructs the right shape without TS-union gymnastics. */
  const handleSaveChanges = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving('save');
    setSaveError(null);
    try {
      const priceNum = ePriceStr ? Number(ePriceStr) : undefined;
      if (isDemoMode()) {
        updateDemoPost(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          ...(isRequestPost
            ? { urgent: eUrgent }
            : { location: eLocation, listingType: eListingType, price: priceNum }),
        });
      } else if (isRequestPost) {
        await updateRequestFields(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          urgency: eUrgent ? 'urgent' : 'normal',
        });
      } else {
        await updateListingFields(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          location: eLocation, listingType: eListingType, price: priceNum,
        });
      }
    } catch (e) {
      setSaveError((e as Error).message ?? 'Could not save');
    } finally {
      setSaving(null);
    }
  }, [isDirty, saving, item.id, isRequestPost, eTitle, eCategory, eDescription, eUrgent, eLocation, eListingType, ePriceStr]);

  const handleSaveAndRepost = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving('repost');
    setSaveError(null);
    try {
      const priceNum = ePriceStr ? Number(ePriceStr) : undefined;
      if (isDemoMode()) {
        repostDemoPost(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          ...(isRequestPost
            ? { urgent: eUrgent }
            : { location: eLocation, listingType: eListingType, price: priceNum }),
        });
      } else if (isRequestPost) {
        await repostRequest(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          urgency: eUrgent ? 'urgent' : 'normal',
        });
      } else {
        await repostListing(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          location: eLocation, listingType: eListingType, price: priceNum,
        });
      }
    } catch (e) {
      setSaveError((e as Error).message ?? 'Could not save');
    } finally {
      setSaving(null);
    }
  }, [isDirty, saving, item.id, isRequestPost, eTitle, eCategory, eDescription, eUrgent, eLocation, eListingType, ePriceStr]);

  const handleDiscard = useCallback(() => {
    setETitle(item.title);
    setEDescription(item.description ?? '');
    setELocation(item.location ?? '');
    setEPriceStr(typeof item.price === 'number' ? String(item.price) : '');
    setEListingType(item.listingType ?? 'free');
    setECategory((item.category || '').toLowerCase());
    setEUrgent(!!item.urgent);
  }, [item]);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try { await onDelete?.(); onBack(); }
    finally { setDeleting(false); }
  };

  /* Count a view once per open for real listings. Fire-and-forget; the next
     fetch picks up the bumped count. We detect "real" by the presence of a
     server count field on the mapped item. */
  useEffect(() => {
    const isLive = !isDemoMode() && (item.viewCount !== undefined || item.saveCount !== undefined);
    if (isLive) incrementListingView(item.id);
  }, [item.id]);

  const handleToggleSave = () => {
    if (!user) { onRequireAuth(); return; }
    setSaved(s => !s); // optimistic
    if (!isDemoMode()) {
      toggleListingSave(item.id).catch(() => setSaved(s => !s)); // revert on failure
    }
  };
  /* Requests are "wanted" posts — never priced, and the action is to offer help
     rather than to take/buy. */
  const isRequest = !!item.isRequest;
  const isPriced = !isRequest && item.listingType === 'sell' && typeof item.price === 'number';
  /* "Selling" stands in for an unpriced sell post — paired with a small
     "contact for more info" note next to the action buttons. */
  const isUnpricedSell = !isRequest && item.listingType === 'sell' && !isPriced;
  const priceLabel = isRequest
    ? (item.urgent ? 'Urgent request' : 'Wanted')
    : isPriced ? `₹${item.price}`
    : isUnpricedSell ? 'Selling'
    : item.listingType === 'free' ? 'Free'
    : item.listingType[0].toUpperCase() + item.listingType.slice(1);
  const desc = item.description ?? '';
  const shouldClamp = desc.length > 140;
  const { isDesktop } = useBreakpoint();
  const { user, profile } = useAuth();

  /* The action the contact buttons fire: requests → 'request' ("I can help"),
     otherwise derived from the listing type. */
  const action = isRequest ? 'request' as const : itemAction(item);

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
    action,
    item,
    viewerName: profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined,
  }), [item, profile, user, action]);

  const primaryActionLabel = actionLabel(action);

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
        onToggleSave={handleToggleSave}
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
        canManage={canManage}
        onDelete={onDelete}
        isAdmin={isAdmin}
        /* Inline-edit state, threaded down so the desktop layout's title /
           description / price etc. become editable in the same way. */
        editState={{
          eTitle, setETitle,
          eDescription, setEDescription,
          eLocation, setELocation,
          ePriceStr, setEPriceStr,
          eListingType, setEListingType,
          eCategory, setECategory,
          eUrgent, setEUrgent,
          isRequestPost,
          isDirty,
          saving,
          saveError,
          handleSaveChanges,
          handleSaveAndRepost,
          handleDiscard,
        }}
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
          onClick={handleToggleSave}
          aria-label={saved ? 'Unsave' : 'Save'}
          aria-pressed={saved}
          className="theme-toggle"
        >
          <Heart size={18} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} color={saved ? '#ED2E50' : undefined} />
        </button>
      </header>

      {/* ── PHOTO CAROUSEL ──
         Skip the entire hero frame when the post has no photos or videos.
         Otherwise we'd render a giant empty 4/5 box that's just visual
         dead space. The title + meta section below picks up the leftover
         padding naturally. */}
      {photos.length > 0 && (
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
      )}

      {/* ── TITLE + META ──
         Owner-edit mode breaks the meta into one-field-per-row so each
         input has room to breathe. Read-only mode keeps the compact "title
         + meta strip" layout from before. */}
      {canManage ? (
        <section style={{ padding: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <EditFieldRow label="Title">
            <input
              value={eTitle}
              onChange={e => setETitle(e.target.value)}
              placeholder="What are you sharing?"
              className="inline-edit inline-edit--h1"
              aria-label="Title"
            />
          </EditFieldRow>

          {!isRequestPost && (
            <EditFieldRow label="Pricing">
              <OwnerPriceEditor
                listingType={eListingType}
                priceStr={ePriceStr}
                onListingType={setEListingType}
                onPriceStr={setEPriceStr}
              />
            </EditFieldRow>
          )}

          {!isRequestPost && (
            <EditFieldRow label="Location" icon={<MapPin size={14} strokeWidth={1.8} />}>
              <input
                value={eLocation}
                onChange={e => setELocation(e.target.value)}
                placeholder="Where can it be picked up?"
                className="inline-edit inline-edit--input"
                aria-label="Location"
              />
            </EditFieldRow>
          )}

          <EditFieldRow label="Category">
            <select
              value={eCategory}
              onChange={e => setECategory(e.target.value)}
              className="inline-edit inline-edit--pill"
              aria-label="Category"
            >
              {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </EditFieldRow>

          {isRequestPost && (
            <EditFieldRow label="Urgency">
              <label className="inline-edit-toggle">
                <input
                  type="checkbox"
                  checked={eUrgent}
                  onChange={e => setEUrgent(e.target.checked)}
                />
                <span>Mark as urgent</span>
              </label>
            </EditFieldRow>
          )}
        </section>
      ) : (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13, minWidth: 0, flex: 1 }}>
              <MapPin size={14} strokeWidth={1.8} />
              <span>{item.location}</span>
            </div>
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
      )}

      {/* ── DESCRIPTION ── */}
      <section style={{ padding: '18px 20px 0' }}>
        {canManage ? (
          <EditFieldRow label="Description">
            <textarea
              value={eDescription}
              onChange={e => setEDescription(e.target.value)}
              placeholder="Condition, pickup notes, why you're letting it go…"
              className="inline-edit inline-edit--body"
              aria-label="Description"
              rows={4}
            />
          </EditFieldRow>
        ) : (
          <>
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
          </>
        )}
        {isUnpricedSell && (
          <p style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'var(--bg-inset)',
            borderRadius: 10,
            fontSize: 12, color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}>
            No price set — contact the seller for more info.
          </p>
        )}
      </section>

      {/* ── OWNER ──
         The whole row is a button so tapping anywhere (avatar, name, role,
         chevron) opens the storefront. Adds a chevron-right hint at the end
         so the affordance is obvious. */}
      <section style={{ padding: '20px 20px 0' }}>
        <button
          type="button"
          onClick={() => onOpenStorefront?.(item.user)}
          aria-label={`View ${item.user.name}'s profile`}
          disabled={!onOpenStorefront}
          style={{
            all: 'unset',
            cursor: onOpenStorefront ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 14px',
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
          }}
        >
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
              {item.user.role} · View profile
            </p>
          </div>
          {onOpenStorefront && (
            <ChevronRight size={16} strokeWidth={1.8} color="var(--text-muted)" />
          )}
        </button>
      </section>

      {/* ── COMMENTS (mobile) ── */}
      <section style={{ padding: '20px 20px 0' }}>
        <CommentsSection postId={item.id} onRequireAuth={onRequireAuth} onOpenStorefront={onOpenStorefront} />
      </section>

      {/* ── ACTION BAR ── */}
      <section style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to bottom, transparent, var(--bg-base) 40%, var(--bg-base) 100%)',
      }}>
        {canManage && saveError && (
          <div role="alert" style={{
            marginBottom: 8, padding: '6px 10px',
            background: 'rgba(237,46,80,0.1)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 8,
            color: 'var(--accent-rose)',
            fontSize: 11, fontWeight: 500, textAlign: 'center',
          }}>
            {saveError}
          </div>
        )}
        <div style={{
          display: 'flex', gap: 8,
        }}>
          {/* OWNER VIEW —
             Clean state → Delete only, full width
             Dirty state → [Save changes] [Save & repost] (Delete hides until clean)
             Save & repost also bumps posted_at so the post jumps to the top
             of the feed; useful when the owner relists an item that's been
             sitting around. */}
          {canManage ? (
            isDirty ? (
              <>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={!!saving}
                  aria-label="Discard changes"
                  style={{
                    width: 52, height: 52, borderRadius: 999,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={16} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={!!saving}
                  style={{
                    flex: 1, height: 52, borderRadius: 999,
                    background: 'var(--bg-surface)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {saving === 'save'
                    ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite' }} />Saving…</>
                    : <><Save size={15} strokeWidth={2} />Save changes</>}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndRepost}
                  disabled={!!saving}
                  style={{
                    flex: 1, height: 52, borderRadius: 999,
                    background: 'var(--text-primary)', color: 'var(--bg-base)',
                    border: 'none',
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
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
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, height: 52, padding: '0 16px', borderRadius: 999,
                  background: confirmDelete ? '#ED2E50' : 'var(--bg-surface)',
                  color: confirmDelete ? '#fff' : 'var(--accent-rose)',
                  border: confirmDelete ? 'none' : '1px solid var(--accent-rose)',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Trash2 size={16} strokeWidth={2} />
                {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm' : 'Delete'}
              </button>
            )
          ) : (
          <>
          <button
            onClick={handleToggleSave}
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
          {isAdmin && (
            <button
              onClick={async () => {
                if (typeof window !== 'undefined' && !window.confirm('Admin: delete this post permanently?')) return;
                try { await onDelete?.(); } finally { onBack(); }
              }}
              aria-label="Admin delete"
              style={{
                width: 52, height: 52, borderRadius: 999,
                background: '#ED2E50', color: '#fff',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <Trash2 size={18} strokeWidth={2} />
            </button>
          )}
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
          </>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── DESKTOP LAYOUT (≥1024px) ──
   Photos column (sticky) on the left, info + actions on the right —
   matches the mental model people built browsing Amazon / Etsy. */

interface EditState {
  eTitle: string;           setETitle: (v: string) => void;
  eDescription: string;     setEDescription: (v: string) => void;
  eLocation: string;        setELocation: (v: string) => void;
  ePriceStr: string;        setEPriceStr: (v: string) => void;
  eListingType: 'free' | 'sell' | 'borrow' | 'swap';
  setEListingType: (v: 'free' | 'sell' | 'borrow' | 'swap') => void;
  eCategory: string;        setECategory: (v: string) => void;
  eUrgent: boolean;         setEUrgent: (v: boolean) => void;
  isRequestPost: boolean;
  isDirty: boolean;
  saving: null | 'save' | 'repost';
  saveError: string | null;
  handleSaveChanges: () => Promise<void>;
  handleSaveAndRepost: () => Promise<void>;
  handleDiscard: () => void;
}

interface DesktopLayoutProps {
  item: MarketplaceItem;
  /* Mixed media slides — photo URL strings or video records. */
  photos: import('../lib/photos').MediaEntry[];
  saved: boolean;
  setSaved: (v: boolean | ((prev: boolean) => boolean)) => void;
  onToggleSave: () => void;
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
  canManage: boolean;
  onDelete?: () => void | Promise<void>;
  isAdmin?: boolean;
  editState: EditState;
}

function DesktopLayout({
  item, photos, saved, setSaved, onToggleSave, expanded, setExpanded,
  shouldClamp, desc, isPriced, priceLabel, onBack, onRequireAuth, onOpenStorefront,
  contactLinks, primaryActionLabel, handleContactClick, hasBoth,
  canManage, onDelete, isAdmin, editState,
}: DesktopLayoutProps) {
  void onRequireAuth;
  void isAdmin;
  const {
    eTitle, setETitle, eDescription, setEDescription, eLocation, setELocation,
    ePriceStr, setEPriceStr, eListingType, setEListingType, eCategory, setECategory,
    eUrgent, setEUrgent, isRequestPost, isDirty, saving, saveError,
    handleSaveChanges, handleSaveAndRepost, handleDiscard,
  } = editState;
  void setSaved; /* save state is driven through onToggleSave now */
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

      {/* When there are no photos we collapse the 2-column grid into a
         single centered column so the right-hand info block isn't squeezed
         into half-width with an empty void next to it. */}
      <div style={{
        maxWidth: photos.length > 0 ? 1280 : 760,
        margin: '0 auto',
        padding: '28px 32px 48px',
        display: 'grid',
        gridTemplateColumns: photos.length > 0
          ? 'minmax(0, 1.05fr) minmax(0, 1fr)'
          : 'minmax(0, 1fr)',
        gap: 48,
        alignItems: 'start',
      }}>
        {/* ── LEFT: Photo carousel (sticky so it stays visible while reading).
             Rendered only when there's media; otherwise the right column
             takes over the full width. */}
        {photos.length > 0 && (
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
              {photos.map((p, i) => {
                /* Each slide is either a photo URL string or a video record
                   { kind:'video', src, poster } — use the poster for the thumb. */
                const thumb = typeof p === 'string' ? p : (p.poster ?? p.src);
                const isVideo = typeof p !== 'string';
                return (
                  <div key={i} style={{
                    position: 'relative',
                    width: 64, height: 80,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {isVideo && (
                      <span style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 16,
                      }} aria-hidden="true">▶</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* ── RIGHT: Title, price, description, owner, actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

          {canManage ? (
            <select
              value={eCategory}
              onChange={e => setECategory(e.target.value)}
              className="inline-edit inline-edit--pill"
              aria-label="Category"
              style={{ alignSelf: 'flex-start' }}
            >
              {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          ) : (
            <div style={{
              display: 'inline-flex', alignSelf: 'flex-start',
              padding: '4px 10px',
              background: 'var(--bg-inset)', borderRadius: 999,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
              color: 'var(--text-secondary)',
            }}>
              {item.category}
            </div>
          )}

          {canManage ? (
            <input
              value={eTitle}
              onChange={e => setETitle(e.target.value)}
              placeholder="Title"
              className="inline-edit inline-edit--h1-desktop"
              aria-label="Title"
            />
          ) : (
            <h1 style={{
              margin: 0,
              fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              lineHeight: 1.18,
            }}>
              {item.title}
            </h1>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 14 }}>
              <MapPin size={14} strokeWidth={1.8} />
              {canManage && !isRequestPost ? (
                <input
                  value={eLocation}
                  onChange={e => setELocation(e.target.value)}
                  placeholder="Location"
                  className="inline-edit inline-edit--meta"
                  aria-label="Location"
                />
              ) : (
                <span>{item.location}</span>
              )}
            </div>
            {canManage && !isRequestPost ? (
              <OwnerPriceEditor
                listingType={eListingType}
                priceStr={ePriceStr}
                onListingType={setEListingType}
                onPriceStr={setEPriceStr}
              />
            ) : (
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
            )}
            {canManage && isRequestPost && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={eUrgent} onChange={e => setEUrgent(e.target.checked)} />
                Urgent
              </label>
            )}
          </div>

          {(canManage || desc) && (
            <div>
              <h2 style={{
                margin: '0 0 8px',
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-secondary)',
              }}>About this item</h2>
              {canManage ? (
                <textarea
                  value={eDescription}
                  onChange={e => setEDescription(e.target.value)}
                  placeholder="Describe the item — condition, why you're letting it go, pickup notes…"
                  className="inline-edit inline-edit--body inline-edit--body-desktop"
                  aria-label="Description"
                  rows={6}
                />
              ) : (
                <>
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
                </>
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
                {item.user.role} · View profile
              </p>
            </div>
            <ChevronRight size={18} strokeWidth={1.8} color="var(--text-muted)" />
          </button>

          {/* Action buttons — inline on desktop, no fixed bar.
              Owners get inline-edit + Save/Delete; everyone else gets contact. */}
          {canManage && saveError && (
            <div role="alert" style={{
              padding: '8px 12px',
              background: 'rgba(237,46,80,0.1)',
              border: '1px solid rgba(237,46,80,0.25)',
              borderRadius: 10,
              color: 'var(--accent-rose)',
              fontSize: 12, fontWeight: 500,
            }}>{saveError}</div>
          )}
          <div style={{
            display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap',
          }}>
            {canManage ? (
              isDirty ? (
                <>
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={!!saving}
                    aria-label="Discard changes"
                    style={{
                      flex: '0 0 auto', height: 52, padding: '0 14px', borderRadius: 14,
                      background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <RotateCcw size={15} strokeWidth={1.8} /> Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    disabled={!!saving}
                    style={{
                      flex: 1, minWidth: 140, height: 52, borderRadius: 14,
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)',
                      cursor: saving ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {saving === 'save'
                      ? <><Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} />Saving…</>
                      : <><Save size={16} strokeWidth={2} /> Save changes</>}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndRepost}
                    disabled={!!saving}
                    style={{
                      flex: 1, minWidth: 140, height: 52, borderRadius: 14,
                      background: 'var(--text-primary)', color: 'var(--bg-base)',
                      border: 'none',
                      cursor: saving ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {saving === 'repost'
                      ? <><Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--bg-base)' }} />Reposting…</>
                      : <>Save &amp; repost</>}
                  </button>
                </>
              ) : (
                onDelete && (
                  <button
                    onClick={async () => {
                      if (typeof window !== 'undefined' && !window.confirm('Delete this post permanently?')) return;
                      await onDelete();
                    }}
                    style={{
                      flex: 1, height: 52, padding: '0 18px', borderRadius: 14,
                      background: 'transparent', color: 'var(--accent-rose)',
                      border: '1px solid var(--accent-rose)', cursor: 'pointer',
                      fontSize: 15, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} /> Delete
                  </button>
                )
              )
            ) : hasBoth ? (
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
              onClick={onToggleSave}
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

          {/* Comments thread — full width below the right column on desktop */}
          <div style={{ marginTop: 8 }}>
            <CommentsSection postId={item.id} onRequireAuth={onRequireAuth} onOpenStorefront={onOpenStorefront} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* Tiny labelled wrapper for an owner-edit field. Renders the field label
 * above the input with consistent vertical rhythm — gives every editable
 * field its own clear "card" rather than letting them stack into a wall. */
function EditFieldRow({
  label, icon, children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-secondary)',
      }}>
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

/* Listing-type segmented switch + optional price input. Used in the title
 * row when the owner is editing a sell/free/borrow/swap post. */
function OwnerPriceEditor({
  listingType, priceStr, onListingType, onPriceStr,
}: {
  listingType: 'free' | 'sell' | 'borrow' | 'swap';
  priceStr: string;
  onListingType: (v: 'free' | 'sell' | 'borrow' | 'swap') => void;
  onPriceStr: (v: string) => void;
}) {
  const isSell = listingType === 'sell';
  /* Segmented chips — bigger, clearer hit targets than a dropdown. */
  const TYPES: { id: 'free' | 'sell' | 'borrow' | 'swap'; label: string }[] = [
    { id: 'free',   label: 'Free' },
    { id: 'sell',   label: 'Sell' },
    { id: 'borrow', label: 'Borrow' },
    { id: 'swap',   label: 'Swap' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="listing-type-segmented" role="radiogroup" aria-label="Listing type">
        {TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={listingType === t.id}
            data-active={listingType === t.id || undefined}
            onClick={() => onListingType(t.id)}
            className="listing-type-chip"
          >
            {t.label}
          </button>
        ))}
      </div>
      {isSell && (
        <label className="price-input-wrap">
          <IndianRupee size={14} strokeWidth={2.2} />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={priceStr}
            onChange={e => onPriceStr(e.target.value)}
            placeholder="Set a price (or leave empty for 'Selling')"
            className="inline-edit inline-edit--price-input"
            aria-label="Price in rupees"
          />
        </label>
      )}
    </div>
  );
}

