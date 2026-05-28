'use client';

import { Home, Plus, Package, CalendarDays, Search } from 'lucide-react';
import { track, EVT } from '../lib/analytics';

/* Activity dropped from the bottom nav — its post-level metrics now live
   inline on each Inventory card (and on the item-detail page for the owner).
   Lost & Found takes the freed-up slot since it's a high-traffic flow. */
export type Screen =
  | 'feed' | 'events' | 'lost_found' | 'inventory'
  | 'market' | 'impact' | 'account' | 'activity';

interface BottomNavProps {
  active: Screen;
  onChange: (screen: Screen) => void;
  onPost: () => void;
}

export default function BottomNav({ active, onChange, onPost }: BottomNavProps) {
  /* Wraps the parent's onChange so we get a single source of nav events. */
  const navigate = (next: Screen) => {
    if (next === active) return;
    track(EVT.nav_switched, { from: active, to: next });
    onChange(next);
  };
  return (
    <nav aria-label="Primary" className="mobile-only-nav bottom-nav" data-tour="bottom-nav">
      <div className="bottom-nav-inner">
        <NavButton
          label="Home"
          isActive={active === 'feed' || active === 'market'}
          onClick={() => navigate('feed')}
          tourId="nav-home"
        >
          <Home size={20} strokeWidth={(active === 'feed' || active === 'market') ? 2 : 1.7} />
        </NavButton>

        <NavButton
          label="Events"
          isActive={active === 'events'}
          onClick={() => navigate('events')}
          tourId="nav-events"
        >
          <CalendarDays size={20} strokeWidth={active === 'events' ? 2 : 1.7} />
        </NavButton>

        <button
          onClick={onPost}
          aria-label="Create post"
          className="bottom-nav-post"
          data-tour="nav-post"
        >
          <Plus size={22} strokeWidth={2} />
        </button>

        <NavButton
          label="Lost & Found"
          isActive={active === 'lost_found'}
          onClick={() => navigate('lost_found')}
          tourId="nav-lostfound"
        >
          <Search size={20} strokeWidth={active === 'lost_found' ? 2 : 1.7} />
        </NavButton>

        <NavButton
          label="Inventory"
          isActive={active === 'inventory'}
          onClick={() => navigate('inventory')}
          tourId="nav-inventory"
        >
          <Package size={20} strokeWidth={active === 'inventory' ? 2 : 1.7} />
        </NavButton>
      </div>
    </nav>
  );
}

function NavButton({
  label, isActive, onClick, children, tourId,
}: {
  label: string; isActive: boolean; onClick: () => void; children: React.ReactNode;
  tourId?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="bottom-nav-btn"
      data-active={isActive || undefined}
      data-tour={tourId}
    >
      {children}
    </button>
  );
}
