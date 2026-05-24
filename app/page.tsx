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
import { useAuth } from '../lib/AuthContext';
import type { MarketplaceItem, CommunityEvent, User, LostItem } from '../lib/mockData';
import { MY_EVENT_IDS } from '../lib/mockData';
import { isDemoMode } from '../lib/demoMode';
import { deletePostById, deleteEvent, purgeExpiredEvents, updateLostFoundFields, repostLostFound } from '../lib/liveData';
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

  /* Sub-screens that take over the viewport. We keep a stack so "back" always
     returns to the previous screen (e.g. Settings → Notifications → back → Settings),
     and entering one directly from the drawer pops back to the main app. */
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

  /* On app open, fire a one-time janitor that drops past-dated events from
     the DB. Best-effort: RLS lets organizers/admin nuke their own; expired
     ones that we can't delete are still filtered client-side in fetchEvents. */
  useEffect(() => {
    if (!isDemoMode()) purgeExpiredEvents();
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
      if (id === 'settings')  { setSubStack(['settings']);      return; }
      if (id === 'notifs')    { setSubStack(['notifications']); return; }
      if (id === 'feedback')  { setSubStack(['feedback']);      return; }
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

  /* Item detail screen takes over the viewport. Logged-out viewers can read
     everything; the contact buttons gate via `onRequireAuth`. Tapping the
     owner card opens their storefront. */
  if (openItem) {
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

  /* Storefront screen — accessed from any owner card / commenter avatar */
  if (openStorefront) {
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

  /* Event detail screen takes over the viewport */
  if (openEvent) {
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
          {activeScreen === 'feed' && (
            <FeedScreen
              onPost={() => requireAuth('post-picker')}
              onOpenMenu={() => setDrawerOpen(true)}
              onOpenAccount={goToAccount}
              onOpenItem={setOpenItem}
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
      </div>
    </>
  );
}
