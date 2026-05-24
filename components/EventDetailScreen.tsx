'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, Users,
  Heart, Share2, Mail, Check, Tag, Trash2, Save, RotateCcw, Loader2,
} from 'lucide-react';
import type { CommunityEvent, User } from '../lib/mockData';
import { getEventPhotos, getAvatar } from '../lib/photos';
import { getEventMetrics } from '../lib/metrics';
import OnlineBadge from './OnlineBadge';
import PhotoCarousel from './PhotoCarousel';
import CommentsSection from './CommentsSection';
import { useAuth } from '../lib/AuthContext';
import { buildContactLinks, type ContactLink } from '../lib/contactUser';
import { useBreakpoint } from '../lib/useBreakpoint';
import { updateEvent } from '../lib/liveData';
import { isDemoMode } from '../lib/demoMode';

interface EventDetailScreenProps {
  event: CommunityEvent;
  isRsvpd: boolean;
  isOwner: boolean;
  onBack: () => void;
  onRsvp: () => void;
  onRequireAuth: () => void;
  onOpenStorefront?: (user: User) => void;
  onDelete?: () => void | Promise<void>;
}

const EVENT_TYPES: { id: CommunityEvent['eventType']; label: string }[] = [
  { id: 'swap',      label: 'Swap drive' },
  { id: 'repair',    label: 'Repair café' },
  { id: 'cleanup',   label: 'Cleanup' },
  { id: 'workshop',  label: 'Workshop' },
  { id: 'drive',     label: 'Collection drive' },
  { id: 'challenge', label: 'Challenge' },
];

/* Parse the human-formatted date/time string on a CommunityEvent into ISO
 * components we can re-emit. Events store starts_at as ISO, but the mapper
 * pretty-formats it for display — we don't have the raw ISO here. So we
 * round-trip via the formatted strings: re-parse what we display. */
