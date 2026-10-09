'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { Wordmark } from './Brand';
import { useAuth } from '../lib/AuthContext';
import { getAvatar } from '../lib/photos';
import MessagesButton from './messages/MessagesButton';

interface TopBarProps {
  onOpenMenu: () => void;
  onOpenAccount: () => void;
  onOpenMessages: () => void;
  /** A screen name in place of the wordmark (Lost & Found). It is that
   *  screen's h1, so it stays a heading, not a label. */
  title?: string;
}

/* ── The bar at the top of every tab ─────────────────────────────────────────
 *
 * Five screens each carried their own copy of this header, and the copies had
 * drifted — the avatar was 44px on Home and 34px on the other four, so it
 * jumped in size as you changed tabs. Adding Messages to five copies would have
 * been a sixth chance to drift, so there is one now.
 *
 * A three-column grid rather than flex: the wordmark stays at the true centre
 * with one control on the left and two on the right. With flex it was centred
 * between them, i.e. pushed 22px left of centre by the extra button. */
export default function TopBar({ onOpenMenu, onOpenAccount, onOpenMessages, title }: TopBarProps) {
  const { user } = useAuth();
  /* The avatar seed depends on the signed-in user, which the server render
     does not know. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* ── At rest, flat; with content under it, a surface ──
     The bar has no edge while the page is at the top, so the first screen
     reads as one sheet. Once anything scrolls beneath it, a hairline and a
     soft shadow fade in and the wordmark settles to 92% — the iOS large-title
     behaviour, so "you have scrolled" is felt without a single line of copy.
     Listens to the scroll container the screens share, passively. */
  const barRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const host = barRef.current?.closest('.scroll-shell') as HTMLElement | null;
    const target: HTMLElement | Window = host ?? window;
    const read = () => setScrolled((host ? host.scrollTop : window.scrollY) > 6);
    read();
    target.addEventListener('scroll', read, { passive: true });
    return () => target.removeEventListener('scroll', read);
  }, []);

  return (
    <header
      ref={barRef}
      className="mobile-only-nav app-topbar-host"
      data-scrolled={scrolled || undefined}
      style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg-card)',
        padding: '14px 16px 10px',
      }}
    >
      <div className="app-topbar">
        <div>
          <button onClick={onOpenMenu} aria-label="Open menu" className="theme-toggle" style={{ marginLeft: -8 }}>
            <Menu size={20} strokeWidth={1.8} />
          </button>
        </div>
        {title ? (
          <h1 style={{
            margin: 0, textAlign: 'center',
            fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600,
            letterSpacing: '-0.01em', color: 'var(--text-primary)',
          }}>
            {title}
          </h1>
        ) : <Wordmark height={30} />}
        <div className="app-topbar-end">
          <MessagesButton onClick={onOpenMessages} />
          <button
            aria-label="Your profile"
            onClick={onOpenAccount}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--bg-inset)',
              border: 'none', cursor: 'pointer',
              padding: 0, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            suppressHydrationWarning
          >
            {mounted && (
              <img
                src={getAvatar(user?.id ?? 'guest')}
                alt=""
                width={44}
                height={44}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
