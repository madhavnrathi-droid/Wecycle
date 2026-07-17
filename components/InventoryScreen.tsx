'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, Search, MapPin, X, Heart, CalendarDays, Eye, Users, Check } from 'lucide-react';
import { Wordmark } from './Brand';
import { MARKETPLACE_ITEMS, EVENTS, MY_EVENT_IDS, type MarketplaceItem, type CommunityEvent, type LostItem } from '../lib/mockData';
import { opportunityCompLabel } from '../lib/opportunity';
import { resolveItemMedia, getEventPhoto, getAvatar, getLostFoundPhoto } from '../lib/photos';
import { useAuth } from '../lib/AuthContext';
import { getEventMetrics } from '../lib/metrics';
import { isDemoMode } from '../lib/demoMode';
import { hasSupabaseEnv } from '../lib/supabase';
import {
  fetchMyUploads, fetchMyRequests, fetchEventsByUser, fetchLostFoundByUser,
  fetchMySaves, onPostsChanged,
  markListingSold, markRequestCompleted, markLostFoundResolved, deleteEvent,
} from '../lib/liveData';
import { track, EVT } from '../lib/analytics';
import { getDemoUploads, getDemoRequests, deleteDemoPost, updateDemoPost } from '../lib/demoInventory';
import PhotoCarousel from './PhotoCarousel';
import EmptyState from './EmptyState';

type Tab = 'all' | 'requests' | 'shared' | 'events' | 'saved';

interface InventoryScreenProps {
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onPostNew: () => void;
  onOpenItem: (item: MarketplaceItem) => void;
  /** Opens an event detail screen — used when an event card in Uploads is tapped */
  onOpenEvent: (event: CommunityEvent) => void;
  /** Opens the Lost & Found detail sheet (lifted to app/page.tsx). */
  onOpenLF?: (item: LostItem) => void;
}

const MY_UPLOAD_IDS = ['m1', 'm5', 'm10'];
const MY_SAVED_IDS = ['m2', 'm6'];
/* No requests yet — empty state will show */
const MY_REQUEST_IDS: string[] = [];

/* Discriminated union for the uploads tab — listings, events, AND lost-found
 * items render in the same masonry. Each kind drives a different color stroke
 * (green / purple / orange) and a different open-detail callback. */
type UploadEntry =
  | { kind: 'item'; item: MarketplaceItem }
  | { kind: 'event'; event: CommunityEvent }
  | { kind: 'lostfound'; lf: LostItem };

