'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Menu, Eye, Bookmark, Share2, MessageCircle, Plus, Bell,
  Clock, IndianRupee, MapPin, MoreHorizontal, Users, CalendarDays,
} from 'lucide-react';
import { Wordmark } from './Brand';
import {
  MARKETPLACE_ITEMS, EVENTS, MY_EVENT_IDS,
  type MarketplaceItem, type CommunityEvent,
} from '../lib/mockData';
import { getItemPhoto, getEventPhoto, getCategoryPhoto, getAvatar } from '../lib/photos';
import { useAuth } from '../lib/AuthContext';
import {
  listAlerts, subscribeAlerts, timeRemaining,
  type WecycleAlert,
} from '../lib/alerts';
import { getPostMetrics, getEventMetrics, summarizeCombined } from '../lib/metrics';
import { isDemoMode } from '../lib/demoMode';

type Tab = 'stats' | 'alerts' | 'inbox';

/* Stable per-user uploads (same set the inventory uses) */
const MY_UPLOAD_IDS = ['m1', 'm5', 'm10'];

interface ActivityScreenProps {
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onCreateAlert: () => void;
  onEditAlert: (alert: WecycleAlert) => void;
}

export default function ActivityScreen({
  onOpenMenu, onOpenAccount, onCreateAlert, onEditAlert,
}: ActivityScreenProps) {
  const { user, isDemo } = useAuth();
  const mode = isDemo ? 'demo' : 'supabase';
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [alerts, setAlerts] = useState<WecycleAlert[]>([]);

  /* Load + subscribe to alerts changes (Realtime for supabase, custom event for demo) */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listAlerts(user.id, mode);
        if (!cancelled) setAlerts(rows);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    };
    load();
    const unsub = subscribeAlerts(user.id, mode, load);
    return () => { cancelled = true; unsub(); };
  }, [user, mode]);

  /* Activity is a per-user summary — in production this becomes a Supabase
     query for `listings where owner = me` + `events where organizer = me`.
     For now we mock my-own posts in demo and leave the screen empty in prod. */
  const demo = isDemoMode();
  const myItems = useMemo(
    () => (demo ? MARKETPLACE_ITEMS.filter(i => MY_UPLOAD_IDS.includes(i.id)) : []),
    [demo],
  );
  const myEvents = useMemo(
    () => (demo ? EVENTS.filter(e => MY_EVENT_IDS.includes(e.id)) : []),
    [demo],
  );
  const summary = useMemo(
    () => summarizeCombined(demo ? MY_UPLOAD_IDS : [], demo ? MY_EVENT_IDS : []),
    [demo],
  );

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
            <Wordmark height={22} />
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
      <section style={{ padding: '14px 20px 14px' }}>
        <h1 style={{
          margin: 0,
          fontSize: 26, fontWeight: 600,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          lineHeight: 1.15,
        }}>
          Activity
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Track your impact, alerts and inbox
        </p>
      </section>

      {/* ── TABS ── */}
      <section style={{ padding: '0 16px 16px' }}>
        <div className="segmented" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button
            onClick={() => setActiveTab('stats')}
            aria-pressed={activeTab === 'stats'}
            data-active={activeTab === 'stats' || undefined}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            aria-pressed={activeTab === 'alerts'}
            data-active={activeTab === 'alerts' || undefined}
          >
            Alerts <span style={{ opacity: 0.7 }}>({alerts.filter(a => a.status === 'active').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            aria-pressed={activeTab === 'inbox'}
            data-active={activeTab === 'inbox' || undefined}
          >
            Inbox
          </button>
        </div>
      </section>

      {activeTab === 'stats'  && <StatsTab myItems={myItems} myEvents={myEvents} summary={summary} />}
      {activeTab === 'alerts' && <AlertsTab alerts={alerts} onCreate={onCreateAlert} onEdit={onEditAlert} />}
      {activeTab === 'inbox'  && <InboxTab alerts={alerts} myItems={myItems} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   STATS TAB
══════════════════════════════════════════════════ */

function StatsTab({
  myItems, myEvents, summary,
}: {
  myItems: MarketplaceItem[];
  myEvents: CommunityEvent[];
  summary: ReturnType<typeof summarizeCombined>;
}) {
  return (
    <div>
      {/* Hero stat block */}
      <section style={{ padding: '0 16px 18px' }}>
        <div className="activity-hero">
          <div className="activity-hero-bg" />
          <div className="activity-hero-headline">
            <p className="activity-hero-eyebrow">All time</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              <span className="activity-hero-value">
                {summary.totalViews.toLocaleString()}
              </span>
              <span style={{ fontSize: 14, opacity: 0.7 }}>views</span>
            </div>
          </div>

          <div className="activity-hero-metrics">
            <MiniMetric icon={<Bookmark size={13} strokeWidth={1.8} />} label="Saves" value={summary.totalSaves} />
            <MiniMetric icon={<Share2 size={13} strokeWidth={1.8} />} label="Shares" value={summary.totalShares} />
            <MiniMetric icon={<MessageCircle size={13} strokeWidth={1.8} />} label="Inquiries" value={summary.totalInquiries} />
          </div>
        </div>
      </section>

      {/* Summary line */}
      <section style={{ padding: '0 20px 14px' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          Across <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'}
          </strong> and <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {summary.eventCount} {summary.eventCount === 1 ? 'event' : 'events'}
          </strong>
          {summary.totalRsvps > 0 && (
            <> · <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{summary.totalRsvps}</strong> total RSVPs</>
          )}
          {summary.topPost && (
            <> · top post "{summary.topPost.title}"</>
          )}
        </p>
      </section>

      {/* Per-post table */}
      {myItems.length > 0 && (
        <>
          <section style={{ padding: '6px 20px 12px' }}>
            <h3 style={{
              margin: 0, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}>
              Your posts
            </h3>
          </section>

          <section className="activity-posts">
            {myItems.map(item => (
              <PostMetricsRow key={item.id} item={item} />
            ))}
          </section>
        </>
      )}

      {/* Per-event table */}
      {myEvents.length > 0 && (
        <>
          <section style={{ padding: '16px 20px 12px' }}>
            <h3 style={{
              margin: 0, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}>
              Your events
            </h3>
          </section>

          <section className="activity-posts">
            {myEvents.map(event => (
              <EventMetricsRow key={event.id} event={event} />
            ))}
          </section>
        </>
      )}

      {myItems.length === 0 && myEvents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Nothing posted yet
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Share an item or host an event to see metrics here.
          </p>
        </div>
      )}
    </div>
  );
}

function MiniMetric({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.7, fontSize: 11 }}>
        {icon}
        <span>{label}</span>
      </div>
      <p style={{
        margin: '2px 0 0', fontSize: 20, fontWeight: 600,
        letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums',
      }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function PostMetricsRow({ item }: { item: MarketplaceItem }) {
  const m = getPostMetrics(item.id);
  const photo = getItemPhoto(item.id) ?? getCategoryPhoto(item.category);
  return (
    <div style={{
      display: 'flex', gap: 12,
      padding: '14px 20px',
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: 'var(--bg-inset)',
        overflow: 'hidden', flexShrink: 0,
      }}>
        <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}>
          {item.title}
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginTop: 6,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Eye size={11} strokeWidth={1.8} /> {m.views}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Bookmark size={11} strokeWidth={1.8} /> {m.saves}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Share2 size={11} strokeWidth={1.8} /> {m.shares}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MessageCircle size={11} strokeWidth={1.8} /> {m.inquiries}
          </span>
        </div>
      </div>
    </div>
  );
}

function EventMetricsRow({ event }: { event: CommunityEvent }) {
  const m = getEventMetrics(event.id);
  const photo = getEventPhoto(event.id, event.eventType);
  return (
    <div style={{
      display: 'flex', gap: 12,
      padding: '14px 20px',
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: 'var(--bg-inset)',
        overflow: 'hidden', flexShrink: 0,
        position: 'relative',
      }}>
        <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <span style={{
          position: 'absolute', top: 4, left: 4,
          width: 18, height: 18, borderRadius: 6,
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <CalendarDays size={10} strokeWidth={2} />
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}>
          {event.title}
        </p>
        <p style={{
          margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)',
        }}>
          {event.date}
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginTop: 6,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Eye size={11} strokeWidth={1.8} /> {m.views}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Users size={11} strokeWidth={1.8} /> {m.rsvps}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Share2 size={11} strokeWidth={1.8} /> {m.shares}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MessageCircle size={11} strokeWidth={1.8} /> {m.questions}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ALERTS TAB
══════════════════════════════════════════════════ */

function AlertsTab({
  alerts, onCreate, onEdit,
}: {
  alerts: WecycleAlert[];
  onCreate: () => void;
  onEdit: (a: WecycleAlert) => void;
}) {
  const active = alerts.filter(a => a.status === 'active');
  const recent = alerts.filter(a => a.status !== 'active');

  return (
    <div>
      {/* Hero banner + CTA */}
      <section style={{ padding: '0 16px 16px' }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 18,
          padding: 14,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(168,221,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-lime-dim)', flexShrink: 0,
          }}>
            <Bell size={18} strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Catch the next match
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              We'll ping you when someone posts what you need.
            </p>
          </div>
          <button
            onClick={onCreate}
            aria-label="Create alert"
            style={{
              background: 'var(--text-primary)', color: 'var(--bg-base)',
              border: 'none', borderRadius: 999,
              padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              letterSpacing: '-0.01em', flexShrink: 0,
            }}
          >
            <Plus size={13} strokeWidth={2.5} /> New
          </button>
        </div>
      </section>

      {/* Active alerts */}
      {active.length > 0 ? (
        <>
          <section style={{ padding: '4px 20px 10px' }}>
            <h3 style={{
              margin: 0, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}>
              Active
            </h3>
          </section>
          <section style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map(a => <AlertCard key={a.id} alert={a} onEdit={() => onEdit(a)} />)}
          </section>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            No active alerts
          </p>
          <p style={{ margin: '4px 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
            Create one to be the first to know when someone uploads it.
          </p>
          <button
            onClick={onCreate}
            className="btn btn-primary btn-sm"
            style={{ gap: 6 }}
          >
            <Plus size={13} strokeWidth={2.5} /> Create alert
          </button>
        </div>
      )}

      {/* Recently expired (still listed before auto-deletion) */}
      {recent.length > 0 && (
        <>
          <section style={{ padding: '24px 20px 10px' }}>
            <h3 style={{
              margin: 0, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              Recently expired
            </h3>
          </section>
          <section style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recent.map(a => <AlertCard key={a.id} alert={a} onEdit={() => onEdit(a)} dim />)}
          </section>
        </>
      )}
    </div>
  );
}

function AlertCard({
  alert, onEdit, dim,
}: { alert: WecycleAlert; onEdit: () => void; dim?: boolean }) {
  const remaining = timeRemaining(alert.expiresAt);
  const isExpired = alert.status === 'expired';
  return (
    <article
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        padding: 14,
        opacity: dim ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px',
              background: isExpired ? 'var(--bg-inset)' : 'rgba(168,221,0,0.15)',
              color: isExpired ? 'var(--text-muted)' : 'var(--accent-lime-dim)',
              borderRadius: 999,
              fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em',
            }}>
              <Clock size={10} strokeWidth={2} />
              {isExpired ? 'Expired' : remaining}
            </span>
            <span style={{
              fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
            }}>
              · {alert.category}
            </span>
          </div>
          <h4 style={{
            margin: 0, fontSize: 15, fontWeight: 600,
            letterSpacing: '-0.015em', color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}>
            {alert.title}
          </h4>
          <p style={{
            margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)',
            lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {alert.description}
          </p>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10,
            marginTop: 8, fontSize: 11, color: 'var(--text-muted)',
          }}>
            {alert.maxPrice && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <IndianRupee size={10} strokeWidth={2} /> up to {alert.maxPrice}
              </span>
            )}
            {alert.locationPref && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} strokeWidth={2} /> {alert.locationPref}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Bell size={10} strokeWidth={2} /> notify via {alert.notify}
            </span>
          </div>
        </div>
        <button
          onClick={onEdit}
          aria-label="Edit alert"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4, flexShrink: 0,
            borderRadius: 8,
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>
      </div>
    </article>
  );
}

/* ══════════════════════════════════════════════════
   INBOX TAB — notifications feed
══════════════════════════════════════════════════ */

interface InboxItem {
  id: string;
  kind: 'alert_match' | 'alert_expired' | 'item_saved' | 'item_messaged';
  title: string;
  body: string;
  timeAgo: string;
  ref?: { type: 'alert' | 'listing'; id: string };
  unread?: boolean;
  emoji: string;
}

function InboxTab({ alerts, myItems }: { alerts: WecycleAlert[]; myItems: MarketplaceItem[] }) {
  /* Build a deterministic mock feed: real expired-alert entries +
     a few synthetic notifications for the user's items. */
  const inbox = useMemo<InboxItem[]>(() => {
    const items: InboxItem[] = [];

    /* Expired alerts → notification per item.
       (Once 2+ days pass, listAlerts() removes them so they vanish naturally
        from both Alerts tab and this inbox.) */
    alerts.filter(a => a.status === 'expired').forEach(a => {
      items.push({
        id: `exp-${a.id}`,
        kind: 'alert_expired',
        title: 'Alert auto-deleted',
        body: `Your alert "${a.title}" expired and was removed.`,
        timeAgo: timeRemaining(a.expiresAt).replace('Expired', 'Just now'),
        ref: { type: 'alert', id: a.id },
        unread: true,
        emoji: '⏰',
      });
    });

    /* A couple of synthetic engagement notifications */
    myItems.slice(0, 2).forEach((item, i) => {
      items.push({
        id: `save-${item.id}`,
        kind: 'item_saved',
        title: 'Someone saved your post',
        body: `"${item.title}" was bookmarked.`,
        timeAgo: i === 0 ? '12m ago' : '1h ago',
        ref: { type: 'listing', id: item.id },
        unread: i === 0,
        emoji: '🔖',
      });
    });
    if (myItems[0]) {
      items.push({
        id: `msg-${myItems[0].id}`,
        kind: 'item_messaged',
        title: 'New inquiry',
        body: `Someone asked about "${myItems[0].title}".`,
        timeAgo: '3h ago',
        ref: { type: 'listing', id: myItems[0].id },
        emoji: '💬',
      });
    }

    return items;
  }, [alerts, myItems]);

  if (inbox.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Inbox is quiet
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Notifications about matches, saves and messages show up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {inbox.map((n, i) => (
        <button
          key={n.id}
          type="button"
          style={{
            width: '100%',
            display: 'flex', gap: 12, alignItems: 'flex-start',
            padding: '14px 20px',
            background: n.unread ? 'rgba(168,221,0,0.05)' : 'transparent',
            border: 'none',
            borderTop: i === 0 ? '1px solid var(--border-subtle)' : undefined,
            borderBottom: '1px solid var(--border-subtle)',
            cursor: 'pointer', textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--bg-inset)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, flexShrink: 0,
          }}>
            {n.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {n.title}
              {n.unread && (
                <span style={{
                  display: 'inline-block', verticalAlign: 'middle',
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent-lime-dim)',
                  marginLeft: 6,
                }} aria-hidden="true" />
              )}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {n.body}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              {n.timeAgo}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
