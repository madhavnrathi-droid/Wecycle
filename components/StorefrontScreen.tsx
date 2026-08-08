'use client';

/* Storefront — a user's public profile + everything they've posted.
 *
 *   Layout:
 *     ┌──── Hero ─────────────────────────────────┐
 *     │  Avatar  Name + role + community + badge  │
 *     │  3 stat tiles: items, requests, impact    │
 *     └───────────────────────────────────────────┘
 *     ┌── Tabs: Shared · Requests · Events ───────┐
 *     │  Filter chips (categories etc.)           │
 *     │  Pinterest-style masonry of their posts   │
 *     └───────────────────────────────────────────┘
 *
 * "Events" tab only appears if the user actually organizes events. When
 * either uploads or requests is empty we still show the tab (with a friendly
 * empty state) since users will want to see "no requests right now". */

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, MapPin, Calendar, Users, IndianRupee,
  Mail, Phone, GraduationCap, Building2, Home, IdCard, Search, MoreHorizontal,
} from 'lucide-react';
import ReportSheet from './ReportSheet';
import type {
  User, MarketplaceItem, CommunityEvent, FeedItem, LostItem,
} from '../lib/mockData';
import {
  MARKETPLACE_ITEMS, EVENTS, FEED_ITEMS, CATEGORIES, MY_EVENT_IDS,
} from '../lib/mockData';
import { getAvatar, resolveItemMedia, resolveEventPhoto, getLostFoundPhoto } from '../lib/photos';
import OnlineBadge from './OnlineBadge';
import { useAuth } from '../lib/AuthContext';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv, supabase } from '../lib/supabase';
import {
  fetchListingsByUser, fetchEventsByUser, fetchLostFoundByUser,
  fetchMyRequests, fetchProfileStats, fetchContact, onPostsChanged, type ProfileStats,
} from '../lib/liveData';

interface StorefrontScreenProps {
  user: User;
  onBack: () => void;
  onOpenItem: (item: MarketplaceItem) => void;
  onOpenEvent: (event: CommunityEvent) => void;
  onOpenLF?: (item: LostItem) => void;
}

type Tab = 'shared' | 'requests' | 'events' | 'lostfound';

/* Extra profile fields we surface in the "About" block. The shape mirrors
 * what the profiles table holds — we fetch them once when the storefront
 * opens, separate from the joined-User payload that the cards carry. */
interface PublicProfile {
  email?: string;
  phone?: string;
  collegeId?: string;
  graduatingYear?: number;
  course?: string;
  department?: string;
  residence?: 'day_scholar' | 'hosteler';
  showPhone?: boolean;
}

