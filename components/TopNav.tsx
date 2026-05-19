'use client';

import {
  Bell, Search, Sun, Moon, Plus, ChevronDown,
} from 'lucide-react';
import type { Screen } from './BottomNav';

interface TopNavProps {
  active: Screen;
  onChange: (screen: Screen) => void;
  onPost: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const PRIMARY_LINKS: { id: Screen; label: string }[] = [
  { id: 'feed',       label: 'Feed' },
  { id: 'market',     label: 'Marketplace' },
  { id: 'inventory',  label: 'Inventory' },
  { id: 'events',     label: 'Events' },
  { id: 'lost_found', label: 'Lost & Found' },
];

export default function TopNav({
  active, onChange, onPost, isDark, onToggleTheme,
}: TopNavProps) {
  return (
    <header
      className="desktop-only-nav"
      role="banner"
      style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'var(--bg-overlay)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 32,
      }}>
        {/* Logo + community */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a
            href="#"
            onClick={e => { e.preventDefault(); onChange('feed'); }}
            style={{
              fontWeight: 800, fontSize: 22,
              letterSpacing: '-0.04em',
              color: 'var(--text-primary)',
              textDecoration: 'none',
            }}
          >
            We<span style={{ color: 'var(--accent-lime-dim)' }}>cycle</span>
          </a>

          <button style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none',
            padding: '4px 8px',
            cursor: 'pointer', borderRadius: 'var(--radius-pill)',
            fontSize: 13, fontWeight: 600,
            color: 'var(--text-secondary)',
          }}>
            🏛️ BITS Goa
            <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Primary links — accessible nav */}
        <nav
          aria-label="Primary"
          style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center' }}
        >
          {PRIMARY_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href="#"
              onClick={e => { e.preventDefault(); onChange(id); }}
              aria-current={active === id ? 'page' : undefined}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius-pill)',
                background: active === id ? 'var(--bg-inset)' : 'transparent',
                color: active === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: active === id ? 600 : 500,
                fontSize: 14, letterSpacing: '-0.01em',
                textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
                cursor: 'pointer',
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="theme-toggle" aria-label="Search">
            <Search size={18} strokeWidth={1.8} />
          </button>
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark
              ? <Sun size={18} strokeWidth={1.8} />
              : <Moon size={18} strokeWidth={1.8} />}
          </button>
          <button
            className="theme-toggle"
            style={{ position: 'relative' }}
            aria-label="Notifications, 3 unread"
          >
            <Bell size={18} strokeWidth={1.8} />
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--accent-rose)',
              border: '2px solid var(--bg-base)',
            }} />
          </button>
          <button
            onClick={onPost}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--accent-lime)', color: '#0C0C0B',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer', marginLeft: 4,
              letterSpacing: '-0.01em',
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Post
          </button>
          <button
            onClick={() => onChange('impact')}
            aria-label="Your profile"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#6C63FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
              cursor: 'pointer', border: 'none',
              marginLeft: 6,
            }}
          >
            AS
          </button>
        </div>
      </div>
    </header>
  );
}
