'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, Search, CalendarDays, MapPin, X, Check, Plus } from 'lucide-react';
import { Wordmark } from './Brand';
import { EVENTS, type CommunityEvent } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import { fetchEvents, onPostsChanged } from '../lib/liveData';
import EmptyState from './EmptyState';
import { getEventPhoto, getAvatar } from '../lib/photos';
import { useAuth } from '../lib/AuthContext';

interface EventsScreenProps {
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onCreate: () => void;
  onOpenEvent: (event: CommunityEvent) => void;
  rsvpdEvents: Set<string>;
  /* Takes the whole event (not just the id) — the app-level handler needs
     `hasForm` to decide whether to route the RSVP through the registration
     form before confirming. */
  onToggleRsvp: (event: CommunityEvent) => void;
}

/* ── Filter definitions ───────────────────────────── */

type TimeFilter = 'all' | 'today' | 'this_week' | 'weekend' | 'this_month';

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'all',         label: 'Any time' },
  { id: 'today',       label: 'Today' },
  { id: 'this_week',   label: 'This week' },
  { id: 'weekend',     label: 'Weekend' },
  { id: 'this_month',  label: 'This month' },
];

const TYPE_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'swap',      label: 'Swap' },
  { id: 'repair',    label: 'Repair' },
  { id: 'cleanup',   label: 'Cleanup' },
  { id: 'workshop',  label: 'Workshop' },
  { id: 'drive',     label: 'Drive' },
  { id: 'challenge', label: 'Challenge' },
];