export default function StorefrontScreen({
  user, onBack, onOpenItem, onOpenEvent, onOpenLF,
}: StorefrontScreenProps) {
  const { user: viewer } = useAuth();
  const isMe = !!viewer && viewer.id === user.id;
  const [reportOpen, setReportOpen] = useState(false);

  /* Demo mode slices the seeded catalogue by author; live mode fetches the
     user's real listings + events from Supabase. */
  const demo = isDemoMode();
  /* Demo requests come from the seeded FEED_ITEMS pool; live requests are
   * fetched below in the effect — `setRequests` keeps both modes in sync.
   * This was previously hard-wired to empty in live mode, which made the
   * Requests tab on every storefront look broken in production. */
  const demoRequests = useMemo(
    () => (demo ? FEED_ITEMS.filter(f => f.type === 'request' && f.user.id === user.id) : []),
    [user.id, demo],
  );
  const [liveRequests, setLiveRequests] = useState<MarketplaceItem[]>([]);
  /* Map live request rows into the FeedItem shape RequestRow expects. The
   * mapper only fills the fields the row card reads (id, type, timeAgo,
   * user, item, timestamp); the rest stay undefined which the renderer is
   * tolerant of. */
  const requests: FeedItem[] = demo ? demoRequests : liveRequests.map(item => ({
    id: item.id,
    type: 'request' as const,
    user: item.user,
    timestamp: new Date().toISOString(),
    timeAgo: item.postedDaysAgo === 0 ? 'today' : `${item.postedDaysAgo}d ago`,
    item: {
      title: item.title,
      description: item.description,
      category: item.category,
      listingType: item.listingType,
      price: item.price,
      condition: item.condition,
      photoColor: item.photoColor,
      photoIcon: item.photoIcon,
      location: item.location,
      saved: item.saved ?? false,
      responses: item.responses,
    },
  }));

  const [uploads, setUploads] = useState<MarketplaceItem[]>(
    demo ? MARKETPLACE_ITEMS.filter(i => i.user.id === user.id) : [],
  );
  const [events, setEvents] = useState<CommunityEvent[]>(
    demo
      ? EVENTS.filter(e => e.organizer.id === user.id || (user.id === 'u1' && MY_EVENT_IDS.includes(e.id)))
      : [],
  );
  const [lostFound, setLostFound] = useState<LostItem[]>([]);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);

  /* Live storefront stats — refetched whenever a post lands so the Shared
     counter updates the instant the user creates / deletes a post. */
  const [stats, setStats] = useState<ProfileStats | null>(null);

  useEffect(() => {
    if (demo || !hasSupabaseEnv) return;
    let cancelled = false;
    const load = () => {
      fetchListingsByUser(user.id).then(rows => { if (!cancelled) setUploads(rows); });
      fetchMyRequests(user.id).then(rows => { if (!cancelled) setLiveRequests(rows); });
      fetchEventsByUser(user.id).then(rows => { if (!cancelled) setEvents(rows); });
      fetchLostFoundByUser(user.id).then(rows => { if (!cancelled) setLostFound(rows); });
      fetchProfileStats(user.id).then(s => { if (!cancelled) setStats(s); });
      /* Public profile fields — separate one-shot fetch since the User
         object joined onto listing rows doesn't carry the academic info. */
      supabase
        .from('profiles')
        .select('college_id, graduating_year, course, department, residence, show_phone_on_profile')
        .eq('id', user.id)
        .single()
        .then(async ({ data }) => {
          if (cancelled || !data) return;
          const d = data as unknown as {
            college_id: string | null;
            graduating_year: number | null;
            course: string | null;
            department: string | null;
            residence: 'day_scholar' | 'hosteler' | null;
            show_phone_on_profile: boolean | null;
          };
          /* email/phone are column-locked — resolve via the get_contact RPC.
             `user` here is the storefront's subject: own row returns full
             contact; others' are filtered by their share prefs. */
          const contact = await fetchContact(user.id);
          if (cancelled) return;
          setPublicProfile({
            email: contact.email,
            phone: contact.phone,
            collegeId: d.college_id ?? undefined,
            graduatingYear: d.graduating_year ?? undefined,
            course: d.course ?? undefined,
            department: d.department ?? undefined,
            residence: d.residence ?? undefined,
            showPhone: d.show_phone_on_profile ?? false,
          });
        });
    };
    load();
    const off = onPostsChanged(load);
    return () => { cancelled = true; off(); };
  }, [user.id, demo]);

  /* Pick the stats to render:
       - Demo mode: derive from in-memory data (shared = uploads+events,
         received from user.itemsReceived, impact derived).
       - Live mode: use the fetched stats; until they arrive, fall back to
         what we already know so the tiles never sit on 0 unnecessarily. */
  const sharedDisplay = demo
    ? uploads.length + events.length
    : (stats?.shared ?? (uploads.length + events.length));
  const receivedDisplay = demo
    ? (user.itemsReceived || 0)
    : (stats?.received ?? 0);
  const impactDisplay = demo
    ? (user.impactScore || (uploads.length * 10 + events.length * 25))
    : (stats?.impact ?? (uploads.length * 10 + events.length * 25));

  /* Tab list — Uploads + Requests are always present (empty states cover the
     no-posts cases). Events + Lost & Found only surface when the user has
     actually posted in those, so guests don't see two empty tabs on every
     storefront. */
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'shared',   label: 'Shared',   count: uploads.length },
    { id: 'requests', label: 'Requests', count: requests.length },
    ...(events.length > 0
      ? [{ id: 'events' as const, label: 'Events', count: events.length }]
      : []),
    ...(lostFound.length > 0
      ? [{ id: 'lostfound' as const, label: 'Lost & Found', count: lostFound.length }]
      : []),
  ];

  const [tab, setTab] = useState<Tab>('shared');
  /* If the active tab loses its data (e.g. user deletes last event while on
   * the Events tab), fall back to Shared — otherwise the masonry just sits
   * empty and the user can't tell why. */
  useEffect(() => {
    if (tab === 'events' && events.length === 0) setTab('shared');
    if (tab === 'lostfound' && lostFound.length === 0) setTab('shared');
  }, [tab, events.length, lostFound.length]);
  /* Category filter is shared across the Shared + Requests tabs; events have their
     own type filter handled inline. */
  const [category, setCategory] = useState<string>('all');

  const filteredUploads = useMemo(() => {
    if (category === 'all') return uploads;
    return uploads.filter(i => i.category.toLowerCase() === category);
  }, [uploads, category]);

  const filteredRequests = useMemo(() => {
    if (category === 'all') return requests;
    return requests.filter(r => (r.item?.category ?? '').toLowerCase() === category);
  }, [requests, category]);

  return (
    <div className="screen-transition" style={{ paddingBottom: 80, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        /* Opaque. --bg-overlay is 88% alpha, so content showed
           through the header as it scrolled past. */
        background: 'var(--bg-card)',
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1 style={{
          margin: 0, flex: 1, textAlign: 'center',
          fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
        }}>
          {isMe ? 'Your storefront' : `${user.name.split(' ')[0]}'s storefront`}
        </h1>
        {viewer && !isMe ? (
          <button
            onClick={() => setReportOpen(true)}
            aria-label={`More options for ${user.name}`}
            className="theme-toggle"
            style={{ width: 36, height: 36 }}
          >
            <MoreHorizontal size={20} strokeWidth={1.8} />
          </button>
        ) : (
          <span style={{ width: 36 }} aria-hidden="true" />
        )}
      </header>

      {/* ── HERO ── */}
      <section style={{ padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            overflow: 'hidden',
            background: user.color, flexShrink: 0,
          }}>
            <img
              src={getAvatar(user.id)}
              alt=""
              width={84} height={84}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 22, fontWeight: 600,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              lineHeight: 1.15,
            }}>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.name}
              </span>
              <OnlineBadge isOnline={user.isOnline} />
            </div>
            <p style={{
              margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)',
            }}>
              {user.role} · {user.community} · {user.joinedDaysAgo}d on Wecycle
            </p>
            {user.badges.length > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8,
              }}>
                {user.badges.slice(0, 4).map(b => (
                  <span key={b} style={{
                    fontSize: 10, fontWeight: 600,
                    padding: '3px 8px', borderRadius: 999,
                    background: 'var(--bg-inset)',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.01em',
                  }}>
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stat tiles — live counts (refetched on every post change). */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          marginTop: 16,
        }}>
          <StatTile value={sharedDisplay}   label="Shared"  />
          <StatTile value={receivedDisplay} label="Received" />
          <StatTile value={impactDisplay}   label="Impact"  />
        </div>
      </section>

      {/* ── PUBLIC INFO ──
         Mirrors the public-facing fields from the Account page so visitors
         get a clear "who is this person" snapshot. Optional fields hide
         themselves when the user hasn't filled them in. Phone is gated on
         the show_phone_on_profile pref. */}
      <PublicInfoSection profile={publicProfile} user={user} />

      {/* ── TABS ── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div
          className="segmented storefront-tabs"
          role="tablist"
          style={{ maxWidth: 640, marginInline: 'auto' }}
        >
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              data-active={tab === t.id || undefined}
            >
              {t.label} {t.count > 0 && <span style={{ opacity: 0.6 }}>· {t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── CATEGORY CHIPS (Shared + Requests tabs share these) ── */}
      {(tab === 'shared' || tab === 'requests') && (
        <section style={{ padding: '0 0 12px' }}>
          <div className="chip-row">
            {CATEGORIES.slice(0, 8).map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`pill ${category === cat.id ? 'pill-active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── CONTENT ── */}
      <section className="masonry-shell" style={{ padding: '0 8px' }}>
        {tab === 'shared' && (
          filteredUploads.length === 0
            ? <EmptyState label={isMe ? "You haven't shared anything yet" : `${user.name.split(' ')[0]} hasn't shared anything yet`} />
            : (
              <div className="masonry-2">
                {filteredUploads.map((item, idx) => (
                  <ItemTile
                    key={item.id}
                    item={item}
                    variant={(['portrait','square','tall','landscape','portrait'] as const)[idx % 5]}
                    onClick={() => onOpenItem(item)}
                  />
                ))}
              </div>
            )
        )}

        {tab === 'requests' && (
          filteredRequests.length === 0
            ? <EmptyState label="No open requests right now" />
            : (
              <ul style={{
                listStyle: 'none', margin: 0, padding: '4px 8px',
                display: 'grid', gap: 10,
              }}>
                {filteredRequests.map(r => (
                  <RequestRow key={r.id} feed={r} />
                ))}
              </ul>
            )
        )}

        {tab === 'events' && (
          events.length === 0
            ? <EmptyState label={`${user.name.split(' ')[0]} hasn't organized any events`} />
            : (
              <ul className="events-list-grid" style={{
                listStyle: 'none', margin: 0, padding: '4px 8px',
                display: 'grid', gap: 10,
              }}>
                {events.map(ev => (
                  <EventTile key={ev.id} event={ev} onClick={() => onOpenEvent(ev)} />
                ))}
              </ul>
            )
        )}

        {tab === 'lostfound' && (
          lostFound.length === 0
            ? <EmptyState label={`${user.name.split(' ')[0]} hasn't posted in Lost & Found`} />
            : (
              <div className="masonry-2" style={{ padding: '0 8px' }}>
                {lostFound.map(lf => (
                  <LostFoundTile
                    key={lf.id}
                    lf={lf}
                    onClick={() => onOpenLF?.(lf)}
                  />
                ))}
              </div>
            )
        )}
      </section>
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={user.id}
        targetUserId={user.id}
        targetLabel={user.name}
      />
    </div>
  );
}

