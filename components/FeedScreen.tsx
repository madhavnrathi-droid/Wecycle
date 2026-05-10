'use client';

import { useState } from 'react';
import {
  Search, Bell, ChevronDown, ArrowRight, Heart, MessageCircle,
  Share2, Repeat2, AlertCircle, Wrench, MapPin, Clock,
  Package, HelpCircle, CalendarDays, Trophy, Plus, Zap,
  CheckCircle, Star,
} from 'lucide-react';
import {
  FEED_ITEMS, USERS, CURRENT_USER, COMMUNITIES,
  type FeedItem, type User,
} from '../lib/mockData';

const QUICK_ACTIONS = [
  { icon: '🎁', label: 'Donate', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  { icon: '🙋', label: 'Request', color: '#FF9A40', bg: 'rgba(255,154,64,0.12)' },
  { icon: '🔄', label: 'Borrow', color: '#6C63FF', bg: 'rgba(108,99,255,0.12)' },
  { icon: '📅', label: 'Event', color: '#3DD6F5', bg: 'rgba(61,214,245,0.12)' },
  { icon: '🔍', label: 'Lost?', color: '#FF6B80', bg: 'rgba(255,107,128,0.12)' },
  { icon: '🔧', label: 'Repair', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
];

const ACTIVE_RING_USERS = USERS.slice(0, 6);

export default function FeedScreen({ onPost }: { onPost: () => void }) {
  const [notifCount] = useState(3);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set(['m2']));
  const [communityOpen, setCommunityOpen] = useState(false);

  const toggleSave = (id: string) => {
    setSavedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="screen-transition" style={{ paddingBottom: 100 }}>
      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 16px 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <div style={{ flexShrink: 0 }}>
            <span style={{
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: '-0.04em',
              color: 'var(--text-primary)',
            }}>
              We<span style={{ color: 'var(--accent-lime)' }}>cycle</span>
            </span>
          </div>

          {/* Community selector */}
          <button
            onClick={() => setCommunityOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--bg-inset)',
              border: '1.5px solid var(--border-default)',
              borderRadius: 'var(--radius-pill)',
              padding: '5px 10px 5px 8px',
              cursor: 'pointer', fontSize: 'var(--text-xs)',
              fontWeight: 600, color: 'var(--text-secondary)',
              flex: 1, maxWidth: 160, minWidth: 0,
            }}
          >
            <span style={{ fontSize: 12 }}>🏛️</span>
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              BITS Goa
            </span>
            <ChevronDown size={12} />
          </button>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <button className="btn-icon" style={{ borderRadius: '50%', flexShrink: 0 }}>
            <Search size={18} strokeWidth={2} />
          </button>

          {/* Notifications */}
          <button
            className="press-scale"
            style={{
              position: 'relative', background: 'none', border: 'none',
              cursor: 'pointer', flexShrink: 0,
              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <Bell size={20} strokeWidth={1.8} />
            {notifCount > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 6,
                background: 'var(--accent-rose)',
                color: '#fff', fontSize: 9, fontWeight: 700,
                width: 16, height: 16, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg-base)',
              }}>
                {notifCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── ACTIVITY TICKER ── */}
      <div style={{
        background: 'var(--accent-lime)',
        padding: '8px 0',
        overflow: 'hidden',
      }}>
        <div className="ticker-track" style={{ color: 'var(--text-on-accent)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
          {[
            '⚡ 12 items shared today',
            '🔄 3 swaps completed this hour',
            '🌿 8.4 tonnes CO₂ diverted',
            '🔧 Repair Café: Thu 6–9 PM',
            '📦 Semester-end drive: Sat May 17',
            '👥 1,847 active members',
            '⚡ 12 items shared today',
            '🔄 3 swaps completed this hour',
            '🌿 8.4 tonnes CO₂ diverted',
          ].map((t, i) => (
            <span key={i} style={{ padding: '0 24px', whiteSpace: 'nowrap' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{
          display: 'flex', gap: 8,
          overflowX: 'auto', paddingBottom: 4,
        }}>
          {QUICK_ACTIONS.map(({ icon, label, color, bg }) => (
            <button
              key={label}
              className="press-scale"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                flexShrink: 0, padding: '4px 2px',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 'var(--radius-lg)',
                background: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
                border: `1.5px solid ${color}20`,
              }}>
                {icon}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: 'var(--text-secondary)',
                letterSpacing: '0.01em',
              }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── ACTIVE MEMBERS RING ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {ACTIVE_RING_USERS.map((user, i) => (
              <div
                key={user.id}
                style={{
                  width: 38, height: 38,
                  borderRadius: '50%',
                  background: user.color,
                  border: `2.5px solid var(--bg-base)`,
                  marginLeft: i === 0 ? 0 : -10,
                  zIndex: ACTIVE_RING_USERS.length - i,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                  {user.initials}
                </span>
                {user.isOnline && (
                  <div style={{
                    position: 'absolute', bottom: 1, right: 1,
                    width: 9, height: 9, borderRadius: '50%',
                    background: '#22C55E',
                    border: '2px solid var(--bg-base)',
                  }} />
                )}
              </div>
            ))}
          </div>
          <div>
            <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              38 active now
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
              in your community
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <button style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent-lime-dim)', fontSize: 'var(--text-xs)', fontWeight: 700,
          }}>
            Map <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* ── FEED ITEMS ── */}
      <div style={{ padding: '16px 0 0' }}>
        {FEED_ITEMS.map((item, i) => (
          <div key={item.id} style={{
            padding: '0 16px 16px',
            animationDelay: `${i * 0.04}s`,
          }}>
            <FeedCard
              item={item}
              isSaved={savedItems.has(item.id)}
              onSave={() => toggleSave(item.id)}
            />
          </div>
        ))}
      </div>

      {/* ── LOAD MORE ── */}
      <div style={{ padding: '0 16px 16px', textAlign: 'center' }}>
        <button className="btn btn-secondary" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
          Load more activity
        </button>
      </div>
    </div>
  );
}

/* ══ FEED CARD ROUTER ══════════════════════════════ */

function FeedCard({ item, isSaved, onSave }: { item: FeedItem; isSaved: boolean; onSave: () => void }) {
  switch (item.type) {
    case 'item_shared': return <ItemSharedCard item={item} isSaved={isSaved} onSave={onSave} />;
    case 'request': return <RequestCard item={item} />;
    case 'event': return <EventCard item={item} />;
    case 'milestone':
    case 'announcement': return <MilestoneCard item={item} />;
    case 'repair': return <RepairCard item={item} />;
    case 'lost_found': return <LostFoundCard item={item} />;
    default: return null;
  }
}

/* ── Shared header for all cards ── */
function CardHeader({ user, timeAgo, badge }: { user: User; timeAgo: string; badge?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div
        className="avatar"
        style={{ width: 36, height: 36, background: user.color, flexShrink: 0 }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{user.initials}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
          {user.name}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {user.role} · {timeAgo}
        </p>
      </div>
      {badge}
    </div>
  );
}

/* ── Card actions bar ── */
function CardActions({ responses, onSave, isSaved }: { responses?: number; onSave?: () => void; isSaved?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      borderTop: '1px solid var(--border-subtle)',
      paddingTop: 10, marginTop: 12,
    }}>
      <button
        onClick={onSave}
        className="press-scale"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 10px', borderRadius: 'var(--radius-pill)',
          color: isSaved ? 'var(--accent-rose)' : 'var(--text-muted)',
          fontSize: 'var(--text-xs)', fontWeight: 600,
          transition: 'color 0.15s',
        }}
      >
        <Heart size={14} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} />
        Save
      </button>
      <button
        className="press-scale"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 10px', borderRadius: 'var(--radius-pill)',
          color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600,
        }}
      >
        <MessageCircle size={14} strokeWidth={2} />
        {responses != null ? responses : 'Reply'}
      </button>
      <div style={{ flex: 1 }} />
      <button
        className="press-scale"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 10px', borderRadius: 'var(--radius-pill)',
          color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600,
        }}
      >
        <Share2 size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ══ CARD TYPES ══════════════════════════════════== */

