'use client';

import { useState } from 'react';
import {
  ChevronLeft, CalendarDays, Clock, MapPin, Users,
  Heart, Share2, MessageCircle, Check, Edit3, Tag,
} from 'lucide-react';
import type { CommunityEvent } from '../lib/mockData';
import { getEventPhotos, getAvatar } from '../lib/photos';
import { getEventMetrics } from '../lib/metrics';
import PhotoCarousel from './PhotoCarousel';

interface EventDetailScreenProps {
  event: CommunityEvent;
  isRsvpd: boolean;
  isOwner: boolean;
  onBack: () => void;
  onRsvp: () => void;
  onEdit?: () => void;
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
  event, isRsvpd, isOwner, onBack, onRsvp, onEdit,
}: EventDetailScreenProps) {
  const photos = getEventPhotos(event.id, event.eventType);
  const [expanded, setExpanded] = useState(false);
  const desc = event.description ?? '';
  const shouldClamp = desc.length > 220;

  const metrics = getEventMetrics(event.id);
  const pct = event.maxAttendees ? Math.min(100, (event.attendees / event.maxAttendees) * 100) : 60;

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
        {isOwner ? (
          <button
            onClick={onEdit}
            aria-label="Edit event"
            className="theme-toggle"
          >
            <Edit3 size={18} strokeWidth={1.8} />
          </button>
        ) : (
          <button
            aria-label="Share event"
            className="theme-toggle"
          >
            <Share2 size={17} strokeWidth={1.8} />
          </button>
        )}
      </header>

      {/* ── HERO PHOTO CAROUSEL ── */}
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

      {/* ── TITLE + KEY FACTS ── */}
      <section style={{ padding: '20px 20px 0' }}>
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
        }}>
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
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {event.organizer.name}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {event.organizer.role}
            </p>
          </div>
          {!isOwner && (
            <button
              aria-label="Message organizer"
              className="theme-toggle"
              style={{ marginRight: -4 }}
            >
              <MessageCircle size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </section>

      {/* ── OWNER METRICS ── */}
      {isOwner && (
        <section style={{ padding: '24px 20px 0' }}>
          <h3 style={{
            margin: '0 0 10px',
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            Your event metrics
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
      )}

      {/* ── BOTTOM CTA ── */}
      <section style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        padding: '12px 16px calc(80px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(to bottom, transparent, var(--bg-base) 35%, var(--bg-base) 100%)',
        pointerEvents: 'none',
        zIndex: 30,
      }}>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
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
            onClick={onRsvp}
            style={{
              flex: 1, height: 52, borderRadius: 999,
              background: isRsvpd ? 'var(--bg-surface)' : 'var(--text-primary)',
              color: isRsvpd ? 'var(--text-primary)' : 'var(--bg-base)',
              border: isRsvpd ? '1px solid var(--border-default)' : 'none',
              cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {isRsvpd ? <><Check size={14} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />You're going</> : 'RSVP'}
          </button>
        </div>
      </section>
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