/* ── Public info section ─────────────────────────
   Renders the user's optional academic / contact info as a clean key-value
   grid. Each row hides itself when the field is empty so guests don't see
   "Course: —" placeholders. Phone is gated on the user's privacy pref. */
function PublicInfoSection({
  profile, user,
}: { profile: PublicProfile | null; user: User }) {
  /* Build the rows in display order. Each entry is null when the field
     isn't worth showing, then filtered out before render. */
  type Row = { icon: React.ReactNode; label: string; value: string };
  const rows: Row[] = [];
  /* Email — always show if present (auth fallback already covered upstream). */
  const email = profile?.email || user.email;
  if (email) rows.push({ icon: <Mail size={13} strokeWidth={1.8} />, label: 'Email', value: email });
  /* Phone — only when the user opted in via the storefront pref. */
  if (profile?.showPhone && profile.phone) {
    rows.push({ icon: <Phone size={13} strokeWidth={1.8} />, label: 'Phone', value: profile.phone });
  }
  if (profile?.collegeId) {
    rows.push({ icon: <IdCard size={13} strokeWidth={1.8} />, label: 'College ID', value: profile.collegeId });
  }
  if (profile?.department) {
    rows.push({ icon: <Building2 size={13} strokeWidth={1.8} />, label: 'Department', value: profile.department.toUpperCase() });
  }
  if (profile?.course) {
    rows.push({ icon: <GraduationCap size={13} strokeWidth={1.8} />, label: 'Course', value: profile.course });
  }
  if (profile?.graduatingYear) {
    rows.push({ icon: <Calendar size={13} strokeWidth={1.8} />, label: 'Graduating', value: String(profile.graduatingYear) });
  }
  if (profile?.residence) {
    rows.push({
      icon: <Home size={13} strokeWidth={1.8} />,
      label: 'Residence',
      value: profile.residence === 'day_scholar' ? 'Day scholar' : 'Hosteler',
    });
  }

  if (rows.length === 0) return null;

  return (
    <section style={{ padding: '4px 20px 18px' }}>
      <h3 style={{
        margin: '0 0 10px', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        About
      </h3>
      <dl style={{
        margin: 0, padding: '12px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 8,
        alignItems: 'baseline',
      }}>
        {rows.map(r => (
          <PublicInfoRow key={r.label} icon={r.icon} label={r.label} value={r.value} />
        ))}
      </dl>
    </section>
  );
}

function PublicInfoRow({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <>
      <dt style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}>
        {icon}
        {label}
      </dt>
      <dd style={{
        margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </dd>
    </>
  );
}

/* ── Lost & Found tile (storefront variant) ── */
function LostFoundTile({ lf, onClick }: { lf: LostItem; onClick: () => void }) {
  const isLost = lf.status === 'lost';
  return (
    <button
      type="button"
      onClick={onClick}
      className="feed-card"
      style={{ aspectRatio: '0.82', padding: 0 }}
      aria-label={`Open ${lf.title}`}
    >
      <img
        src={getLostFoundPhoto(lf.id, lf.photoIcon, lf.photoUrls)}
        alt="" className="feed-card-img" loading="lazy"
      />
      <span style={{
        position: 'absolute', top: 10, left: 10,
        background: isLost ? 'rgba(237,46,80,0.92)' : 'rgba(34,197,94,0.92)',
        color: '#fff', borderRadius: 999,
        padding: '4px 10px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase', zIndex: 3,
      }}>{lf.status}</span>
      <div className="feed-card-overlay">
        <p className="feed-card-title">{lf.title}</p>
        <div className="feed-card-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MapPin size={10} strokeWidth={2} /> {lf.lastSeen}
          </span>
          <span className="feed-card-price">{lf.timeAgo}</span>
        </div>
      </div>
    </button>
  );
}

/* ── Pieces ─────────────────────────────────────── */

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14,
      padding: '12px 14px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 20, fontWeight: 700,
        letterSpacing: '-0.025em',
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.15,
      }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🗂️</div>
      <p style={{ margin: 0, fontSize: 13 }}>{label}</p>
    </div>
  );
}

