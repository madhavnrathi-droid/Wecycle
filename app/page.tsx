'use client';

import { useState } from 'react';
import BottomNav, { type Screen } from '../components/BottomNav';
import FeedScreen from '../components/FeedScreen';
import MarketplaceScreen from '../components/MarketplaceScreen';
import EventsScreen from '../components/EventsScreen';
import ImpactScreen from '../components/ImpactScreen';
import PostSheet from '../components/PostSheet';

export default function WecycleApp() {
  const [activeScreen, setActiveScreen] = useState<Screen>('feed');
  const [postSheetOpen, setPostSheetOpen] = useState(false);

  return (
    <div className="app-container">
      {/* ── SCREENS ── */}
      <div style={{ overflowY: 'auto', height: '100svh' }}>
        {activeScreen === 'feed' && <FeedScreen onPost={() => setPostSheetOpen(true)} />}
        {activeScreen === 'market' && <MarketplaceScreen />}
        {activeScreen === 'events' && <EventsScreen />}
        {activeScreen === 'impact' && <ImpactScreen />}
      </div>

      {/* ── BOTTOM NAV ── */}
      <BottomNav
        active={activeScreen}
        onChange={setActiveScreen}
        onPost={() => setPostSheetOpen(true)}
      />

      {/* ── POST SHEET ── */}
      {postSheetOpen && (
        <PostSheet onClose={() => setPostSheetOpen(false)} />
      )}
    </div>
  );
}
