'use client';

import { Home, Plus, Package, CalendarDays, Backpack } from 'lucide-react';
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
          label="L&F"
          ariaLabel="Lost & Found"
          isActive={active === 'lost_found'}
          onClick={() => navigate('lost_found')}
          tourId="nav-lostfound"
        >
          {/* Backpack (not Search) — users were tapping the magnifying glass
              expecting a search page. Backpack reads as "personal items you
              carry on campus", which is exactly what L&F is about. */}
          <Backpack size={20} strokeWidth={active === 'lost_found' ? 2 : 1.7} />
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
  label, ariaLabel, isActive, onClick, children, tourId,
}: {
  label: string;
  /** Screen-reader name, when the visible pill label is abbreviated
   *  (e.g. "L&F" pill / "Lost & Found" for SR users). Defaults to label. */
  ariaLabel?: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tourId?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-current={isActive ? 'page' : undefined}
      className="bottom-nav-btn"
      data-active={isActive || undefined}
      data-tour={tourId}
    >
      {children}
      {/* Label rendered inline next to the icon. The pill-expansion CSS
       *  animates max-width + opacity from 0 → 1, so when the button isn't
       *  active the label collapses to a zero-width hidden state without
       *  unmount jank. aria-hidden because the parent button already
       *  carries the accessible label via aria-label. */}
      <span className="bottom-nav-btn-label" aria-hidden="true">{label}</span>
    </button>
  );
}
