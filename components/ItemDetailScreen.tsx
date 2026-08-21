'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Heart, Share2, Mail, IndianRupee, Trash2, RotateCcw, Save, Loader2, Flag, Camera, ImagePlus } from 'lucide-react';
import ReportSheet from './ReportSheet';
import type { MarketplaceItem, User } from '../lib/mockData';
import { resolveItemMedia, getAvatar } from '../lib/photos';
import PhotoCarousel from './PhotoCarousel';
import { LinkChip, LinkedText, PhotoLinkBadge, openExternal } from './PostLink';
import OnlineBadge from './OnlineBadge';
import CommentsSection from './CommentsSection';
import RelatedShelf from './RelatedShelf';
import type { LostItem } from '../lib/mockData';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useNaturalAspect } from '../lib/useNaturalAspect';
import { useAuth } from '../lib/AuthContext';
import { buildContactLinks, contactGate, itemAction, opportunityAction, actionLabel, type ContactLink, type ContactGate } from '../lib/contactUser';
import {
  opportunityCompLabel, compToListing,
  COMP_META, COMP_OPTIONS, RATE_PERIODS, RATE_BASIS_OPTIONS, oppRoleBadge,
  type Comp, type RatePeriod,
} from '../lib/opportunity';
import { useOwnerContact } from '../lib/useOwnerContact';
import {
  incrementListingView, toggleListingSave,
  updateListingFields, repostListing,
  updateRequestFields, repostRequest,
  updateListingMedia, updateRequestMedia,
} from '../lib/liveData';
import PhotoEditDialog from './PhotoEditDialog';
import { isDemoMode } from '../lib/demoMode';
import { track, trackContactClicked, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import { updateDemoPost, repostDemoPost } from '../lib/demoInventory';
import { CATEGORIES, closedLabelFor } from '../lib/mockData';
import ShareCardModal from './ShareCardModal';
import type { ShareCardSpec } from '../lib/shareCard';
import { shareUrl } from '../lib/shareUrl';
import { Logomark } from './Brand';
import { WA_FILL, WA_INK } from '../lib/whatsapp';

/* Wecycle brand stamp pinned to the top-right corner of a detail hero photo.
   A small frosted-white circle so the logomark reads on any image. `offset`
   shifts it left when an owner edit button shares the corner. */
function PhotoLogoStamp({ offset = 12 }: { offset?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', top: 12, right: offset, zIndex: 11,
        width: 38, height: 38, borderRadius: 999,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Logomark size={26} alt="" />
    </span>
  );
}

interface ItemDetailScreenProps {
  item: MarketplaceItem;
  onBack: () => void;
  /** Invoked when an unauthenticated viewer tries to contact the owner. */
  onRequireAuth: () => void;
  /** Optional: tap an avatar/owner name to open their storefront. */
  onOpenStorefront?: (user: User) => void;
  /** Jump to another listing from the related-items shelf at the bottom. */
  onOpenItem?: (item: MarketplaceItem) => void;
  /** Jump to a Lost & Found item from the sponsored slot in the related shelf. */
  onOpenLF?: (item: LostItem & { photoUrls?: string[] }) => void;
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

/* ── Engagement actions (save · share · report · admin-delete) ──
 * These live on the SAME ROW as the product name now, NOT in the sticky bar —
 * the bottom bar is reserved for contacting the seller (email / WhatsApp). */
function EngagementActions({
  saved, onToggleSave, onShare, showReport, onReport, showAdminDelete, onAdminDelete, size = 40,
}: {
  saved: boolean;
  onToggleSave: () => void;
  onShare: () => void;
  showReport: boolean;
  onReport: () => void;
  showAdminDelete: boolean;
  onAdminDelete: () => void;
  size?: number;
}) {
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: 999,
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  };
  const icon = Math.round(size * 0.44);
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <button onClick={onToggleSave} aria-label={saved ? 'Saved' : 'Save'} aria-pressed={saved}
        style={{ ...base, color: saved ? '#ED2E50' : 'var(--text-secondary)' }}>
        <Heart size={icon} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
      </button>
      <button onClick={onShare} aria-label="Share" style={{ ...base, color: 'var(--text-secondary)' }}>
        <Share2 size={icon} strokeWidth={1.8} />
      </button>
      {showReport && (
        <button onClick={onReport} aria-label="Report this post" style={{ ...base, color: 'var(--text-muted)' }}>
          <Flag size={icon} strokeWidth={1.8} />
        </button>
      )}
      {showAdminDelete && (
        <button onClick={onAdminDelete} aria-label="Admin delete"
          style={{ ...base, color: '#ED2E50', borderColor: 'rgba(237,46,80,0.4)' }}>
          <Trash2 size={icon} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

export default function ItemDetailScreen({ item, onBack, onRequireAuth, onOpenStorefront, onOpenItem, onOpenLF, onDelete, isOwner, isAdmin }: ItemDetailScreenProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(item.saved);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /* "Manage" UI = the owner's inline-edit fields + Delete bar. Admin
     moderation renders INSIDE the regular contact bar so admins still
     see contact CTAs alongside their delete affordance. */
  /* Editing rights. Admins were given delete but not edit, so moderating a bad
     post meant removing it outright when fixing a line would have done. onDelete
     is still required: the parent only passes it to someone allowed to act, so
     this cannot grant more than the parent already decided. */
  const canManage = (!!isOwner || !!isAdmin) && !!onDelete;
  const photos = resolveItemMedia(item);

  /* Photo editing — owner can open a picker dialog to add/remove/replace. */
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  /* Optimistic local override: once the owner saves new photos we swap them in
     immediately rather than waiting for a full feed refetch. Stored as plain
     URL strings so resolveItemMedia isn't needed again. */
  const [localPhotoUrls, setLocalPhotoUrls] = useState<string[] | null>(null);
  /* Derive the photo list the carousel actually shows. */
  const displayPhotos = localPhotoUrls !== null
    ? localPhotoUrls.map(u => u) // keep as strings; PhotoCarousel accepts string[]
    : photos;
  /* Current raw string URLs for seeding the picker (strip video records). */
  const currentPhotoUrlsForPicker: string[] = photos
    .map(p => (typeof p === 'string' ? p : p.src))
    .filter(Boolean);

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
  /* Opportunity compensation edit state (services only). */
  const [eComp, setEComp]               = useState<Comp>(item.comp ?? 'free');
  const [eRatePeriod, setERatePeriod]   = useState<RatePeriod | undefined>(item.ratePeriod);
  const [ePriceMaxStr, setEPriceMaxStr] = useState<string>(item.priceMax != null ? String(item.priceMax) : '');
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
    setEComp(item.comp ?? 'free');
    setERatePeriod(item.ratePeriod);
    setEPriceMaxStr(item.priceMax != null ? String(item.priceMax) : '');
    setECategory((item.category || '').toLowerCase());
    setEUrgent(!!item.urgent);
  }, [item.id, item.title, item.description, item.location, item.price, item.listingType, item.comp, item.ratePeriod, item.category, item.urgent]);

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
    if (item.kind === 'opportunity') {
      if (eComp !== (item.comp ?? 'free')) return true;
      if ((eRatePeriod ?? null) !== (item.ratePeriod ?? null)) return true;
      if ((ePriceMaxStr.trim() === '' ? null : Number(ePriceMaxStr)) !== (item.priceMax ?? null)) return true;
    }
    if (eCategory !== (item.category || '').toLowerCase()) return true;
    if (isRequestPost && eUrgent !== !!item.urgent) return true;
    return false;
  }, [eTitle, eDescription, eLocation, ePriceStr, eListingType, eComp, eRatePeriod, ePriceMaxStr, eCategory, eUrgent, item, isRequestPost]);

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
      const isOpp = item.kind === 'opportunity';
      const svc = isOpp ? compToListing(eComp, priceNum) : null;
      if (isDemoMode()) {
        updateDemoPost(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          ...(isRequestPost
            ? { urgent: eUrgent }
            : isOpp
              ? { location: eLocation, comp: eComp, ratePeriod: eComp === 'paid' ? eRatePeriod : undefined, priceMax: eComp === 'paid' && ePriceMaxStr.trim() !== '' ? Number(ePriceMaxStr) : undefined, listingType: svc!.listingType, price: svc!.price }
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
          location: eLocation,
          ...(isOpp
            ? { listingType: svc!.listingType, price: svc!.price, comp: eComp, ratePeriod: eComp === 'paid' ? (eRatePeriod ?? null) : null, priceMax: eComp === 'paid' ? (ePriceMaxStr.trim() === '' ? null : Number(ePriceMaxStr)) : null }
            : { listingType: eListingType, price: priceNum }),
        });
      }
    } catch (e) {
      setSaveError((e as Error).message ?? 'Could not save');
    } finally {
      setSaving(null);
    }
  }, [isDirty, saving, item.id, item.kind, isRequestPost, eTitle, eCategory, eDescription, eUrgent, eLocation, eListingType, eComp, eRatePeriod, ePriceStr, ePriceMaxStr]);

  const handleSaveAndRepost = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving('repost');
    setSaveError(null);
    try {
      const priceNum = ePriceStr ? Number(ePriceStr) : undefined;
      const isOpp = item.kind === 'opportunity';
      const svc = isOpp ? compToListing(eComp, priceNum) : null;
      if (isDemoMode()) {
        repostDemoPost(item.id, {
          title: eTitle, category: eCategory, description: eDescription,
          ...(isRequestPost
            ? { urgent: eUrgent }
            : isOpp
              ? { location: eLocation, comp: eComp, ratePeriod: eComp === 'paid' ? eRatePeriod : undefined, priceMax: eComp === 'paid' && ePriceMaxStr.trim() !== '' ? Number(ePriceMaxStr) : undefined, listingType: svc!.listingType, price: svc!.price }
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
          location: eLocation,
          ...(isOpp
            ? { listingType: svc!.listingType, price: svc!.price, comp: eComp, ratePeriod: eComp === 'paid' ? (eRatePeriod ?? null) : null, priceMax: eComp === 'paid' ? (ePriceMaxStr.trim() === '' ? null : Number(ePriceMaxStr)) : null }
            : { listingType: eListingType, price: priceNum }),
        });
      }
    } catch (e) {
      setSaveError((e as Error).message ?? 'Could not save');
    } finally {
      setSaving(null);
    }
  }, [isDirty, saving, item.id, item.kind, isRequestPost, eTitle, eCategory, eDescription, eUrgent, eLocation, eListingType, eComp, eRatePeriod, ePriceStr, ePriceMaxStr]);

  const handleDiscard = useCallback(() => {
    setETitle(item.title);
    setEDescription(item.description ?? '');
    setELocation(item.location ?? '');
    setEPriceStr(typeof item.price === 'number' ? String(item.price) : '');
    setEListingType(item.listingType ?? 'free');
    setEComp(item.comp ?? 'free');
    setERatePeriod(item.ratePeriod);
    setEPriceMaxStr(item.priceMax != null ? String(item.priceMax) : '');
    setECategory((item.category || '').toLowerCase());
    setEUrgent(!!item.urgent);
  }, [item]);

  const handleSavePhotos = useCallback(async (photoUrls: string[]) => {
    if (isDemoMode()) {
      setLocalPhotoUrls(photoUrls);
      return;
    }
    if (isRequestPost) {
      await updateRequestMedia(item.id, photoUrls, []);
    } else {
      await updateListingMedia(item.id, photoUrls, []);
    }
    setLocalPhotoUrls(photoUrls);
  }, [item.id, isRequestPost]);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try { await onDelete?.(); onBack(); }
    finally { setDeleting(false); }
  };

  /* Admin moderation delete (admin viewing someone else's post). Window confirm
     since it's a destructive cross-user action; lives in the title-row actions. */
  const handleAdminDelete = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Admin: delete this post permanently?')) return;
    try { await onDelete?.(); } finally { onBack(); }
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
  /* A service offer rather than a physical item — pricing reads as a rate. */
  const isOpportunity = item.kind === 'opportunity';
  const isPriced = !isRequest && item.listingType === 'sell' && typeof item.price === 'number';
  /* "Selling" stands in for an unpriced sell post — paired with a small
     "contact for more info" note next to the action buttons. For a service
     the same state reads as "Rate on ask". */
  const isUnpricedSell = !isRequest && item.listingType === 'sell' && !isPriced;
  const priceLabel = isRequest
    ? (item.urgent ? 'Urgent request' : 'Wanted')
    : isOpportunity ? opportunityCompLabel(item)
    : isPriced ? `₹${item.price!.toLocaleString('en-IN')}`
    : isUnpricedSell ? 'Selling'
    : item.listingType === 'free' ? 'Free'
    : item.listingType[0].toUpperCase() + item.listingType.slice(1);
  const desc = item.description ?? '';

  /* When a link is armed on the photo, the photo stops opening the lightbox and
     follows the link instead — and says so, because the tap target is identical
     and the two outcomes are not. Spread onto the carousel so a post without a
     link keeps exactly its previous behaviour. */
  const photoLink = item.linkOnPhoto && item.linkUrl ? item.linkUrl : null;
  const photoLinkProps = photoLink
    ? {
        onClick: () => {
          track(EVT.post_link_opened, { id: item.id, from: 'photo' });
          openExternal(photoLink);
        },
        overlay: <PhotoLinkBadge url={photoLink} />,
      }
    : {};

  const shouldClamp = desc.length > 140;
  const { isDesktop } = useBreakpoint();
  const { user, profile } = useAuth();

  /* The action the contact buttons fire: requests → 'request' ("I can help"),
     otherwise derived from the listing type. */
  const action = isRequest ? 'request' as const
    : isOpportunity ? opportunityAction(item.comp)
    : itemAction(item);

  /* Owner contact (email/phone) resolved on demand — the raw columns are locked
     down at the DB so the feed no longer carries them. Demo uses the mock
     user's values; live fetches the one owner via the get_contact RPC. */
  const ownerContact = useOwnerContact(item.user.id, { email: item.user.email, phone: item.user.phone });

  /* Resolve contact channels the owner has accepted. We compute these
     unconditionally so logged-out viewers see the right *number* of buttons
     (just blurred behind an auth prompt); only the actual link is gated. */
  const contactLinks: ContactLink[] = useMemo(() => buildContactLinks({
    owner: {
      name:    item.user.name,
      email:   ownerContact.email,
      phone:   ownerContact.phone,
      contact: item.user.contact,
    },
    action,
    item,
    viewerName: profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined,
  }), [item, profile, user, action, ownerContact.email, ownerContact.phone]);

  const primaryActionLabel = actionLabel(action);

  const handleContactClick = (link: ContactLink) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    /* THE conversion event. This is the single best proxy for "real
     * connection happened" until we wire in-app messaging. */
    haptics.medium();
    trackContactClicked(link.channel, item.isRequest ? 'request' : 'item', item.id, {
      owner_id: item.user.id,
      action: action,
    });
    /* In-place navigation — opens the OS mail/WhatsApp handler reliably on
       iOS and Android, and a new tab on desktop browsers. */
    if (link.channel === 'whatsapp') {
      /* Always open WhatsApp in a new tab so we don't lose context. */
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link.href;
    }
  };

  /* Share → generate a Spotify-style card and open the preview/share modal. */
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const handleShare = () => {
    track(EVT.share_clicked, { post_id: item.id, post_kind: item.isRequest ? 'request' : item.kind === 'opportunity' ? 'job' : 'item' });
    setShareCardOpen(true);
  };
  /* The card shows every photo (cover full-bleed + the rest as a strip). */
  /* Hero frame follows the cover's real shape instead of a hard 4:5, so a
     landscape or 9:16 upload isn't cropped. */
  const coverForAspect = (() => {
    const p = displayPhotos[0] as unknown;
    if (typeof p === 'string') return p;
    const o = p as { poster?: string; src?: string } | undefined;
    return o?.poster ?? o?.src;
  })();
  const heroAspect = useNaturalAspect(coverForAspect);

  const shareImages = displayPhotos
    .map(p => (typeof p === 'string' ? p : (p as { poster?: string; src?: string }).poster ?? (p as { src?: string }).src))
    .filter((u): u is string => !!u && /^https?:|^\//.test(u));
  const shareCardSpec: ShareCardSpec = {
    /* An opportunity is a job/gig and gets its own share palette; only a
       physical listing is 'item'. Without this, hiring posts shared with the
       marketplace's white-and-green wash and a "Condition" cell. */
    kind: item.isRequest ? 'request' : item.kind === 'opportunity' ? 'job' : 'item',
    title: item.title,
    imageUrls: shareImages,
    /* Opportunities put the FULL rate on the pill ("₹300/hr") — passing `price`
       instead would drop the period and print a bare "₹300". */
    price: item.kind === 'opportunity' ? undefined : (isPriced ? item.price : undefined),
    badge: item.kind === 'opportunity' ? priceLabel : (isPriced ? undefined : priceLabel),
    roleLabel: item.kind === 'opportunity' ? oppRoleBadge(item.oppRole) : undefined,
    conditionLabel: item.kind === 'opportunity' || item.isRequest
      ? undefined
      : ({ like_new: 'Like new', good: 'Good', fair: 'Fair' } as const)[item.condition],
    location: item.location,
    description: item.description,
    byName: item.user.name,
    byInitials: item.user.initials,
    byColor: item.user.color,
    verified: true,
    byEmail: ownerContact.email,
    byPhone: ownerContact.phone,
    url: shareUrl(item.id),
  };

  /* Convenience: when only one channel is on, the primary CTA carries the
     action label ("Request to borrow"). When both, we surface two named
     buttons ("Email Aditya" + "WhatsApp Aditya") side by side. */
  const hasBoth = contactLinks.length >= 2;
  /* 'links' | 'sign-in' | 'none' — see contactGate. Signed-out viewers can
     never resolve channels, so they get a sign-in CTA rather than a dead end. */
  const gate = contactGate(!!user, contactLinks);

  /* Sticky title bar — fires when the hero photo scrolls out of view.
     IntersectionObserver is cheaper than a scroll listener: no per-frame
     callbacks, no jank. The sentinel sits right after the hero section. */
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const sentinel = heroSentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  /* Desktop (≥1024px) gets an Amazon-style 2-column layout:
     photos on the left, title + meta + actions on the right.
     Mobile keeps the original stacked flow with the fixed bottom action bar. */
  if (isDesktop) {
    return (
      <DesktopLayout
        item={item}
        photos={displayPhotos}
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
        onOpenItem={onOpenItem}
        onOpenLF={onOpenLF}
        contactLinks={contactLinks}
        gate={gate}
        primaryActionLabel={primaryActionLabel}
        handleContactClick={handleContactClick}
        hasBoth={hasBoth}
        canManage={canManage}
        onDelete={onDelete}
        isAdmin={isAdmin}
        isOwner={isOwner}
        heroSentinelRef={heroSentinelRef}
        heroVisible={heroVisible}
        heroAspect={heroAspect}
        /* Inline-edit state, threaded down so the desktop layout's title /
           description / price etc. become editable in the same way. */
        editState={{
          eTitle, setETitle,
          eDescription, setEDescription,
          eLocation, setELocation,
          ePriceStr, setEPriceStr,
          eListingType, setEListingType,
          eComp, setEComp,
          eRatePeriod, setERatePeriod,
          ePriceMaxStr, setEPriceMaxStr,
          eCategory, setECategory,
          eUrgent, setEUrgent,
          isRequestPost,
          isDirty,
          saving,
          saveError,
          handleSaveChanges,
          handleSaveAndRepost,
          handleDiscard,
          photoEditOpen,
          setPhotoEditOpen,
          currentPhotoUrlsForPicker,
          handleSavePhotos,
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
          /* Opaque. --bg-overlay is 88% alpha, so content showed
             through the header as it scrolled past. */
          background: 'var(--bg-card)',
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
        {/* Save lives in the title row now (with share/report), so the header
            just needs a spacer to keep the category centred. */}
        <span style={{ width: 36, flexShrink: 0 }} aria-hidden="true" />
      </header>

      {/* ── STICKY TITLE BAR (mobile) ──
         Slides down from the top once the hero photo scrolls away.
         Layered on top of the regular header (z-index 31) so it covers
         the category chip while keeping the back-button hit target
         accessible (the back button is duplicated here). */}
      <div
        role="banner"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 31,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          transform: heroVisible ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 200ms ease',
          /* Pointer events only when visible — prevents ghost tap targets */
          pointerEvents: heroVisible ? 'none' : 'auto',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="theme-toggle"
          style={{ width: 36, height: 36, flexShrink: 0 }}
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <span
          aria-current="page"
          style={{
            fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}
        >
          {item.title}
        </span>
        {/* Price / status pill */}
        {item.isClosed ? (
          <span style={{
            flexShrink: 0,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#fff', background: 'var(--text-primary)',
            padding: '4px 10px', borderRadius: 999,
          }}>
            {closedLabelFor(item)}
          </span>
        ) : (
          <span style={{
            flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 1,
            fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            {isPriced && <IndianRupee size={12} strokeWidth={2.3} />}
            <span>{isPriced ? item.price!.toLocaleString('en-IN') : priceLabel}</span>
          </span>
        )}
        {/* Mini contact CTA. Also shown when signed out, where it prompts
            sign-in — the channels simply aren't resolvable yet. */}
        {!item.isClosed && (contactLinks.length > 0 || gate === 'sign-in') && (
          <button
            aria-label={gate === 'sign-in'
              ? `Sign in to contact ${item.user.name}`
              : contactLinks[0].ariaLabel}
            onClick={() => {
              if (gate === 'sign-in') { onRequireAuth(); return; }
              handleContactClick(contactLinks[0]);
            }}
            style={{
              width: 36, height: 36, borderRadius: 999, border: 'none',
              background: 'var(--text-primary)', color: 'var(--bg-base)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Mail size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── PHOTO CAROUSEL ──
         Skip the entire hero frame when the post has no photos or videos.
         Otherwise we'd render a giant empty 4/5 box that's just visual
         dead space. The title + meta section below picks up the leftover
         padding naturally. */}
      {displayPhotos.length > 0 ? (
        <section style={{ padding: '12px 16px 0' }}>
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: heroAspect,
            borderRadius: 24,
            overflow: 'hidden',
            background: 'var(--bg-inset)',
          }}>
            <PhotoCarousel
              photos={displayPhotos}
              aspectRatio={heroAspect}
              objectFit="contain"
              dotsPosition="bottom"
              radius={24}
              {...photoLinkProps}
            />
            <PhotoLogoStamp />
            {canManage && (
              <button
                type="button"
                onClick={() => setPhotoEditOpen(true)}
                aria-label="Edit photos"
                style={{
                  position: 'absolute', top: 12, right: 58,
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
        </section>
      ) : canManage ? (
        <section style={{ padding: '12px 16px 0' }}>
          <button
            type="button"
            onClick={() => setPhotoEditOpen(true)}
            aria-label="Add photos"
            style={{
              width: '100%',
              aspectRatio: heroAspect,
              borderRadius: 24,
              background: 'var(--bg-inset)',
              border: '2px dashed var(--border-default)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            <ImagePlus size={32} strokeWidth={1.5} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>+ Add photo</span>
          </button>
        </section>
      ) : null}
      {/* Sentinel: when this leaves the viewport the sticky title bar appears */}
      <div ref={heroSentinelRef} style={{ height: 0, margin: 0 }} aria-hidden="true" />

      {/* ── TITLE + META ──
         Owner-edit mode breaks the meta into one-field-per-row so each
         input has room to breathe. Read-only mode keeps the compact "title
         + meta strip" layout from before. */}
      {canManage ? (
        <section style={{ padding: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isOpportunity && (
            <div style={{
              display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#fff', background: '#8B5CF6',
              padding: '4px 10px', borderRadius: 999,
            }}>
              🛠️ Opportunity
            </div>
          )}
          <EditFieldRow label="Title">
            <input
              value={eTitle}
              onChange={e => setETitle(e.target.value)}
              placeholder={isOpportunity ? 'What are you offering?' : 'What are you sharing?'}
              className="inline-edit inline-edit--h1"
              aria-label="Title"
            />
          </EditFieldRow>

          {!isRequestPost && (
            <EditFieldRow label={isOpportunity ? 'Compensation' : 'Pricing'}>
              {isOpportunity ? (
                <OwnerCompEditor
                  comp={eComp}
                  ratePeriod={eRatePeriod}
                  onRatePeriod={setERatePeriod}
                  priceStr={ePriceStr}
                  priceMaxStr={ePriceMaxStr}
                  onComp={setEComp}
                  onPriceStr={setEPriceStr}
                  onPriceMaxStr={setEPriceMaxStr}
                />
              ) : (
                <OwnerPriceEditor
                  listingType={eListingType}
                  priceStr={ePriceStr}
                  onListingType={setEListingType}
                  onPriceStr={setEPriceStr}
                />
              )}
            </EditFieldRow>
          )}

          {!isRequestPost && (
            <EditFieldRow label="Location" icon={<MapPin size={14} strokeWidth={1.8} />}>
              <input
                value={eLocation}
                onChange={e => setELocation(e.target.value)}
                placeholder={isOpportunity ? 'Where or how? (or “Online”)' : 'Where can it be picked up?'}
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
          {isOpportunity && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginBottom: 10,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#fff', background: '#8B5CF6',
              padding: '4px 10px', borderRadius: 999,
            }}>
              🛠️ Opportunity
            </div>
          )}
          {/* Title + engagement actions (save · share · report · admin-delete)
              share the same row. The sticky bottom bar is reserved for
              contacting the seller (email / WhatsApp). */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <h1 style={{
              margin: 0,
              fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              flex: 1, minWidth: 0,
            }}>
              {item.title}
            </h1>
            <EngagementActions
              saved={saved}
              onToggleSave={handleToggleSave}
              onShare={handleShare}
              showReport={!isOwner}
              onReport={() => setReportOpen(true)}
              showAdminDelete={!!isAdmin && !isOwner}
              onAdminDelete={handleAdminDelete}
              size={40}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13, minWidth: 0, flex: 1 }}>
              <MapPin size={14} strokeWidth={1.8} />
              <span>{item.location}</span>
            </div>
            {item.isClosed ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#fff', background: 'var(--text-primary)',
                padding: '6px 14px', borderRadius: 999,
              }}>
                {closedLabelFor(item)}
              </div>
            ) : (
              /* Price — bold black, no bounding box (reads like a real price). */
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 1,
                fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}>
                {isPriced && <IndianRupee size={16} strokeWidth={2.4} />}
                <span>{isPriced ? item.price!.toLocaleString('en-IN') : priceLabel}</span>
              </div>
            )}
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
              placeholder={isOpportunity ? 'What you offer, experience, availability…' : 'Condition, pickup notes, why you’re letting it go…'}
              className="inline-edit inline-edit--body"
              aria-label="Description"
              rows={4}
            />
          </EditFieldRow>
        ) : (
          <>
            {/* LinkedText, not a plain <p>: a URL someone typed into the
                description is a link they meant, and leaving it as dead text
                makes them paste it somewhere by hand. Rendered from segments,
                never from HTML — the text is member-written. */}
            <LinkedText text={desc} style={{
              margin: 0,
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              display: shouldClamp && !expanded ? '-webkit-box' : 'block',
              WebkitLineClamp: shouldClamp && !expanded ? 4 : undefined,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }} />
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
            {item.linkUrl && (
              <div style={{ marginTop: 12 }}>
                <LinkChip url={item.linkUrl} onOpen={() => track(EVT.post_link_opened, { id: item.id, from: 'chip' })} />
              </div>
            )}
          </>
        )}
        {isUnpricedSell && !isOpportunity && (
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

        {/* The address in plain text, outside the button so it can be selected
            and copied — some people would rather paste it into their own mail
            client than be thrown into a mailto: handler. Rendered only once
            get_contact has returned it, and that RPC already enforces the
            owner's share preference, so its presence IS the permission. */}
        {ownerContact.email && (
          <p style={{
            margin: '8px 4px 0',
            fontSize: 12, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 6,
            userSelect: 'text',
          }}>
            <Mail size={12} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
            <a
              href={contactLinks.find(l => l.channel === 'email')?.href ?? `mailto:${ownerContact.email}`}
              style={{
                color: 'var(--text-secondary)',
                textDecoration: 'underline', textDecorationStyle: 'dotted',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {ownerContact.email}
            </a>
          </p>
        )}
      </section>

      {/* ── COMMENTS (mobile) ── */}
      <section style={{ padding: '20px 20px 0' }}>
        <CommentsSection postId={item.id} entityType={item.isRequest ? 'request' : 'listing'} onRequireAuth={onRequireAuth} onOpenStorefront={onOpenStorefront} />
      </section>

      {/* ── RELATED SHELF (Amazon-style rails) ── */}
      {(onOpenItem || onOpenLF) && (
        <div style={{ marginTop: 28, paddingBottom: 100 /* clear of action bar */ }}>
          <RelatedShelf
            item={item}
            onOpenItem={(it) => onOpenItem?.(it)}
            onOpenLF={(lf) => onOpenLF?.(lf)}
            onOpenSeller={onOpenStorefront ? () => onOpenStorefront(item.user) : undefined}
          />
        </div>
      )}

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
          display: 'flex', gap: 8, flexWrap: 'wrap',
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
              /* Owner, not editing: Delete + Share (owners can share their
                 own listing too). */
              <>
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
                <button
                  aria-label="Share"
                  onClick={handleShare}
                  style={{
                    width: 52, height: 52, borderRadius: 999,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Share2 size={18} strokeWidth={1.8} />
                </button>
              </>
            )
          ) : (
          <>
          {/* ── Contact the seller — the ONLY thing in the sticky bar now.
              Email is ALWAYS present (every member has an email on file); when
              the seller also opts into WhatsApp the two CTAs split the row.
              Save / share / report / admin-delete moved up to the title row. */}
          {!item.isClosed && contactLinks.map(link => (
            <button
              key={link.channel}
              onClick={() => {
                if (!user) { onRequireAuth(); return; }
                handleContactClick(link);
              }}
              aria-label={link.ariaLabel}
              style={{
                flex: 1, height: 52, borderRadius: 999,
                background: link.channel === 'whatsapp' ? WA_FILL : 'var(--text-primary)',
                color: link.channel === 'whatsapp' ? WA_INK : 'var(--bg-base)',
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600,
                letterSpacing: '-0.01em',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {link.channel === 'whatsapp' ? <WhatsAppGlyph size={15} /> : <Mail size={15} strokeWidth={2} />}
              {link.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
            </button>
          ))}
          {/* Signed out → the channels can't be resolved yet (get_contact needs
              auth), so offer the thing they actually want and let sign-in be the
              means. Showing "view profile" here told every pre-signup visitor
              the seller was unreachable. */}
          {!item.isClosed && gate === 'sign-in' && (
            <button
              onClick={onRequireAuth}
              aria-label={`Sign in to contact ${item.user.name}`}
              style={{
                flex: 1, height: 52, borderRadius: 999,
                background: 'var(--text-primary)', color: 'var(--bg-base)',
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Mail size={15} strokeWidth={2} />
              Contact {item.isRequest ? 'requester' : 'seller'}
            </button>
          )}
          {/* Genuinely nothing to offer: closed post, or a signed-in viewer and
              an owner who shares no channel at all. */}
          {(item.isClosed || gate === 'none') && (
            <button
              onClick={() => { if (!user) { onRequireAuth(); return; } onOpenStorefront?.(item.user); }}
              aria-label={`View ${item.user.name}'s profile`}
              style={{
                flex: 1, height: 52, borderRadius: 999,
                background: 'var(--text-primary)', color: 'var(--bg-base)',
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              View seller&rsquo;s profile
            </button>
          )}
          </>
          )}
        </div>
      </section>
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType={item.isRequest ? 'request' : 'listing'}
        targetId={item.id}
        targetUserId={item.user.id}
        targetLabel={`"${item.title}"`}
      />
      {canManage && (
        <PhotoEditDialog
          open={photoEditOpen}
          onOpenChange={setPhotoEditOpen}
          initialUrls={currentPhotoUrlsForPicker}
          bucket={isRequestPost ? 'listings' : 'listings'}
          allowVideo={!isRequestPost}
          onSave={handleSavePhotos}
        />
      )}
      <ShareCardModal open={shareCardOpen} onOpenChange={setShareCardOpen} spec={shareCardSpec} />
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
  eComp: Comp;              setEComp: (v: Comp) => void;
  eRatePeriod?: RatePeriod; setERatePeriod: (v: RatePeriod | undefined) => void;
  ePriceMaxStr: string;     setEPriceMaxStr: (v: string) => void;
  eCategory: string;        setECategory: (v: string) => void;
  eUrgent: boolean;         setEUrgent: (v: boolean) => void;
  isRequestPost: boolean;
  isDirty: boolean;
  saving: null | 'save' | 'repost';
  saveError: string | null;
  handleSaveChanges: () => Promise<void>;
  handleSaveAndRepost: () => Promise<void>;
  handleDiscard: () => void;
  /* Photo editing */
  photoEditOpen: boolean;
  setPhotoEditOpen: (v: boolean) => void;
  currentPhotoUrlsForPicker: string[];
  handleSavePhotos: (urls: string[]) => Promise<void>;
}

interface DesktopLayoutProps {
  item: MarketplaceItem;
  /** Hero frame ratio measured from the cover image — see useNaturalAspect. */
  heroAspect: string;
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
  onOpenItem?: (item: MarketplaceItem) => void;
  onOpenLF?: (item: LostItem & { photoUrls?: string[] }) => void;
  contactLinks: ContactLink[];
  /** 'links' | 'sign-in' | 'none' — see contactGate. */
  gate: ContactGate;
  primaryActionLabel: string;
  handleContactClick: (link: ContactLink) => void;
  hasBoth: boolean;
  canManage: boolean;
  onDelete?: () => void | Promise<void>;
  isAdmin?: boolean;
  isOwner?: boolean;
  heroSentinelRef: React.RefObject<HTMLDivElement>;
  heroVisible: boolean;
  editState: EditState;
}

function DesktopLayout({
  heroAspect,
  item, photos, saved, setSaved, onToggleSave, expanded, setExpanded,
  shouldClamp, desc, isPriced, priceLabel, onBack, onRequireAuth, onOpenStorefront,
  onOpenItem, onOpenLF,
  contactLinks, gate, primaryActionLabel, handleContactClick, hasBoth,
  canManage, onDelete, isAdmin, isOwner, heroSentinelRef, heroVisible, editState,
}: DesktopLayoutProps) {
  void isAdmin;
  void primaryActionLabel;
  void hasBoth;
  const isOpportunity = item.kind === 'opportunity';
  const [reportOpen, setReportOpen] = useState(false);
  /* Same derivation as the mobile layout — see the comment there. */
  const photoLink = item.linkOnPhoto && item.linkUrl ? item.linkUrl : null;
  const photoLinkProps = photoLink
    ? {
        onClick: () => {
          track(EVT.post_link_opened, { id: item.id, from: 'photo' });
          openExternal(photoLink);
        },
        overlay: <PhotoLinkBadge url={photoLink} />,
      }
    : {};
  /* Owner contact for the share card — same on-demand resolve as the main
     component (raw email/phone columns are locked down). */
  const ownerContact = useOwnerContact(item.user.id, { email: item.user.email, phone: item.user.phone });
  /* Share card (Spotify-style) — preview + share/save modal. */
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const shareImages = photos
    .map(p => (typeof p === 'string' ? p : (p as { poster?: string; src?: string }).poster ?? (p as { src?: string }).src))
    .filter((u): u is string => !!u && /^https?:|^\//.test(u));
  const shareCardSpec: ShareCardSpec = {
    /* An opportunity is a job/gig and gets its own share palette; only a
       physical listing is 'item'. Without this, hiring posts shared with the
       marketplace's white-and-green wash and a "Condition" cell. */
    kind: item.isRequest ? 'request' : item.kind === 'opportunity' ? 'job' : 'item',
    title: item.title,
    imageUrls: shareImages,
    /* Opportunities put the FULL rate on the pill ("₹300/hr") — passing `price`
       instead would drop the period and print a bare "₹300". */
    price: item.kind === 'opportunity' ? undefined : (isPriced ? item.price : undefined),
    badge: item.kind === 'opportunity' ? priceLabel : (isPriced ? undefined : priceLabel),
    roleLabel: item.kind === 'opportunity' ? oppRoleBadge(item.oppRole) : undefined,
    conditionLabel: item.kind === 'opportunity' || item.isRequest
      ? undefined
      : ({ like_new: 'Like new', good: 'Good', fair: 'Fair' } as const)[item.condition],
    location: item.location,
    description: item.description,
    byName: item.user.name,
    byInitials: item.user.initials,
    byColor: item.user.color,
    verified: true,
    byEmail: ownerContact.email,
    byPhone: ownerContact.phone,
    url: shareUrl(item.id),
  };
  const {
    eTitle, setETitle, eDescription, setEDescription, eLocation, setELocation,
    ePriceStr, setEPriceStr, eListingType, setEListingType,
    eComp, setEComp, eRatePeriod, setERatePeriod, ePriceMaxStr, setEPriceMaxStr, eCategory, setECategory,
    eUrgent, setEUrgent, isRequestPost, isDirty, saving, saveError,
    handleSaveChanges, handleSaveAndRepost, handleDiscard,
    photoEditOpen, setPhotoEditOpen, currentPhotoUrlsForPicker, handleSavePhotos,
  } = editState;
  void setSaved; /* save state is driven through onToggleSave now */
  return (
    <div className="screen-transition" style={{ background: 'var(--bg-base)', minHeight: '100%' }}>
      {/* Slim top bar: breadcrumb always visible + title/price/CTA fade in after hero */}
      <header role="banner" style={{
        position: 'sticky', top: 0, zIndex: 30,
        /* Opaque. --bg-overlay is 88% alpha, so content showed
           through the header as it scrolled past. */
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '10px 24px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        {/* Breadcrumb — always visible */}
        <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
          Marketplace
          <span style={{ margin: '0 6px', opacity: 0.5 }}>›</span>
          <span style={{ color: 'var(--text-secondary)' }}>{item.category}</span>
        </span>
        {/* Title + price + mini-CTA — fade in once hero scrolls away */}
        <span
          aria-current="page"
          style={{
            flex: 1, minWidth: 0,
            fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            opacity: heroVisible ? 0 : 1,
            transition: 'opacity 200ms ease',
            pointerEvents: heroVisible ? 'none' : 'auto',
          }}
        >
          {item.title}
        </span>
        {!heroVisible && (
          <>
            {item.isClosed ? (
              <span style={{
                flexShrink: 0,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#fff', background: 'var(--text-primary)',
                padding: '4px 10px', borderRadius: 999,
              }}>
                {closedLabelFor(item)}
              </span>
            ) : (
              <span style={{
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 1,
                fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}>
                {isPriced && <IndianRupee size={13} strokeWidth={2.3} />}
                <span>{isPriced ? item.price!.toLocaleString('en-IN') : priceLabel}</span>
              </span>
            )}
            {!item.isClosed && contactLinks.length > 0 && (
              <button
                aria-label={contactLinks[0].ariaLabel}
                onClick={() => handleContactClick(contactLinks[0])}
                style={{
                  width: 36, height: 36, borderRadius: 999, border: 'none',
                  background: 'var(--text-primary)', color: 'var(--bg-base)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Mail size={15} strokeWidth={2} />
              </button>
            )}
          </>
        )}
      </header>

      {/* When there are no photos we collapse the 2-column grid into a
         single centered column so the right-hand info block isn't squeezed
         into half-width with an empty void next to it.
         Exception: when the owner can add photos we still show the 2-col
         grid so the "+ Add photo" tile is visible in the left column. */}
      <div style={{
        maxWidth: (photos.length > 0 || canManage) ? 1280 : 760,
        margin: '0 auto',
        padding: '28px 32px 48px',
        display: 'grid',
        gridTemplateColumns: (photos.length > 0 || canManage)
          ? 'minmax(0, 1.05fr) minmax(0, 1fr)'
          : 'minmax(0, 1fr)',
        gap: 48,
        alignItems: 'start',
      }}>
        {/* ── LEFT: Photo carousel (sticky so it stays visible while reading).
             Rendered only when there's media; otherwise the right column
             takes over the full width. The owner also sees a "+ Add photo"
             tile here when no photos are present. */}
        {photos.length > 0 ? (
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
            aspectRatio: heroAspect,
            borderRadius: 20,
            overflow: 'hidden',
            background: 'var(--bg-inset)',
          }}>
            <PhotoCarousel
              photos={photos}
              aspectRatio={heroAspect}
              objectFit="contain"
              dotsPosition="bottom"
              radius={20}
              {...photoLinkProps}
            />
            <PhotoLogoStamp />
            {canManage && (
              <button
                type="button"
                onClick={() => setPhotoEditOpen(true)}
                aria-label="Edit photos"
                style={{
                  position: 'absolute', top: 12, right: 58,
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
        ) : canManage ? (
          /* Owner, no photos yet — show a tappable "+ Add photo" tile. */
          <div style={{ position: 'sticky', top: 76, alignSelf: 'start' }}>
            <button
              type="button"
              onClick={() => setPhotoEditOpen(true)}
              aria-label="Add photos"
              style={{
                width: '100%',
                maxWidth: 560,
                margin: '0 auto',
                display: 'flex',
                aspectRatio: heroAspect,
                borderRadius: 20,
                background: 'var(--bg-inset)',
                border: '2px dashed var(--border-default)',
                flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <ImagePlus size={36} strokeWidth={1.4} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>+ Add photo</span>
            </button>
          </div>
        ) : null}
        {/* Sentinel: when the bottom of the photo column leaves the viewport
            the sticky header fades in the title+price+CTA strip. Placed in the
            grid flow so it tracks the photo column's scroll position. */}
        {photos.length > 0 && (
          <div ref={heroSentinelRef} style={{ height: 0, gridColumn: '1', alignSelf: 'end' }} aria-hidden="true" />
        )}

        {/* ── RIGHT: Title, price, description, owner, actions ──
             Explicitly pinned to column 2 / row 1 in the 2-col layout. The
             zero-height scroll sentinel above carries `gridColumn: 1`, which
             was disrupting grid auto-placement and pushing this info block
             down into a second row (forcing the user to scroll past the tall
             photo to reach the details). */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0,
          ...((photos.length > 0 || canManage) ? { gridColumn: 2, gridRow: 1 } : {}),
        }}>

          {isOpportunity && (
            <div style={{
              display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#fff', background: '#8B5CF6',
              padding: '4px 10px', borderRadius: 999,
            }}>
              🛠️ Opportunity
            </div>
          )}

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
              isOpportunity ? (
                <OwnerCompEditor
                  comp={eComp}
                  ratePeriod={eRatePeriod}
                  onRatePeriod={setERatePeriod}
                  priceStr={ePriceStr}
                  priceMaxStr={ePriceMaxStr}
                  onComp={setEComp}
                  onPriceStr={setEPriceStr}
                  onPriceMaxStr={setEPriceMaxStr}
                />
              ) : (
                <OwnerPriceEditor
                  listingType={eListingType}
                  priceStr={ePriceStr}
                  onListingType={setEListingType}
                  onPriceStr={setEPriceStr}
                />
              )
            ) : (
              /* Price — bold black, no bounding box. */
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}>
                {isPriced && <IndianRupee size={18} strokeWidth={2.4} />}
                <span>{isPriced ? item.price!.toLocaleString('en-IN') : priceLabel}</span>
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
              }}>{isOpportunity ? 'About this opportunity' : 'About this item'}</h2>
              {canManage ? (
                <textarea
                  value={eDescription}
                  onChange={e => setEDescription(e.target.value)}
                  placeholder={isOpportunity ? 'Describe your offer — what you do, experience, availability…' : 'Describe the item — condition, why you’re letting it go, pickup notes…'}
                  className="inline-edit inline-edit--body inline-edit--body-desktop"
                  aria-label="Description"
                  rows={6}
                />
              ) : (
                <>
                  <LinkedText text={desc} style={{
                    margin: 0,
                    fontSize: 15,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    display: shouldClamp && !expanded ? '-webkit-box' : 'block',
                    WebkitLineClamp: shouldClamp && !expanded ? 5 : undefined,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }} />
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
                  {item.linkUrl && (
                    <div style={{ marginTop: 12 }}>
                      <LinkChip url={item.linkUrl} onOpen={() => track(EVT.post_link_opened, { id: item.id, from: 'chip' })} />
                    </div>
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
            ) : item.isClosed ? (
              <button
                onClick={() => onOpenStorefront?.(item.user)}
                aria-label={`View ${item.user.name}'s profile`}
                style={{
                  flex: 1, height: 52, borderRadius: 14,
                  background: 'var(--text-primary)', color: 'var(--bg-base)',
                  border: 'none', cursor: 'pointer',
                  fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                View seller&rsquo;s profile
              </button>
            ) : (
              <>
                {contactLinks.map(link => (
                  <button
                    key={link.channel}
                    onClick={() => handleContactClick(link)}
                    aria-label={link.ariaLabel}
                    style={{
                      flex: '1 1 220px', minWidth: 0, height: 52, borderRadius: 14,
                      background: link.channel === 'whatsapp' ? WA_FILL : 'var(--text-primary)',
                      color: link.channel === 'whatsapp' ? WA_INK : 'var(--bg-base)',
                      border: 'none', cursor: 'pointer',
                      fontSize: 15, fontWeight: 600,
                      letterSpacing: '-0.01em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {link.channel === 'whatsapp' ? <WhatsAppGlyph size={16} /> : <Mail size={16} strokeWidth={2} />}
                    {link.channel === 'whatsapp' ? `WhatsApp ${item.user.name.split(' ')[0]}` : `Email ${item.user.name.split(' ')[0]}`}
                  </button>
                ))}
                {gate === 'sign-in' && (
                  <button
                    onClick={onRequireAuth}
                    aria-label={`Sign in to contact ${item.user.name}`}
                    style={{
                      flex: 1, height: 52, borderRadius: 14,
                      background: 'var(--text-primary)', color: 'var(--bg-base)',
                      border: 'none', cursor: 'pointer',
                      fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Mail size={16} strokeWidth={2} />
                    Contact {item.isRequest ? 'requester' : 'seller'}
                  </button>
                )}
                {gate === 'none' && (
                  <button
                    onClick={() => onOpenStorefront?.(item.user)}
                    aria-label={`View ${item.user.name}'s profile`}
                    style={{
                      flex: 1, height: 52, borderRadius: 14,
                      background: 'var(--text-primary)', color: 'var(--bg-base)',
                      border: 'none', cursor: 'pointer',
                      fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    View seller&rsquo;s profile
                  </button>
                )}
              </>
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
              onClick={() => {
                track(EVT.share_clicked, { post_id: item.id, post_kind: item.isRequest ? 'request' : item.kind === 'opportunity' ? 'job' : 'item' });
                setShareCardOpen(true);
              }}
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
            {!isOwner && (
              <button
                aria-label="Report this post"
                onClick={() => setReportOpen(true)}
                style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Flag size={18} strokeWidth={1.8} />
              </button>
            )}
          </div>

          {/* Comments thread — full width below the right column on desktop */}
          <div style={{ marginTop: 8 }}>
            <CommentsSection postId={item.id} entityType={item.isRequest ? 'request' : 'listing'} onRequireAuth={onRequireAuth} onOpenStorefront={onOpenStorefront} />
          </div>
        </div>
      </div>

      {/* ── RELATED SHELF (Amazon-style rails — desktop variant spans full width
           below the photo+info two-column grid) ── */}
      {(onOpenItem || onOpenLF) && (
        <div style={{ marginTop: 32 }}>
          <RelatedShelf
            item={item}
            onOpenItem={(it) => onOpenItem?.(it)}
            onOpenLF={(lf) => onOpenLF?.(lf)}
            onOpenSeller={onOpenStorefront ? () => onOpenStorefront(item.user) : undefined}
          />
        </div>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType={item.isRequest ? 'request' : 'listing'}
        targetId={item.id}
        targetUserId={item.user.id}
        targetLabel={`"${item.title}"`}
      />
      {canManage && (
        <PhotoEditDialog
          open={photoEditOpen}
          onOpenChange={setPhotoEditOpen}
          initialUrls={currentPhotoUrlsForPicker}
          bucket="listings"
          allowVideo={!isRequestPost}
          onSave={handleSavePhotos}
        />
      )}
      <ShareCardModal open={shareCardOpen} onOpenChange={setShareCardOpen} spec={shareCardSpec} />
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

/* Compensation editor for an OPPORTUNITY (service): Volunteer / Free / Paid,
 * with price-band chips + an optional exact rate when Paid. Mirrors the create
 * form so the edit path can't put a service into a nonsensical borrow/swap. */
function OwnerCompEditor({
  comp, priceStr, priceMaxStr, ratePeriod, onComp, onPriceStr, onPriceMaxStr, onRatePeriod,
}: {
  comp: Comp;
  priceStr: string;
  priceMaxStr: string;
  ratePeriod?: RatePeriod;
  onComp: (v: Comp) => void;
  onPriceStr: (v: string) => void;
  onPriceMaxStr: (v: string) => void;
  onRatePeriod: (v: RatePeriod | undefined) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="listing-type-segmented" role="radiogroup" aria-label="Compensation">
        {COMP_OPTIONS.map(c => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={comp === c}
            data-active={comp === c || undefined}
            onClick={() => onComp(c)}
            className="listing-type-chip"
          >
            {COMP_META[c].label}
          </button>
        ))}
      </div>
      {comp === 'paid' && (
        <>
          {/* Same shape as the create form: basis pills, then a from–to range.
              Nothing required; every pill toggles off. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {RATE_BASIS_OPTIONS.map(id => {
              const meta = RATE_PERIODS.find(p => p.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  className={`pill ${ratePeriod === id ? 'pill-active' : ''}`}
                  aria-pressed={ratePeriod === id}
                  onClick={() => onRatePeriod(ratePeriod === id ? undefined : id)}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" inputMode="numeric" min="0"
              className="inline-edit inline-edit--input"
              placeholder="From ₹"
              value={priceStr}
              onChange={e => onPriceStr(e.target.value)}
              aria-label="Rate from (optional)"
            />
            <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>–</span>
            <input
              type="number" inputMode="numeric" min="0"
              className="inline-edit inline-edit--input"
              placeholder="To ₹"
              value={priceMaxStr}
              onChange={e => onPriceMaxStr(e.target.value)}
              aria-label="Rate up to (optional)"
            />
          </div>
        </>
      )}
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