/* Parse the mock event date strings into JS Dates (best-effort) */
function parseEventDate(s: string): Date | null {
  /* mock data uses formats like "Sat, 17 May 2025" or "Mon, 12 – Sun, 18 May" */
  const trimmed = s.split('–')[0].trim();
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function withinTimeFilter(dateStr: string, filter: TimeFilter): boolean {
  if (filter === 'all') return true;
  const d = parseEventDate(dateStr);
  if (!d) return true; // permissive when unparseable
  const now = new Date();
  const dayMs = 86400000;

  if (filter === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (filter === 'this_week') {
    const diff = (d.getTime() - now.getTime()) / dayMs;
    return diff >= -1 && diff <= 7;
  }
  if (filter === 'weekend') {
    const day = d.getDay(); // 0 = Sun, 6 = Sat
    const diff = (d.getTime() - now.getTime()) / dayMs;
    return (day === 0 || day === 6) && diff >= -1 && diff <= 14;
  }
  if (filter === 'this_month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  return true;
}

/* ── SCREEN ──────────────────────────────────────── */

export default function EventsScreen({ onOpenMenu, onOpenAccount, onCreate, onOpenEvent, rsvpdEvents, onToggleRsvp }: EventsScreenProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [query, setQuery] = useState('');
  const [time, setTime] = useState<TimeFilter>('all');
  const [type, setType] = useState<string>('all');
  const rsvpd = rsvpdEvents;

  /* Single source of truth — demo catalogue, live Supabase events, or empty. */
  const [liveEvents, setLiveEvents] = useState<CommunityEvent[]>([]);
  useEffect(() => {
    if (!mounted || isDemoMode() || !hasSupabaseEnv) return;
    let cancelled = false;
    const load = () => { fetchEvents().then(rows => { if (!cancelled) setLiveEvents(rows); }); };
    load();
    const off = onPostsChanged(load);
    return () => { cancelled = true; off(); };
  }, [mounted]);

  const allEvents: CommunityEvent[] = useMemo(
    () => (mounted && isDemoMode() ? EVENTS : liveEvents),
    [mounted, liveEvents],
  );

  const filtered = useMemo(() => {
    return allEvents.filter(e => {
      if (query && !`${e.title} ${e.location}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (type !== 'all' && e.eventType !== type) return false;
      if (!withinTimeFilter(e.date, time)) return false;
      return true;
    });
  }, [allEvents, query, time, type]);

  /* Events the user has RSVP'd to — sorted by upcoming date.
     Powers the carousel that used to be the single featured card. */
  const upcomingRsvps = useMemo(() => {
    return allEvents
      .filter(e => rsvpd.has(e.id))
      .map(e => ({ e, d: parseEventDate(e.date) }))
      .sort((a, b) => {
        const at = a.d?.getTime() ?? Infinity;
        const bt = b.d?.getTime() ?? Infinity;
        return at - bt;
      })
      .map(({ e }) => e);
  }, [rsvpd, allEvents]);

  const rest = filtered;

  const toggleRsvp = onToggleRsvp;

  return (
    <div className="screen-transition" style={{ paddingBottom: 120, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── TOP BAR ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '14px 16px 10px',
        }}
        className="mobile-only-nav"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="theme-toggle"
            style={{ marginLeft: -8 }}
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Wordmark height={30} />
          </span>
          <button
            aria-label="Your profile"
            onClick={onOpenAccount}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--bg-inset)',
              border: 'none', cursor: 'pointer',
              padding: 0, overflow: 'hidden',
            }}
            suppressHydrationWarning
          >
            {mounted && (
              <img
                src={getAvatar(user?.id ?? 'guest')}
                alt=""
                width={34}
                height={34}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </button>
        </div>
      </header>

      {/* ── PAGE TITLE ── */}
      <section style={{ padding: '14px 20px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 26, fontWeight: 600,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.15,
          }}>
            Events
          </h1>
          <p style={{
            margin: '4px 0 0',
            fontSize: 13, color: 'var(--text-muted)',
          }}>
            Swaps, repair cafés, workshops & more
          </p>
        </div>
        <button
          onClick={onCreate}
          aria-label="Create event"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--text-primary)', color: 'var(--bg-base)',
            border: 'none', borderRadius: 999,
            padding: '8px 14px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            letterSpacing: '-0.01em', flexShrink: 0,
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          New
        </button>
      </section>

      {/* ── SEARCH ── */}
      <section style={{ padding: '0 16px 12px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} strokeWidth={1.8} style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search events…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-pill"
            aria-label="Search events"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </section>

      {/* ── TIME FILTER (segmented) ── */}
      <section style={{ padding: '0 0 8px' }}>
        <div className="chip-row" role="tablist" aria-label="Time filter">
          {TIME_FILTERS.map(f => (
            <button
              key={f.id}
              role="tab"
              aria-selected={time === f.id}
              onClick={() => setTime(f.id)}
              className={`pill ${time === f.id ? 'pill-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── TYPE FILTER (hidden until we have more event data) ──
         We kept TYPE_FILTERS + the `type` state below for when this comes
         back; the chip row was just visual noise on a screen that currently
         only shows a handful of events. Add the section back once there are
         enough events to meaningfully filter by category. */}

      {/* ── YOUR UPCOMING (RSVP'd events carousel) ── */}
      <section style={{ padding: '8px 20px 8px' }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          Your upcoming
        </h3>
      </section>
      {upcomingRsvps.length > 0 ? (
        <section
          className="rsvp-carousel"
          aria-label="Events you're attending"
          role="region"
        >
          {upcomingRsvps.map(event => (
            <UpcomingRsvpCard
              key={event.id}
              event={event}
              onCancel={() => toggleRsvp(event)}
              onOpen={() => onOpenEvent(event)}
            />
          ))}
        </section>
      ) : (
        <section style={{ padding: '4px 20px 20px' }}>
          <div style={{
            padding: '22px 18px',
            background: 'var(--bg-inset)',
            borderRadius: 18,
            textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              You haven't RSVP'd to anything yet
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Tap RSVP on any event below to add it here.
            </p>
          </div>
        </section>
      )}

      {/* ── ALL EVENTS LIST ── */}
      {rest.length > 0 && (
        <>
          <section style={{ padding: '18px 20px 12px' }}>
            <h3 style={{
              margin: 0, fontSize: 13, fontWeight: 600,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              Browse events
            </h3>
          </section>
          <section className="events-list" style={{ padding: '0 16px' }}>
            {rest.map(event => (
              <EventListCard
                key={event.id}
                event={event}
                isRsvpd={rsvpd.has(event.id)}
                onRsvp={() => toggleRsvp(event)}
                onOpen={() => onOpenEvent(event)}
              />
            ))}
          </section>
        </>
      )}

      {filtered.length === 0 && (
        allEvents.length === 0 ? (
          /* No events yet anywhere — invite the first organizer. */
          <EmptyState
            icon="📅"
            prompt="No events on the calendar yet. Plant a flag — start one?"
            sub="Repair café, swap drive, cleanup — every great community has someone who goes first."
            cta={{ label: 'Create an event', onClick: onCreate }}
          />
        ) : (
          /* Filter mismatch — keep the gentle "clear filters" path. */
          <EmptyState
            icon="📅"
            prompt="No events match those filters."
            sub="Try a different time, category, or clear the search."
            compact
            cta={{ label: 'Clear filters', onClick: () => { setTime('all'); setType('all'); setQuery(''); } }}
          />
        )
      )}
    </div>
  );
}

/* ══ UPCOMING RSVP CARD (horizontal carousel) ════════ */

function UpcomingRsvpCard({ event, onCancel, onOpen }: { event: CommunityEvent; onCancel: () => void; onOpen?: () => void }) {
  const photo = getEventPhoto(event.id, event.eventType);
  return (
    <article className="rsvp-card">
      <button
        type="button"
        onClick={onOpen}
        className="rsvp-card-photo"
        aria-label={`Open ${event.title}`}
        style={{ border: 'none', padding: 0, cursor: onOpen ? 'pointer' : 'default', background: 'var(--bg-inset)' }}
      >
        <img src={photo} alt="" loading="lazy" />
        <div className="rsvp-card-overlay" />
        <span className="rsvp-card-going">
          <Check size={11} strokeWidth={2.5} />
          Going
        </span>
        <div className="rsvp-card-meta">
          <p className="rsvp-card-label">{labelForType(event.eventType)}</p>
          <p className="rsvp-card-title">{event.title}</p>
          <p className="rsvp-card-when">
            <CalendarDays size={11} strokeWidth={1.8} />
            {event.date} · {event.time}
          </p>
        </div>
      </button>
      <div className="rsvp-card-footer">
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <MapPin size={11} strokeWidth={1.8} />
          {event.location}
        </span>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 11, fontWeight: 500,
            padding: 0,
          }}
        >
          Cancel
        </button>
      </div>
    </article>
  );
}

/* ══ FEATURED EVENT CARD ═════════════════════════ */

function FeaturedEventCard({ event, isRsvpd, onRsvp }: { event: CommunityEvent; isRsvpd: boolean; onRsvp: () => void }) {
  const photo = getEventPhoto(event.id, event.eventType);
  const pct = event.maxAttendees ? Math.min(100, (event.attendees / event.maxAttendees) * 100) : 60;

  return (
    <article style={{
      borderRadius: 22,
      overflow: 'hidden',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
    }}>
      {/* Photo */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '5 / 4',
        background: 'var(--bg-inset)',
      }}>
        <img
          src={photo}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(0,0,0,0.55)', color: '#fff',
          backdropFilter: 'blur(8px)',
          borderRadius: 999,
          padding: '5px 10px',
          fontSize: 11, fontWeight: 500, letterSpacing: '-0.01em',
        }}>
          {labelForType(event.eventType)}
        </div>
        {isRsvpd && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            background: '#22C55E', color: '#fff',
            borderRadius: 999, padding: '5px 10px',
            fontSize: 11, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Check size={11} strokeWidth={2.5} /> Going
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 16px' }}>
        <h2 style={{
          margin: 0, fontSize: 18, fontWeight: 600,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
          lineHeight: 1.25,
        }}>
          {event.title}
        </h2>
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CalendarDays size={12} strokeWidth={1.8} />
            {event.date} · {event.time}
          </span>
        </div>
        <div style={{
          marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          <MapPin size={12} strokeWidth={1.8} />
          {event.location}
        </div>

        {/* Attendance bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{event.attendees}</strong>
              {event.maxAttendees ? ` / ${event.maxAttendees} going` : ' going'}
            </span>
            {event.maxAttendees && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(pct)}% full</span>
            )}
          </div>
          <div style={{ height: 3, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: event.colorAccent ?? 'var(--text-primary)',
              borderRadius: 99,
              transition: 'width 0.4s',
            }} />
          </div>
        </div>

        <button
          onClick={onRsvp}
          style={{
            marginTop: 14, width: '100%',
            background: isRsvpd ? 'var(--bg-inset)' : 'var(--text-primary)',
            color: isRsvpd ? 'var(--text-primary)' : 'var(--bg-base)',
            border: isRsvpd ? '1px solid var(--border-default)' : 'none',
            borderRadius: 999,
            padding: '12px',
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer', letterSpacing: '-0.01em',
          }}
        >
          {isRsvpd ? '✓ You\'re going' : 'RSVP'}
        </button>
      </div>
    </article>
  );
}

/* ══ EVENT LIST CARD (compact) ═══════════════════ */

function EventListCard({ event, isRsvpd, onRsvp, onOpen }: { event: CommunityEvent; isRsvpd: boolean; onRsvp: () => void; onOpen?: () => void }) {
  const photo = getEventPhoto(event.id, event.eventType);

  return (
    <article style={{
      display: 'flex', gap: 12,
      padding: 10,
      background: 'var(--bg-card)',
      borderRadius: 18,
      boxShadow: '0 1px 2px rgba(28,28,26,0.04), 0 6px 20px rgba(28,28,26,0.06)',
    }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${event.title}`}
        style={{
          flex: 1, minWidth: 0, display: 'flex', gap: 12, alignItems: 'center',
          background: 'transparent', border: 'none', padding: 0, cursor: onOpen ? 'pointer' : 'default',
          textAlign: 'left', font: 'inherit', color: 'inherit',
        }}
      >
        <div style={{
          width: 88, height: 88, borderRadius: 12,
          overflow: 'hidden', flexShrink: 0,
          background: 'var(--bg-inset)',
        }}>
          <img
            src={photo}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              marginBottom: 3,
            }}>
              {labelForType(event.eventType)}
              {event.hasForm && (
                <span style={{
                  color: '#8B5CF6', background: 'rgba(139,92,246,0.12)',
                  padding: '1px 6px', borderRadius: 999,
                  fontSize: 9, fontWeight: 700,
                }}>
                  📋 Register
                </span>
              )}
            </div>
            <h3 style={{
              margin: 0, fontSize: 14, fontWeight: 600,
              letterSpacing: '-0.015em', color: 'var(--text-primary)',
              lineHeight: 1.25,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {event.title}
            </h3>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
            fontSize: 11, color: 'var(--text-muted)',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <CalendarDays size={10} strokeWidth={1.8} />
              {event.date}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={10} strokeWidth={1.8} />
              {event.location}
            </span>
          </div>
        </div>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onRsvp(); }}
        aria-label={isRsvpd ? 'Cancel RSVP' : 'RSVP'}
        style={{
          alignSelf: 'center',
          background: isRsvpd ? '#22C55E' : 'var(--bg-inset)',
          color: isRsvpd ? '#fff' : 'var(--text-primary)',
          border: isRsvpd ? 'none' : '1px solid var(--border-subtle)',
          borderRadius: 999,
          padding: '7px 12px',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {isRsvpd
          ? <><Check size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-1px' }} /> Going</>
          : event.hasForm ? 'Register' : 'RSVP'}
      </button>
    </article>
  );
}

function labelForType(t: CommunityEvent['eventType']): string {
  return {
    swap: 'Swap drive',
    repair: 'Repair café',
    cleanup: 'Cleanup',
    workshop: 'Workshop',
    drive: 'Collection drive',
    challenge: 'Challenge',
  }[t];
}