function ItemSharedCard({ item, isSaved, onSave }: { item: FeedItem; isSaved: boolean; onSave: () => void }) {
  const it = item.item!;

  const typeColors: Record<string, { bg: string; text: string; label: string }> = {
    free: { bg: 'rgba(34,197,94,0.12)', text: 'var(--color-donate)', label: 'Free' },
    borrow: { bg: 'rgba(108,99,255,0.12)', text: 'var(--color-exchange)', label: 'Borrow' },
    swap: { bg: 'rgba(61,214,245,0.12)', text: 'var(--color-event)', label: 'Swap' },
    sell: { bg: 'rgba(255,154,64,0.12)', text: 'var(--accent-amber)', label: `₹${it.price}` },
  };
  const tc = typeColors[it.listingType];

  return (
    <div className="card" style={{ padding: '14px 14px 10px' }}>
      <CardHeader user={item.user} timeAgo={item.timeAgo} />

      {/* Photo + Info row */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Photo */}
        <div style={{
          width: 80, height: 80, borderRadius: 'var(--radius-md)',
          background: it.photoColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, flexShrink: 0,
          border: '1px solid var(--border-subtle)',
        }}>
          {it.photoIcon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <h3 style={{
              margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700,
              color: 'var(--text-primary)', letterSpacing: '-0.01em',
              flex: 1, lineHeight: 1.3,
            }}>
              {it.title}
            </h3>
            {/* Type badge */}
            <span style={{
              background: tc.bg, color: tc.text,
              fontSize: 10, fontWeight: 700, padding: '3px 7px',
              borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {tc.label}
            </span>
          </div>

          <p style={{
            margin: '0 0 6px', fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {it.description}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 10 }}>
              <MapPin size={10} />
              <span>{it.location}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 10 }}>
              <MessageCircle size={10} />
              <span>{it.responses} interested</span>
            </div>
          </div>
        </div>
      </div>

      <CardActions responses={it.responses} isSaved={isSaved} onSave={onSave} />
    </div>
  );
}

function RequestCard({ item }: { item: FeedItem }) {
  const req = item.request!;
  return (
    <div className="card" style={{
      padding: '14px 14px 10px',
      borderLeft: `3px solid ${req.urgency === 'urgent' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`,
    }}>
      <CardHeader
        user={item.user}
        timeAgo={item.timeAgo}
        badge={
          req.urgency === 'urgent' ? (
            <span style={{
              background: 'var(--accent-rose-surface)',
              color: 'var(--accent-rose)',
              fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 'var(--radius-pill)',
            }}>
              Urgent
            </span>
          ) : null
        }
      />
      <div style={{
        background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)',
        padding: '10px 12px', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <HelpCircle size={15} strokeWidth={2} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {req.title}
          </p>
        </div>
        <p style={{
          margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4,
          paddingLeft: 23,
        }}>
          {req.description}
        </p>
        {req.offers > 0 && (
          <p style={{
            margin: '8px 0 0', paddingLeft: 23,
            fontSize: 'var(--text-xs)', color: 'var(--color-donate)', fontWeight: 700,
          }}>
            {req.offers} member{req.offers !== 1 ? 's' : ''} can help →
          </p>
        )}
      </div>
      <button className="btn btn-primary btn-sm" style={{ width: '100%' }}>
        I Can Help
      </button>
    </div>
  );
}

function EventCard({ item }: { item: FeedItem }) {
  const ev = item.event!;
  const typeIcons: Record<string, string> = {
    swap: '🔄', repair: '🔧', cleanup: '🌿',
    workshop: '📚', drive: '🚛', challenge: '⚡',
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Color header */}
      <div style={{
        background: `linear-gradient(135deg, ${ev.colorAccent}22, ${ev.colorAccent}08)`,
        borderBottom: `1px solid ${ev.colorAccent}30`,
        padding: '14px 14px 10px',
      }}>
        <CardHeader user={item.user} timeAgo={item.timeAgo} />

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 'var(--radius-md)',
            background: `${ev.colorAccent}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, flexShrink: 0,
          }}>
            {typeIcons[ev.eventType]}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: '0 0 4px', fontSize: 'var(--text-md)', fontWeight: 700,
              color: 'var(--text-primary)', letterSpacing: '-0.01em',
            }}>
              {ev.title}
            </h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                <CalendarDays size={11} /> {ev.date}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                <Clock size={11} /> {ev.time}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                <MapPin size={11} /> {ev.location}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 700, color: ev.colorAccent }}>
              {ev.attendees} going
              {ev.maxAttendees && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  {' '}/ {ev.maxAttendees} spots
                </span>
              )}
            </p>
            {/* Progress bar */}
            {ev.maxAttendees && (
              <div style={{ marginTop: 4, width: 120, height: 3, background: 'var(--border-default)', borderRadius: 99 }}>
                <div style={{
                  width: `${Math.min(100, (ev.attendees / ev.maxAttendees) * 100)}%`,
                  height: '100%', background: ev.colorAccent, borderRadius: 99,
                }} />
              </div>
            )}
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ background: ev.colorAccent, color: 'var(--text-on-accent)' }}
          >
            RSVP
          </button>
        </div>
      </div>
    </div>
  );
}

function MilestoneCard({ item }: { item: FeedItem }) {
  const ms = item.milestone!;
  const isAnnouncement = item.type === 'announcement';
  return (
    <div className="card" style={{
      background: isAnnouncement ? 'var(--accent-cyan-surface)' : 'var(--accent-lime-surface)',
      borderColor: isAnnouncement ? 'var(--accent-cyan)30' : 'var(--accent-lime)30',
      padding: '16px',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--radius-md)',
          background: isAnnouncement ? 'rgba(61,214,245,0.2)' : 'rgba(200,255,77,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {isAnnouncement ? '📣' : '🏆'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: isAnnouncement ? 'var(--accent-cyan)' : 'var(--accent-lime-dim)',
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            {ms.metric}
          </div>
          <h3 style={{
            margin: '0 0 4px', fontSize: 'var(--text-md)', fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>
            {ms.title}
          </h3>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {ms.description}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {item.user.name} · {item.timeAgo}
          </p>
        </div>
      </div>
    </div>
  );
}

function RepairCard({ item }: { item: FeedItem }) {
  const rep = item.repair!;
  return (
    <div className="card" style={{ padding: '14px 14px 10px' }}>
      <CardHeader
        user={item.user}
        timeAgo={item.timeAgo}
        badge={
          <span style={{
            background: 'rgba(168,85,247,0.12)', color: 'var(--color-repair)',
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-pill)',
          }}>
            Repaired ✓
          </span>
        }
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <Wrench size={14} strokeWidth={2} style={{ color: 'var(--color-repair)', flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
          {rep.title}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{
          flex: 1, height: 52, borderRadius: 'var(--radius-md)',
          background: rep.beforeColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600,
        }}>
          Before
        </div>
        <ArrowRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <div style={{
          flex: 1, height: 52, borderRadius: 'var(--radius-md)',
          background: rep.afterColor || 'var(--color-donate)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600,
        }}>
          Fixed ✓
        </div>
      </div>
      <CardActions />
    </div>
  );
}

function LostFoundCard({ item }: { item: FeedItem }) {
  const lf = item.lostFound!;
  const isLost = lf.status === 'lost';
  return (
    <div className="card" style={{
      padding: '14px 14px 10px',
      borderLeft: `3px solid ${isLost ? 'var(--accent-rose)' : 'var(--color-found)'}`,
    }}>
      <CardHeader
        user={item.user}
        timeAgo={item.timeAgo}
        badge={
          <span style={{
            background: isLost ? 'var(--accent-rose-surface)' : 'var(--accent-lime-surface)',
            color: isLost ? 'var(--accent-rose)' : 'var(--accent-lime-dim)',
            fontSize: 10, fontWeight: 700,
            padding: '3px 8px', borderRadius: 'var(--radius-pill)',
          }}>
            {isLost ? 'Lost' : 'Found'}
          </span>
        }
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 'var(--radius-md)',
          background: lf.photoColor, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
          border: '1px solid var(--border-subtle)',
        }}>
          {lf.photoIcon}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{
            margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            {lf.title}
          </h3>
          <p style={{
            margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <MapPin size={10} /> {lf.lastSeen}
          </p>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}>
          {isLost ? 'I Found This!' : 'This Is Mine'}
        </button>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
          View Details
        </button>
      </div>
    </div>
  );
}