const RATIOS = {
  tall:      '0.72',
  portrait:  '0.82',
  square:    '1.00',
  landscape: '1.20',
} as const;

function ItemTile({
  item, variant, onClick,
}: {
  item: MarketplaceItem;
  variant: keyof typeof RATIOS;
  onClick: () => void;
}) {
  /* First slide as a thumbnail — use the video poster if the first media is a clip. */
  const first = resolveItemMedia(item)[0];
  const photo = typeof first === 'string' ? first : (first?.poster ?? first?.src);
  const isPriced = item.listingType === 'sell';
  return (
    <button
      type="button"
      onClick={onClick}
      className="feed-card"
      style={{ aspectRatio: RATIOS[variant], padding: 0 }}
      aria-label={`Open ${item.title}`}
    >
      <img src={photo} alt="" className="feed-card-img" loading="lazy" />
      <div className="feed-card-overlay">
        <p className="feed-card-title">{item.title}</p>
        <div className="feed-card-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MapPin size={10} strokeWidth={2} />
            {item.location}
          </span>
          <span className="feed-card-price">
            {isPriced
              ? <><IndianRupee size={9} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-1px' }} />{item.price}</>
              : item.listingType[0].toUpperCase() + item.listingType.slice(1)}
          </span>
        </div>
      </div>
    </button>
  );
}

