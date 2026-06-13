'use client';

/**
 * LiveCounter — Apple Live Activities / iOS widget-style block.
 *
 * Sits next to the "Hi, there" greeting on the feed header. Fills the
 * remaining horizontal space at the same height as the greeting block.
 *
 * Visual: weather-card aesthetic — yellow→lime gradient with a slow
 * background-position shift, big animated number, quiet label below,
 * absolute-positioned live-pulse dot top-right.
 *
 * Behaviour:
 * - Counter starts at 176, increments by 1–2 on each Supabase profile INSERT.
 * - GSAP 600ms power2.out tween drives the number.
 * - Demo / no-Supabase fallback: +1 every 25 s, capped at baseline+10.
 * - prefers-reduced-motion: gradient animation paused; number still tweens.
 */

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { supabase, hasSupabaseEnv } from '../lib/supabase';

const BASELINE = 176;
const DEMO_CAP = BASELINE + 10;
const DEMO_INTERVAL_MS = 25_000;

/* ── Module-singleton subscription ──────────────────────────────────────
 * We render LiveCounter in multiple places (mobile greeting row + desktop
 * hero row). Each mount used to open its own Supabase realtime channel
 * with the same name, which the Supabase JS client rejects with
 * "cannot add postgres_changes callbacks for realtime:wecycle-lobby
 *  after subscribe()". Subscribe once at module scope; React mounts
 * subscribe to a pub/sub that fans the count out to all listeners. */
let sharedCount = BASELINE;
const listeners = new Set<(n: number) => void>();
let started = false;
function emit(n: number) { sharedCount = n; listeners.forEach(l => l(n)); }

function startSubscription() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (hasSupabaseEnv) {
    supabase
      .channel('wecycle-lobby')
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        () => {
          const increment = Math.random() < 0.7 ? 1 : 2;
          emit(sharedCount + increment);
        },
      )
      .subscribe();
  } else {
    setInterval(() => {
      if (sharedCount < DEMO_CAP) emit(sharedCount + 1);
    }, DEMO_INTERVAL_MS);
  }
}

export default function LiveCounter() {
  const [display, setDisplay] = useState(sharedCount);
  const tweenTarget = useRef({ n: sharedCount });

  useEffect(() => {
    startSubscription();
    /* Tween from whatever we're currently showing to each new value the
       singleton emits. Multiple LiveCounter mounts tween independently —
       that's fine, GSAP handles the per-instance state. */
    const listener = (next: number) => {
      gsap.to(tweenTarget.current, {
        n: next,
        duration: 0.6,
        ease: 'power2.out',
        overwrite: true,
        onUpdate() { setDisplay(Math.floor(tweenTarget.current.n)); },
        onComplete() { setDisplay(next); },
      });
    };
    listeners.add(listener);
    /* Sync to the latest count immediately in case we mounted after an
       emit (e.g. desktop counter mounts after a tab switch). */
    setDisplay(sharedCount);
    tweenTarget.current.n = sharedCount;
    return () => { listeners.delete(listener); };
  }, []);

  return (
    <>
      <style>{`
        @keyframes wc-widget-grad {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes wc-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.7; }
          70%  { transform: scale(2.4); opacity: 0;   }
          100% { transform: scale(2.4); opacity: 0;   }
        }

        .wc-widget {
          /* Takes the remaining horizontal space next to the greeting */
          flex: 1;
          min-width: 0;
          /* Match the greeting block's height exactly — the greeting (h1 +
             date) is the height-defining element, so the widget stretches to
             it and never extends past the date line. No min-height floor that
             would force the row taller. */
          align-self: stretch;
          position: relative;
          border-radius: 20px;
          /* Yellow → lime at 135°; oversized so the position-shift is visible */
          background: linear-gradient(
            135deg,
            #FFE066 0%,
            #D8F54B 45%,
            #C4F649 60%,
            #FFE066 100%
          );
          background-size: 300% 300%;
          animation: wc-widget-grad 10s ease infinite;
          /* Glassy inset border */
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
          padding: 6px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          overflow: hidden;
        }

        @media (prefers-reduced-motion: reduce) {
          .wc-widget {
            animation-play-state: paused;
          }
        }

        /* ── Live-pulse dot ───────────────────── */
        .wc-widget-dot {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 6px;
          height: 6px;
        }

        .wc-widget-dot-core {
          display: block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #16a34a;
          position: relative;
          z-index: 1;
        }

        .wc-widget-dot-ring {
          display: block;
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: #16a34a;
          animation: wc-pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .wc-widget-dot-ring {
            animation: none;
          }
        }

        /* ── Count number ─────────────────────────
           Big, bold, tabular (odometer-like fixed-width digits) and centered
           so it reads as a live counter spread across the widget. */
        .wc-widget-count {
          font-size: 32px;
          font-weight: 800;
          color: #0F1A00;
          line-height: 1;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
          font-feature-settings: 'tnum' 1;
          text-align: center;
        }

        /* ── Sub-label ────────────────────────── */
        .wc-widget-label {
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: rgba(15, 26, 0, 0.66);
          line-height: 1;
          text-align: center;
          white-space: nowrap;
        }
      `}</style>

      <div className="wc-widget">
        {/* Live-pulse dot — aria-hidden, decorative */}
        <span className="wc-widget-dot" aria-hidden="true">
          <span className="wc-widget-dot-ring" />
          <span className="wc-widget-dot-core" />
        </span>

        {/* Count — screen-readers announce updates via aria-live */}
        <span
          className="wc-widget-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${display} people on Wecycle right now`}
        >
          {display.toLocaleString()}
        </span>

        <span className="wc-widget-label">on Wecycle right now</span>
      </div>
    </>
  );
}
