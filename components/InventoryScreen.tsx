'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, Search, MapPin, X, Heart, CalendarDays, Eye, Bookmark, Users } from 'lucide-react';
import { MARKETPLACE_ITEMS, EVENTS, MY_EVENT_IDS, type MarketplaceItem, type CommunityEvent } from '../lib/mockData';
import { resolveItemMedia, getEventPhoto, getAvatar } from '../lib/photos';
import { useAuth } from '../lib/AuthContext';
import { getPostMetrics, getEventMetrics } from '../lib/metrics';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import { fetchMyUploads, fetchMyRequests, onPostsChanged } from '../lib/liveData';
import { getDemoUploads, getDemoRequests } from '../lib/demoInventory';
import PhotoCarousel from './PhotoCarousel';
import EmptyState from './EmptyState';

type Tab = 'all' | 'requests' | 'uploads' | 'saved';

interface InventoryScreenProps {
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onPostNew: () => void;
  onOpenItem: (item: MarketplaceItem) => void;
  /** Opens the owner-edit modal (uploads & requests only) */
  onEditItem: (item: MarketplaceItem) => void;
  /** Opens an event detail screen — used when an event card in Uploads is tapped */
  onOpenEvent: (event: CommunityEvent) => void;
}

const MY_UPLOAD_IDS = ['m1', 'm5', 'm10'];
const MY_SAVED_IDS = ['m2', 'm6'];
/* No requests yet — empty state will show */
const MY_REQUEST_IDS: string[] = [];

/* Discriminated union for the uploads tab — listings AND events together */
type UploadEntry =
  | { kind: 'item'; item: MarketplaceItem }
  | { kind: 'event'; event: CommunityEvent };

