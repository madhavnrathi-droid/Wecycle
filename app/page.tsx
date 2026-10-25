'use client';

import { getActiveRoom } from '../lib/rooms';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

/* ── What ships with the first paint, and what doesn't ─────────────────────
 *
 * Every screen in this app is a client component swapped inside this one route,
 * and all 26 of them used to be imported statically. That meant someone landing
 * on the feed downloaded the item detail screen, all five post forms, the event
 * insights dashboard, the form builder and the account screen before they could
 * read a single card — on a campus phone, over campus wifi.
 *
 * Only the feed and the bar under it are needed to render the first screen.
 * Everything below is behind a tap, so it is fetched on that tap instead. The
 * chunks are small and the network is already idle by then, so the swap is
 * imperceptible; what it removes is weight from the one moment that decides
 * whether a stranger stays.
 *
 * ssr:false throughout because these are client-only screens — they read
 * window, localStorage and the auth session — and there is no SSR pass to
 * benefit from. */
import BottomNav, { type Screen } from '../components/BottomNav';
import FeedScreen from '../components/FeedScreen';
import type { LFSavePatch } from '../components/LostFoundScreen';

/* Nav destinations — one tap from the feed. */
const MarketplaceScreen = dynamic(() => import('../components/MarketplaceScreen'), { ssr: false });
const EventsScreen      = dynamic(() => import('../components/EventsScreen'), { ssr: false });
const ImpactScreen      = dynamic(() => import('../components/ImpactScreen'), { ssr: false });
const InventoryScreen   = dynamic(() => import('../components/InventoryScreen'), { ssr: false });
const LostFoundScreen   = dynamic(() => import('../components/LostFoundScreen'), { ssr: false });

/* Detail + secondary screens. */
const LostFoundDetailSheet    = dynamic(() => import('../components/LostFoundScreen').then(m => m.LostFoundDetailSheet), { ssr: false });
const ItemDetailScreen        = dynamic(() => import('../components/ItemDetailScreen'), { ssr: false });
const EventDetailScreen       = dynamic(() => import('../components/EventDetailScreen'), { ssr: false });
const EventRegistrationScreen = dynamic(() => import('../components/EventRegistrationScreen'), { ssr: false });
const EventInsightsScreen     = dynamic(() => import('../components/EventInsightsScreen'), { ssr: false });
const AccountScreen           = dynamic(() => import('../components/AccountScreen'), { ssr: false });
const ActivityScreen          = dynamic(() => import('../components/ActivityScreen'), { ssr: false });
const SettingsScreen          = dynamic(() => import('../components/SettingsScreen'), { ssr: false });
const NotificationsScreen     = dynamic(() => import('../components/NotificationsScreen'), { ssr: false });
const FeedbackScreen          = dynamic(() => import('../components/FeedbackScreen'), { ssr: false });
const ChangePasswordScreen    = dynamic(() => import('../components/ChangePasswordScreen'), { ssr: false });
const StorefrontScreen        = dynamic(() => import('../components/StorefrontScreen'), { ssr: false });
const MessagesScreen          = dynamic(() => import('../components/messages/MessagesScreen'), { ssr: false });
const OrderSheet              = dynamic(() => import('../components/orders/OrderSheet'), { ssr: false });

/* Overlays — none of these exist until something is opened. */
const Drawer                = dynamic(() => import('../components/Drawer'), { ssr: false });
const PostSheet             = dynamic(() => import('../components/PostSheet'), { ssr: false });
const ShareItemModal        = dynamic(() => import('../components/forms/ShareItemModal'), { ssr: false });
const PostRequestModal      = dynamic(() => import('../components/forms/PostRequestModal'), { ssr: false });
const ReportLostFoundModal  = dynamic(() => import('../components/forms/ReportLostFoundModal'), { ssr: false });
const SubmitEventModal      = dynamic(() => import('../components/forms/SubmitEventModal'), { ssr: false });
const AlertFormModal        = dynamic(() => import('../components/forms/AlertFormModal'), { ssr: false });
const AuthModal             = dynamic(() => import('../components/AuthModal'), { ssr: false });
import { track, EVT, trackScreenView } from '../lib/analytics';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useAuth } from '../lib/AuthContext';
import type { MarketplaceItem, CommunityEvent, User, LostItem } from '../lib/mockData';
import { MY_EVENT_IDS } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import {
  deletePostById, deleteEvent, purgeExpiredEvents, purgeExpiredRequests,
  updateLostFoundFields, repostLostFound, fetchPostById,
  toggleEventRsvp, fetchMyRsvpIds,
} from '../lib/liveData';
import { withdrawFormResponse, fetchEventForm } from '../lib/eventForms';
import { hasSupabaseEnv } from '../lib/supabase';
import { lockBodyScroll } from '../lib/bodyLock';
import { Z_LAYER } from '../lib/zLayers';
import { useBackLayer, installBackStack, setBaseUrl, backIsExternal } from '../lib/backStack';
import NavLayer, { navMotionStyle, edgeSwipeAvailable } from '../components/nav/NavLayer';
import { supabase } from '../lib/supabase';
import { deleteDemoPost, demoOwnedIds } from '../lib/demoInventory';
import type { WecycleAlert } from '../lib/alerts';
import {
  startMessaging, openConversationWith, rememberPeer, peerFromUser, type MessageTarget,
} from '../lib/messaging/store';
import { startOrders, getOrdersState, openOrderFor } from '../lib/orders/store';
import { brandByHandle, brandForUser } from '../lib/brands';
import { shopNameOf } from '../lib/shops';
import { primePostPreview } from '../lib/messaging/useMessaging';
import { conversationIdFor } from '../lib/messaging/conversationId';
import type { DeepLinkPost } from '../lib/liveData';
import {
  getSettings, onSettingsChange, applyTheme,
  applyLargerText,
} from '../lib/settings';

/* useLayoutEffect warns during SSR; fall back to useEffect on the server so
 * the scroll-restore logic below runs flush-before-paint on the client only. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ── The navigation stack ─────────────────────────────────────────────────
 * Every screen or sheet opened over the tabs, in the order it was opened.
 * Back closes the top one; whatever is under it is still mounted, exactly as it
 * was left. See components/nav/NavLayer.tsx and lib/backStack.ts. */
type SubScreen = 'settings' | 'notifications' | 'feedback' | 'password';
type Route =
  | { kind: 'item'; item: MarketplaceItem }
  | { kind: 'event'; event: CommunityEvent }
  | { kind: 'lf'; lf: LostItem }
  | { kind: 'store'; user: User }
  | { kind: 'register'; event: CommunityEvent; edit: boolean }
  | { kind: 'insights'; event: CommunityEvent }
  | { kind: 'messages'; conversationId: string | null; entry: 'inbox' | 'thread' }
  | { kind: 'sub'; screen: SubScreen };
