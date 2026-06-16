'use client';

/**
 * SessionSplash — full-screen brand splash shown at the start of a NEW web
 * session.
 *
 * "New session" = the first load, or a load after the tab has been away long
 * enough to count as a fresh visit (default 30 min, the GA session-timeout
 * convention). We stamp `wecycle.lastActive` on mount and keep it fresh with a
 * heartbeat + on tab-hide, so reloads or quick tab-switches during an active
 * session DON'T re-trigger the splash.
 *
 * Visual: an animated blue→teal→green shader-style gradient (a shifting linear
 * base + drifting radial blobs, the same technique as the live counter) with
 * the Wecycle logomark knocked out in white, centred, breathing gently. Holds
 * ~1.3s, then fades out and unmounts.
 *
 * Mounted once in app/layout.tsx so it covers every entry point (feed, deep
 * links, etc.). Decision happens in a layout effect → the overlay paints
 * before the app shows, so there's no flash of the app underneath.
 */

import { useLayoutEffect, useEffect, useState } from 'react';

const LAST_ACTIVE_KEY = 'wecycle.lastActive';
const SESSION_GAP_MS = 30 * 60 * 1000; /* 30 min away ⇒ new session */
const HOLD_MS = 1300;                  /* fully-visible dwell */
const FADE_MS = 560;                   /* fade-out duration */
const HEARTBEAT_MS = 60 * 1000;        /* keep an active session "fresh" */

/* useLayoutEffect warns during SSR; fall back to useEffect on the server so the
 * splash decision still runs flush-before-paint on the client only. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function isNewSession(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
    return !last || Date.now() - last > SESSION_GAP_MS;
  } catch {
    return false;
  }
}
function markActive() {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* private mode */ }
}

/* Decide ONCE per page load, before stamping the timestamp. Module-scoped so
 * React 18 Strict Mode's double effect-invoke (dev) can't read its own freshly
 * written timestamp and flip the answer to "not new". Re-evaluated on a real
 * reload because the module re-initialises. */
let sessionDecided = false;
let sessionWasNew = false;
function decideSessionOnce(): boolean {
  if (sessionDecided) return sessionWasNew;
  sessionDecided = true;
  sessionWasNew = isNewSession();
  markActive();
  return sessionWasNew;
}

type Phase = 'idle' | 'show' | 'hide';

export default function SessionSplash() {
  const [phase, setPhase] = useState<Phase>('idle');

  useIsoLayoutEffect(() => {
    const fresh = decideSessionOnce();

    /* Keep the session timestamp fresh so a long-but-active visit doesn't
       re-splash on reload: heartbeat while visible + stamp on tab-hide. */
    const beat = setInterval(markActive, HEARTBEAT_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') markActive(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', markActive);

    let holdT: ReturnType<typeof setTimeout> | undefined;
    let fadeT: ReturnType<typeof setTimeout> | undefined;
    if (fresh) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const hold = reduce ? 700 : HOLD_MS;
      setPhase('show');
      holdT = setTimeout(() => {
        setPhase('hide');
        fadeT = setTimeout(() => setPhase('idle'), FADE_MS);
      }, hold);
    }

    return () => {
      clearInterval(beat);
      if (holdT) clearTimeout(holdT);
      if (fadeT) clearTimeout(fadeT);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', markActive);
    };
  }, []);

  if (phase === 'idle') return null;

  return (
    <div className="wc-splash" data-hide={phase === 'hide' || undefined} aria-hidden="true">
      <style>{`
        @keyframes wc-splash-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes wc-splash-drift {
          0%   { background-position: 0% 0%,   100% 0%,  50% 100%, 0% 100%; }
          100% { background-position: 60% 40%, 30% 70%, 80% 10%, 100% 60%; }
        }
        @keyframes wc-splash-breathe {
          0%, 100% { transform: scale(1);     opacity: 0.96; }
          50%      { transform: scale(1.045); opacity: 1;    }
        }
        @keyframes wc-splash-mark-in {
          from { transform: scale(0.86); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }

        .wc-splash {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          /* Blue (top-left) flowing into green (bottom-right) — both colours
             are always on screen at once; the slow position-shift just makes
             the boundary breathe. */
          background: linear-gradient(
            130deg,
            #0860b0 0%,
            #0a78b0 26%,
            #0c9090 50%,
            #14a35a 76%,
            #1aa84e 100%
          );
          background-size: 220% 220%;
          animation: wc-splash-shift 10s ease-in-out infinite;
          opacity: 1;
          transition: opacity ${FADE_MS}ms ease;
          will-change: opacity;
          /* iOS safe areas — gradient bleeds edge to edge regardless */
          padding: env(safe-area-inset-top) env(safe-area-inset-right)
                   env(safe-area-inset-bottom) env(safe-area-inset-left);
        }
        .wc-splash[data-hide] { opacity: 0; pointer-events: none; }

        /* Drifting aurora blobs (blue / teal / mint / green) layered over the
           base on their own slow clock — the "shader" movement. */
        .wc-splash::before {
          content: '';
          position: absolute;
          inset: -25%;
          background:
            radial-gradient(44% 50% at 20% 24%, rgba(38, 170, 255, 0.50), transparent 60%),
            radial-gradient(46% 46% at 82% 26%, rgba(20, 130, 210, 0.55), transparent 62%),
            radial-gradient(52% 52% at 64% 84%, rgba(34, 200, 120, 0.52), transparent 64%),
            radial-gradient(40% 46% at 14% 82%, rgba(40, 200, 150, 0.45), transparent 60%);
          background-repeat: no-repeat;
          background-size: 140% 140%, 150% 150%, 160% 160%, 130% 130%;
          animation: wc-splash-drift 18s ease-in-out infinite alternate;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        /* Soft vignette so the centre logomark always pops. */
        .wc-splash::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(60% 60% at 50% 50%, transparent 40%, rgba(2, 22, 30, 0.34) 100%);
          pointer-events: none;
        }

        .wc-splash-mark {
          position: relative;
          z-index: 1;
          width: clamp(96px, 26vw, 132px);
          height: auto;
          /* Knock the blue-green logomark out to pure white. */
          filter: brightness(0) invert(1) drop-shadow(0 6px 26px rgba(0, 0, 0, 0.28));
          animation:
            wc-splash-mark-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both,
            wc-splash-breathe 3.4s ease-in-out 0.6s infinite;
          user-select: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .wc-splash { animation: none; }
          .wc-splash::before { animation: none; }
          .wc-splash-mark { animation: wc-splash-mark-in 0.3s ease both; }
        }
      `}</style>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="wc-splash-mark" src="/brand/logomark.png" alt="" draggable={false} />
    </div>
  );
}
