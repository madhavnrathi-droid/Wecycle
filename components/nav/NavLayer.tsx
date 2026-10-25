'use client';

/* ── One screen in the navigation stack ────────────────────────────────────
 *
 * Detail screens used to REPLACE the app: open a post on a phone and the feed
 * was unmounted, so Back rebuilt it from nothing — scroll position, the chosen
 * category, the search, the carousel you had swiped, all gone. Native apps
 * never do that; a navigation controller keeps the screen underneath alive and
 * slides the new one over it.
 *
 * This is that layer. Two kinds:
 *
 *   'screen'   an opaque full-screen page with its own scroll container (a
 *              post, a profile, Settings). It slides in over what is below and
 *              out again on Back. Once it has fully arrived, everything under
 *              it stops painting (visibility:hidden keeps scroll positions,
 *              display:none would not) until it starts to leave.
 *   'overlay'  something that draws its own surface — the Lost & Found sheet,
 *              a desktop post window, Messages. The layer only orders it in
 *              the stack, through a zero-size stacking wrapper that blocks
 *              nothing.
 *
 * Motion follows the platform. iOS: the page slides from the right edge on
 * Apple's curve, and in the app (or an installed web app, where Safari has no
 * back gesture of its own) it can be dragged back from the left edge, the way
 * every iOS app can. Elsewhere: a short shared-axis fade-and-shift, which is
 * what Android and the web expect. Reduced motion: a 120ms fade.
 *
 * Everything not on top is inert, so keyboard focus and screen readers stay
 * on the page actually in front of the person.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { DUR, EASE, reducedMotion } from '../../lib/motion';
import { haptics } from '../../lib/haptics';

export type NavMotion = 'ios' | 'shared';

export function navMotionStyle(): NavMotion {
  if (typeof navigator === 'undefined') return 'shared';
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS ? 'ios' : 'shared';
}

/** Can this device take an edge swipe as Back? iOS where the browser does not
 *  already own that gesture: the native app, or an installed web app. */
export function edgeSwipeAvailable(): boolean {
  if (typeof window === 'undefined' || navMotionStyle() !== 'ios') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const native = !!cap?.isNativePlatform?.();
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return native || !!standalone;
}

const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface NavLayerProps {
  kind: 'screen' | 'overlay';
  z: number;
  phase: 'entering' | 'idle' | 'leaving';
  /** Skip the exit motion (the browser already animated it, or a swipe did). */
  instantLeave?: boolean;
  /** Not the top of the stack. */
  inert: boolean;
  /** An opaque screen above has fully arrived: stop painting this one. */
  covered: boolean;
  /** This is the top screen and may be swiped back. */
  swipeable: boolean;
  onSwipeBack: () => void;
  onEntered: () => void;
  onLeft: () => void;
  label: string;
  children: React.ReactNode;
}

