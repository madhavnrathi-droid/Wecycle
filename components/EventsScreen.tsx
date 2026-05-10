'use client';

import { useState } from 'react';
import {
  CalendarDays, MapPin, Clock, Users, CheckCircle,
  Plus, Search, AlertCircle, Tag, ChevronRight,
  Flame, Wrench, Leaf, BookOpen, Truck, Zap,
  Star, MessageCircle, ExternalLink,
} from 'lucide-react';
import { EVENTS, LOST_FOUND_ITEMS, type CommunityEvent, type LostItem } from '../lib/mockData';

type Tab = 'events' | 'lost_found' | 'requests';

const EVENT_TYPE_CONFIG = {
  swap: { icon: '🔄', color: '#C8FF4D', label: 'Swap Drive' },
  repair: { icon: '🔧', color: '#A855F7', label: 'Repair Café' },
  cleanup: { icon: '🌿', color: '#3DD6F5', label: 'Cleanup' },
  workshop: { icon: '📚', color: '#FF9A40', label: 'Workshop' },
  drive: { icon: '🚛', color: '#3DD6F5', label: 'Drive' },
  challenge: { icon: '⚡', color: '#FF6B80', label: 'Challenge' },
};

export default function EventsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [rsvpdEvents, setRsvpdEvents] = useState<Set<string>>(new Set(['e1', 'e4', 'e5']));

  const toggleRsvp = (id: string) => {
    setRsvpdEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="screen-transition" style={{ paddingBottom: 100 }}>
      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 16px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h1 style={{
            margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800,
            letterSpacing: '-0.02em', color: 'var(--text-primary)', flex: 1,
          }}>
            Community
          </h1>
          <button className="btn-icon" style={{ borderRadius: 'var(--radius-md)' }}>
            <Search size={16} strokeWidth={2} />
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap: 4 }}>
            <Plus size={14} strokeWidth={2.5} />
            Post
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: -1 }}>
          {(['events', 'lost_found', 'requests'] as Tab[]).map(tab => {
            const labels: Record<Tab, string> = { events: 'Events', lost_found: 'Lost & Found', requests: 'Requests' };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 14px',
                  fontSize: 'var(--text-xs)', fontWeight: 700,
                  color: activeTab === tab ? 'var(--accent-lime)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-lime)' : 'transparent'}`,
                  whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── CONTENT ── */}
      {activeTab === 'events' && <EventsTab rsvpdEvents={rsvpdEvents} onToggleRsvp={toggleRsvp} />}
      {activeTab === 'lost_found' && <LostFoundTab />}
      {activeTab === 'requests' && <RequestsTab />}
    </div>
  );
}

/* ══ EVENTS TAB ══════════════════════════════════ */

function EventsTab({ rsvpdEvents, onToggleRsvp }: { rsvpdEvents: Set<string>; onToggleRsvp: (id: string) => void }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filters = [
    { id: 'all', label: 'All Events' },
    { id: 'swap', label: '🔄 Swap' },
    { id: 'repair', label: '🔧 Repair' },
    { id: 'cleanup', label: '🌿 Cleanup' },
    { id: 'workshop', label: '📚 Workshop' },
    { id: 'challenge', label: '⚡ Challenge' },
  ];

  const filtered = EVENTS.filter(e => activeFilter === 'all' || e.eventType === activeFilter);
  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div>
      {/* Filter chips */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`filter-chip ${activeFilter === f.id ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Featured event (hero card) */}
      {featured && (
        <div style={{ padding: '0 16px 16px' }}>
          <FeaturedEventCard event={featured} isRsvpd={rsvpdEvents.has(featured.id)} onRsvp={() => onToggleRsvp(featured.id)} />
        </div>
      )}

      {/* Events list */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rest.map(event => (
          <EventListCard
            key={event.id}
            event={event}
            isRsvpd={rsvpdEvents.has(event.id)}
            onRsvp={() => onToggleRsvp(event.id)}
          />
        ))}
      </div>

      {/* Create event CTA */}
      <div style={{ padding: '20px 16px' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1.5px dashed var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <p style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Organize an Event
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Swap drive, repair café, workshop — make it happen
          </p>
          <button className="btn btn-primary btn-sm">
            <Plus size={14} /> Create Event
          </button>
        </div>
      </div>
    </div>
  );
}

function FeaturedEventCard({ event, isRsvpd, onRsvp }: { event: CommunityEvent; isRsvpd: boolean; onRsvp: () => void }) {
  const tc = EVENT_TYPE_CONFIG[event.eventType];
  const pct = event.maxAttendees ? (event.attendees / event.maxAttendees) * 100 : 60;

  return (
    <div className="card-hero" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
      {/* Color banner */}
      <div style={{
        background: `linear-gradient(135deg, ${tc.color}30, ${tc.color}10)`,
        padding: '20px 16px 16px',
        borderBottom: `1px solid ${tc.color}25`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-lg)',
            background: `${tc.color}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, flexShrink: 0,
          }}>
            {tc.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span style={{
                background: `${tc.color}20`, color: tc.color,
                fontSize: 10, fontWeight: 700,
                padding: '2px 8px', borderRadius: 'var(--radius-pill)',
              }}>
                {tc.label}
              </span>
              {isRsvpd && (
                <span style={{
                  background: 'rgba(34,197,94,0.12)', color: '#22C55E',
                  fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <CheckCircle size={10} /> Going
                </span>
              )}
            </div>
            <h2 style={{
              margin: '0 0 8px', fontSize: 'var(--text-lg)', fontWeight: 800,
              letterSpacing: '-0.02em', color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}>
              {event.title}
            </h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {event.description}
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* Event details */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {[
            { icon: <CalendarDays size={12} />, text: event.date },
            { icon: <Clock size={12} />, text: event.time },
            { icon: <MapPin size={12} />, text: event.location },
          ].map(({ icon, text }, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {/* Attendance */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>
              <strong style={{ color: tc.color }}>{event.attendees}</strong> going
              {event.maxAttendees && ` · ${event.maxAttendees - event.attendees} spots left`}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {Math.round(pct)}% full
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: tc.color }} />
          </div>
        </div>

        {/* Organizer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: event.organizer.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: '#fff',
          }}>
            {event.organizer.initials}
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Organized by <strong style={{ color: 'var(--text-primary)' }}>{event.organizer.name}</strong>
          </span>
        </div>

        <button
          onClick={onRsvp}
          className="btn"
          style={{
            width: '100%',
            background: isRsvpd ? 'var(--bg-inset)' : tc.color,
            color: isRsvpd ? 'var(--text-secondary)' : 'var(--text-on-accent)',
            border: isRsvpd ? '1.5px solid var(--border-default)' : 'none',
            borderRadius: 'var(--radius-pill)',
            padding: '13px',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
          }}
        >
          {isRsvpd ? '✓ Going — Cancel RSVP' : `RSVP for ${tc.label}`}
        </button>
      </div>
    </div>
  );
}

function EventListCard({ event, isRsvpd, onRsvp }: { event: CommunityEvent; isRsvpd: boolean; onRsvp: () => void }) {
  const tc = EVENT_TYPE_CONFIG[event.eventType];

  return (
    <div className="card" style={{ padding: '14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 'var(--radius-md)',
        background: `${tc.color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
        border: `1px solid ${tc.color}25`,
      }}>
        {tc.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: '0 0 3px', fontSize: 'var(--text-sm)', fontWeight: 700,
              color: 'var(--text-primary)', letterSpacing: '-0.01em',
            }}>
              {event.title}
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {event.date}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>·</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {event.attendees} going
              </span>
            </div>
          </div>
          <button
            onClick={onRsvp}
            style={{
              padding: '5px 12px',
              background: isRsvpd ? 'rgba(34,197,94,0.12)' : tc.color,
              color: isRsvpd ? '#22C55E' : 'var(--text-on-accent)',
              border: isRsvpd ? '1.5px solid rgba(34,197,94,0.25)' : 'none',
              borderRadius: 'var(--radius-pill)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isRsvpd ? '✓ Going' : 'RSVP'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <MapPin size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.location}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ══ LOST & FOUND TAB ═══════════════════════════ */

function LostFoundTab() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [claimedItems, setClaimedItems] = useState<Set<string>>(new Set());

  const filtered = LOST_FOUND_ITEMS.filter(item => {
    if (activeFilter === 'all') return true;
    return item.status === activeFilter;
  });

  return (
    <div>
      {/* Status tabs */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6 }}>
        {(['all', 'lost', 'found'] as const).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`filter-chip ${activeFilter === f ? 'active' : ''}`}
          >
            {f === 'all' ? 'All' : f === 'lost' ? '😟 Lost' : '🎉 Found'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" style={{ gap: 4 }}>
          <Plus size={14} /> Report
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1, background: 'var(--accent-rose-surface)',
          border: '1px solid var(--accent-rose)20',
          borderRadius: 'var(--radius-md)', padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle size={18} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)' }}>
              {LOST_FOUND_ITEMS.filter(i => i.status === 'lost').length}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Lost Items</p>
          </div>
        </div>
        <div style={{
          flex: 1, background: 'var(--accent-lime-surface)',
          border: '1px solid var(--accent-lime)20',
          borderRadius: 'var(--radius-md)', padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={18} style={{ color: 'var(--accent-lime-dim)', flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)' }}>
              {LOST_FOUND_ITEMS.filter(i => i.status === 'found').length}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Found Items</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(item => (
          <LostFoundItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function LostFoundItemCard({ item }: { item: LostItem }) {
  const isLost = item.status === 'lost';

  return (
    <div className="card" style={{
      padding: '14px',
      borderLeft: `3px solid ${isLost ? 'var(--accent-rose)' : 'var(--accent-lime)'}`,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Photo */}
        <div style={{
          width: 64, height: 64, borderRadius: 'var(--radius-md)',
          background: item.photoColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
          border: '1px solid var(--border-subtle)',
          position: 'relative',
        }}>
          {item.photoIcon}
          {item.verified && (
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 16, height: 16, borderRadius: '50%',
              background: '#22C55E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--bg-base)',
            }}>
              <CheckCircle size={8} strokeWidth={2.5} style={{ color: '#fff' }} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <h3 style={{
              margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700,
              color: 'var(--text-primary)', flex: 1, lineHeight: 1.3,
            }}>
              {item.title}
            </h3>
            <span style={{
              background: isLost ? 'var(--accent-rose-surface)' : 'var(--accent-lime-surface)',
              color: isLost ? 'var(--accent-rose)' : 'var(--accent-lime-dim)',
              fontSize: 10, fontWeight: 700,
              padding: '2px 7px', borderRadius: 'var(--radius-pill)', flexShrink: 0,
            }}>
              {isLost ? 'Lost' : 'Found'}
            </span>
          </div>

          <p style={{
            margin: '0 0 6px', fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.description}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
              <MapPin size={10} /> {item.lastSeen}
            </span>
          </div>

          {/* Reporter + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: item.user.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 800, color: '#fff',
            }}>
              {item.user.initials}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {item.user.name.split(' ')[0]} · {item.timeAgo}
            </span>
            {item.reward && (
              <>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>·</span>
                <span style={{
                  background: 'rgba(255,154,64,0.12)', color: 'var(--accent-amber)',
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                }}>
                  Reward: {item.reward}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}>
          {isLost ? '👋 I Found This!' : '✋ This Is Mine'}
        </button>
        <button className="btn btn-secondary btn-sm">
          <MessageCircle size={13} />
        </button>
      </div>
    </div>
  );
}

/* ══ REQUESTS TAB ════════════════════════════════ */

const MOCK_REQUESTS = [
  { id: 'r1', title: 'Need Casio fx-991 calculator', user: 'Sneha Patel', timeAgo: '45m', urgency: 'urgent', offers: 2, emoji: '🖩', desc: 'Finals week, desperate. Will swap my drawing set.' },
  { id: 'r2', title: 'Looking for a portable hard drive (1TB+)', user: 'Karan Singh', timeAgo: '2h', urgency: 'normal', offers: 1, emoji: '💾', desc: 'Need to backup my project files before semester ends.' },
  { id: 'r3', title: 'Anyone have a bike pump?', user: 'Dev Malhotra', timeAgo: '3h', urgency: 'normal', offers: 3, emoji: '🚲', desc: 'Flat tyre on my cycle. Just need it for 20 minutes.' },
  { id: 'r4', title: 'Lab coat size M/L needed', user: 'Meera Iyer', timeAgo: '5h', urgency: 'normal', offers: 0, emoji: '🥼', desc: 'Mine got damaged in the chem lab. Need one for practical tomorrow.' },
  { id: 'r5', title: 'Need extension cord 10m for studio', user: 'Ananya Sharma', timeAgo: '1d', urgency: 'normal', offers: 2, emoji: '🔌', desc: 'Photo shoot project. Need for the weekend.' },
];

function RequestsTab() {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
          {MOCK_REQUESTS.length} open requests
        </p>
        <button className="btn btn-primary btn-sm" style={{ gap: 4 }}>
          <Plus size={14} /> New Request
        </button>
      </div>
      {MOCK_REQUESTS.map(req => (
        <div
          key={req.id}
          className="card"
          style={{
            padding: '14px',
            borderLeft: `3px solid ${req.urgency === 'urgent' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`,
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: req.urgency === 'urgent' ? 'var(--accent-rose-surface)' : 'var(--accent-amber-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0,
            }}>
              {req.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <h3 style={{
                  margin: '0 0 2px', fontSize: 'var(--text-sm)', fontWeight: 700,
                  color: 'var(--text-primary)', flex: 1, lineHeight: 1.3,
                }}>
                  {req.title}
                </h3>
                {req.urgency === 'urgent' && (
                  <span style={{
                    background: 'var(--accent-rose-surface)', color: 'var(--accent-rose)',
                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    borderRadius: 'var(--radius-pill)', flexShrink: 0,
                  }}>
                    Urgent
                  </span>
                )}
              </div>
              <p style={{ margin: '0 0 6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                {req.desc}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{req.user} · {req.timeAgo}</span>
                {req.offers > 0 && (
                  <span style={{
                    background: 'rgba(34,197,94,0.12)', color: 'var(--color-donate)',
                    fontSize: 10, fontWeight: 700, padding: '1px 6px',
                    borderRadius: 'var(--radius-pill)',
                  }}>
                    {req.offers} can help
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 10 }}>
            I Can Help
          </button>
        </div>
      ))}
    </div>
  );
}