export default function InventoryScreen({ onOpenMenu, onOpenAccount, onPostNew, onOpenItem, onEditItem, onOpenEvent }: InventoryScreenProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  /* My real uploads + requests from Supabase (live mode), refetched whenever
     a post lands. Empty in production until the user posts. */
  const [myLiveUploads, setMyLiveUploads] = useState<MarketplaceItem[]>([]);
  const [myLiveRequests, setMyLiveRequests] = useState<MarketplaceItem[]>([]);
  useEffect(() => {
    if (!mounted || isDemoMode() || !hasSupabaseEnv || !user) return;
    let cancelled = false;
    const load = () => {
      fetchMyUploads(user.id).then(rows => { if (!cancelled) setMyLiveUploads(rows); });
      fetchMyRequests(user.id).then(rows => { if (!cancelled) setMyLiveRequests(rows); });
    };
    load();
    const off = onPostsChanged(load);
    return () => { cancelled = true; off(); };
  }, [mounted, user]);

  /* Demo mode reads from the mutable demo store; bump a tick on every change
     so edits/deletes reflect instantly (the store is plain module state). */
  const [demoTick, setDemoTick] = useState(0);
  useEffect(() => {
    if (!isDemoMode()) return;
    return onPostsChanged(() => setDemoTick(t => t + 1));
  }, []);

  /* Items + events as a unified list for the active tab.
       - demo mode → seeded MY_*_IDS lists
       - live mode → my real uploads from Supabase (requests/events wire up
         as those create paths land; for now uploads is the live tab) */
  const matchesQuery = (t: string) => !query || t.toLowerCase().includes(query.toLowerCase());

  const entries = useMemo<UploadEntry[]>(() => {
    if (!mounted) return [];

    if (isDemoMode()) {
      /* Read from the mutable demo store so edits + deletes reflect live. */
      const pool: MarketplaceItem[] =
        activeTab === 'uploads'  ? getDemoUploads() :
        activeTab === 'requests' ? getDemoRequests() :
        activeTab === 'saved'    ? MARKETPLACE_ITEMS.filter(i => MY_SAVED_IDS.includes(i.id)) :
        [...getDemoUploads(), ...getDemoRequests()];   /* all */
      const itemEntries: UploadEntry[] = pool
        .filter(i => matchesQuery(i.title))
        .map(item => ({ kind: 'item', item }));

      /* Events show under 'all' and 'uploads'. */
      if (activeTab !== 'uploads' && activeTab !== 'all') return itemEntries;

      const eventEntries: UploadEntry[] = EVENTS
        .filter(e => MY_EVENT_IDS.includes(e.id))
        .filter(e => matchesQuery(e.title))
        .map(event => ({ kind: 'event', event }));

      return [...itemEntries, ...eventEntries];
    }

    /* Live mode:
         all      → my uploads + my requests (everything I've shared)
         uploads  → my listings
         requests → my requests
         saved    → local-only for now (no server saves UI yet) */
    const pool =
      activeTab === 'uploads'  ? myLiveUploads :
      activeTab === 'requests' ? myLiveRequests :
      activeTab === 'saved'    ? [] :
      [...myLiveUploads, ...myLiveRequests];   /* all */
    return pool
      .filter(i => matchesQuery(i.title))
      .map(item => ({ kind: 'item' as const, item }));
  }, [activeTab, query, mounted, myLiveUploads, myLiveRequests, demoTick]);

  const uploadItemCount  = mounted && isDemoMode() ? getDemoUploads().length : myLiveUploads.length;
  const uploadEventCount = mounted && isDemoMode() ? MY_EVENT_IDS.length  : 0;

  return (
    <div className="screen-transition" style={{ paddingBottom: 120, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '14px 16px 10px',
      }} className="mobile-only-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="theme-toggle"
            style={{ marginLeft: -8 }}
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>
          <span style={{
            flex: 1, textAlign: 'center',
            fontWeight: 600, fontSize: 18,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>
            wecycle
          </span>
          <button
            aria-label="Profile"
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
      <section style={{ padding: '14px 20px 18px' }}>
        <h1 style={{
          margin: 0,
          fontSize: 26, fontWeight: 600,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          lineHeight: 1.15,
        }}>
          Your inventory
        </h1>
        <p style={{
          margin: '4px 0 0',
          fontSize: 13, color: 'var(--text-muted)',
        }}>
          Manage uploads, requests and saved items
        </p>
      </section>

      {/* ── SEARCH ── */}
      <section style={{ padding: '0 16px 14px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} strokeWidth={1.8} style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }} />
          <input
            type="search"
            placeholder="Search your inventory…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-pill"
            aria-label="Search your inventory"
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

      {/* ── TABS ── */}
      <section style={{ padding: '0 16px 16px' }}>
        <div className="segmented" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <button
            onClick={() => setActiveTab('all')}
            aria-pressed={activeTab === 'all'}
            data-active={activeTab === 'all' || undefined}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('uploads')}
            aria-pressed={activeTab === 'uploads'}
            data-active={activeTab === 'uploads' || undefined}
          >
            Uploaded
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            aria-pressed={activeTab === 'requests'}
            data-active={activeTab === 'requests' || undefined}
          >
            Requested
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            aria-pressed={activeTab === 'saved'}
            data-active={activeTab === 'saved' || undefined}
          >
            Saved
          </button>
        </div>
      </section>

      {/* ── UPLOADS SUMMARY (uploads tab only) ── */}
      {activeTab === 'uploads' && (uploadItemCount + uploadEventCount > 0) && (
        <section style={{ padding: '0 16px 14px', display: 'flex', gap: 8 }}>
          <SummaryPill icon="📦" label={`${uploadItemCount} ${uploadItemCount === 1 ? 'item' : 'items'}`} />
          <SummaryPill icon="📅" label={`${uploadEventCount} ${uploadEventCount === 1 ? 'event' : 'events'}`} />
        </section>
      )}

      {/* ── GRID ── */}
      <section style={{ padding: '0 12px' }}>
        {entries.length === 0 ? (
          <InventoryEmpty tab={activeTab} onPostNew={onPostNew} />
        ) : (
          <div className="masonry-2">
            {entries.map((entry, idx) => {
              const tall = idx % 4 === 0 || idx % 4 === 3;
              if (entry.kind === 'item') {
                return (
                  <InventoryCard
                    key={`item-${entry.item.id}`}
                    item={entry.item}
                    tall={tall}
                    onClick={() => {
                      /* My listings open the edit modal; requests + saved open
                         the detail view (the edit modal only knows listings). */
                      if (activeTab === 'saved' || entry.item.isRequest) onOpenItem(entry.item);
                      else onEditItem(entry.item);
                    }}
                    showHeart={activeTab === 'saved'}
                    showEditTag={activeTab !== 'saved' && !entry.item.isRequest}
                  />
                );
              }
              return (
                <InventoryEventCard
                  key={`event-${entry.event.id}`}
                  event={entry.event}
                  tall={tall}
                  onClick={() => onOpenEvent(entry.event)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px',
      background: 'var(--bg-inset)',
      borderRadius: 999,
      fontSize: 12, fontWeight: 500,
      color: 'var(--text-secondary)',
    }}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}

function InventoryCard({
  item, tall, onClick, showHeart, showEditTag,
}: {
  item: MarketplaceItem; tall: boolean; onClick: () => void;
  showHeart: boolean; showEditTag?: boolean;
}) {
  const photos = resolveItemMedia(item);
  const isPriced = item.listingType === 'sell';
  const ar = tall ? '0.72' : '0.92';

  return (
    <div
      className="feed-card"
      style={{ aspectRatio: ar, padding: 0 }}
      aria-label={showEditTag ? `Edit ${item.title}` : `Open ${item.title}`}
    >
      <PhotoCarousel
        photos={photos}
        aspectRatio={ar}
        showArrows={false}
        dotsPosition="top"
        onClick={onClick}
        overlay={
          <>
            {showHeart && (
              <span className="feed-card-save" data-saved aria-hidden="true" style={{ zIndex: 3 }}>
                <Heart size={14} strokeWidth={2} fill="currentColor" />
              </span>
            )}

            {showEditTag && (
              <span style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(255,255,255,0.92)',
                color: '#0E0E08',
                padding: '4px 9px',
                borderRadius: 999,
                fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em',
                backdropFilter: 'blur(8px)',
                zIndex: 3,
              }}>
                Edit
              </span>
            )}

            <div className="feed-card-overlay">
              <p className="feed-card-title">{item.title}</p>
              <div className="feed-card-meta">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {item.isRequest
                    ? <>🙋 {item.category}</>
                    : <><MapPin size={10} strokeWidth={2} />{item.location}</>}
                </span>
                <span
                  className="feed-card-price"
                  style={item.isRequest && item.urgent ? { color: '#F58400' } : undefined}
                >
                  {item.isRequest
                    ? (item.urgent ? 'Urgent' : 'Wanted')
                    : isPriced ? `₹${item.price}`
                    : item.listingType === 'free' ? 'Free'
                    : item.listingType[0].toUpperCase() + item.listingType.slice(1)}
                </span>
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}

/* ── Event tile for the Uploads tab ─────────────── */

function InventoryEventCard({
  event, tall, onClick,
}: { event: CommunityEvent; tall: boolean; onClick: () => void }) {
  const photo = getEventPhoto(event.id, event.eventType);
  const metrics = getEventMetrics(event.id);
  const ar = tall ? '0.72' : '0.92';

  return (
    <button
      onClick={onClick}
      className="feed-card"
      style={{ aspectRatio: ar, padding: 0 }}
      aria-label={`Open event ${event.title}`}
    >
      <img src={photo} alt="" className="feed-card-img" loading="lazy" />

      {/* Event chip top-left */}
      <span style={{
        position: 'absolute', top: 10, left: 10,
        background: 'rgba(0,0,0,0.55)', color: '#fff',
        backdropFilter: 'blur(8px)',
        borderRadius: 999,
        padding: '4px 9px',
        fontSize: 10, fontWeight: 500, letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        zIndex: 3,
      }}>
        <CalendarDays size={10} strokeWidth={2} />
        Event
      </span>

      {/* Edit pill top-right */}
      <span style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(255,255,255,0.92)',
        color: '#0E0E08',
        padding: '4px 9px',
        borderRadius: 999,
        fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em',
        backdropFilter: 'blur(8px)',
        zIndex: 3,
      }}>
        Edit
      </span>

      <div className="feed-card-overlay">
        <p className="feed-card-title">{event.title}</p>
        <div className="feed-card-meta" style={{ gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Eye size={10} strokeWidth={2} />
            {metrics.views}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Users size={10} strokeWidth={2} />
            {metrics.rsvps}
          </span>
          <span className="feed-card-price">{event.date.split(' ').slice(0, 3).join(' ')}</span>
        </div>
      </div>
    </button>
  );
}

function InventoryEmpty({ tab, onPostNew }: { tab: Tab; onPostNew: () => void }) {
  /* Per-tab copy lives here because each tab has a different verb and CTA. */
  const copy =
    tab === 'all' ? {
      icon: '🗂️',
      prompt: "You haven't posted anything yet.",
      sub: 'Everything you share or request shows up here. Start with your first post.',
      ctaLabel: 'Create a post',
    } :
    tab === 'uploads'  ? {
      icon: '📦',
      prompt: 'Your shelves are empty for now.',
      sub: 'Drop the first thing you no longer use — someone next door is looking for it.',
      ctaLabel: 'Share an item',
    } :
    tab === 'requests' ? {
      icon: '🙋',
      prompt: 'No requests open yet.',
      sub: 'Need something? Asking the community is usually faster (and cheaper) than buying new.',
      ctaLabel: 'Post a request',
    } :
    {
      icon: '🔖',
      prompt: 'Nothing saved yet.',
      sub: 'Tap the heart on anything you want to come back to.',
      ctaLabel: null as null | string,
    };

  return (
    <EmptyState
      icon={copy.icon}
      prompt={copy.prompt}
      sub={copy.sub}
      cta={copy.ctaLabel ? { label: copy.ctaLabel, onClick: onPostNew } : undefined}
    />
  );
}
