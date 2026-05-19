'use client';

import { useState, useEffect } from 'react';
import BottomNav, { type Screen } from '../components/BottomNav';
import FeedScreen from '../components/FeedScreen';
import MarketplaceScreen from '../components/MarketplaceScreen';
import EventsScreen from '../components/EventsScreen';
import ImpactScreen from '../components/ImpactScreen';
import InventoryScreen from '../components/InventoryScreen';
import LostFoundScreen from '../components/LostFoundScreen';
import ItemDetailScreen from '../components/ItemDetailScreen';
import EventDetailScreen from '../components/EventDetailScreen';
import AccountScreen from '../components/AccountScreen';
import ActivityScreen from '../components/ActivityScreen';
import Drawer from '../components/Drawer';
import PostSheet from '../components/PostSheet';
import ShareItemModal from '../components/forms/ShareItemModal';
import PostRequestModal from '../components/forms/PostRequestModal';
import ReportLostFoundModal from '../components/forms/ReportLostFoundModal';
import SubmitEventModal from '../components/forms/SubmitEventModal';
import EditItemModal from '../components/forms/EditItemModal';
import AlertFormModal from '../components/forms/AlertFormModal';
import AuthModal from '../components/AuthModal';
import { useAuth } from '../lib/AuthContext';
import type { MarketplaceItem, CommunityEvent } from '../lib/mockData';
import { MY_EVENT_IDS } from '../lib/mockData';
import type { WecycleAlert } from '../lib/alerts';

type ModalKind =
  | null
  | 'post-picker'
  | 'share-item'
  | 'post-request'
  | 'report-lf'
  | 'submit-event'
  | 'auth'
  | 'edit-item'
  | 'alert-form';

export default function WecycleApp() {
  const { user, isDemo } = useAuth();
  const storageMode = isDemo ? 'demo' as const : 'supabase' as const;
  const [activeScreen, setActiveScreen] = useState<Screen>('feed');
  const [modal, setModal] = useState<ModalKind>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openItem, setOpenItem] = useState<MarketplaceItem | null>(null);
  const [openEvent, setOpenEvent] = useState<CommunityEvent | null>(null);
  const [editItem, setEditItem] = useState<MarketplaceItem | null>(null);
  const [editingAlert, setEditingAlert] = useState<WecycleAlert | null>(null);
  /* Track RSVPs at app-level so EventsScreen + EventDetailScreen stay in sync */
  const [rsvpdEvents, setRsvpdEvents] = useState<Set<string>>(new Set(['e1', 'e4', 'e5']));
  const toggleRsvp = (id: string) => setRsvpdEvents(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [lfDefaultStatus, setLfDefaultStatus] = useState<'lost' | 'found' | undefined>();
  const [isDark, setIsDark] = useState(false);

  /* Theme */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  /* Service worker */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
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

  const toggleTheme = () => setIsDark(d => !d);

  /* Avatar everywhere routes to the Account screen.
     If signed-out, prompt auth first. */
  const goToAccount = () => {
    if (!user) { setModal('auth'); return; }
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
    if (id === 'account') {
      goToAccount();
    }
    /* settings / feedback / etc. wired later */
  };

  /* Item detail screen takes over the viewport */
  if (openItem) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <ItemDetailScreen
              item={openItem}
              onBack={() => setOpenItem(null)}
              onContact={() => { /* messages in a future iteration */ }}
            />
          </main>
        </div>
      </>
    );
  }

  /* Event detail screen takes over the viewport */
  if (openEvent) {
    const isOwner = MY_EVENT_IDS.includes(openEvent.id);
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app-container">
          <main id="main" className="scroll-shell" style={{ overflowY: 'auto', height: '100svh' }}>
            <EventDetailScreen
              event={openEvent}
              isRsvpd={rsvpdEvents.has(openEvent.id)}
              isOwner={isOwner}
              onBack={() => setOpenEvent(null)}
              onRsvp={() => toggleRsvp(openEvent.id)}
              onEdit={isOwner ? () => { /* TODO: open edit-event modal */ } : undefined}
            />
          </main>
        </div>
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
              onEditItem={(item) => {
                if (!user) { setModal('auth'); return; }
                setEditItem(item);
                setModal('edit-item');
              }}
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
          {activeScreen === 'lost_found' && <LostFoundScreen onReport={openReportLF} />}
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
        {editItem && (
          <EditItemModal
            open={modal === 'edit-item'}
            onClose={() => { closeModal(); setEditItem(null); }}
            item={editItem}
            onSave={() => { /* TODO: persist via lib/api/listings updateListing */ }}
            onRepost={() => { /* TODO: updateListing + reset posted_at to now() */ }}
            onDelete={() => { /* TODO: deleteListing */ }}
          />
        )}
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
      </div>
    </>
  );
}