export default function NavLayer({
  kind, z, phase, instantLeave, inert, covered, swipeable, onSwipeBack, onEntered, onLeft, label, children,
}: NavLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef({ onEntered, onLeft, onSwipeBack });
  cb.current = { onEntered, onLeft, onSwipeBack };

  /* inert is not a React 18 prop; set it on the element. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inert) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [inert]);

  /* Arrive. Animations do not run in a background tab, so every "when it
     finishes" also has a timer — a screen must never be stuck half-arrived or
     half-gone because the app was switched away mid-move. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let fired = false;
    const entered = () => { if (!fired) { fired = true; cb.current.onEntered(); } };
    if (kind !== 'screen' || reducedMotion()) {
      const a = kind === 'screen' ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 }) : null;
      if (a) { a.finished.then(entered, entered); window.setTimeout(entered, 300); }
      else entered();
      return;
    }
    const ios = navMotionStyle() === 'ios';
    const a = ios
      ? el.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 420, easing: IOS_EASE })
      : el.animate(
          [{ transform: 'translateX(32px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: DUR[3], easing: EASE.enter },
        );
    a.finished.then(entered, entered);
    window.setTimeout(entered, 600);
    /* Focus moves into the new screen, for keyboards and screen readers. */
    el.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Leave. */
  useEffect(() => {
    if (phase !== 'leaving') return;
    const el = ref.current;
    if (!el || kind !== 'screen' || instantLeave) { cb.current.onLeft(); return; }
    let fired = false;
    const done = () => { if (!fired) { fired = true; cb.current.onLeft(); } };
    const timer = window.setTimeout(done, 500);
    if (reducedMotion()) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished.then(done, done);
      return;
    }
    const ios = navMotionStyle() === 'ios';
    const a = ios
      ? el.animate([{ transform: getComputedStyle(el).transform === 'none' ? 'none' : getComputedStyle(el).transform }, { transform: 'translateX(100%)' }],
          { duration: 300, easing: IOS_EASE, fill: 'forwards' })
      : el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(32px)', opacity: 0 }],
          { duration: DUR[2], easing: EASE.exit, fill: 'forwards' });
    a.finished.then(done, done);
    return () => window.clearTimeout(timer);
  }, [phase, kind, instantLeave]);

  /* iOS edge swipe. */
  useEffect(() => {
    const el = ref.current;
    if (!el || !swipeable || kind !== 'screen' || !edgeSwipeAvailable()) return;
    let startX = 0, startY = 0, lastX = 0, lastT = 0, v = 0, tracking = false, dragging = false;
    let below: HTMLElement | null = null;
    const width = () => el.getBoundingClientRect().width || window.innerWidth;
    const reveal = (on: boolean) => {
      if (!below) return;
      below.style.visibility = on ? 'visible' : '';
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > 24) return;
      tracking = true; dragging = false;
      startX = lastX = t.clientX; startY = t.clientY; lastT = performance.now(); v = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
        if (dx < 8) return;
        dragging = true;
        below = findBelow(el);
        reveal(true);
      }
      e.preventDefault();
      const now = performance.now();
      v = (t.clientX - lastX) / Math.max(1, now - lastT);
      lastX = t.clientX; lastT = now;
      el.style.transform = `translateX(${Math.max(0, dx)}px)`;
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const dx = lastX - startX;
      const w = width();
      const go = dx > w * 0.33 || v > 0.5;
      const from = `translateX(${Math.max(0, dx)}px)`;
      el.style.transform = '';
      if (go) {
        haptics.light();
        const remain = Math.max(0, w - dx);
        const duration = v > 0.3 ? Math.min(300, Math.max(120, remain / v)) : 280;
        el.animate([{ transform: from }, { transform: 'translateX(100%)' }], { duration, easing: IOS_EASE, fill: 'forwards' })
          .finished.then(() => cb.current.onSwipeBack(), () => cb.current.onSwipeBack());
      } else {
        el.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: IOS_EASE })
          .finished.then(() => reveal(false), () => reveal(false));
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      reveal(false);
    };
  }, [swipeable, kind]);

  if (kind === 'overlay') {
    return (
      <div ref={ref} className="nav-overlay" style={{ zIndex: z, visibility: covered ? 'hidden' : undefined }} data-phase={phase}>
        {children}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className="nav-layer"
      data-phase={phase}
      data-covered={covered || undefined}
      style={{ zIndex: z }}
      tabIndex={-1}
      role="region"
      aria-label={label}
    >
      <div className="app-container">
        <main className="scroll-shell nav-scroll" style={{ overflowY: 'auto', height: '100svh' }}>{children}</main>
      </div>
    </div>
  );
}

/** The screen a swipe reveals: the previous layer, else the app underneath. */
function findBelow(el: HTMLElement): HTMLElement | null {
  let p = el.previousElementSibling as HTMLElement | null;
  while (p) {
    if (p.classList.contains('nav-layer') || p.classList.contains('nav-overlay') || p.dataset.navBase !== undefined) return p;
    p = p.previousElementSibling as HTMLElement | null;
  }
  return document.querySelector<HTMLElement>('[data-nav-base]');
}