function RequestRow({ feed }: { feed: FeedItem }) {
  const r = feed.item;
  if (!r) return null;
  return (
    <li style={{
      padding: '14px 16px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 600,
          padding: '3px 8px', borderRadius: 999,
          background: 'rgba(245,132,0,0.14)', color: 'var(--accent-amber)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          Request
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{feed.timeAgo}</span>
      </div>
      <h3 style={{
        margin: 0, fontSize: 14, fontWeight: 600,
        color: 'var(--text-primary)', letterSpacing: '-0.01em',
      }}>{r.title}</h3>
      <p style={{
        margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{r.description}</p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
        fontSize: 11, color: 'var(--text-muted)',
      }}>
        <MapPin size={11} strokeWidth={1.8} />
        {r.location}
      </div>
    </li>
  );
}

function EventTile({ event, onClick }: { event: CommunityEvent; onClick: () => void }) {
  const photo = resolveEventPhoto(event);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        style={{
          all: 'unset', cursor: 'pointer', width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          overflow: 'hidden',
          display: 'block',
        }}
        aria-label={`Open ${event.title}`}
      >
        <div style={{
          aspectRatio: '4 / 3', background: 'var(--bg-inset)',
          backgroundImage: `url(${photo})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
        <div style={{ padding: '12px 14px' }}>
          <h3 style={{
            margin: 0, fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)', letterSpacing: '-0.01em',
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{event.title}</h3>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginTop: 6,
            fontSize: 11, color: 'var(--text-muted)',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Calendar size={11} strokeWidth={1.8} /> {event.date}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Users size={11} strokeWidth={1.8} /> {event.attendees}
            </span>
            {event.hasForm && (
              <span style={{
                color: '#8B5CF6', background: 'rgba(139,92,246,0.12)',
                padding: '1px 7px', borderRadius: 999,
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
              }}>
                📋 Register
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
