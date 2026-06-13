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

export default function LiveCounter() {
  const [display, setDisplay] = useState(BASELINE);
  const tweenTarget = useRef({ n: BASELINE });
  const currentRef = useRef(BASELINE);

  function animateTo(next: number) {
    gsap.to(tweenTarget.current, {
      n: next,
      duration: 0.6,
      ease: 'power2.out',
      overwrite: true,
      onUpdate() {
        setDisplay(Math.floor(tweenTarget.current.n));
      },
      onComplete() {
        setDisplay(next);
      },
    });
    currentRef.current = next;
  }

  useEffect(() => {
    if (hasSupabaseEnv) {
      const channel = supabase
        .channel('wecycle-lobby')
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event: 'INSERT', schema: 'public', table: 'profiles' },
          () => {
            const increment = Math.random() < 0.7 ? 1 : 2;
            animateTo(currentRef.current + increment);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const timer = setInterval(() => {
      if (currentRef.current < DEMO_CAP) {
        animateTo(currentRef.current + 1);
      }
    }, DEMO_INTERVAL_MS);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          /* Match greeting block height — greeting is ~64px on narrow screens */
          align-self: stretch;
          position: relative;
          border-radius: 22px;
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
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
          /* Never shrink narrower than its content */
          min-height: 64px;
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

        /* ── Count number ─────────────────────── */
        .wc-widget-count {
          font-size: 28px;
          font-weight: 700;
          color: #0F1A00;
          line-height: 1;
          letter-spacing: -0.03em;
          /* Extra right space so the number never slides under the dot */
          padding-right: 20px;
        }

        /* ── Sub-label ────────────────────────── */
        .wc-widget-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          color: rgba(15, 26, 0, 0.7);
          line-height: 1;
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