type Entry = Route & { key: number };
type Leaving = Entry & { instant: boolean };
let navSeq = 0;

/* Tabs that can sit in the URL (`?tab=`), so a refresh on the web stays put. */
const TAB_PARAM: Partial<Record<Screen, string>> = {
  events: 'events', lost_found: 'lost-found', inventory: 'inventory',
  activity: 'activity', account: 'account', market: 'market', impact: 'impact',
};
const tabFromParam = (v: string | null): Screen | null =>
  (Object.entries(TAB_PARAM).find(([, p]) => p === v)?.[0] as Screen | undefined) ?? null;

/** The page URL with one deep-link param set, keeping anything else it had
 *  (the demo flag, UTM tags). */
function urlWith(base: string, key: string, value: string): string {
  try {
    const u = new URL(base, window.location.origin);
    ['p', 'u', 'b', 'tab'].forEach(k => u.searchParams.delete(k));
    u.searchParams.set(key, value);
    return u.pathname + u.search;
  } catch { return `/?${key}=${encodeURIComponent(value)}`; }
}

/** Registers one open screen with the back stack. Rendered just before the
 *  screen, so it registers before anything the screen itself opens. */
function BackEntry({ onBack, url }: { onBack: () => void; url?: string | null }) {
  useBackLayer(true, onBack, url);
  return null;
}

type ModalKind =
  | null
  | 'post-picker'
  | 'share-item'
  | 'offer-service'
  | 'post-request'
  | 'report-lf'
  | 'submit-event'
  | 'auth'
  | 'alert-form';

