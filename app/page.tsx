'use client';

import { useState, useEffect } from 'react';
import BottomNav, { type Screen } from '../components/BottomNav';
import FeedScreen from '../components/FeedScreen';
import MarketplaceScreen from '../components/MarketplaceScreen';
import EventsScreen from '../components/EventsScreen';
import ImpactScreen from '../components/ImpactScreen';
import InventoryScreen from '../components/InventoryScreen';
import LostFoundScreen, { LostFoundDetailSheet, type LFSavePatch } from '../components/LostFoundScreen';
import ItemDetailScreen from '../components/ItemDetailScreen';
import EventDetailScreen from '../components/EventDetailScreen';
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
import ConversationListScreen from '../components/ConversationListScreen';
import ChatThread from '../components/ChatThread';
import { getOrCreateConversation } from '../lib/messaging';
import { track, EVT } from '../lib/analytics';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useAuth } from '../lib/AuthContext';
import type { MarketplaceItem, CommunityEvent, User, LostItem } from '../lib/mockData';
import { MY_EVENT_IDS } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import { deletePostById, deleteEvent, purgeExpiredEvents, purgeExpiredRequests, updateLostFoundFields, repostLostFound } from '../lib/liveData';
import { supabase } from '../lib/supabase';
import { deleteDemoPost, demoOwnedIds } from '../lib/demoInventory';
import type { WecycleAlert } from '../lib/alerts';
import {
  getSettings, onSettingsChange, applyTheme, watchSystemTheme,
  applyLargerText, saveSettings, type ThemeMode,
} from '../lib/settings';

