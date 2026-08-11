'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, Users,
  Heart, Share2, Mail, Check, Tag, Trash2, Save, RotateCcw, Loader2, Camera, ImagePlus,
  BarChart3, ClipboardList,
} from 'lucide-react';
import type { CommunityEvent, User } from '../lib/mockData';
import { resolveEventPhotos, getAvatar } from '../lib/photos';
import OnlineBadge from './OnlineBadge';
import PhotoCarousel from './PhotoCarousel';
import CommentsSection from './CommentsSection';
import { useAuth } from '../lib/AuthContext';
import { buildContactLinks, contactGate, type ContactLink } from '../lib/contactUser';
import { useOwnerContact } from '../lib/useOwnerContact';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useNaturalAspect } from '../lib/useNaturalAspect';
import { track, trackContactClicked, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import { shareLink, addEventToCalendar } from '../lib/share';
import {
  updateEvent, updateEventMedia,
  incrementEventView, toggleEventSave, fetchSavedEventIds,
} from '../lib/liveData';
import {
  fetchEventForm, fetchEventResponses, upsertEventForm, deleteEventForm,
  validateFields, type FormField,
} from '../lib/eventForms';
import FormBuilderScreen from './forms/FormBuilderScreen';
import PhotoEditDialog from './PhotoEditDialog';
import { isDemoMode } from '../lib/demoMode';
import ShareCardModal from './ShareCardModal';
import type { ShareCardSpec } from '../lib/shareCard';
import { shareUrl } from '../lib/shareUrl';
import { Logomark } from './Brand';

interface EventDetailScreenProps {
  event: CommunityEvent;
  isRsvpd: boolean;
  isOwner: boolean;
  onBack: () => void;
  onRsvp: () => void;
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
  onDelete?: () => void | Promise<void>;
  /** Owner-only: open the metrics/attendees/responses screen. */
  onOpenInsights?: () => void;
  /** Going + has a form: reopen the registration to view/edit answers. */
  onEditRegistration?: () => void;
}

const EVENT_TYPES: { id: CommunityEvent['eventType']; label: string }[] = [
  { id: 'swap',      label: 'Swap drive' },
  { id: 'repair',    label: 'Repair café' },
  { id: 'cleanup',   label: 'Cleanup' },
  { id: 'workshop',  label: 'Workshop' },
  { id: 'drive',     label: 'Collection drive' },
  { id: 'challenge', label: 'Challenge' },
];

/* Seed the organizer's <input type="date"> / <input type="time"> from an event.
 *
 * This used to re-parse the DISPLAY strings — `new Date("Sat, Aug 15, 2026 " +
 * "11:00pm")` — after stripping the space before am/pm. V8 rejects that form,
 * so it returned Invalid Date for EVERY real event (verified against the actual
 * fmtDate/fmtTime output: 5 of 5 invalid). Both inputs were therefore always
 * blank, and saving with only one of them filled recomposed starts_at as
 * 1970-01-01, which hid the event and then let purgeExpiredEvents delete it
 * outright — taking its RSVPs and form responses with it.
 *
 * Now it reads the raw ISO the mapper carries through, and only falls back to
 * parsing display text for demo fixtures (which have no startsAt). The fallback
 * keeps the am/pm space so it actually parses.
 */
function parseEventDateTime(
  dateStr: string, timeStr: string, startsAt?: string,
): { date: string; time: string } {
  const fromDate = (d: Date) => ({
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  });

  if (startsAt) {
    const d = new Date(startsAt);
    if (!Number.isNaN(d.getTime())) return fromDate(d);
  }

  /* Demo/mock fallback only. Re-insert the space am/pm needs to be parseable. */
  try {
    const spaced = timeStr.trim().replace(/\s*(am|pm)$/i, ' $1');
    const d = new Date(`${dateStr} ${spaced}`);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    return fromDate(d);
  } catch {
    return { date: '', time: '' };
  }
}

function WhatsAppGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

const TYPE_LABEL: Record<CommunityEvent['eventType'], string> = {
  swap:      'Swap drive',
  repair:    'Repair café',
  cleanup:   'Cleanup',
  workshop:  'Workshop',
  drive:     'Collection drive',
  challenge: 'Challenge',
};

export default function EventDetailScreen({
  event, isRsvpd, isOwner, onBack, onRsvp, onRequireAuth, onOpenStorefront, onDelete,
  onOpenInsights, onEditRegistration,
}: EventDetailScreenProps) {
  /* Prefer the organizer's uploaded photos; mock events fall back to the
     curated Unsplash covers. Real events with no upload → empty array → we
     render the hero block without an image. */
  const uploadedPhotos = (event as { photoUrls?: string[] }).photoUrls;
  const photos: string[] = uploadedPhotos && uploadedPhotos.length > 0
    ? uploadedPhotos
    : (Array.isArray(uploadedPhotos) ? [] : resolveEventPhotos(event));
  /* Photo editing — owner can add/replace photos. */
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [localPhotoUrls, setLocalPhotoUrls] = useState<string[] | null>(null);
  const displayPhotos: string[] = localPhotoUrls !== null ? localPhotoUrls : photos;
  const handleSaveEventPhotos = useCallback(async (photoUrls: string[]) => {
    if (isDemoMode()) { setLocalPhotoUrls(photoUrls); return; }
    await updateEventMedia(event.id, photoUrls, []);
    setLocalPhotoUrls(photoUrls);
  }, [event.id]);
  const [expanded, setExpanded] = useState(false);
  const desc = event.description ?? '';
  const shouldClamp = desc.length > 220;
  const { user, profile } = useAuth();
  const { isDesktop } = useBreakpoint();
  /* The hero frame follows the poster's real shape rather than forcing 4:5,
     so a landscape banner or a 9:16 phone shot isn't cropped. */
  const heroAspect = useNaturalAspect(displayPhotos[0]);

  const pct = event.maxAttendees ? Math.min(100, (event.attendees / event.maxAttendees) * 100) : 60;

  /* ── Views — count one per open (live only; mirrors the listing pattern). */
  useEffect(() => {
    if (!isDemoMode()) incrementEventView(event.id);
  }, [event.id]);

  /* ── Save (heart) — real persistence via event_saves. */
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!user || isDemoMode()) { setSaved(false); return; }
    let cancelled = false;
    fetchSavedEventIds(user.id).then(ids => { if (!cancelled) setSaved(ids.has(event.id)); });
    return () => { cancelled = true; };
  }, [event.id, user]);
  const handleToggleSave = () => {
    if (!user && !isDemoMode()) { onRequireAuth(); return; }
    if (saved) haptics.selection(); else haptics.success();
    track(EVT.save_toggled, { post_id: event.id, post_kind: 'event', saved: !saved });
    setSaved(s => !s);
    if (isDemoMode()) return;
    toggleEventSave(event.id).catch(() => setSaved(s => !s)); /* revert on failure */
  };

  /* ── Registration form management (owner). Lazy-loaded on open. */
  const [manageFormOpen, setManageFormOpen] = useState(false);
  const [mfFields, setMfFields] = useState<FormField[]>([]);
  const [mfHadForm, setMfHadForm] = useState(false);
  const [mfResponseCount, setMfResponseCount] = useState(0);
  const [mfLoading, setMfLoading] = useState(false);
  const [mfSaving, setMfSaving] = useState(false);
  const [mfError, setMfError] = useState<string | null>(null);
  const [hasFormLocal, setHasFormLocal] = useState<boolean | null>(null);
  const effectiveHasForm = hasFormLocal ?? !!event.hasForm;

  const openManageForm = async () => {
    haptics.selection();
    setManageFormOpen(true);
    setMfLoading(true);
    setMfError(null);
    try {
      const [f, responses] = await Promise.all([
        fetchEventForm(event.id),
        fetchEventResponses(event.id),
      ]);
      setMfFields(f?.fields ?? []);
      setMfHadForm(!!f && f.fields.length > 0);
      setMfResponseCount(responses.length);
    } finally {
      setMfLoading(false);
    }
  };

  const saveManagedForm = async () => {
    const bad = validateFields(mfFields);
    if (bad) { setMfError(bad); return; }
    setMfSaving(true);
    setMfError(null);
    try {
      await upsertEventForm(event.id, mfFields);
      track(EVT.event_form_saved, { event_id: event.id, field_count: mfFields.length, source: 'edit' });
      haptics.success();
      setHasFormLocal(true);
      setManageFormOpen(false);
    } catch (e) {
      setMfError((e as Error).message ?? 'Could not save the form');
    } finally {
      setMfSaving(false);
    }
  };

  const removeManagedForm = async () => {
    if (typeof window !== 'undefined' && !window.confirm(
      mfResponseCount > 0
        ? `Remove the registration form? This permanently deletes the ${mfResponseCount} response${mfResponseCount === 1 ? '' : 's'} collected so far. Export the CSV from Insights first if you need them.`
        : 'Remove the registration form? RSVPs will confirm directly.',
    )) return;
    setMfSaving(true);
    setMfError(null);
    try {
      await deleteEventForm(event.id);
      track(EVT.event_form_removed, { event_id: event.id, had_responses: mfResponseCount > 0 });
      haptics.selection();
      setHasFormLocal(false);
      setManageFormOpen(false);
    } catch (e) {
      setMfError((e as Error).message ?? 'Could not remove the form');
    } finally {
      setMfSaving(false);
    }
  };

  /* ── Inline edit state (owner only) ── */
  const initial = useMemo(
    () => parseEventDateTime(event.date, event.time, event.startsAt),
    [event.date, event.time, event.startsAt],
  );
  const [eTitle, setETitle]             = useState(event.title);
  const [eDescription, setEDescription] = useState(event.description ?? '');
  const [eLocation, setELocation]       = useState(event.location);
  const [eDate, setEDate]               = useState(initial.date);
  const [eTime, setETime]               = useState(initial.time);
  const [eType, setEType]               = useState<CommunityEvent['eventType']>(event.eventType);
  const [eMaxAttendeesStr, setEMaxAttendeesStr] = useState(
    event.maxAttendees ? String(event.maxAttendees) : '',
  );

  useEffect(() => {
    setETitle(event.title);
    setEDescription(event.description ?? '');
    setELocation(event.location);
    setEDate(initial.date);
    setETime(initial.time);
    setEType(event.eventType);
    setEMaxAttendeesStr(event.maxAttendees ? String(event.maxAttendees) : '');
  }, [event.id, event.title, event.description, event.location, event.eventType, event.maxAttendees, initial.date, initial.time]);

  const isDirty =
    eTitle !== event.title ||
    eDescription !== (event.description ?? '') ||
    eLocation !== event.location ||
    eDate !== initial.date ||
    eTime !== initial.time ||
    eType !== event.eventType ||
    (eMaxAttendeesStr ? Number(eMaxAttendeesStr) : null) !== (event.maxAttendees ?? null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveChanges = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isDemoMode()) {
        /* No demo store mutation for events yet — best-effort no-op so the
           CTA still feels responsive. The page will continue to reflect the
           in-memory state during this session. */
        await new Promise(r => setTimeout(r, 200));
      } else {
        await updateEvent(event.id, {
          title: eTitle,
          eventType: eType,
          date: eDate || undefined,
          time: eTime || undefined,
          location: eLocation,
          description: eDescription,
          maxAttendees: eMaxAttendeesStr ? Number(eMaxAttendeesStr) : undefined,
        });
      }
    } catch (e) {
      setSaveError((e as Error).message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [isDirty, saving, event.id, eTitle, eType, eDate, eTime, eLocation, eDescription, eMaxAttendeesStr]);

  const handleDiscard = useCallback(() => {
    setETitle(event.title);
    setEDescription(event.description ?? '');
    setELocation(event.location);
    setEDate(initial.date);
    setETime(initial.time);
    setEType(event.eventType);
    setEMaxAttendeesStr(event.maxAttendees ? String(event.maxAttendees) : '');
  }, [event, initial]);

  /* Owner contact resolved on demand — raw email/phone columns are locked down. */
  const ownerContact = useOwnerContact(event.organizer?.id, { email: event.organizer?.email, phone: event.organizer?.phone });

  /* Contact links for messaging the organizer — same flow as item details. */
  const contactLinks: ContactLink[] = useMemo(() => buildContactLinks({
    owner: {
      name:    event.organizer.name,
      email:   ownerContact.email,
      phone:   ownerContact.phone,
      contact: event.organizer.contact,
    },
    action: 'event',
    event,
    viewerName: profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined,
  }), [event, profile, user, ownerContact.email, ownerContact.phone]);

  const handleContact = (link: ContactLink) => {
    if (!user) { onRequireAuth(); return; }
    haptics.medium();
    trackContactClicked(link.channel, 'event', event.id, {
      owner_id: event.organizer.id,
      event_type: event.eventType,
    });
    if (link.channel === 'whatsapp') {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link.href;
    }
  };

  const handleRsvpClick = () => {
    if (!user && !isDemoMode()) { onRequireAuth(); return; }
    /* `rsvpd` is the *current* state — fire the event with the resulting state. */
    if (isRsvpd) haptics.selection(); else haptics.success();
    track(EVT.rsvp_toggled, { event_id: event.id, rsvp: !isRsvpd, event_type: event.eventType, has_form: !!event.hasForm });
    onRsvp();
  };

  /* Parse the event's display date + time back into a Date for the .ics
   * hand-off. The event row stores a formatted string, so we lean on the
   * native Date parser; if it can't parse, addToCalendar bails gracefully. */
  const handleAddToCalendar = () => {
    haptics.success();
    track(EVT.share_clicked, { post_id: event.id, post_kind: 'event', action: 'add_to_calendar' });
    const parsed = new Date(`${event.date} ${event.time}`);
    const start = Number.isNaN(parsed.getTime()) ? new Date(event.date) : parsed;
    addEventToCalendar({
      title: event.title,
      description: event.description,
      location: event.location,
      start,
      uid: `${event.id}@wecycle.page`,
    });
  };

  /* Share → Spotify-style card preview/share modal. */
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const shareDateBadge = (() => {
    const d = new Date(event.date);
    if (isNaN(d.getTime())) return undefined;
    return {
      mon: d.toLocaleString('en-US', { month: 'short' }),
      day: String(d.getDate()),
      dow: d.toLocaleString('en-US', { weekday: 'short' }),
    };
  })();
  const shareChips = [
    event.time,
    typeof event.attendees === 'number' ? `${event.attendees} going` : undefined,
    event.maxAttendees ? `Cap ${event.maxAttendees}` : undefined,
  ].filter(Boolean) as string[];
  const shareCardSpec: ShareCardSpec = {
    kind: 'event',
    title: event.title,
    imageUrls: displayPhotos.filter(u => !!u && /^https?:|^\//.test(u)),
    dateLine: [event.date, event.time].filter(Boolean).join(' · '),
    dateBadge: shareDateBadge,
    eventChips: shareChips,
    location: event.location,
    description: event.description,
    byName: event.organizer?.name,
    byInitials: event.organizer?.initials,
    byColor: event.organizer?.color,
    verified: true,
    byEmail: ownerContact.email,
    byPhone: ownerContact.phone,
    url: shareUrl(event.id),
  };
  const handleShareEvent = () => {
    track(EVT.share_clicked, { post_id: event.id, post_kind: 'event' });
    setShareCardOpen(true);
  };

  /* When both channels are accepted we render two named buttons inline with
     the RSVP CTA. When only one, the message button sits beside RSVP. */
  const hasBoth = contactLinks.length >= 2;
  /* Signed-out viewers can't resolve channels (get_contact is auth-only),
     so they get a sign-in prompt instead of no button at all. */
  const gate = contactGate(!!user, contactLinks);

  return (
    <div className="screen-transition" style={{ paddingBottom: 140, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          /* Opaque. --bg-overlay is 88% alpha, so content showed
             through the header as it scrolled past. */
          background: 'var(--bg-card)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
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
          flex: 1, textAlign: 'center',
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          padding: '0 12px',
        }}>
          {TYPE_LABEL[event.eventType]}
        </span>
        {/* Header right-side is share only now — "add to calendar" moved down
           beside RSVP, where the other event actions live. */}
        <div style={{ display: 'flex', gap: 4 }}>
          {isOwner && onOpenInsights && (
            <button
              aria-label="View insights"
              className="theme-toggle"
              onClick={() => { haptics.selection(); onOpenInsights(); }}
            >
              <BarChart3 size={17} strokeWidth={1.8} />
            </button>
          )}
          <button
            aria-label="Share event"
            className="theme-toggle"
            onClick={handleShareEvent}
          >
            <Share2 size={17} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/* ── DESKTOP 2-COLUMN WRAPPER ──
           On ≥1024px the hero photo sits on the left (max ~560px) and the
           title/facts/description fill the right column. On mobile the
           wrapper is transparent — all sections stack normally. */}
      <div
        style={isDesktop ? {
          maxWidth: 1280, margin: '0 auto',
          padding: '20px 32px 0',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 48,
          alignItems: 'start',
        } : undefined}
      >
        {/* ── LEFT COLUMN (desktop) ──
            The hero poster and the RSVP bar share this column, so the bar sits
            directly under the image and lands level with the comment box on the
            right. It used to be a position:fixed 430px-wide mobile bar rendered
            outside the grid entirely, which on a wide screen centred itself on
            the VIEWPORT — floating mid-page, detached from both columns. On
            mobile .ev-cta is still that fixed bottom bar; see globals.css. */}
        <div style={isDesktop ? { minWidth: 0 } : undefined}>
        {/* ── HERO PHOTO CAROUSEL ── */}
        {displayPhotos.length > 0 ? (
          <section style={{ padding: isDesktop ? 0 : '12px 16px 0' }}>
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: isDesktop ? 560 : undefined,
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
                overlay={
                  <>
                    <div style={{
                      position: 'absolute', top: 14, left: 14,
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      backdropFilter: 'blur(8px)',
                      borderRadius: 999,
                      padding: '5px 11px',
                      fontSize: 11, fontWeight: 500, letterSpacing: '-0.01em',
                      zIndex: 4,
                    }}>
                      {TYPE_LABEL[event.eventType]}
                    </div>
                    {/* Wecycle brand stamp — top-right corner. */}
                    <span aria-hidden="true" style={{
                      position: 'absolute', top: 12, right: 12, zIndex: 6,
                      width: 38, height: 38, borderRadius: 999,
                      background: 'rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Logomark size={26} alt="" />
                    </span>
                    {isRsvpd && (
                      <div style={{
                        position: 'absolute', top: 60, right: 14,
                        background: '#22C55E', color: '#fff',
                        borderRadius: 999, padding: '5px 11px',
                        fontSize: 11, fontWeight: 600,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        zIndex: 4,
                      }}>
                        <Check size={11} strokeWidth={2.5} /> Going
                      </div>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setPhotoEditOpen(true)}
                        aria-label="Edit photos"
                        style={{
                          position: 'absolute', bottom: 14, right: 14,
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
                  </>
                }
              />
            </div>
          </section>
        ) : isOwner ? (
          <section style={{ padding: isDesktop ? 0 : '12px 16px 0' }}>
            <button
              type="button"
              onClick={() => setPhotoEditOpen(true)}
              aria-label="Add photos"
              style={{
                width: '100%',
                maxWidth: isDesktop ? 560 : undefined,
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
      {/* ── BOTTOM CTA ── */}
      <section className="ev-cta">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
          {isOwner && saveError && (
            <div role="alert" style={{
              padding: '6px 10px',
              background: 'rgba(237,46,80,0.1)',
              border: '1px solid rgba(237,46,80,0.25)',
              borderRadius: 8,
              color: 'var(--accent-rose)',
              fontSize: 11, fontWeight: 500, textAlign: 'center',
            }}>{saveError}</div>
          )}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto', flexWrap: 'wrap' }}>
          {/* OWNER:
             Clean → Delete full-width
             Dirty → [Discard] [Save changes]  (no repost concept for events) */}
          {isOwner ? (
            isDirty ? (
              <>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={saving}
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
                  disabled={saving}
                  style={{
                    flex: 1, minWidth: 140, height: 52, borderRadius: 999,
                    background: 'var(--text-primary)', color: 'var(--bg-base)',
                    border: 'none',
                    cursor: saving ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {saving
                    ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--bg-base)' }} />Saving…</>
                    : <><Save size={15} strokeWidth={2} /> Save changes</>}
                </button>
              </>
            ) : (
              <>
                {onOpenInsights && (
                  <button
                    onClick={() => { haptics.selection(); onOpenInsights(); }}
                    style={{
                      flex: 1, minWidth: 130, height: 52, padding: '0 16px', borderRadius: 999,
                      background: 'var(--text-primary)', color: 'var(--bg-base)',
                      border: 'none', cursor: 'pointer',
                      fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <BarChart3 size={16} strokeWidth={2} /> Insights
                  </button>
                )}
                <button
                  onClick={openManageForm}
                  aria-label={effectiveHasForm ? 'Edit registration form' : 'Add registration form'}
                  title={effectiveHasForm ? 'Edit registration form' : 'Add registration form'}
                  style={{
                    width: 52, height: 52, borderRadius: 999,
                    background: effectiveHasForm ? 'rgba(139,92,246,0.12)' : 'var(--bg-surface)',
                    border: `1px solid ${effectiveHasForm ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'}`,
                    color: effectiveHasForm ? '#8B5CF6' : 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <ClipboardList size={17} strokeWidth={1.8} />
                </button>
                {onDelete && (
                  <button
                    onClick={async () => {
                      if (typeof window !== 'undefined' && !window.confirm('Delete this event permanently?')) return;
                      await onDelete();
                      onBack();
                    }}
                    aria-label="Delete event"
                    title="Delete event"
                    style={{
                      width: 52, height: 52, borderRadius: 999,
                      background: 'transparent', color: 'var(--accent-rose)',
                      border: '1px solid var(--accent-rose)', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                )}
              </>
            )
          ) : (
          <>
          <button
            onClick={handleRsvpClick}
            style={{
              flex: 1, minWidth: 120, height: 52, borderRadius: 999,
              /* Purple, not black: events are purple everywhere else in the app
                 (the EVENT badge, the calendar chip, --color-repair), so the
                 primary action on an event should read as an event action.
                 Going = the confirmed/quiet state, so it drops to a surface. */
              background: isRsvpd ? 'var(--bg-surface)' : '#8B5CF6',
              color: isRsvpd ? 'var(--text-primary)' : '#FFFFFF',
              border: isRsvpd ? '1px solid var(--border-default)' : 'none',
              boxShadow: isRsvpd ? 'none' : '0 6px 20px rgba(139, 92, 246, 0.34)',
              cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {isRsvpd
              ? <><Check size={14} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />You're going</>
              : 'RSVP'}
          </button>

          {/* Icon actions sit to the RIGHT of RSVP, so RSVP starts flush with the
              poster's left edge and these end flush with its right — the row spans
              exactly the image's width (max-width 560px, see .ev-cta). */}
          <button
            aria-label="Add to calendar"
            title="Add to calendar"
            onClick={handleAddToCalendar}
            style={{
              width: 52, height: 52, borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <CalendarDays size={18} strokeWidth={1.8} />
          </button>
          <button
            aria-label={saved ? 'Unsave event' : 'Save event'}
            aria-pressed={saved}
            onClick={handleToggleSave}
            style={{
              width: 52, height: 52, borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: saved ? '#ED2E50' : 'var(--text-secondary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Heart size={18} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} />
          </button>

          {/* Message organizer — one button per accepted channel. */}
          {(
            hasBoth ? (
              contactLinks.map(link => (
                <button
                  key={link.channel}
                  onClick={() => handleContact(link)}
                  aria-label={link.ariaLabel}
                  style={{
                    width: 52, height: 52, borderRadius: 999,
                    background: link.channel === 'whatsapp' ? '#25D366' : 'var(--bg-surface)',
                    color: link.channel === 'whatsapp' ? '#0B141A' : 'var(--text-secondary)',
                    border: link.channel === 'whatsapp' ? 'none' : '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {link.channel === 'whatsapp' ? <WhatsAppGlyph /> : <Mail size={16} strokeWidth={1.8} />}
                </button>
              ))
            ) : contactLinks.length === 1 ? (
              <button
                onClick={() => handleContact(contactLinks[0])}
                aria-label={contactLinks[0].ariaLabel}
                style={{
                  width: 52, height: 52, borderRadius: 999,
                  background: contactLinks[0].channel === 'whatsapp' ? '#25D366' : 'var(--bg-surface)',
                  color: contactLinks[0].channel === 'whatsapp' ? '#0B141A' : 'var(--text-secondary)',
                  border: contactLinks[0].channel === 'whatsapp' ? 'none' : '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                {contactLinks[0].channel === 'whatsapp'
                  ? <WhatsAppGlyph />
                  : <Mail size={16} strokeWidth={1.8} />}
              </button>
            ) : gate === 'sign-in' ? (
              <button
                onClick={onRequireAuth}
                aria-label={`Sign in to message ${event.organizer?.name ?? 'the organizer'}`}
                style={{
                  width: 52, height: 52, borderRadius: 999,
                  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Mail size={16} strokeWidth={1.8} />
              </button>
            ) : null
          )}
          </>
          )}
        </div>
        {/* Going + form → quick access to their own submission. */}
        {!isOwner && isRsvpd && !!event.hasForm && onEditRegistration && (
          <button
            type="button"
            onClick={() => { haptics.selection(); onEditRegistration(); }}
            style={{
              alignSelf: 'center',
              background: 'none', border: 'none', padding: '2px 4px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: 'var(--text-secondary)', fontFamily: 'inherit',
              textDecoration: 'underline', textDecorationStyle: 'dotted',
              pointerEvents: 'auto',
            }}
          >
            View / edit your registration
          </button>
        )}
        </div>
      </section>
        </div>{/* /left column */}
        {/* RIGHT COLUMN starts here — wrapped on desktop for the side-by-side
            layout. Closing tag is right before the bottom CTA. */}
        <div style={isDesktop ? { minWidth: 0 } : { display: 'contents' }}>

      {/* ── TITLE + KEY FACTS ── */}
      <section style={{ padding: '24px 20px 0' }}>
        {isOwner ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <EventEditField label="Event title">
              <input
                value={eTitle}
                onChange={e => setETitle(e.target.value)}
                placeholder="What's happening?"
                className="inline-edit inline-edit--h1"
                aria-label="Event title"
              />
            </EventEditField>

            <EventEditField label="Type">
              <select
                value={eType}
                onChange={e => setEType(e.target.value as CommunityEvent['eventType'])}
                className="inline-edit inline-edit--pill"
                aria-label="Event type"
              >
                {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </EventEditField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <EventEditField label="Date" icon={<CalendarDays size={13} strokeWidth={1.8} />}>
                <input
                  type="date"
                  value={eDate}
                  onChange={e => setEDate(e.target.value)}
                  className="inline-edit inline-edit--input"
                  aria-label="Date"
                />
              </EventEditField>
              <EventEditField label="Time" icon={<Clock size={13} strokeWidth={1.8} />}>
                <input
                  type="time"
                  value={eTime}
                  onChange={e => setETime(e.target.value)}
                  className="inline-edit inline-edit--input"
                  aria-label="Time"
                />
              </EventEditField>
            </div>

            <EventEditField label="Location" icon={<MapPin size={13} strokeWidth={1.8} />}>
              <input
                value={eLocation}
                onChange={e => setELocation(e.target.value)}
                placeholder="Where it's happening"
                className="inline-edit inline-edit--input"
                aria-label="Location"
              />
            </EventEditField>

            <EventEditField label="Max attendees" icon={<Users size={13} strokeWidth={1.8} />}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={eMaxAttendeesStr}
                onChange={e => setEMaxAttendeesStr(e.target.value)}
                placeholder="Leave empty for open RSVP"
                className="inline-edit inline-edit--input"
                aria-label="Maximum attendees"
              />
            </EventEditField>
          </div>
        ) : (
          <>
            <h1 style={{
              margin: 0,
              fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}>
              {event.title}
            </h1>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FactRow
                icon={<CalendarDays size={14} strokeWidth={1.8} />}
                label="Date"
                value={event.date}
              />
              {/* Omitted rather than shown blank when the organiser gave a
                  date but no start time. */}
              {event.time && (
                <FactRow
                  icon={<Clock size={14} strokeWidth={1.8} />}
                  label="Time"
                  value={event.time}
                />
              )}
              <FactRow
                icon={<MapPin size={14} strokeWidth={1.8} />}
                label="Location"
                value={event.location}
              />
              <FactRow
                icon={<Users size={14} strokeWidth={1.8} />}
                label={event.maxAttendees ? `${event.attendees} / ${event.maxAttendees} going` : `${event.attendees} going`}
                value={event.maxAttendees ? `${Math.round(pct)}% full` : 'Open RSVP'}
                trailing
              />
            </div>
          </>
        )}

        {event.maxAttendees && (
          <div style={{ marginTop: 12, height: 3, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: event.colorAccent ?? 'var(--text-primary)',
              borderRadius: 99,
              transition: 'width 0.4s',
            }} />
          </div>
        )}
      </section>

      {/* ── DESCRIPTION ── */}
      <section style={{ padding: '24px 20px 0' }}>
        {isOwner ? (
          /* The EventEditField provides its own label — no separate h3. */
          <EventEditField label="About this event">
            <textarea
              value={eDescription}
              onChange={e => setEDescription(e.target.value)}
              placeholder="Tell people what's happening, who it's for, what to bring…"
              className="inline-edit inline-edit--body"
              aria-label="Description"
              rows={5}
            />
          </EventEditField>
        ) : (
          <>
            <h3 style={{
              margin: '0 0 10px',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              About this event
            </h3>
            <p style={{
              margin: 0,
              fontSize: 14, color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              display: shouldClamp && !expanded ? '-webkit-box' : 'block',
              WebkitLineClamp: shouldClamp && !expanded ? 5 : undefined,
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
      </section>

      {/* ── TAGS ── */}
      {event.tags && event.tags.length > 0 && (
        <section style={{ padding: '20px 20px 0' }}>
          <h3 style={{
            margin: '0 0 10px',
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            Tags
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {event.tags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--bg-inset)',
                  color: 'var(--text-secondary)',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 11, fontWeight: 500,
                }}
              >
                <Tag size={9} strokeWidth={2} />
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── ORGANIZER ── */}
      <section style={{ padding: '24px 20px 0' }}>
        <h3 style={{
          margin: '0 0 10px',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          Organized by
        </h3>
        {/* Whole card is tappable — opens the organizer's storefront. */}
        <button
          type="button"
          onClick={() => onOpenStorefront?.(event.organizer)}
          disabled={!onOpenStorefront}
          aria-label={`View ${event.organizer.name}'s profile`}
          style={{
            all: 'unset',
            cursor: onOpenStorefront ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            background: event.organizer.color,
          }}>
            <img
              src={getAvatar(event.organizer.id)}
              alt=""
              width={40} height={40}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <p style={{
              margin: 0, display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.organizer.name}
              </span>
              <OnlineBadge isOnline={event.organizer.isOnline} />
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {event.organizer.role} · View profile
            </p>
          </div>
          {onOpenStorefront && (
            <ChevronRight size={16} strokeWidth={1.8} color="var(--text-muted)" />
          )}
        </button>
      </section>

      {/* ── COMMENTS ── */}
      <section style={{ padding: '24px 20px 0' }}>
        <CommentsSection
          postId={event.id}
          entityType="event"
          onRequireAuth={onRequireAuth}
          onOpenStorefront={onOpenStorefront}
        />
      </section>

        </div>{/* /right column */}
      </div>{/* /desktop grid wrapper */}

      {isOwner && (
        <PhotoEditDialog
          open={photoEditOpen}
          onOpenChange={setPhotoEditOpen}
          initialUrls={photos}
          bucket="events"
          allowVideo={false}
          onSave={handleSaveEventPhotos}
        />
      )}
      {/* ── Registration form manager (owner) — dedicated full-page builder.
           Back returns to this detail screen exactly as it was. */}
      {isOwner && (
        <FormBuilderScreen
          open={manageFormOpen}
          subtitle={event.title}
          fields={mfFields}
          onChange={f => { setMfFields(f); setMfError(null); }}
          onBack={() => setManageFormOpen(false)}
          onSave={saveManagedForm}
          saving={mfSaving}
          loading={mfLoading}
          error={mfError}
          responseCount={mfResponseCount}
          onRemove={mfHadForm ? removeManagedForm : undefined}
        />
      )}
      <ShareCardModal open={shareCardOpen} onOpenChange={setShareCardOpen} spec={shareCardSpec} />
    </div>
  );
}

/* Labelled wrapper for an owner-edit event field — label above the input,
 * matching the rhythm of the item-detail screen. Optional icon sits next
 * to the label so each field is visually identifiable at a glance. */
function EventEditField({
  label, icon, children,
}: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
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

function FactRow({
  icon, label, value, trailing,
}: { icon: React.ReactNode; label: string; value: string; trailing?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--bg-inset)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: trailing ? 500 : 500 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {value}
      </span>
    </div>
  );
}

