'use client';

import { Home, Plus, Package, CalendarDays, PackageSearch } from 'lucide-react';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';

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
    haptics.selection();   /* iOS-style light tick on tab change */
    track(EVT.nav_switched, { from: active, to: next });
    onChange(next);
  };
  return (
    <nav aria-label="Primary" className="mobile-only-nav bottom-nav">
      <div className="bottom-nav-inner">
        <NavButton
          label="Home"
          isActive={active === 'feed' || active === 'market'}
          onClick={() => navigate('feed')}
        >
          <Home size={20} strokeWidth={(active === 'feed' || active === 'market') ? 2 : 1.7} />
        </NavButton>

        <NavButton
          label="Events"
          isActive={active === 'events'}
          onClick={() => navigate('events')}
        >
          <CalendarDays size={20} strokeWidth={active === 'events' ? 2 : 1.7} />
        </NavButton>

        <button
          onClick={() => { haptics.medium(); onPost(); }}
          aria-label="Create post"
          className="bottom-nav-post"
        >
          <Plus size={22} strokeWidth={2} />
        </button>

        <NavButton
          label="L&F"
          ariaLabel="Lost & Found"
          isActive={active === 'lost_found'}
          onClick={() => navigate('lost_found')}
        >
          {/* PackageSearch — a box with a magnifier overlay. Literally "find
              stuff in this box". Visually distinct from both the plain Search
              magnifier (which confused users) and the plain Package icon used
              by the Inventory tab right next to it. */}
          <PackageSearch size={20} strokeWidth={active === 'lost_found' ? 2 : 1.7} />
        </NavButton>

        <NavButton
          label="Inventory"
          isActive={active === 'inventory'}
          onClick={() => navigate('inventory')}
        >
          <Package size={20} strokeWidth={active === 'inventory' ? 2 : 1.7} />
        </NavButton>
      </div>
    </nav>
  );
}

function NavButton({
  label, ariaLabel, isActive, onClick, children,
}: {
  label: string;
  /** Screen-reader name, when the visible pill label is abbreviated
   *  (e.g. "L&F" pill / "Lost & Found" for SR users). Defaults to label. */
  ariaLabel?: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-current={isActive ? 'page' : undefined}
      className="bottom-nav-btn"
      data-active={isActive || undefined}
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