type ModalKind =
  | null
  | 'post-picker'
  | 'share-item'
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
  /* Track RSVPs at app-level so EventsScreen + EventDetailScreen stay in sync */
  const [rsvpdEvents, setRsvpdEvents] = useState<Set<string>>(new Set(['e1', 'e4', 'e5']));
  const toggleRsvp = (id: string) => setRsvpdEvents(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
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
  /* ── Messaging state ─────────────────────────── */
  const [msgScreen, setMsgScreen] = useState<'list' | 'thread' | null>(null);
  const [msgThread, setMsgThread] = useState<{
    conversationId: string;
    otherUser: { id: string; name: string; initials: string; color: string };
  } | null>(null);

  const openMessages = () => { setMsgThread(null); setMsgScreen('list'); };
  const openThread = (conversationId: string, otherUser: { id: string; name: string; initials: string; color: string }) => {
    setMsgThread({ conversationId, otherUser });
    setMsgScreen('thread');
  };
  /** Open (or create) a conversation with a specific user, optionally tied to a listing. */
  const openConversationWith = async (otherUser: { id: string; name: string; initials: string; color: string }, listingId?: string, subject?: string) => {
    const convoId = await getOrCreateConversation(otherUser.id, listingId, subject);
    if (convoId) {
      openThread(convoId, otherUser);
    } else {
      openMessages();
    }
  };

  type SubScreen = 'settings' | 'notifications' | 'feedback';
  const [subStack, setSubStack] = useState<SubScreen[]>([]);
  const subScreen: SubScreen | null = subStack[subStack.length - 1] ?? null;
  const pushSub = (s: SubScreen) => setSubStack(prev => [...prev, s]);
  const popSub  = () => setSubStack(prev => prev.slice(0, -1));
  const clearSubStack = () => setSubStack([]);

  /* Theme state derived from settings — supports light/dark/system. */
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const syncDarkFromDOM = () => {
      if (typeof document !== 'undefined') {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    /* Hydrate from localStorage and apply immediately */
    const s = getSettings();
    setThemeMode(s.appearance.theme);
    applyTheme(s.appearance.theme);
    applyLargerText(s.appearance.largerText);
    syncDarkFromDOM();
    /* Listen for in-app changes (Settings toggle) */
    const off = onSettingsChange(next => {
      setThemeMode(next.appearance.theme);
      applyTheme(next.appearance.theme);
      applyLargerText(next.appearance.largerText);
      syncDarkFromDOM();
    });
    return off;
  }, []);
  useEffect(() => {
    /* Re-resolve when OS preference flips while in 'system' mode */
    return watchSystemTheme(themeMode, () => {
      applyTheme(themeMode);
      if (typeof document !== 'undefined') {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    });
  }, [themeMode]);

  /* Drawer's sun/moon button cycles light → dark → system. */
  const toggleTheme = () => {
    const next: ThemeMode =
      themeMode === 'light'  ? 'dark'   :
      themeMode === 'dark'   ? 'system' :
                                'light';
    saveSettings({ appearance: { ...getSettings().appearance, theme: next } });
  };

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
    purgeExpiredEvents();
    purgeExpiredRequests();
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
  }, []);

  const closeModal = () => setModal(null);

  const requireAuth = (next: ModalKind) => {
    if (!user) {
      setModal('auth');
      return;
    }
    setModal(next);
  };

  const openShareItem   = () => requireAuth('share-item');
  const openPostRequest = () => requireAuth('post-request');
  const openSubmitEvent = () => requireAuth('submit-event');
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

  const handlePostPickerSelect = (kind: 'share' | 'request' | 'event' | 'report-lf') => {
    setModal(null);
    setTimeout(() => {
      if (kind === 'share')     openShareItem();
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
      if (id === 'messages')  {
        /* Inbox is meaningless signed-out — route to auth first. */
        if (!user && !isDemo) { setModal('auth'); return; }
        openMessages();
        return;
      }
      if (id === 'settings')  { setSubStack(['settings']);      return; }
      if (id === 'notifs')    { setSubStack(['notifications']); return; }
      if (id === 'feedback')  { setSubStack(['feedback']);      return; }
      if (id === 'tour')      { track(EVT.tour_replayed); setActiveScreen('feed'); setShowTour(true); return; }
      if (id === 'invite') {
        if (typeof window === 'undefined') return;
        const shareUrl = window.location.origin || 'https://wecycle.page';
        const nav = window.navigator as Navigator & {
          share?: (d: ShareData) => Promise<void>;
        };
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
        return;
      }
      if (id === 'updates' || id === 'mission' || id === 'team') {
        /* Static destinations — open marketing site in a new tab */
        const map: Record<string, string> = {
          updates: 'https://wecycle.page/changelog',
          mission: 'https://wecycle.page/mission',
          team:    'https://wecycle.page/careers',
        };
        if (typeof window !== 'undefined') {
          window.open(map[id], '_blank', 'noopener,noreferrer');
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
              onMessage={(otherUser, listingId, subject) => openConversationWith(otherUser, listingId, subject)}
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

  /* ── Messaging screens ── */
  if (msgScreen === 'thread' && msgThread) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <ChatThread
              conversationId={msgThread.conversationId}
              otherUser={msgThread.otherUser}
              onBack={() => setMsgScreen('list')}
            />
          </main>
        </div>
      </>
    );
  }
  if (msgScreen === 'list') {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <ConversationListScreen
              onBack={() => setMsgScreen(null)}
              onOpenThread={openThread}
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
              onRsvp={() => toggleRsvp(openEvent.id)}
              onRequireAuth={() => setModal('auth')}
              onOpenStorefront={openStorefrontFor}
              onDelete={(isOwner || isAdmin) ? async () => {
                if (isDemoMode()) { deleteDemoPost(openEvent.id); return; }
                await deleteEvent(openEvent.id);
              } : undefined}
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
              onToggleRsvp={toggleRsvp}
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
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onSignIn={() => { setDrawerOpen(false); setTimeout(() => setModal('auth'), 80); }}
          onNavigate={handleDrawerNavigate}
        />

        {/* ── POST PICKER ── */}
        {modal === 'post-picker' && (
          <PostSheet onClose={closeModal} onSelect={handlePostPickerSelect} />
        )}

        {/* ── FORM MODALS ── */}
        <ShareItemModal open={modal === 'share-item'} onClose={closeModal} />
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
              onMessage={(otherUser, listingId, subject) => { setOpenItem(null); openConversationWith(otherUser, listingId, subject); }}
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
                onRsvp={() => toggleRsvp(openEvent.id)}
                onRequireAuth={() => setModal('auth')}
                onOpenStorefront={openStorefrontFor}
                onDelete={(isOwner || isAdmin) ? async () => {
                  if (isDemoMode()) { deleteDemoPost(openEvent.id); return; }
                  await deleteEvent(openEvent.id);
                } : undefined}
              />
            </DesktopDetailModal>
          );
        })()}

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
  onClose, ariaLabel, children,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
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
          width: 'min(1080px, 94vw)',
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
