'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import BottomNav, { type Screen } from '../components/BottomNav';
import FeedScreen from '../components/FeedScreen';
import MarketplaceScreen from '../components/MarketplaceScreen';
import EventsScreen from '../components/EventsScreen';
import ImpactScreen from '../components/ImpactScreen';
import InventoryScreen from '../components/InventoryScreen';
import LostFoundScreen, { LostFoundDetailSheet, type LFSavePatch } from '../components/LostFoundScreen';
import ItemDetailScreen from '../components/ItemDetailScreen';
import EventDetailScreen from '../components/EventDetailScreen';
import EventRegistrationScreen from '../components/EventRegistrationScreen';
import EventInsightsScreen from '../components/EventInsightsScreen';
import AccountScreen from '../components/AccountScreen';
import ActivityScreen from '../components/ActivityScreen';
import SettingsScreen from '../components/SettingsScreen';
import NotificationsScreen from '../components/NotificationsScreen';
import FeedbackScreen from '../components/FeedbackScreen';
import StorefrontScreen from '../components/StorefrontScreen';
import Drawer from '../components/Drawer';
import PostSheet from '../components/PostSheet';
import ShareItemModal from '../components/forms/ShareItemModal';
import PostRequestModal from '../components/forms/PostRequestModal';
import ReportLostFoundModal from '../components/forms/ReportLostFoundModal';
import SubmitEventModal from '../components/forms/SubmitEventModal';
import AlertFormModal from '../components/forms/AlertFormModal';
import AuthModal from '../components/AuthModal';
import OnboardingTour, { hasCompletedOnboarding, type TourScreen } from '../components/OnboardingTour';
import { track, EVT } from '../lib/analytics';
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
import { withdrawFormResponse } from '../lib/eventForms';
import { hasSupabaseEnv } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { deleteDemoPost, demoOwnedIds } from '../lib/demoInventory';
import type { WecycleAlert } from '../lib/alerts';
import {
  getSettings, onSettingsChange, applyTheme,
  applyLargerText,
} from '../lib/settings';