export default function WecycleApp() {
  const { user, profile, isDemo, isAdmin, signOut } = useAuth();
  /* `isDesktop` decides between full-page takeover (mobile) and modal-
   * theatre overlay (desktop) for item/event/storefront detail surfaces.
   * The L&F sheet already branches internally; the others wrap below. */
  const { isDesktop } = useBreakpoint();
  const storageMode = isDemo ? 'demo' as const : 'supabase' as const;
  const [activeScreen, setActiveScreenRaw] = useState<Screen>('feed');
  /* Every tab change goes through here, so the tab being left has its scroll
     position written down at that moment — not only from scroll events, which
     a backgrounded page never fires. */
  const tabScroll = useRef<Partial<Record<Screen, number>>>({});
  const activeTabRef = useRef<Screen>('feed');
  const setActiveScreen = (s: Screen) => {
    const m = typeof document !== 'undefined' ? document.getElementById('main') : null;
    if (m) tabScroll.current[activeTabRef.current] = m.scrollTop;
    setActiveScreenRaw(s);
  };
  const [modal, setModal] = useState<ModalKind>(null);
  /* Set when the auth modal is opened from "I don't know my current password",
     so it lands on the emailed-code reset with the address already filled in
     rather than on a sign-in form asking for that same password. */
  const [authReset, setAuthReset] = useState<{ email: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /* ── The stack ── */
  const [stack, setStack] = useState<Entry[]>([]);
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  /* Screens that have finished arriving — only those hide what is under them. */
  const [entered, setEntered] = useState<Set<number>>(() => new Set());
  /* Written eagerly as well as through state, so several opens or closes in
     one tick (a popstate closing two layers, close-then-open) see each other. */
  const stackRef = useRef<Entry[]>([]);
  const commitStack = (next: Entry[]) => { stackRef.current = next; setStack(next); };

  /* What had focus when each screen opened, so closing it hands focus back —
     to the card that was tapped, not to the top of the page. */
  const openedFrom = useRef(new Map<number, HTMLElement>());
  const push = (r: Route) => {
    setDrawerOpen(false);
    const key = ++navSeq;
    const from = typeof document !== 'undefined' ? document.activeElement : null;
    if (from instanceof HTMLElement && from !== document.body) openedFrom.current.set(key, from);
    commitStack([...stackRef.current, { ...r, key } as Entry]);
  };
  /** Close this entry and everything opened above it. */
  const closeEntry = (key: number, opts?: { instant?: boolean }) => {
    const s = stackRef.current;
    const i = s.findIndex(e => e.key === key);
    if (i < 0) return;
    const removed = s.slice(i);
    /* iOS Safari already animated its own swipe-back; doing ours as well would
       slide the page out twice. */
    const instant = opts?.instant ?? (backIsExternal() && navMotionStyle() === 'ios' && !edgeSwipeAvailable());
    commitStack(s.slice(0, i));
    setLeaving(l => [...l, ...removed.map(e => ({ ...e, instant }))]);
  };
  const closeAll = () => { const first = stackRef.current[0]; if (first) closeEntry(first.key); };
  const updateEntries = (fn: (e: Entry) => Entry) => commitStack(stackRef.current.map(fn));
  const topEntry: Entry | null = stack[stack.length - 1] ?? null;

  const openItem = (item: MarketplaceItem) => push({ kind: 'item', item });
  const openEvent = (event: CommunityEvent) => push({ kind: 'event', event });
  const openLF = (lf: LostItem) => push({ kind: 'lf', lf });
  /* A profile opens ON TOP of wherever it was tapped — a post, a chat, an
     insights list — so Back returns there, the way every app does it. */
  const openStorefrontFor = (u: User) => {
    push({ kind: 'store', user: u });
    /* THE second-most-important conversion event after contact_clicked —
     * if users browse storefronts, the marketplace has the "people" texture
     * we want. Tag `self_view` so we can split "I'm checking my own
     * storefront" from "I'm checking somebody else's." */
    track(EVT.storefront_opened, {
      user_id: u.id,
      self_view: !!user && user.id === u.id,
    });
  };
  /* Does the signed-in user own this post? Demo: it's one of the demo-store
     posts. Live: the listing's author id matches the auth user. */
  const ownsItem = (it: MarketplaceItem) => {
    if (isDemoMode()) return demoOwnedIds().includes(it.id);
    return !!user && it.user.id === user.id;
  };
  const [editingAlert, setEditingAlert] = useState<WecycleAlert | null>(null);

  /* ── Direct messages ──────────────────────────────────────────────────────
     Messages is one more screen on the stack: a profile or a post opened from
     a chat goes on top of it, and Back lands in the chat as it was. */
  /* One store for the badge, the inbox and the open thread; started once a
     member is known. Deferred a moment on sign-in so its queries do not
     compete with the feed's first paint. */
  useEffect(() => {
    const t = window.setTimeout(() => { startMessaging(user?.id ?? null); startOrders(user?.id ?? null); }, user ? 1200 : 0);
    return () => window.clearTimeout(t);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMessages = (target?: MessageTarget, post?: DeepLinkPost) => {
    if (!user) { setModal('auth'); return; }
    let conversationId: string | null = null;
    if (target) {
      if (target.peer.id === user.id) return;
      startMessaging(user.id);
      rememberPeer(target.peer);
      if (post) primePostPreview(post);
      conversationId = openConversationWith(target.peer.id, target.context ?? null);
      if (!conversationId) return;
    }
    showConversation(conversationId, target ? 'thread' : 'inbox');
  };
  /* Messages already open somewhere down the stack (a chat → their profile →
     "Message")? Go back to it and show this conversation, rather than opening
     a second Messages on top of the first. */
  const showConversation = (conversationId: string | null, entry: 'inbox' | 'thread') => {
    setDrawerOpen(false);
    const s = stackRef.current;
    const at = s.findIndex(e => e.kind === 'messages');
    if (at < 0) { push({ kind: 'messages', conversationId, entry }); return; }
    if (at < s.length - 1) closeEntry(s[at + 1].key);
    updateEntries(e => (e.key === s[at].key && e.kind === 'messages'
      ? { ...e, conversationId: conversationId ?? e.conversationId } : e));
  };

  /* "Message seller" and friends — one per kind of post. */
  const messageAboutItem = (it: MarketplaceItem) => openMessages(
    { peer: peerFromUser(it.user), context: { type: it.isRequest ? 'request' : 'listing', id: it.id, title: it.title } },
    { kind: it.isRequest ? 'request' : 'item', data: it },
  );
  const messageAboutEvent = (ev: CommunityEvent) => openMessages(
    { peer: peerFromUser(ev.organizer), context: { type: 'event', id: ev.id, title: ev.title } },
    { kind: 'event', data: ev },
  );
  const messageAboutLF = (lf: LostItem) => openMessages(
    { peer: peerFromUser(lf.user), context: { type: 'lost_found', id: lf.id, title: lf.title } },
    { kind: 'lostfound', data: lf },
  );
  const messageUser = (u: User) => openMessages({ peer: peerFromUser(u) });

  /* ── Orders ──
     "Order" on a post opens the order sheet — or, if this member already has
     an open order for it, goes straight to that order's chat. Placing one
     lands in the chat too: ordering and talking are one thread. */
  const [orderItem, setOrderItem] = useState<MarketplaceItem | null>(null);
  const openOrderChat = (conversationPeerId: string) => {
    if (!user) { setModal('auth'); return; }
    startMessaging(user.id);
    const conversationId = openConversationWith(conversationPeerId, null);
    if (!conversationId) return;
    showConversation(conversationId, 'thread');
  };
  const orderItemFlow = (it: MarketplaceItem) => {
    if (!user) { setModal('auth'); return; }
    startOrders(user.id);
    const existing = openOrderFor(getOrdersState(), it.id);
    if (existing) { rememberPeer(peerFromUser(it.user)); openOrderChat(it.user.id); return; }
    track(EVT.order_sheet_opened, { priced: typeof it.price === 'number' });
    setOrderItem(it);
  };


  /* Open a member's storefront from just their id — a search hit, a chat.
     Fetches a fresh row so it never carries stale data from wherever the id
     came from. Returns whether it opened. */
  const openUserById = async (userId: string): Promise<boolean> => {
    /* Search-result tap → load the full profile shape the
       storefront expects, then open it. We fetch a fresh row so
       we don't carry stale data from the search hit. */
    /* Deliberately does NOT select email/phone. Those columns have no
       SELECT grant for `authenticated` (see the column-grant lockdown
       migration), and naming a non-granted column makes Postgres
       refuse the WHOLE select — which landed here as `data === null`
       and a tap that silently did nothing. The detail screens resolve
       contact on demand through useOwnerContact → get_contact, which
       honours the owner's share prefs. */
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, initials, avatar_color, role, bio, is_online, contact_email_enabled, contact_whatsapp_enabled')
      .eq('id', userId)
      .single();
    if (error || !data) return false;
    const p = data as unknown as {
      id: string;
      full_name: string | null;
      initials: string | null;
      avatar_color: string | null;
      role: string | null;
      bio: string | null;
      is_online: boolean | null;
      contact_email_enabled: boolean | null;
      contact_whatsapp_enabled: boolean | null;
    };
    openStorefrontFor({
      id: p.id,
      name: p.full_name || 'Wecycle member',
      initials: p.initials || 'W',
      color: p.avatar_color || '#6C63FF',
      role: p.role || 'Member',
      shop: shopNameOf(p) ?? undefined,
      community: 'Wecycle',
      joinedDaysAgo: 0,
      itemsShared: 0,
      itemsReceived: 0,
      impactScore: 0,
      badges: [],
      isOnline: p.is_online ?? false,
      /* Left undefined on purpose — resolved per share-prefs by
         useOwnerContact on the screens that offer a contact button. */
      email: undefined,
      phone: undefined,
      contact: {
        email: p.contact_email_enabled ?? true,
        whatsapp: p.contact_whatsapp_enabled ?? false,
      },
    });
    return true;
  };

  /* ── RSVPs — app-level so EventsScreen + EventDetailScreen stay in sync.
     Live mode persists via event_rsvps/rpc_toggle_rsvp and hydrates on auth;
     demo mode seeds the fixture RSVPs and stays in memory. */
  const [rsvpdEvents, setRsvpdEvents] = useState<Set<string>>(new Set());
  /* Ref mirror of rsvpdEvents so async reconciliation reads CURRENT state,
     not the closure snapshot — makes setRsvpLocal idempotent (no double
     attendee bumps, safe to call again with the server's authoritative
     answer). */
  const rsvpdRef = useRef<Set<string>>(new Set());
  const applyRsvpSet = (ids: Set<string>) => { rsvpdRef.current = ids; setRsvpdEvents(ids); };
  useEffect(() => {
    /* isDemoMode() (the ?demo flag) — same check every other surface uses. */
    if (isDemoMode()) { applyRsvpSet(new Set(['e1', 'e4', 'e5'])); return; }
    if (!user || !hasSupabaseEnv) { applyRsvpSet(new Set()); return; }
    let cancelled = false;
    fetchMyRsvpIds(user.id).then(ids => { if (!cancelled) applyRsvpSet(ids); });
    return () => { cancelled = true; };
  }, [user, isDemo]);

  /* Registration form-fill + organizer insights: screens on the stack, above
     the event they belong to. */
  const openRegistration = (event: CommunityEvent, edit: boolean) => push({ kind: 'register', event, edit });
  const openInsights = (event: CommunityEvent) => push({ kind: 'insights', event });

  /* Idempotent local RSVP write: no-ops (and doesn't bump the attendee
     count) when the state already matches, so optimistic-then-reconcile
     never double-counts. */
  const setRsvpLocal = (id: string, going: boolean) => {
    if (rsvpdRef.current.has(id) === going) return;
    const next = new Set(rsvpdRef.current);
    if (going) next.add(id); else next.delete(id);
    applyRsvpSet(next);
    updateEntries(e => (e.kind === 'event' && e.event.id === id
      ? { ...e, event: { ...e.event, attendees: Math.max(0, e.event.attendees + (going ? 1 : -1)) } }
      : e));
  };

  /* THE central RSVP entry point — every RSVP button routes here.
       No form  → toggle straight away (optimistic, reconciled against the
                  RPC's returned state so a stale tab can't invert reality).
       Has form → new RSVP opens the registration screen (the submit confirms
                  it); cancelling withdraws the response along with the RSVP. */
  const requestRsvp = async (event: CommunityEvent) => {
    /* Demo mode is a guided tour — let RSVPs work without an account (they
       only live in memory). Live mode requires auth. */
    if (!user && !isDemoMode()) { setModal('auth'); return; }
    const going = rsvpdRef.current.has(event.id);

    if (!going) {
      if (event.hasForm) {
        openRegistration(event, false);
        return;
      }
      /* The event object can be a stale snapshot (feed cache) that predates
         a form the organizer added later — verify before skipping it. */
      if (!isDemoMode() && hasSupabaseEnv) {
        const form = await fetchEventForm(event.id).catch(() => null);
        if (form && form.fields.length > 0) {
          openRegistration({ ...event, hasForm: true }, false);
          return;
        }
      }
      setRsvpLocal(event.id, true);
      if (isDemoMode() || !hasSupabaseEnv) return;
      try {
        const result = await toggleEventRsvp(event.id);
        /* Reconcile with the server's authoritative answer — if this tab was
           stale and the toggle actually cancelled, reflect that. */
        setRsvpLocal(event.id, result === 'going');
      } catch {
        setRsvpLocal(event.id, false);
      }
      return;
    }

    /* ── Cancel path ── */
    if (typeof window !== 'undefined' && !window.confirm(
      event.hasForm
        ? 'Cancel your RSVP? Your registration response will be withdrawn too.'
        : 'Cancel your RSVP?',
    )) return;

    setRsvpLocal(event.id, false);
    if (isDemoMode() || !hasSupabaseEnv) {
      /* Demo keeps its promise too — drop the in-memory response. */
      withdrawFormResponse(event.id).catch(() => {});
      return;
    }
    let result: 'going' | 'cancelled' | null = null;
    try {
      result = await toggleEventRsvp(event.id);
      setRsvpLocal(event.id, result === 'going');
    } catch {
      setRsvpLocal(event.id, true); /* toggle itself failed — restore */
      return;
    }
    /* Withdraw is best-effort and SEPARATE from the toggle: if it fails the
       RSVP is still cancelled — never resurrect "Going" over it. Attempted
       regardless of the (possibly stale) hasForm flag; it no-ops without a
       stored response. */
    if (result === 'cancelled') {
      try {
        await withdrawFormResponse(event.id);
        track(EVT.registration_withdrawn, { event_id: event.id });
      } catch { /* orphaned response cleaned up on next submit/withdraw */ }
    }
  };

  /* Registration submitted → make sure the RSVP is confirmed. Edit mode
     never touches the RSVP (they're already going). */
  const handleRegistrationSubmitted = async (entryKey: number, ev: CommunityEvent, wasEdit: boolean) => {
    closeEntry(entryKey);
    if (wasEdit) return;
    setRsvpLocal(ev.id, true);
    if (isDemoMode() || !hasSupabaseEnv) return;
    try {
      /* rpc_toggle_rsvp is a TOGGLE — if a stale tab thought we weren't going
         but the server says otherwise, the first call cancels; flip it back
         so "submit registration" always lands on GOING. */
      let result = await toggleEventRsvp(ev.id);
      if (result === 'cancelled') result = await toggleEventRsvp(ev.id);
      setRsvpLocal(ev.id, result === 'going');
    } catch {
      /* The form answers are already stored at this point, so failing quietly
         left the worst possible split: the organizer sees a response while the
         person is NOT on the attendee list, and nobody is told. Say so, and say
         what to do about it. */
      setRsvpLocal(ev.id, false);
      if (typeof window !== 'undefined') {
        window.alert(
          `Your answers for "${ev.title}" were saved, but we couldn't add you to the attendee list. `
          + 'Open the event and tap RSVP to finish — your answers are still there.',
        );
      }
    }
  };

  const [lfDefaultStatus, setLfDefaultStatus] = useState<'lost' | 'found' | undefined>();


  /* Settings and its sub-screens are screens on the stack too, so
     Settings → Notifications → Back lands on Settings. */
  const pushSub = (screen: SubScreen) => push({ kind: 'sub', screen });
  const closeSubs = () => {
    const first = stackRef.current.find(e => e.kind === 'sub');
    if (first) closeEntry(first.key);
  };

  /* ── The app's page_view ───────────────────────────────────────────────
     One route, many screens, so GA4 has to be told what is on screen or its
     Pages report has a single row reading "/" and its engagement rule that
     counts 2+ page_views per session can never fire.

     The topmost surface wins: an open post is what the person is looking at,
     not the tab behind it. Fires on mount too — gtag's automatic page_view is
     switched off in the layout precisely so this owns all of them, which also
     makes a deep link report the post rather than the feed. */
  const VIEW_NAME: Record<Route['kind'], string> = {
    item: 'listing_detail', event: 'event_detail', lf: 'lostfound_detail', store: 'storefront',
    register: 'event_registration', insights: 'event_insights', messages: 'messages', sub: 'settings',
  };
  const currentView = topEntry
    ? (topEntry.kind === 'sub' ? topEntry.screen : VIEW_NAME[topEntry.kind])
    : activeScreen;

  useEffect(() => {
    trackScreenView(String(currentView));
  }, [currentView]);

  /* Appearance — Wecycle is light-only now (dark mode retired). We still pin
   * the browser/PWA chrome to the light surface and apply the "larger text"
   * preference, reacting to changes made in Settings. */
  useEffect(() => {
    const s = getSettings();
    applyTheme('light');
    applyLargerText(s.appearance.largerText);
    const off = onSettingsChange(next => {
      applyTheme('light');
      applyLargerText(next.appearance.largerText);
    });
    return off;
  }, []);

  /* Each tab keeps its own scroll position. All tabs share #main, so the
     offset is remembered per tab as it scrolls and put back when the tab
     returns — the way Instagram's feed is where you left it after a look at
     your profile. */
  const rememberTabScroll = (e: React.UIEvent<HTMLElement>) => {
    tabScroll.current[activeTabRef.current] = e.currentTarget.scrollTop;
  };
  useIsoLayoutEffect(() => {
    activeTabRef.current = activeScreen;
    const main = document.getElementById('main');
    if (main) main.scrollTop = tabScroll.current[activeScreen] ?? 0;
  }, [activeScreen]);

  /* Tabs mount the first time they are visited and then stay mounted, hidden,
     so switching back finds them as they were — filters, search, loaded posts. */
  const [visitedTabs, setVisitedTabs] = useState<Set<Screen>>(() => new Set<Screen>(['feed']));
  useEffect(() => {
    setVisitedTabs(v => (v.has(activeScreen) ? v : new Set(v).add(activeScreen)));
  }, [activeScreen]);

  /* Tap the tab you are on → back to its top, like every tab bar on iOS and
     Android. */
  const selectTab = (s: Screen) => {
    if (s === activeScreen && !stackRef.current.length) {
      document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    closeAll();
    setActiveScreen(s);
  };

  /* Back from any tab but Home goes to Home, and Back on Home leaves — the
     Android rule for bottom navigation, and what Instagram does on the web.
     One entry however many tabs were visited in between. */
  useBackLayer(activeScreen !== 'feed', () => setActiveScreen('feed'),
    TAB_PARAM[activeScreen] ? urlWith(typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search, 'tab', TAB_PARAM[activeScreen]!) : null);

  /* Service worker.
   *
   * The reload is the important half. A worker that takes over mid-session is
   * a NEW worker, which means the page is still running whatever the OLD one
   * served — and the old one cached /_next/ with stale-while-revalidate under
   * a VERSION that never moved, so "whatever it served" could be code from a
   * build we replaced weeks ago. A device in that state can't be talked out of
   * it: the app looks fine, it is simply an older app, disagreeing with the
   * database about things like which categories exist. Reloading once on
   * handover is what lets such a device heal itself instead of waiting for
   * someone to know to clear their cache.
   *
   * Guarded twice over, because a reload loop is worse than a stale bundle:
   * `controllerchange` also fires on the very first install (when there was no
   * previous controller and nothing is stale), and the session flag means even
   * an unforeseen repeat handover can only ever cost one reload per tab. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});

    const hadController = !!navigator.serviceWorker.controller;
    const onChange = () => {
      if (!hadController) return;
      try {
        if (sessionStorage.getItem('wecycle.swreload')) return;
        sessionStorage.setItem('wecycle.swreload', '1');
      } catch { /* private mode — the hadController guard still holds */ }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);

  /* On app open, fire one-time janitors that drop past-dated events and
     expired requests from the DB. Best-effort: RLS lets the owner/admin
     nuke their own; anything we can't delete is still filtered client-side
     in the fetch helpers. */
  useEffect(() => {
    if (isDemoMode()) return;
    /* Defer the janitors a few seconds so their DELETEs don't compete with the
       feed's read queries during the critical first-paint window. */
    const t = setTimeout(() => {
      purgeExpiredEvents().catch(() => {});
      purgeExpiredRequests().catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  /* ─ App-open analytics ────────────────────────────────────────
     Fire-once-per-load events that give GA4 the visit context: first vs
     returning user, UTM source/medium/campaign if the link carried them,
     and the platform shell. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    /* first vs return — flag in localStorage so we don't double-count a
       refresh as a new visit. */
    let isFirst = false;
    try {
      const seen = localStorage.getItem('wecycle.fv');
      isFirst = !seen;
      if (isFirst) localStorage.setItem('wecycle.fv', '1');
    } catch { /* private mode etc. — assume returning */ }
    track(EVT.app_open, { is_first_visit: isFirst });

    /* UTM detection — surfaces "where did this user come from" in GA4. We
       parse the *current* URL once (next/script's gtag has already fired
       the initial page_view so source attribution is already wired, but
       this gives us a custom event we can also filter Clarity sessions by). */
    const params = new URLSearchParams(window.location.search);
    const utm = {
      utm_source:   params.get('utm_source')   ?? undefined,
      utm_medium:   params.get('utm_medium')   ?? undefined,
      utm_campaign: params.get('utm_campaign') ?? undefined,
      utm_term:     params.get('utm_term')     ?? undefined,
      utm_content:  params.get('utm_content')  ?? undefined,
    };
    if (Object.values(utm).some(Boolean)) {
      track(EVT.app_open as never, { ...utm, kind: 'utm_detected' });
    }

    /* Deep links. `/?p=<id>` opens a post, `/?u=<id>` a member's profile,
       `/?b=<handle>` (what /b/<handle> redirects to) a brand's store, and
       `/?tab=` a tab. The page underneath becomes the plain URL first, so
       Back from a shared link lands on the feed rather than leaving the site —
       and the opened screen then puts its own URL back on top, so the address
       bar still names what is on screen. */
    const deepTab = tabFromParam(params.get('tab'));
    if (deepTab) setActiveScreen(deepTab);
    try {
      const u = new URL(window.location.href);
      ['p', 'u', 'b', 'tab'].forEach(k => u.searchParams.delete(k));
      installBackStack();
      setBaseUrl(u.pathname + u.search + u.hash);
    } catch { /* ignore */ }

    const brandHandle = params.get('b');
    const linkedBrand = brandByHandle(brandHandle);
    if (linkedBrand) {
      openUserById(linkedBrand.ownerId).then(ok => {
        if (ok) track(EVT.brand_opened, { brand: linkedBrand.handle, source: 'link' });
      }).catch(() => { /* ignore */ });
    }
    const linkedUser = params.get('u');
    if (linkedUser && !linkedBrand) void openUserById(linkedUser).catch(() => { /* ignore */ });

    const postId = params.get('p');
    if (postId) {
      fetchPostById(postId).then(found => {
        if (!found) return;
        if (found.kind === 'item' || found.kind === 'request') openItem(found.data);
        else if (found.kind === 'event') openEvent(found.data);
        else if (found.kind === 'lostfound') openLF(found.data);
      }).catch(() => { /* ignore — invalid id */ });
    }
  }, []);

  const closeModal = () => { setModal(null); setAuthReset(null); };

  const requireAuth = (next: ModalKind) => {
    if (!user) {
      setModal('auth');
      return;
    }
    setModal(next);
  };

  const openShareItem    = () => requireAuth('share-item');
  const openOfferService = () => requireAuth('offer-service');
  const openPostRequest  = () => requireAuth('post-request');
  const openSubmitEvent  = () => requireAuth('submit-event');

  /* Native share sheet → "invite a friend". Used by the drawer's Invite
     item and the "For MAHE, by MAHE" marketing slide. Falls back to
     clipboard when the Web Share API isn't available (desktop browsers). */
  const inviteFriends = () => {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.origin || 'https://wecycle.page';
    const nav = window.navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      nav.share({
        title: 'Wecycle',
        /* In a private room, the invite says which one — and which email gets
           you in — or the friend signs up and lands in the wrong room. */
        text: getActiveRoom().university === 'NMIMS'
          ? `Join ${getActiveRoom().name} on Wecycle — our campus’s own room to buy, borrow and give away. Sign up with your @nmims.in email.`
          : 'Join me on Wecycle — circulate resources in our community.',
        url: shareUrl,
      }).catch(() => {});
    } else if (nav.clipboard?.writeText) {
      nav.clipboard.writeText(shareUrl).then(
        () => window.alert('Link copied — share it with a friend!'),
        () => {},
      );
    }
  };
  const openReportLF    = (status?: 'lost' | 'found') => {
    setLfDefaultStatus(status);
    requireAuth('report-lf');
  };

  const openCreateAlert = () => {
    if (!user) { setModal('auth'); return; }
    setEditingAlert(null);
    setModal('alert-form');
  };
  const openEditAlert = (a: WecycleAlert) => {
    if (!user) { setModal('auth'); return; }
    setEditingAlert(a);
    setModal('alert-form');
  };

  /* Avatar everywhere routes to the Account screen.
     If signed-out, prompt auth first. */
  const goToAccount = () => {
    if (!user) { setModal('auth'); return; }
    closeAll();
    setActiveScreen('account');
  };

  const handlePostPickerSelect = (kind: 'share' | 'service' | 'request' | 'event' | 'report-lf') => {
    setModal(null);
    setTimeout(() => {
      if (kind === 'share')     openShareItem();
      if (kind === 'service')   openOfferService();
      if (kind === 'request')   openPostRequest();
      if (kind === 'event')     openSubmitEvent();
      if (kind === 'report-lf') openReportLF();
    }, 120);
  };

  const handleDrawerNavigate = (id: string) => {
    setDrawerOpen(false);
    /* Defer screen switch by one frame so the drawer close animation reads cleanly */
    setTimeout(() => {
      if (id === 'account')   { goToAccount(); return; }
      if (id === 'messages')  { openMessages(); return; }
      if (id === 'settings')  { pushSub('settings');      return; }
      if (id === 'notifs')    { pushSub('notifications'); return; }
      if (id === 'feedback')  { pushSub('feedback');      return; }
      if (id === 'invite') {
        inviteFriends();
        return;
      }
      if (id === 'mission') {
        if (typeof window !== 'undefined') {
          window.open('/mission', '_blank', 'noopener,noreferrer');
        }
      }
    }, 80);
  };

  /* ── One screen of the stack ── */
  const eventOwner = (ev: CommunityEvent) =>
    (isDemoMode() && MY_EVENT_IDS.includes(ev.id)) || (!!user && ev.organizer.id === user.id);
  const entryUrl = (e: Entry): string | null => {
    if (typeof window === 'undefined') return null;
    const here = window.location.pathname + window.location.search;
    if (e.kind === 'item') return urlWith(here, 'p', e.item.id);
    if (e.kind === 'event') return urlWith(here, 'p', e.event.id);
    if (e.kind === 'lf') return urlWith(here, 'p', e.lf.id);
    if (e.kind === 'store') {
      const brand = brandForUser(e.user.id);
      return brand ? urlWith(here, 'b', brand.handle) : urlWith(here, 'u', e.user.id);
    }
    return null;
  };
  const entryLabel = (e: Entry): string => {
    switch (e.kind) {
      case 'item': return e.item.title;
      case 'event': return e.event.title;
      case 'lf': return e.lf.title;
      case 'store': return brandForUser(e.user.id)?.name ?? e.user.shop ?? `${e.user.name}'s storefront`;
      case 'register': return `Register for ${e.event.title}`;
      case 'insights': return `Insights for ${e.event.title}`;
      case 'messages': return 'Messages';
      case 'sub': return e.screen === 'notifications' ? 'Notifications' : e.screen === 'feedback' ? 'Feedback'
        : e.screen === 'password' ? 'Change password' : 'Settings';
    }
  };
  /* Desktop shows posts, events, profiles and insights as windows over the
     page; phones push them as full screens. Registration and Settings are full
     screens everywhere; Lost & Found is a sheet and Messages draws its own. */
  const layerKind = (e: Entry): 'screen' | 'overlay' => {
    if (e.kind === 'lf' || e.kind === 'messages') return 'overlay';
    if (isDesktop && (e.kind === 'item' || e.kind === 'event' || e.kind === 'store' || e.kind === 'insights')) return 'overlay';
    return 'screen';
  };

  const TAB_LABEL: Record<Screen, string> = {
    feed: 'Home', events: 'Events', lost_found: 'Lost & Found', inventory: 'Your inventory',
    activity: 'Activity', account: 'Account', market: 'Marketplace', impact: 'Impact',
  } as Record<Screen, string>;
  /** What Back from this entry returns to, in words. */
  const backLabelFor = (key: number): string => {
    const i = stack.findIndex(x => x.key === key);
    return i > 0 ? entryLabel(stack[i - 1]) : (TAB_LABEL[activeScreen] ?? 'Home');
  };

  const renderEntry = (e: Entry) => {
    const back = () => closeEntry(e.key);
    switch (e.kind) {
      case 'item': {
        const screen = (
          <ItemDetailScreen
            item={e.item}
            onBack={back}
            backLabel={backLabelFor(e.key)}
            onRequireAuth={() => setModal('auth')}
            onOpenStorefront={openStorefrontFor}
            onOpenItem={openItem}
            onOpenLF={openLF}
            onMessage={messageAboutItem}
            onOrder={orderItemFlow}
            /* Owner edits inline (no Edit button — fields are editable
               in place). Admin gets Delete on any post for moderation. */
            isOwner={ownsItem(e.item)}
            isAdmin={isAdmin}
            onDelete={(ownsItem(e.item) || isAdmin) ? async () => {
              if (isDemoMode()) { deleteDemoPost(e.item.id); return; }
              await deletePostById(e.item.id, e.item.isRequest ? 'request' : 'listing');
            } : undefined}
          />
        );
        return isDesktop ? <DesktopDetailModal onClose={back} ariaLabel={e.item.title}>{screen}</DesktopDetailModal> : screen;
      }
      case 'store': {
        const screen = (
          <StorefrontScreen
            user={e.user}
            onBack={back}
            onOpenItem={openItem}
            onOpenEvent={openEvent}
            onOpenLF={openLF}
            onMessage={messageUser}
            onOrder={orderItemFlow}
          />
        );
        return isDesktop
          ? <DesktopDetailModal onClose={back} ariaLabel={entryLabel(e)}>{screen}</DesktopDetailModal>
          : screen;
      }
      case 'event': {
        const isOwner = eventOwner(e.event);
        const screen = (
          <EventDetailScreen
            event={e.event}
            isRsvpd={rsvpdEvents.has(e.event.id)}
            isOwner={isOwner}
            isAdmin={isAdmin}
            onBack={back}
            onRsvp={() => requestRsvp(e.event)}
            onRequireAuth={() => setModal('auth')}
            onOpenStorefront={openStorefrontFor}
            onMessage={messageAboutEvent}
            onDelete={(isOwner || isAdmin) ? async () => {
              if (isDemoMode()) { deleteDemoPost(e.event.id); return; }
              await deleteEvent(e.event.id);
            } : undefined}
            onOpenInsights={(isOwner || isAdmin) ? () => openInsights(e.event) : undefined}
            onEditRegistration={() => openRegistration(e.event, true)}
            onOpenItem={openItem}
            onBrowseAll={() => { closeAll(); setActiveScreen('feed'); }}
          />
        );
        return isDesktop ? <DesktopDetailModal onClose={back} ariaLabel={e.event.title}>{screen}</DesktopDetailModal> : screen;
      }
      case 'insights': {
        const screen = <EventInsightsScreen event={e.event} onBack={back} onOpenUser={openStorefrontFor} />;
        return isDesktop
          ? <DesktopDetailModal onClose={back} ariaLabel={entryLabel(e)} width={920}>{screen}</DesktopDetailModal>
          : screen;
      }
      case 'register':
        return (
          <EventRegistrationScreen
            event={e.event}
            editMode={e.edit}
            onBack={back}
            onSubmitted={() => handleRegistrationSubmitted(e.key, e.event, e.edit)}
          />
        );
      case 'lf':
        return (
          <LostFoundDetailSheet
            item={e.lf}
            onClose={back}
            onRequireAuth={() => setModal('auth')}
            onOpenStorefront={openStorefrontFor}
            onMessage={messageAboutLF}
            viewerName={profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined}
            isOwner={!!user && e.lf.user.id === user.id}
            onSaveChanges={isDemoMode() ? undefined : async (patch: LFSavePatch) => {
              await updateLostFoundFields(e.lf.id, patch);
            }}
            onSaveAndRepost={isDemoMode() ? undefined : async (patch: LFSavePatch) => {
              await repostLostFound(e.lf.id, patch);
            }}
            onDelete={(!!user && e.lf.user.id === user.id) || isAdmin ? async () => {
              if (isDemoMode()) { back(); return; }
              await deletePostById(e.lf.id, 'lostfound');
            } : undefined}
          />
        );
      case 'messages':
        if (!user) return null;
        return (
          <MessagesScreen
            initialConversationId={e.conversationId}
            entry={e.entry}
            onClose={back}
            onOpenProfile={(peerId) => { void openUserById(peerId); }}
            onOpenPost={(post) => {
              if (post.kind === 'item' || post.kind === 'request') openItem(post.data);
              else if (post.kind === 'event') openEvent(post.data);
              else openLF(post.data);
            }}
            onBrowse={() => { closeAll(); setActiveScreen('feed'); }}
          />
        );
      case 'sub':
        if (e.screen === 'settings') return (
          <SettingsScreen
            onBack={back}
            onOpenNotifications={() => pushSub('notifications')}
            onOpenFeedback={() => pushSub('feedback')}
            onOpenAccount={goToAccount}
            onOpenPassword={() => pushSub('password')}
          />
        );
        if (e.screen === 'notifications') return <NotificationsScreen onBack={back} onOpenAccount={goToAccount} />;
        if (e.screen === 'feedback') return <FeedbackScreen onBack={back} />;
        return (
          <ChangePasswordScreen
            onBack={back}
            /* "I don't know my current password" → sign out and use the
               emailed-code reset, which is the only way in without it. */
            onForgot={async () => {
              const addr = (user as { email?: string } | null)?.email ?? profile?.email ?? '';
              closeSubs();
              await signOut();
              setAuthReset({ email: addr });
              setModal('auth');
            }}
          />
        );
    }
  };

  /* The tab screens, by name. */
  const renderTab = (t: Screen) => {
    switch (t) {
      case 'feed': return (
        <FeedScreen
          onRequireAuth={() => setModal('auth')}
          onPost={() => requireAuth('post-picker')}
          /* The storefront's "Post a job" CTA already knows the post type,
             so it skips the picker and opens the service composer. */
          onPostService={openOfferService}
          /* Same shortcut for the sell nudge under the shop window: it
             asked about a thing you own, so the picker has nothing left
             to ask. */
          onSellItem={openShareItem}
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenAccount={goToAccount}
          onOpenMessages={() => openMessages()}
          onOpenItem={openItem}
          onOpenEvent={openEvent}
          onOpenLF={openLF}
          onBannerAction={(kind) => {
            if (kind === 'share')       openShareItem();
            else if (kind === 'request') openPostRequest();
            else if (kind === 'events')  setActiveScreen('events');
            else if (kind === 'lost-found') setActiveScreen('lost_found');
            else if (kind === 'invite')  inviteFriends();
          }}
          onOpenUser={(userId) => { void openUserById(userId); }}
        />
      );
      case 'events': return (
        <EventsScreen
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenAccount={goToAccount}
          onOpenMessages={() => openMessages()}
          onCreate={openSubmitEvent}
          onOpenEvent={openEvent}
          rsvpdEvents={rsvpdEvents}
          onToggleRsvp={requestRsvp}
        />
      );
      case 'lost_found': return (
        <LostFoundScreen
          onReport={openReportLF}
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenAccount={goToAccount}
          onOpenMessages={() => openMessages()}
          onRequireAuth={() => setModal('auth')}
          onOpenStorefront={openStorefrontFor}
          onOpenLF={openLF}
        />
      );
      /* Activity is still reachable via Settings → Notifications hint flows or
         the alerts CTA on the home feed, but it's no longer in the bottom nav. */
      case 'activity': return (
        <ActivityScreen
          onOpenMenu={() => setDrawerOpen(true)}
          onBack={() => setActiveScreen('feed')}
          onOpenAccount={goToAccount}
          onOpenMessages={() => openMessages()}
          onCreateAlert={openCreateAlert}
          onEditAlert={openEditAlert}
        />
      );
      case 'inventory': return (
        <InventoryScreen
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenAccount={goToAccount}
          onOpenMessages={() => openMessages()}
          onPostNew={() => requireAuth('post-picker')}
          onOpenItem={openItem}
          onOpenEvent={openEvent}
          onOpenEventInsights={openInsights}
          onOpenLF={openLF}
          onOpenOrderChat={openOrderChat}
        />
      );
      case 'account': return (
        <AccountScreen
          onBack={() => setActiveScreen('feed')}
          onSignedOut={() => setActiveScreen('feed')}
        />
      );
      /* Desktop-only auxiliary screens */
      case 'market': return <MarketplaceScreen />;
      case 'impact': return <ImpactScreen />;
      default: return null;
    }
  };

  /* Underneath an open screen, the tabs take no focus and no clicks. */
  const baseEl = useRef<HTMLDivElement | null>(null);
  const baseRef = (el: HTMLDivElement | null) => { baseEl.current = el; };
  useIsoLayoutEffect(() => {
    const el = baseEl.current;
    if (!el) return;
    if (stack.length) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [stack.length]);

  /* Everything currently drawn: the stack, then whatever is still leaving. */
  const drawn: (Entry & { leavingInstant?: boolean })[] = [
    ...stack,
    ...leaving.map(l => ({ ...l, leavingInstant: l.instant })),
  ].sort((x, y) => x.key - y.key);
  const live = new Set(stack.map(e => e.key));
  const topLiveKey = stack.length ? stack[stack.length - 1].key : null;
  /* A full screen that has finished arriving hides everything below it. */
  let coveringIndex = -1;
  for (let i = drawn.length - 1; i >= 0; i--) {
    const d = drawn[i];
    if (live.has(d.key) && entered.has(d.key) && layerKind(d) === 'screen') { coveringIndex = i; break; }
  }
  const baseCovered = coveringIndex >= 0;

  return (
    <>
      {/* ── The tabs and the bar under them: always mounted, so Back finds
             them exactly as they were left. ── */}
      <div
        data-nav-base=""
        className="nav-base"
        data-covered={baseCovered || undefined}
        ref={baseRef}
        aria-hidden={stack.length ? true : undefined}
      >
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }} onScroll={rememberTabScroll}>
            {TABS.filter(t => visitedTabs.has(t) || t === activeScreen).map(t => (
              <div key={t} className="motion-rise" hidden={t !== activeScreen}>
                {renderTab(t)}
              </div>
            ))}
          </main>

          <BottomNav
            active={activeScreen}
            onChange={selectTab}
            onPost={() => requireAuth('post-picker')}
            postOpen={modal === 'post-picker'}
          />
        </div>
      </div>

      {/* ── The stack ── */}
      {drawn.map((e, i) => {
        const isLive = live.has(e.key);
        return (
          <NavSlot key={e.key}>
            {isLive && <BackEntry onBack={() => closeEntry(e.key)} url={entryUrl(e)} />}
            <NavLayer
              kind={layerKind(e)}
              z={Z_LAYER.content + 2 + i * 3}
              phase={!isLive ? 'leaving' : entered.has(e.key) ? 'idle' : 'entering'}
              instantLeave={e.leavingInstant}
              inert={!isLive || e.key !== topLiveKey}
              covered={i < coveringIndex}
              swipeable={isLive && e.key === topLiveKey}
              onSwipeBack={() => closeEntry(e.key, { instant: true })}
              onEntered={() => setEntered(s => (s.has(e.key) ? s : new Set(s).add(e.key)))}
              onLeft={() => {
                const back = openedFrom.current.get(e.key);
                openedFrom.current.delete(e.key);
                if (back?.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
                setLeaving(l => l.filter(x => x.key !== e.key));
                setEntered(s => { if (!s.has(e.key)) return s; const n = new Set(s); n.delete(e.key); return n; });
              }}
              label={entryLabel(e)}
            >
              {renderEntry(e)}
            </NavLayer>
          </NavSlot>
        );
      })}

      {/* ── Over everything: the drawer, the composers, sign-in, ordering. ── */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSignIn={() => { setDrawerOpen(false); setTimeout(() => setModal('auth'), 80); }}
        onNavigate={handleDrawerNavigate}
      />

      {modal === 'post-picker' && (
        <PostSheet onClose={closeModal} onSelect={handlePostPickerSelect} />
      )}

      {/* onPosted opens the finished listing. Posting used to end on the
          feed with nothing to show for it — see the note on the prop. */}
      <ShareItemModal open={modal === 'share-item'} onClose={closeModal} onPosted={openItem} />
      <ShareItemModal open={modal === 'offer-service'} onClose={closeModal} mode="service" onPosted={openItem} />
      <PostRequestModal open={modal === 'post-request'} onClose={closeModal} />
      <ReportLostFoundModal open={modal === 'report-lf'} onClose={closeModal} defaultStatus={lfDefaultStatus} />
      <SubmitEventModal open={modal === 'submit-event'} onClose={closeModal} />
      {user && (
        <AlertFormModal
          open={modal === 'alert-form'}
          onClose={() => { closeModal(); setEditingAlert(null); }}
          userId={user.id}
          mode={storageMode}
          alert={editingAlert}
        />
      )}
      <AuthModal
        open={modal === 'auth'}
        onClose={closeModal}
        startInReset={!!authReset}
        initialEmail={authReset?.email}
      />
      {orderItem && (
        <OrderSheet
          item={orderItem}
          onClose={() => setOrderItem(null)}
          onPlaced={(_conversationId, it) => {
            setOrderItem(null);
            primePostPreview({ kind: 'item', data: it });
            openMessages({ peer: peerFromUser(it.user), context: { type: 'listing', id: it.id, title: it.title } }, { kind: 'item', data: it });
          }}
        />
      )}
    </>
  );
}

const TABS: Screen[] = ['feed', 'events', 'lost_found', 'activity', 'inventory', 'account', 'market', 'impact'];

/** A stack entry: its back registration, then its layer. */
function NavSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* ── DesktopDetailModal ──
 * Thin wrapper that mirrors the LostFoundDetailSheet's desktop layout:
 * dim backdrop + centered 1080px-wide modal box that scrolls its own
 * contents. Used to host the marketplace / event / storefront detail
 * screens on desktop without making them replace the whole page.
 *
 * The backdrop swallows the click → close; the box stops propagation so
 * clicks inside don't dismiss it. ESC also closes (via the keydown
 * listener) so keyboard users can dismiss without aiming for the X.
 */
function DesktopDetailModal({
  onClose, ariaLabel, children, width = 1080, layer = Z_LAYER.content,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** Max box width in px — narrower for focused flows (forms), default 1080. */
  width?: number;
  /** Stacking base — a modal layered over another modal (registration /
   *  insights above event detail) must pass a HIGHER layer so its backdrop
   *  actually covers the lower box (backdrop = layer, box = layer + 1). */
  layer?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /* Anything layered ABOVE the theatre owns Escape. Overlays that sit on
         top (the auth/composer Modal, the share card's Radix dialog, the report
         sheet) call preventDefault in a capture-phase listener but not
         stopPropagation, so this bubble-phase listener still fires — and used
         to close the product underneath as well, discarding unsaved inline
         edits. Checking defaultPrevented is what makes the stack behave. */
      if (e.defaultPrevented) return;
      /* Full-page surfaces stand down the same way Modal.tsx does. */
      if (document.querySelector('[data-fbs]')) return;
      /* Only the TOPMOST stacked theatre reacts — otherwise one Escape rips
         through the whole stack (and eats typed form answers with it). */
      const all = document.querySelectorAll('[data-ddm]');
      if (all.length && all[all.length - 1] !== boxRef.current) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [onClose]);

  return (
    <>
      {/* Dim + blur backdrop. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: layer,
        }}
      />
      {/* Centered modal — fixed-position so it ignores page scroll. The
         inner overflow handles content scroll. */}
      <div
        ref={boxRef}
        data-ddm
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: `min(${width}px, 94vw)`,
          maxHeight: '90vh',
          background: 'var(--bg-card)',
          borderRadius: 24,
          zIndex: layer + 1,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Inner scroll shell — the hosted screens still expect a tall
           scrollable container, so we give them one bounded by maxHeight. */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </>
  );
}