function parseEventDateTime(dateStr: string, timeStr: string): { date: string; time: string } {
  /* dateStr like "Sat, 24 May 2026"; timeStr like "5:30pm" */
  try {
    const combined = `${dateStr} ${timeStr.replace(/\s+/g, '')}`;
    const d = new Date(combined);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
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
}: EventDetailScreenProps) {
  /* Prefer the organizer's uploaded photos; mock events fall back to the
     curated Unsplash covers. Real events with no upload → empty array → we
     render the hero block without an image. */
  const uploadedPhotos = (event as { photoUrls?: string[] }).photoUrls;
  const photos: string[] = uploadedPhotos && uploadedPhotos.length > 0
    ? uploadedPhotos
    : (Array.isArray(uploadedPhotos) ? [] : getEventPhotos(event.id, event.eventType));
  const hasPhotos = photos.length > 0;
  const [expanded, setExpanded] = useState(false);
  const desc = event.description ?? '';
  const shouldClamp = desc.length > 220;
  const { user, profile } = useAuth();
  const { isDesktop } = useBreakpoint();

  const metrics = getEventMetrics(event.id);
  const pct = event.maxAttendees ? Math.min(100, (event.attendees / event.maxAttendees) * 100) : 60;

  /* ── Inline edit state (owner only) ── */
  const initial = useMemo(() => parseEventDateTime(event.date, event.time), [event.date, event.time]);
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

  /* Contact links for messaging the organizer — same flow as item details. */
  const contactLinks: ContactLink[] = useMemo(() => buildContactLinks({
    owner: {
      name:    event.organizer.name,
      email:   event.organizer.email,
      phone:   event.organizer.phone,
      contact: event.organizer.contact,
    },
    action: 'event',
    event,
    viewerName: profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined,
  }), [event, profile, user]);

  const handleContact = (link: ContactLink) => {
    if (!user) { onRequireAuth(); return; }
    if (link.channel === 'whatsapp') {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = link.href;
    }
  };

  const handleRsvpClick = () => {
    if (!user) { onRequireAuth(); return; }
    onRsvp();
  };

  /* When both channels are accepted we render two named buttons inline with
     the RSVP CTA. When only one, the message button sits beside RSVP. */
  const hasBoth = contactLinks.length >= 2;

  return (
    <div className="screen-transition" style={{ paddingBottom: 140, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
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
        {/* Header right-side: share for guests, RSVP confirmation for going.
           Owners just see a spacer (their editing happens in-place below,
           with the Save CTA at the bottom). */}
        {isOwner ? (
          <span style={{ width: 36 }} aria-hidden="true" />
        ) : (
          <button
            aria-label="Share event"
            className="theme-toggle"
          >
            <Share2 size={17} strokeWidth={1.8} />
          </button>
        )}
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
        {/* ── HERO PHOTO CAROUSEL ── */}
        {hasPhotos && (
          <section style={{ padding: isDesktop ? 0 : '12px 16px 0' }}>
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: isDesktop ? 560 : undefined,
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
                    {isRsvpd && (
                      <div style={{
                        position: 'absolute', top: 14, right: 14,
                        background: '#22C55E', color: '#fff',
                        borderRadius: 999, padding: '5px 11px',
                        fontSize: 11, fontWeight: 600,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        zIndex: 4,
                      }}>
                        <Check size={11} strokeWidth={2.5} /> Going
                      </div>
                    )}
                  </>
                }
              />
            </div>
          </section>
        )}
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
              <FactRow
                icon={<Clock size={14} strokeWidth={1.8} />}
                label="Time"
                value={event.time}
              />
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
          onRequireAuth={onRequireAuth}
          onOpenStorefront={onOpenStorefront}
        />
      </section>

      {/* ── METRICS ──
         Surfaced on every event page now (not gated by ownership) — viewers
         get social proof from the same numbers the organizer sees. Label
         shifts from "Your event metrics" to "Event activity" for non-owners. */}
      <section style={{ padding: '24px 20px 0' }}>
        <h3 style={{
          margin: '0 0 10px',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          {isOwner ? 'Your event metrics' : 'Event activity'}
        </h3>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          padding: '14px 12px',
          gap: 8,
        }}>
          <MiniStat label="Views"    value={metrics.views} />
          <MiniStat label="RSVPs"    value={metrics.rsvps} />
          <MiniStat label="Shares"   value={metrics.shares} />
          <MiniStat label="Questions" value={metrics.questions} />
        </div>
      </section>
        </div>{/* /right column */}
      </div>{/* /desktop grid wrapper */}

      {/* ── BOTTOM CTA ── */}
      <section style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        padding: '12px 16px calc(80px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to bottom, transparent, var(--bg-base) 35%, var(--bg-base) 100%)',
        pointerEvents: 'none',
        zIndex: 30,
      }}>
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
              onDelete && (
                <button
                  onClick={async () => {
                    if (typeof window !== 'undefined' && !window.confirm('Delete this event permanently?')) return;
                    await onDelete();
                    onBack();
                  }}
                  style={{
                    flex: 1, height: 52, padding: '0 18px', borderRadius: 999,
                    background: 'transparent', color: 'var(--accent-rose)',
                    border: '1px solid var(--accent-rose)', cursor: 'pointer',
                    fontSize: 14, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Trash2 size={16} strokeWidth={2} /> Delete event
                </button>
              )
            )
          ) : (
          <>
          <button
            aria-label="Save"
            style={{
              width: 52, height: 52, borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Heart size={18} strokeWidth={1.8} />
          </button>
          <button
            onClick={handleRsvpClick}
            style={{
              flex: 1, minWidth: 120, height: 52, borderRadius: 999,
              background: isRsvpd ? 'var(--bg-surface)' : 'var(--text-primary)',
              color: isRsvpd ? 'var(--text-primary)' : 'var(--bg-base)',
              border: isRsvpd ? '1px solid var(--border-default)' : 'none',
              cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {isRsvpd
              ? <><Check size={14} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />You're going</>
              : 'RSVP'}
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
            ) : null
          )}
          </>
          )}
        </div>
        </div>
      </section>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{
        margin: 0, fontSize: 18, fontWeight: 700,
        letterSpacing: '-0.025em', color: 'var(--text-primary)',
        lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
      }}>
        {value.toLocaleString()}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
        {label}
      </p>
    </div>
  );
}