/* useLayoutEffect warns during SSR; fall back to useEffect on the server so
 * the scroll-restore logic below runs flush-before-paint on the client only. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  const { user, profile, isDemo, isAdmin } = useAuth();
  /* `isDesktop` decides between full-page takeover (mobile) and modal-
   * theatre overlay (desktop) for item/event/storefront detail surfaces.
   * The L&F sheet already branches internally; the others wrap below. */
  const { isDesktop } = useBreakpoint();
  const storageMode = isDemo ? 'demo' as const : 'supabase' as const;
  const [activeScreen, setActiveScreen] = useState<Screen>('feed');
  const [modal, setModal] = useState<ModalKind>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openItem, setOpenItem] = useState<MarketplaceItem | null>(null);
  const [openEvent, setOpenEvent] = useState<CommunityEvent | null>(null);
  /* L&F detail is a bottom sheet (not a full screen) — lifted to app-level
   * so the same sheet can be opened from LostFoundScreen AND InventoryScreen. */
  const [openLF, setOpenLF] = useState<LostItem | null>(null);
  /* Storefront takes over the viewport when set — clicking any author avatar
     or owner card lands here. Cleared on back. */
  const [openStorefront, setOpenStorefront] = useState<User | null>(null);
  /* Opening a storefront must clear any open item/event first — otherwise the
     `if (openItem)` early-return below wins and the storefront never renders.
     This is THE fix for "clicking a user's name does nothing". */
  const openStorefrontFor = (u: User) => {
    setOpenItem(null);
    setOpenEvent(null);
    setOpenStorefront(u);
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

  /* ── RSVPs — app-level so EventsScreen + EventDetailScreen stay in sync.
     Live mode persists via event_rsvps/rpc_toggle_rsvp and hydrates on auth;
     demo mode seeds the fixture RSVPs and stays in memory. */
  const [rsvpdEvents, setRsvpdEvents] = useState<Set<string>>(new Set());
  useEffect(() => {
    /* isDemoMode() (the ?demo flag) — same check every other surface uses. */
    if (isDemoMode()) { setRsvpdEvents(new Set(['e1', 'e4', 'e5'])); return; }
    if (!user || !hasSupabaseEnv) { setRsvpdEvents(new Set()); return; }
    let cancelled = false;
    fetchMyRsvpIds(user.id).then(ids => { if (!cancelled) setRsvpdEvents(ids); });
    return () => { cancelled = true; };
  }, [user, isDemo]);

  /* Registration form-fill + organizer insights sub-surfaces. */
  const [registerEvent, setRegisterEvent] = useState<CommunityEvent | null>(null);
  const [registerEditMode, setRegisterEditMode] = useState(false);
  const [insightsEvent, setInsightsEvent] = useState<CommunityEvent | null>(null);

  const setRsvpLocal = (id: string, going: boolean) => {
    setRsvpdEvents(prev => {
      const next = new Set(prev);
      if (going) next.add(id); else next.delete(id);
      return next;
    });
    /* Optimistically bump the open detail's "going" count so the screen
       reflects the action without waiting for a refetch. */
    setOpenEvent(prev => (prev && prev.id === id
      ? { ...prev, attendees: Math.max(0, prev.attendees + (going ? 1 : -1)) }
      : prev));
  };

  /* THE central RSVP entry point — every RSVP button routes here.
       No form  → toggle straight away (optimistic, server-backed).
       Has form → new RSVP opens the registration screen (the submit confirms
                  it); cancelling withdraws the response along with the RSVP. */
  const requestRsvp = async (event: CommunityEvent) => {
    /* Demo mode is a guided tour — let RSVPs work without an account (they
       only live in memory). Live mode requires auth. */
    if (!user && !isDemoMode()) { setModal('auth'); return; }
    const going = rsvpdEvents.has(event.id);

    if (!going && event.hasForm) {
      setRegisterEditMode(false);
      setRegisterEvent(event);
      return;
    }

    if (going && event.hasForm) {
      if (typeof window !== 'undefined' && !window.confirm(
        'Cancel your RSVP? Your registration response will be withdrawn too.',
      )) return;
    }

    /* Optimistic flip + server toggle (revert on failure). */
    setRsvpLocal(event.id, !going);
    if (isDemoMode() || !hasSupabaseEnv) return;
    try {
      await toggleEventRsvp(event.id);
      if (going && event.hasForm) {
        await withdrawFormResponse(event.id);
        track(EVT.registration_withdrawn, { event_id: event.id });
      }
    } catch {
      setRsvpLocal(event.id, going); /* revert */
    }
  };

  /* Registration submitted → confirm the RSVP (unless already going). */
  const handleRegistrationSubmitted = async () => {
    const ev = registerEvent;
    setRegisterEvent(null);
    if (!ev) return;
    if (rsvpdEvents.has(ev.id)) return; /* edit of an existing registration */
    setRsvpLocal(ev.id, true);
    if (isDemoMode() || !hasSupabaseEnv) return;
    try {
      await toggleEventRsvp(ev.id);
    } catch {
      setRsvpLocal(ev.id, false);
    }
  };

  const [lfDefaultStatus, setLfDefaultStatus] = useState<'lost' | 'found' | undefined>();

  /* First-time onboarding tour — fires only when the local "done" flag is
   * missing. Mounted after a small delay so the feed has time to paint
   * before the spotlight tries to measure target elements. */
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    if (hasCompletedOnboarding()) return;
    const t = setTimeout(() => setShowTour(true), 650);
    return () => clearTimeout(t);
  }, []);
  const handleTourJump = (s: TourScreen) => {
    /* Route the tour through the same screen state the bottom nav uses. */
    setOpenItem(null);
    setOpenEvent(null);
    setOpenLF(null);
    setOpenStorefront(null);
    setActiveScreen(s);
  };

  /* Sub-screens that take over the viewport. We keep a stack so "back" always
     returns to the previous screen (e.g. Settings → Notifications → back → Settings),
     and entering one directly from the drawer pops back to the main app. */
  type SubScreen = 'settings' | 'notifications' | 'feedback';
  const [subStack, setSubStack] = useState<SubScreen[]>([]);
  const subScreen: SubScreen | null = subStack[subStack.length - 1] ?? null;
  const pushSub = (s: SubScreen) => setSubStack(prev => [...prev, s]);
  const popSub  = () => setSubStack(prev => prev.slice(0, -1));
  const clearSubStack = () => setSubStack([]);

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

  /* Detail / storefront / settings sub-screens share the same <main id="main">
   * scroll container as the feed. React keeps that DOM node's scrollTop across
   * the swap, so tapping a product while scrolled down used to open the detail
   * halfway down the page. Force every full-screen takeover to open at the very
   * top — the product photo + name first — flush before paint so there's no
   * visible jump. */
  useIsoLayoutEffect(() => {
    if (isDesktop) return; /* desktop overlays are modals; the feed stays put */
    const overlay = !!(openItem || openEvent || openStorefront || subScreen || registerEvent || insightsEvent);
    if (!overlay) return;
    const main = document.getElementById('main');
    if (main) main.scrollTop = 0;
  }, [isDesktop, openItem, openEvent, openStorefront, subScreen, registerEvent, insightsEvent]);

  /* Service worker */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
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

    /* Deep link: `/?p=<id>` opens that post's detail directly (powers the
       shareable product links). We fetch the single post by id and route it
       to the right screen, then strip the param so refresh/back is clean. */
    const postId = params.get('p');
    if (postId) {
      fetchPostById(postId).then(found => {
        if (!found) return;
        if (found.kind === 'item' || found.kind === 'request') setOpenItem(found.data);
        else if (found.kind === 'event') setOpenEvent(found.data);
        else if (found.kind === 'lostfound') setOpenLF(found.data);
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete('p');
          window.history.replaceState({}, '', u.toString());
        } catch { /* ignore */ }
      }).catch(() => { /* ignore — invalid id */ });
    }
  }, []);

  const closeModal = () => setModal(null);

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
        text: 'Join me on Wecycle — circulate resources in our community.',
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
    clearSubStack();
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
      if (id === 'settings')  { setSubStack(['settings']);      return; }
      if (id === 'notifs')    { setSubStack(['notifications']); return; }
      if (id === 'feedback')  { setSubStack(['feedback']);      return; }
      if (id === 'tour')      { track(EVT.tour_replayed); setActiveScreen('feed'); setShowTour(true); return; }
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

  /* Item detail screen takes over the viewport on MOBILE. On desktop we
   * fall through and render it as a modal-theatre overlay at the bottom of
   * the JSX (after the main shell) so the underlying feed stays visible —
   * matching the Lost & Found pattern the user picked as the canonical
   * desktop look. */
  if (openItem && !isDesktop) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <ItemDetailScreen
              item={openItem}
              onBack={() => setOpenItem(null)}
              onRequireAuth={() => setModal('auth')}
              onOpenStorefront={openStorefrontFor}
              onOpenItem={setOpenItem}
              onOpenLF={setOpenLF}
              /* Owner edits inline (no Edit button — fields are editable
                 in place). Admin gets Delete on any post for moderation. */
              isOwner={ownsItem(openItem)}
              isAdmin={isAdmin}
              onDelete={(ownsItem(openItem) || isAdmin) ? async () => {
                if (isDemoMode()) { deleteDemoPost(openItem.id); return; }
                await deletePostById(openItem.id, openItem.isRequest ? 'request' : 'listing');
              } : undefined}
            />
          </main>
        </div>
        <AuthModal open={modal === 'auth'} onClose={closeModal} />
      </>
    );
  }

  /* Storefront — same split. Modal on desktop, full takeover on mobile. */
  if (openStorefront && !isDesktop) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <StorefrontScreen
              user={openStorefront}
              onBack={() => setOpenStorefront(null)}
              onOpenItem={(item) => { setOpenStorefront(null); setOpenItem(item); }}
              onOpenEvent={(ev) => { setOpenStorefront(null); setOpenEvent(ev); }}
              onOpenLF={(lf) => { setOpenStorefront(null); setOpenLF(lf); }}
            />
          </main>
        </div>
      </>
    );
  }


  /* Settings sub-screens take over the viewport. `popSub` walks the stack back
     one level so cross-links (Settings → Feedback) return to where you came from. */
  if (subScreen === 'settings') {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <SettingsScreen
              onBack={popSub}
              onOpenNotifications={() => pushSub('notifications')}
              onOpenFeedback={() => pushSub('feedback')}
              onOpenAccount={() => { clearSubStack(); goToAccount(); }}
            />
          </main>
        </div>
      </>
    );
  }
  if (subScreen === 'notifications') {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <NotificationsScreen
              onBack={popSub}
              onOpenAccount={() => { clearSubStack(); goToAccount(); }}
            />
          </main>
        </div>
      </>
    );
  }
  if (subScreen === 'feedback') {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <FeedbackScreen onBack={popSub} />
          </main>
        </div>
      </>
    );
  }

  /* Event registration (form-fill) — stacks ABOVE the event detail takeover
     so Back returns to the event. Mobile only; desktop renders as a modal. */
  if (registerEvent && !isDesktop) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <EventRegistrationScreen
              event={registerEvent}
              editMode={registerEditMode}
              onBack={() => setRegisterEvent(null)}
              onSubmitted={handleRegistrationSubmitted}
            />
          </main>
        </div>
      </>
    );
  }

  /* Organizer insights — stacks above the event detail takeover. */
  if (insightsEvent && !isDesktop) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <EventInsightsScreen
              event={insightsEvent}
              onBack={() => setInsightsEvent(null)}
              onOpenUser={(u) => { setInsightsEvent(null); setOpenEvent(null); openStorefrontFor(u); }}
            />
          </main>
        </div>
      </>
    );
  }

  /* Event detail — full takeover on mobile, modal overlay on desktop. */
  if (openEvent && !isDesktop) {
    /* Ownership: demo flag relies on MY_EVENT_IDS; live mode trusts the
       organizer.id matching the signed-in user. */
    const isOwner = (isDemoMode() && MY_EVENT_IDS.includes(openEvent.id))
      || (!!user && openEvent.organizer.id === user.id);
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <EventDetailScreen
              event={openEvent}
              isRsvpd={rsvpdEvents.has(openEvent.id)}
              isOwner={isOwner || isAdmin}
              onBack={() => setOpenEvent(null)}
              onRsvp={() => requestRsvp(openEvent)}
              onRequireAuth={() => setModal('auth')}
              onOpenStorefront={openStorefrontFor}
              onDelete={(isOwner || isAdmin) ? async () => {
                if (isDemoMode()) { deleteDemoPost(openEvent.id); return; }
                await deleteEvent(openEvent.id);
              } : undefined}
              onOpenInsights={(isOwner || isAdmin) ? () => setInsightsEvent(openEvent) : undefined}
              onEditRegistration={() => { setRegisterEditMode(true); setRegisterEvent(openEvent); }}
            />
          </main>
        </div>
        <AuthModal open={modal === 'auth'} onClose={closeModal} />
      </>
    );
  }

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>

      <div className="app-container">
        <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
          {/* key={activeScreen} re-mounts on screen change so the Liquid-Glass
              spring entrance (.motion-rise) replays for each view. */}
          <div key={activeScreen} className="motion-rise">
          {activeScreen === 'feed' && (
            <FeedScreen
              onPost={() => requireAuth('post-picker')}
              onOpenMenu={() => setDrawerOpen(true)}
              onOpenAccount={goToAccount}
              onOpenItem={setOpenItem}
              onOpenEvent={setOpenEvent}
              onOpenLF={(lf) => setOpenLF(lf)}
              onBannerAction={(kind) => {
                if (kind === 'share')       openShareItem();
                else if (kind === 'request') openPostRequest();
                else if (kind === 'events')  setActiveScreen('events');
                else if (kind === 'lost-found') setActiveScreen('lost_found');
                else if (kind === 'invite')  inviteFriends();
              }}
              onOpenUser={async (userId) => {
                /* Search-result tap → load the full profile shape the
                   storefront expects, then open it. We fetch a fresh row so
                   we don't carry stale data from the search hit. */
                const { data } = await supabase
                  .from('profiles')
                  .select('id, full_name, initials, avatar_color, role, is_online, email, phone, contact_email_enabled, contact_whatsapp_enabled')
                  .eq('id', userId)
                  .single();
                if (!data) return;
                /* Cast through unknown — the generated Database types don't
                   know about the new `email` column yet (added in the
                   add_email_to_profiles migration). */
                const p = data as unknown as {
                  id: string;
                  full_name: string | null;
                  initials: string | null;
                  avatar_color: string | null;
                  role: string | null;
                  is_online: boolean | null;
                  email: string | null;
                  phone: string | null;
                  contact_email_enabled: boolean | null;
                  contact_whatsapp_enabled: boolean | null;
                };
                openStorefrontFor({
                  id: p.id,
                  name: p.full_name || 'Wecycle member',
                  initials: p.initials || 'W',
                  color: p.avatar_color || '#6C63FF',
                  role: p.role || 'Member',
                  community: 'Wecycle',
                  joinedDaysAgo: 0,
                  itemsShared: 0,
                  itemsReceived: 0,
                  impactScore: 0,
                  badges: [],
                  isOnline: p.is_online ?? false,
                  email: p.email ?? undefined,
                  phone: p.phone ?? undefined,
                  contact: {
                    email: p.contact_email_enabled ?? true,
                    whatsapp: p.contact_whatsapp_enabled ?? false,
                  },
                });
              }}
            />
          )}
          {activeScreen === 'events' && (
            <EventsScreen
              onOpenMenu={() => setDrawerOpen(true)}
              onOpenAccount={goToAccount}
              onCreate={openSubmitEvent}
              onOpenEvent={setOpenEvent}
              rsvpdEvents={rsvpdEvents}
              onToggleRsvp={requestRsvp}
            />
          )}
          {activeScreen === 'lost_found' && (
            <LostFoundScreen
              onReport={openReportLF}
              onOpenMenu={() => setDrawerOpen(true)}
              onOpenAccount={goToAccount}
              onRequireAuth={() => setModal('auth')}
              onOpenStorefront={openStorefrontFor}
              onOpenLF={(it) => setOpenLF(it)}
            />
          )}
          {/* Activity is still reachable via Settings → Notifications hint
             flows or the alerts CTA on the home feed, but it's no longer in
             the bottom nav. */}
          {activeScreen === 'activity' && (
            <ActivityScreen
              onOpenMenu={() => setDrawerOpen(true)}
              onOpenAccount={goToAccount}
              onCreateAlert={openCreateAlert}
              onEditAlert={openEditAlert}
            />
          )}
          {activeScreen === 'inventory' && (
            <InventoryScreen
              onOpenMenu={() => setDrawerOpen(true)}
              onOpenAccount={goToAccount}
              onPostNew={() => requireAuth('post-picker')}
              onOpenItem={setOpenItem}
              onOpenEvent={setOpenEvent}
              onOpenEventInsights={setInsightsEvent}
              onOpenLF={(lf) => setOpenLF(lf)}
            />
          )}
          {activeScreen === 'account' && (
            <AccountScreen
              onBack={() => setActiveScreen('feed')}
              onSignedOut={() => setActiveScreen('feed')}
            />
          )}
          {/* Desktop-only auxiliary screens */}
          {activeScreen === 'market'     && <MarketplaceScreen />}
          {activeScreen === 'impact'     && <ImpactScreen />}
          </div>
        </main>

        <BottomNav
          active={activeScreen}
          onChange={setActiveScreen}
          onPost={() => requireAuth('post-picker')}
        />

        {/* ── DRAWER ── */}
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSignIn={() => { setDrawerOpen(false); setTimeout(() => setModal('auth'), 80); }}
          onNavigate={handleDrawerNavigate}
        />

        {/* ── POST PICKER ── */}
        {modal === 'post-picker' && (
          <PostSheet onClose={closeModal} onSelect={handlePostPickerSelect} />
        )}

        {/* ── FORM MODALS ── */}
        <ShareItemModal open={modal === 'share-item'} onClose={closeModal} />
        <ShareItemModal open={modal === 'offer-service'} onClose={closeModal} mode="service" />
        <PostRequestModal open={modal === 'post-request'} onClose={closeModal} />
        <ReportLostFoundModal open={modal === 'report-lf'} onClose={closeModal} defaultStatus={lfDefaultStatus} />
        <SubmitEventModal open={modal === 'submit-event'} onClose={closeModal} />
        {/* EditItemModal removed — owners edit their posts inline directly
           on the detail screen. Save changes / Save & repost CTAs swap in
           when the form is dirty. */}
        {user && (
          <AlertFormModal
            open={modal === 'alert-form'}
            onClose={() => { closeModal(); setEditingAlert(null); }}
            userId={user.id}
            mode={storageMode}
            alert={editingAlert}
          />
        )}
        <AuthModal open={modal === 'auth'} onClose={closeModal} />

        {/* ── LOST & FOUND DETAIL SHEET ──
           Lifted from LostFoundScreen so it can also be opened from Inventory.
           Owner-aware: when the signed-in user is the reporter, the sheet
           renders inline-editable fields with Save changes / Save & repost
           / Delete CTAs. Otherwise it shows the contact buttons. */}
        {/* ── FIRST-TIME ONBOARDING TOUR ── */}
        {showTour && (
          <OnboardingTour
            onJumpTo={handleTourJump}
            onClose={() => setShowTour(false)}
          />
        )}

        {openLF && (
          <LostFoundDetailSheet
            item={openLF}
            onClose={() => setOpenLF(null)}
            onRequireAuth={() => setModal('auth')}
            onOpenStorefront={openStorefrontFor}
            viewerName={profile?.full_name ?? (user as { email?: string } | null)?.email ?? undefined}
            isOwner={!!user && openLF.user.id === user.id}
            onSaveChanges={isDemoMode() ? undefined : async (patch: LFSavePatch) => {
              await updateLostFoundFields(openLF.id, patch);
            }}
            onSaveAndRepost={isDemoMode() ? undefined : async (patch: LFSavePatch) => {
              await repostLostFound(openLF.id, patch);
            }}
            onDelete={(!!user && openLF.user.id === user.id) || isAdmin ? async () => {
              if (isDemoMode()) { setOpenLF(null); return; }
              await deletePostById(openLF.id, 'lostfound');
            } : undefined}
          />
        )}

        {/* ── DESKTOP MODAL THEATRE ──
           On desktop ≥1024px the item / event / storefront detail surfaces
           render as a centered modal overlay — same vibe as the Lost &
           Found sheet — instead of replacing the full app shell. The feed
           stays visible (dimmed) behind so the user keeps spatial context.
           On mobile these branches don't render (the early-return takeover
           up top fires instead). */}
        {isDesktop && openItem && (
          <DesktopDetailModal onClose={() => setOpenItem(null)} ariaLabel={openItem.title}>
            <ItemDetailScreen
              item={openItem}
              onBack={() => setOpenItem(null)}
              onRequireAuth={() => setModal('auth')}
              onOpenStorefront={openStorefrontFor}
              onOpenItem={setOpenItem}
              onOpenLF={(lf) => { setOpenItem(null); setOpenLF(lf); }}
              isOwner={ownsItem(openItem)}
              isAdmin={isAdmin}
              onDelete={(ownsItem(openItem) || isAdmin) ? async () => {
                if (isDemoMode()) { deleteDemoPost(openItem.id); return; }
                await deletePostById(openItem.id, openItem.isRequest ? 'request' : 'listing');
              } : undefined}
            />
          </DesktopDetailModal>
        )}

        {isDesktop && openEvent && (() => {
          const isOwner = (isDemoMode() && MY_EVENT_IDS.includes(openEvent.id))
            || (!!user && openEvent.organizer.id === user.id);
          return (
            <DesktopDetailModal onClose={() => setOpenEvent(null)} ariaLabel={openEvent.title}>
              <EventDetailScreen
                event={openEvent}
                isRsvpd={rsvpdEvents.has(openEvent.id)}
                isOwner={isOwner || isAdmin}
                onBack={() => setOpenEvent(null)}
                onRsvp={() => requestRsvp(openEvent)}
                onRequireAuth={() => setModal('auth')}
                onOpenStorefront={openStorefrontFor}
                onDelete={(isOwner || isAdmin) ? async () => {
                  if (isDemoMode()) { deleteDemoPost(openEvent.id); return; }
                  await deleteEvent(openEvent.id);
                } : undefined}
                onOpenInsights={(isOwner || isAdmin) ? () => setInsightsEvent(openEvent) : undefined}
                onEditRegistration={() => { setRegisterEditMode(true); setRegisterEvent(openEvent); }}
              />
            </DesktopDetailModal>
          );
        })()}

        {/* Registration form-fill (desktop) — narrower centered modal, layered
            above the event detail modal. */}
        {isDesktop && registerEvent && (
          <DesktopDetailModal
            onClose={() => setRegisterEvent(null)}
            ariaLabel={`Register for ${registerEvent.title}`}
            width={640}
          >
            <EventRegistrationScreen
              event={registerEvent}
              editMode={registerEditMode}
              onBack={() => setRegisterEvent(null)}
              onSubmitted={handleRegistrationSubmitted}
            />
          </DesktopDetailModal>
        )}

        {/* Organizer insights (desktop). */}
        {isDesktop && insightsEvent && (
          <DesktopDetailModal
            onClose={() => setInsightsEvent(null)}
            ariaLabel={`Insights for ${insightsEvent.title}`}
            width={920}
          >
            <EventInsightsScreen
              event={insightsEvent}
              onBack={() => setInsightsEvent(null)}
              onOpenUser={(u) => { setInsightsEvent(null); setOpenEvent(null); openStorefrontFor(u); }}
            />
          </DesktopDetailModal>
        )}

        {isDesktop && openStorefront && (
          <DesktopDetailModal onClose={() => setOpenStorefront(null)} ariaLabel={`${openStorefront.name}'s storefront`}>
            <StorefrontScreen
              user={openStorefront}
              onBack={() => setOpenStorefront(null)}
              onOpenItem={(item) => { setOpenStorefront(null); setOpenItem(item); }}
              onOpenEvent={(ev) => { setOpenStorefront(null); setOpenEvent(ev); }}
              onOpenLF={(lf) => { setOpenStorefront(null); setOpenLF(lf); }}
            />
          </DesktopDetailModal>
        )}
      </div>
    </>
  );
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
  onClose, ariaLabel, children, width = 1080,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** Max box width in px — narrower for focused flows (forms), default 1080. */
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
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
          zIndex: 100,
        }}
      />
      {/* Centered modal — fixed-position so it ignores page scroll. The
         inner overflow handles content scroll. */}
      <div
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
          zIndex: 101,
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