export default function InventoryScreen({ onOpenMenu, onOpenAccount, onPostNew, onOpenItem, onOpenEvent, onOpenLF }: InventoryScreenProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  /* My real uploads + requests from Supabase (live mode), refetched whenever
     a post lands. Empty in production until the user posts. */
  const [myLiveUploads, setMyLiveUploads] = useState<MarketplaceItem[]>([]);
  const [myLiveRequests, setMyLiveRequests] = useState<MarketplaceItem[]>([]);
  const [myLiveEvents, setMyLiveEvents] = useState<CommunityEvent[]>([]);
  const [myLiveLF, setMyLiveLF] = useState<LostItem[]>([]);
  /* Saved listings — fetched via the saves table JOIN. Refreshes on every
     post-change so a deleted listing automatically drops out (saves
     CASCADE on delete; this refetch is the visible side of that). */
  const [myLiveSaves, setMyLiveSaves] = useState<MarketplaceItem[]>([]);
  useEffect(() => {
    if (!mounted || isDemoMode() || !hasSupabaseEnv || !user) return;
    let cancelled = false;
    const load = () => {
      fetchMyUploads(user.id).then(rows => { if (!cancelled) setMyLiveUploads(rows); });
      fetchMyRequests(user.id).then(rows => { if (!cancelled) setMyLiveRequests(rows); });
      fetchEventsByUser(user.id).then(rows => { if (!cancelled) setMyLiveEvents(rows); });
      fetchLostFoundByUser(user.id).then(rows => { if (!cancelled) setMyLiveLF(rows); });
      fetchMySaves(user.id).then(rows => { if (!cancelled) setMyLiveSaves(rows); });
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

  /* My events — live (Supabase) or the demo seed set. Powers the conditional
     "Events" tab and the events shown under All / Uploaded. */
  const myEvents: CommunityEvent[] = useMemo(() => {
    if (!mounted) return [];
    if (isDemoMode()) return EVENTS.filter(e => MY_EVENT_IDS.includes(e.id));
    return myLiveEvents;
  }, [mounted, myLiveEvents, demoTick]);
  const hasEvents = myEvents.length > 0;

  /* If the Events tab vanishes (deleted your last event), fall back to All. */
  useEffect(() => {
    if (activeTab === 'events' && !hasEvents) setActiveTab('all');
  }, [activeTab, hasEvents]);

  /* Items + events as a unified list for the active tab.
       - demo mode → seeded MY_*_IDS lists
       - live mode → my real uploads from Supabase (requests/events wire up
         as those create paths land; for now uploads is the live tab) */
  const matchesQuery = (t: string) => !query || t.toLowerCase().includes(query.toLowerCase());

  const eventEntriesFor = (evts: CommunityEvent[]): UploadEntry[] =>
    evts.filter(e => matchesQuery(e.title)).map(event => ({ kind: 'event', event }));
  const lfEntriesFor = (lfs: LostItem[]): UploadEntry[] =>
    lfs.filter(l => matchesQuery(l.title)).map(lf => ({ kind: 'lostfound', lf }));

  const entries = useMemo<UploadEntry[]>(() => {
    if (!mounted) return [];

    /* Dedicated Events tab → only events. */
    if (activeTab === 'events') return eventEntriesFor(myEvents);

    if (isDemoMode()) {
      /* Read from the mutable demo store so edits + deletes reflect live. */
      const pool: MarketplaceItem[] =
        activeTab === 'shared'  ? getDemoUploads() :
        activeTab === 'requests' ? getDemoRequests() :
        activeTab === 'saved'    ? MARKETPLACE_ITEMS.filter(i => MY_SAVED_IDS.includes(i.id)) :
        [...getDemoUploads(), ...getDemoRequests()];   /* all */
      const itemEntries: UploadEntry[] = pool
        .filter(i => matchesQuery(i.title))
        .map(item => ({ kind: 'item', item }));

      /* Events also appear under 'all' and 'shared'. */
      if (activeTab !== 'shared' && activeTab !== 'all') return itemEntries;
      return [...itemEntries, ...eventEntriesFor(myEvents)];
    }

    /* Live mode */
    const pool =
      activeTab === 'shared'  ? myLiveUploads :
      activeTab === 'requests' ? myLiveRequests :
      activeTab === 'saved'    ? myLiveSaves :
      [...myLiveUploads, ...myLiveRequests];   /* all */
    const itemEntries = pool
      .filter(i => matchesQuery(i.title))
      .map(item => ({ kind: 'item' as const, item }));

    /* "All" rolls everything in: items + requests + events + lost-found. */
    if (activeTab === 'all') {
      return [...itemEntries, ...eventEntriesFor(myEvents), ...lfEntriesFor(myLiveLF)];
    }
    /* "Shared" also joins events (you organized them). */
    if (activeTab === 'shared') {
      return [...itemEntries, ...eventEntriesFor(myEvents)];
    }
    return itemEntries;
  }, [activeTab, query, mounted, myLiveUploads, myLiveRequests, myEvents, myLiveLF, myLiveSaves, demoTick]);

  const uploadItemCount  = mounted && isDemoMode() ? getDemoUploads().length : myLiveUploads.length;
  const uploadEventCount = myEvents.length;

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
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Wordmark height={30} />
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
          Manage what you've shared, requested, and saved
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

      {/* ── TABS ── (Events tab only appears once you've posted an event) */}
      <section style={{ padding: '0 16px 16px' }}>
        <div className="segmented" style={{ gridTemplateColumns: `repeat(${hasEvents ? 5 : 4}, 1fr)` }}>
          <button
            onClick={() => setActiveTab('all')}
            aria-pressed={activeTab === 'all'}
            data-active={activeTab === 'all' || undefined}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            aria-pressed={activeTab === 'shared'}
            data-active={activeTab === 'shared' || undefined}
          >
            Shared
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            aria-pressed={activeTab === 'requests'}
            data-active={activeTab === 'requests' || undefined}
          >
            Requested
          </button>
          {hasEvents && (
            <button
              onClick={() => setActiveTab('events')}
              aria-pressed={activeTab === 'events'}
              data-active={activeTab === 'events' || undefined}
            >
              Events
            </button>
          )}
          <button
            onClick={() => setActiveTab('saved')}
            aria-pressed={activeTab === 'saved'}
            data-active={activeTab === 'saved' || undefined}
          >
            Saved
          </button>
        </div>
      </section>

      {/* ── SHARED-TAB SUMMARY ── */}
      {activeTab === 'shared' && (uploadItemCount + uploadEventCount > 0) && (
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
                const isMine = activeTab !== 'saved';
                /* Pick the right action label for owner-only quick-close.
                   Opportunities (services) aren't "sold"/"given" — a
                   volunteering call gets "Filled", any other service
                   "Completed". */
                const completeLabel = entry.item.isRequest ? 'Completed'
                  : entry.item.kind === 'opportunity'      ? (entry.item.comp === 'volunteer' ? 'Filled' : 'Completed')
                  : entry.item.listingType === 'sell'      ? 'Sold'
                  : 'Given';
                return (
                  <InventoryCard
                    key={`item-${entry.item.id}`}
                    item={entry.item}
                    tall={tall}
                    onClick={() => onOpenItem(entry.item)}
                    showHeart={activeTab === 'saved'}
                    completeLabel={isMine ? completeLabel : undefined}
                    onComplete={isMine ? async () => {
                      if (typeof window !== 'undefined' && !window.confirm(`Mark "${entry.item.title}" as ${completeLabel.toLowerCase()}? It stays on your storefront with a "${completeLabel}" ribbon — delete it from the post if you want it gone.`)) return;
                      track(EVT.post_marked_complete, {
                        post_id: entry.item.id,
                        post_kind: entry.item.isRequest ? 'request' : entry.item.kind === 'opportunity' ? 'opportunity' : 'item',
                        action: (entry.item.isRequest || entry.item.kind === 'opportunity') ? 'completed' : 'sold',
                      });
                      if (isDemoMode()) {
                        updateDemoPost(entry.item.id, { isClosed: true });
                      } else {
                        try {
                          if (entry.item.isRequest) await markRequestCompleted(entry.item.id);
                          else                      await markListingSold(entry.item.id);
                        } catch (e) {
                          /* Surface the failure — silent failures here gave the
                           * impression nothing happened, then the post would
                           * reappear and confuse the user. */
                          if (typeof window !== 'undefined') {
                            window.alert((e as Error).message || 'Could not remove the post — please try again.');
                          }
                        }
                      }
                    } : undefined}
                  />
                );
              }
              if (entry.kind === 'event') {
                return (
                  <InventoryEventCard
                    key={`event-${entry.event.id}`}
                    event={entry.event}
                    tall={tall}
                    onClick={() => onOpenEvent(entry.event)}
                    onDelete={async () => {
                      if (typeof window !== 'undefined' && !window.confirm(`Delete event "${entry.event.title}"?`)) return;
                      track(EVT.post_deleted, { post_id: entry.event.id, post_kind: 'event' });
                      if (isDemoMode()) deleteDemoPost(entry.event.id);
                      else {
                        try { await deleteEvent(entry.event.id); }
                        catch (e) {
                          if (typeof window !== 'undefined') {
                            window.alert((e as Error).message || 'Could not delete event — please try again.');
                          }
                        }
                      }
                    }}
                  />
                );
              }
              /* Lost & Found card — orange stroke marker, "Found"/"Resolved"
                 quick-close button, taps open the lifted L&F sheet. */
              const lfLabel = entry.lf.status === 'lost' ? 'Found it' : 'Resolved';
              return (
                <InventoryLostFoundCard
                  key={`lf-${entry.lf.id}`}
                  lf={entry.lf}
                  tall={tall}
                  onClick={() => onOpenLF?.(entry.lf)}
                  completeLabel={lfLabel}
                  onComplete={async () => {
                    if (typeof window !== 'undefined' && !window.confirm(`Mark "${entry.lf.title}" as resolved? This removes the post.`)) return;
                    track(EVT.post_marked_complete, {
                      post_id: entry.lf.id,
                      post_kind: 'lostfound',
                      action: 'resolved',
                      lf_status: entry.lf.status,
                    });
                    if (isDemoMode()) {
                      /* Demo store doesn't track L&F separately yet; no-op. */
                    } else {
                      try { await markLostFoundResolved(entry.lf.id); }
                      catch (e) {
                        if (typeof window !== 'undefined') {
                          window.alert((e as Error).message || 'Could not resolve — please try again.');
                        }
                      }
                    }
                  }}
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
  item, tall, onClick, showHeart, completeLabel, onComplete,
}: {
  item: MarketplaceItem; tall: boolean; onClick: () => void;
  showHeart: boolean;
  /* Shown only when the viewer owns the post — closes it (sold/completed/given). */
  completeLabel?: string;
  onComplete?: () => void | Promise<void>;
}) {
  const photos = resolveItemMedia(item);
  const hasMedia = photos.length > 0;
  const isPriced = item.listingType === 'sell' && typeof item.price === 'number';
  const ar = tall ? '0.72' : '0.92';

  /* Stroke kind drives the inventory-only colored border (green for items +
     requests; orange for L&F; purple for events — applied via CSS data attr). */
  const strokeKind: 'marketplace' | 'request' = item.isRequest ? 'request' : 'marketplace';

  /* When the listing has no real photos we render a text-only card — no
     stock image, no fabricated thumbnail. Title + description shown directly. */
  if (!hasMedia) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <article
          className="feed-card inventory-card"
          data-stroke={strokeKind}
          style={{ aspectRatio: ar, padding: 0, position: 'relative', overflow: 'hidden' }}
          aria-label={`Open ${item.title}`}
        >
          <button
            onClick={onClick}
            style={{
              all: 'unset', cursor: 'pointer',
              position: 'absolute', inset: 0,
              padding: '14px 14px 14px',
              display: 'flex', flexDirection: 'column', gap: 8,
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          >
            {/* type chip top-left */}
            <span style={{
              alignSelf: 'flex-start',
              background: 'var(--bg-inset)',
              color: 'var(--text-secondary)',
              padding: '3px 9px',
              borderRadius: 999,
              fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em',
            }}>
              {item.isRequest ? '🙋 Request' : item.category}
            </span>
            <p style={{
              margin: 0,
              fontSize: 15, fontWeight: 600, lineHeight: 1.25,
              letterSpacing: '-0.015em',
              color: 'var(--text-primary)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>{item.title}</p>
            {item.description && (
              <p style={{
                margin: 0,
                fontSize: 12, color: 'var(--text-secondary)',
                lineHeight: 1.45,
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{item.description}</p>
            )}
            <div style={{
              marginTop: 'auto',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              fontSize: 11, color: 'var(--text-muted)',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {item.isRequest ? null : <><MapPin size={10} strokeWidth={2} />{item.location}</>}
              </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {item.isRequest
                  ? (item.urgent ? 'Urgent' : 'Wanted')
                  : item.kind === 'opportunity' ? opportunityCompLabel(item)
                  : isPriced ? `₹${item.price}`
                  : item.listingType === 'sell' ? 'Selling'
                  : item.listingType === 'free' ? 'Free'
                  : item.listingType[0].toUpperCase() + item.listingType.slice(1)}
              </span>
            </div>
          </button>
        </article>
        {completeLabel && (
          <CompleteButton
            label={completeLabel}
            onClick={onComplete ?? (() => {})}
            isClosed={!!item.isClosed}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        className="feed-card inventory-card"
        data-stroke={strokeKind}
        style={{ aspectRatio: ar, padding: 0, position: 'relative' }}
        aria-label={`Open ${item.title}`}
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
                      : item.kind === 'opportunity' ? opportunityCompLabel(item)
                      : isPriced ? `₹${item.price}`
                      : item.listingType === 'sell' ? 'Selling'
                      : item.listingType === 'free' ? 'Free'
                      : item.listingType[0].toUpperCase() + item.listingType.slice(1)}
                  </span>
                </div>
              </div>
            </>
          }
        />
      </div>
      {completeLabel && (
        <CompleteButton
          label={completeLabel}
          onClick={onComplete ?? (() => {})}
          isClosed={!!item.isClosed}
        />
      )}
    </div>
  );
}

/* Per-card action pill rendered BELOW the photo/card area. Owner-only.
   Default (available): white bg, black text, 1px border.
   Active/closed (already sold/completed): black bg, white text, no border.
   Hover: slight elevation on the available state. */
function CompleteButton({
  label, onClick, isClosed,
}: { label: string; onClick: () => void | Promise<void>; isClosed: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (busy || isClosed) return;
        setBusy(true);
        try { await onClick(); } finally { setBusy(false); }
      }}
      aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        width: '100%',
        padding: '7px 10px',
        marginTop: 6,
        background: isClosed ? '#0E0E0E' : 'var(--bg-surface, #fff)',
        color: isClosed ? '#fff' : 'var(--text-primary)',
        border: isClosed ? 'none' : '1px solid var(--border-default)',
        borderRadius: 999,
        fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em',
        cursor: isClosed ? 'default' : busy ? 'wait' : 'pointer',
        opacity: busy ? 0.65 : 1,
        transition: 'box-shadow 150ms ease',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        if (!isClosed) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
      }}
    >
      <Check size={11} strokeWidth={2} />
      {busy ? '…' : label}
    </button>
  );
}

/* ── Event tile for the Shared tab ──────────────── */

function InventoryEventCard({
  event, tall, onClick, onDelete,
}: { event: CommunityEvent; tall: boolean; onClick: () => void; onDelete?: () => void | Promise<void> }) {
  /* Real (Supabase) events carry photoUrls; mock events fall back to a curated
     Unsplash cover. If a real event has no photo, we render text-only too. */
  const hasUploaded = Array.isArray((event as { photoUrls?: string[] }).photoUrls)
    && ((event as { photoUrls?: string[] }).photoUrls?.length ?? 0) > 0;
  const isMockEvent = !Array.isArray((event as { photoUrls?: string[] }).photoUrls);
  const photo = (event as { photoUrls?: string[] }).photoUrls?.[0]
    ?? (isMockEvent ? getEventPhoto(event.id, event.eventType) : undefined);
  const metrics = getEventMetrics(event.id);
  const ar = tall ? '0.72' : '0.92';

  if (!photo && !hasUploaded && !isMockEvent) {
    /* Text-only event card. */
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <article className="feed-card inventory-card" data-stroke="event" style={{ aspectRatio: ar, padding: 0, position: 'relative', overflow: 'hidden' }}>
          <button onClick={onClick} style={{
            all: 'unset', cursor: 'pointer', position: 'absolute', inset: 0,
            padding: '14px', display: 'flex', flexDirection: 'column', gap: 8,
            background: 'var(--bg-surface)', color: 'var(--text-primary)', boxSizing: 'border-box',
          }}>
            <span style={{
              alignSelf: 'flex-start', background: 'var(--bg-inset)',
              color: 'var(--text-secondary)', padding: '3px 9px',
              borderRadius: 999, fontSize: 10, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <CalendarDays size={10} strokeWidth={2} /> Event
            </span>
            <p style={{
              margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.25,
              color: 'var(--text-primary)', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{event.title}</p>
            {event.description && (
              <p style={{
                margin: 0, fontSize: 12, color: 'var(--text-secondary)',
                lineHeight: 1.45, display: '-webkit-box',
                WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{event.description}</p>
            )}
            <div style={{
              marginTop: 'auto', display: 'flex', justifyContent: 'space-between',
              fontSize: 11, color: 'var(--text-muted)',
            }}>
              <span>{event.date.split(' ').slice(0, 3).join(' ')}</span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Eye size={10} strokeWidth={2} />{metrics.views}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Users size={10} strokeWidth={2} />{metrics.rsvps}</span>
              </span>
            </div>
          </button>
        </article>
        {onDelete && <CompleteButton label="Delete" onClick={onDelete} isClosed={false} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="feed-card inventory-card" data-stroke="event" style={{ aspectRatio: ar, padding: 0, position: 'relative' }}>
        <button
          onClick={onClick}
          className="feed-card"
          style={{ aspectRatio: ar, padding: 0, border: 'none', background: 'transparent', width: '100%', height: '100%' }}
          aria-label={`Open event ${event.title}`}
        >
          <img src={photo} alt="" className="feed-card-img" loading="lazy" />

          <span style={{
            position: 'absolute', top: 10, left: 10,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            backdropFilter: 'blur(8px)', borderRadius: 999,
            padding: '4px 9px', fontSize: 10, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 4, zIndex: 3,
          }}>
            <CalendarDays size={10} strokeWidth={2} />Event
          </span>

          <div className="feed-card-overlay">
            <p className="feed-card-title">{event.title}</p>
            <div className="feed-card-meta" style={{ gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Eye size={10} strokeWidth={2} />{metrics.views}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Users size={10} strokeWidth={2} />{metrics.rsvps}
              </span>
              <span className="feed-card-price">{event.date.split(' ').slice(0, 3).join(' ')}</span>
            </div>
          </div>
        </button>
      </div>
      {onDelete && <CompleteButton label="Delete" onClick={onDelete} isClosed={false} />}
    </div>
  );
}

/* ── Lost & Found tile (orange-stroked, inventory-only) ── */
function InventoryLostFoundCard({
  lf, tall, onClick, completeLabel, onComplete,
}: {
  lf: LostItem;
  tall: boolean;
  onClick: () => void;
  completeLabel?: string;
  onComplete?: () => void | Promise<void>;
}) {
  const photo = getLostFoundPhoto(lf.id, lf.photoIcon, lf.photoUrls);
  const isLost = lf.status === 'lost';
  const ar = tall ? '0.72' : '0.92';
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        className="feed-card inventory-card"
        data-stroke="lostfound"
        style={{ aspectRatio: ar, padding: 0, position: 'relative' }}
      >
        <button
          onClick={onClick}
          className="feed-card"
          style={{ aspectRatio: ar, padding: 0, border: 'none', background: 'transparent', width: '100%', height: '100%' }}
          aria-label={`Open ${lf.title}`}
        >
          <img src={photo} alt="" className="feed-card-img" loading="lazy" />

          <span style={{
            position: 'absolute', top: 10, left: 10,
            background: isLost ? 'rgba(237,46,80,0.92)' : 'rgba(34,197,94,0.92)',
            color: '#fff',
            backdropFilter: 'blur(8px)', borderRadius: 999,
            padding: '4px 10px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            zIndex: 3,
          }}>
            {lf.status}
          </span>

          <div className="feed-card-overlay">
            <p className="feed-card-title">{lf.title}</p>
            <div className="feed-card-meta" style={{ gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} strokeWidth={2} />
                {lf.lastSeen}
              </span>
              <span className="feed-card-price">{lf.timeAgo}</span>
            </div>
          </div>
        </button>
      </div>
      {completeLabel && onComplete && (
        <CompleteButton label={completeLabel} onClick={onComplete} isClosed={false} />
      )}
    </div>
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
    tab === 'shared'  ? {
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
    tab === 'events' ? {
      icon: '📅',
      prompt: 'No events yet.',
      sub: 'Organize a swap, repair café, or cleanup — your community will see it on the Events page.',
      ctaLabel: 'Create an event',
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
