'use client';

import { Home, ShoppingBag, Zap, CalendarDays, User } from 'lucide-react';

export type Screen = 'feed' | 'market' | 'events' | 'impact';

interface BottomNavProps {
  active: Screen;
  onChange: (screen: Screen) => void;
  onPost: () => void;
}

const NAV_ITEMS = [
  { id: 'feed' as Screen, icon: Home, label: 'Feed' },
  { id: 'market' as Screen, icon: ShoppingBag, label: 'Market' },
];
const NAV_ITEMS_RIGHT = [
  { id: 'events' as Screen, icon: CalendarDays, label: 'Events' },
  { id: 'impact' as Screen, icon: User, label: 'You' },
];

export default function BottomNav({ active, onChange, onPost }: BottomNavProps) {
  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 430,
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Blur backdrop */}
      <div
        className="nav-blur"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '8px 16px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          {/* Left items */}
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <NavButton
              key={id}
              label={label}
              isActive={active === id}
              onClick={() => onChange(id)}
            >
              <Icon size={22} strokeWidth={active === id ? 2.2 : 1.8} />
            </NavButton>
          ))}

          {/* Center Post Button */}
          <button
            onClick={onPost}
            aria-label="Post or share"
            className="press-scale"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--accent-lime)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-accent)',
              flexShrink: 0,
            }}
          >
            <Zap size={22} strokeWidth={2.2} style={{ color: 'var(--text-on-accent)' }} />
          </button>

          {/* Right items */}
          {NAV_ITEMS_RIGHT.map(({ id, icon: Icon, label }) => (
            <NavButton
              key={id}
              label={label}
              isActive={active === id}
              onClick={() => onChange(id)}
            >
              <Icon size={22} strokeWidth={active === id ? 2.2 : 1.8} />
            </NavButton>
          ))}
        </div>
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
      className="press-scale"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '6px 14px',
        borderRadius: 'var(--radius-md)',
        color: isActive ? 'var(--accent-lime)' : 'var(--text-muted)',
        transition: 'color 0.2s var(--ease-smooth)',
        minWidth: 52,
      }}
    >
      {children}
      <span style={{
        fontSize: 'var(--text-xs)',
        fontWeight: isActive ? 700 : 500,
        letterSpacing: '0.02em',
        lineHeight: 1,
      }}>
        {label}
      </span>
    </button>
  );
}
