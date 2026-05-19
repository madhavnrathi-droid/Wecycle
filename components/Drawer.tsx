'use client';

import { useEffect, useRef } from 'react';
import {
  X, User, Settings, MessageSquare, Send, Bell,
  Heart, Briefcase, LogOut, Moon, Sun, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { getAvatar } from '../lib/photos';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onSignIn: () => void;
  onNavigate?: (id: string) => void;
}

const SECTIONS: { items: { id: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; desc?: string }[] }[] = [
  {
    items: [
      { id: 'account',  label: 'Account',         icon: User,         desc: 'Profile & community' },
      { id: 'settings', label: 'Settings',        icon: Settings,     desc: 'Privacy, notifications' },
      { id: 'notifs',   label: 'Notifications',   icon: Bell,         desc: 'Manage alerts' },
    ],
  },
  {
    items: [
      { id: 'feedback', label: 'Give feedback',   icon: MessageSquare },
      { id: 'invite',   label: 'Invite friends',  icon: Send },
      { id: 'updates',  label: 'Get live updates', icon: Heart,        desc: 'New features & changes' },
    ],
  },
  {
    items: [
      { id: 'mission',  label: 'Our mission',     icon: Heart },
      { id: 'team',     label: 'Join our team',   icon: Briefcase },
    ],
  },
];

export default function Drawer({
  open, onClose, isDark, onToggleTheme, onSignIn, onNavigate,
}: DrawerProps) {
  const { user, profile, signOut } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);

    /* focus first focusable in drawer */
    const focusables = ref.current?.querySelectorAll<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])');
    focusables?.[0]?.focus();

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKey);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  if (!open) return null;

  const displayName = profile?.full_name || profile?.username || (user ? user.email?.split('@')[0] : 'Welcome');
  const initials = profile?.initials || (displayName?.slice(0, 2).toUpperCase() ?? 'W');
  const avatarSrc = profile?.avatar_url || (user ? getAvatar(user.id) : getAvatar('guest'));

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{ zIndex: 90 }}
      />
      <aside
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        {/* Header */}
        <div style={{
          padding: '16px 18px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--bg-inset)',
            overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)',
          }}>
            <img
              src={avatarSrc}
              alt=""
              width={44}
              height={44}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {!user && <span style={{ position: 'absolute' }}>{initials}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            {user
              ? <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{profile?.role || 'Member'}</p>
              : (
                <button onClick={onSignIn} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 12, fontWeight: 600, color: 'var(--accent-lime-dim)',
                }}>
                  Sign in
                </button>
              )
            }
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="modal-close"
            style={{ width: 36, height: 36 }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Menu sections */}
        <nav style={{ padding: '8px 0', flex: 1, overflowY: 'auto' }}>
          {SECTIONS.map((section, i) => (
            <div key={i}>
              {i > 0 && <div className="hairline" style={{ margin: '8px 18px' }} />}
              {section.items.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  className="drawer-item"
                  type="button"
                  onClick={() => {
                    if (onNavigate) onNavigate(id);
                    onClose();
                  }}
                >
                  <span className="drawer-icon"><Icon size={17} strokeWidth={1.8} /></span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {label}
                    </span>
                    {desc && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {desc}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={14} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={onToggleTheme}
            className="drawer-footer-btn"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
            <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          {user && (
            <button onClick={handleSignOut} className="drawer-footer-btn">
              <LogOut size={16} strokeWidth={1.8} />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
