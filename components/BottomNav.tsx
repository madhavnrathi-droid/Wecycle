'use client';

import { Home, Plus, Package, CalendarDays, Activity } from 'lucide-react';

export type Screen =
  | 'feed' | 'events' | 'activity' | 'inventory'
  | 'market' | 'lost_found' | 'impact' | 'account';

interface BottomNavProps {
  active: Screen;
  onChange: (screen: Screen) => void;
  onPost: () => void;
}

export default function BottomNav({ active, onChange, onPost }: BottomNavProps) {
  return (
    <nav aria-label="Primary" className="mobile-only-nav bottom-nav">
      <div className="bottom-nav-inner">
        <NavButton
          label="Home"
          isActive={active === 'feed' || active === 'market'}
          onClick={() => onChange('feed')}
        >
          <Home size={20} strokeWidth={(active === 'feed' || active === 'market') ? 2 : 1.7} />
        </NavButton>

        <NavButton
          label="Events"
          isActive={active === 'events'}
          onClick={() => onChange('events')}
        >
          <CalendarDays size={20} strokeWidth={active === 'events' ? 2 : 1.7} />
        </NavButton>

        <button
          onClick={onPost}
          aria-label="Create post"
          className="bottom-nav-post"
        >
          <Plus size={22} strokeWidth={2} />
        </button>

        <NavButton
          label="Activity"
          isActive={active === 'activity'}
          onClick={() => onChange('activity')}
        >
          <Activity size={20} strokeWidth={active === 'activity' ? 2 : 1.7} />
        </NavButton>

        <NavButton
          label="Inventory"
          isActive={active === 'inventory'}
          onClick={() => onChange('inventory')}
        >
          <Package size={20} strokeWidth={active === 'inventory' ? 2 : 1.7} />
        </NavButton>
      </div>
    </nav>
  );
}

function NavButton({
  label, isActive, onClick, children,
}: {
  label: string; isActive: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="bottom-nav-btn"
      data-active={isActive || undefined}
    >
      {children}
    </button>
  );
}
