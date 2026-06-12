'use client';

/**
 * LiveCounter — animated pill showing how many people are on Wecycle.
 *
 * - Yellow→green CSS gradient pill with a slow looping shift animation.
 * - Counter starts at 176 and ticks up when a new profile row is INSERTed
 *   via Supabase Realtime (each event randomly increments by 1 or 2).
 * - GSAP drives a smooth number-flip (~600ms power2.out) on every tick.
 * - Demo/no-Supabase fallback: a fake +1 every 25s, capped at baseline+10.
 * - prefers-reduced-motion: gradient animation disabled; number still ticks.
 */

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { supabase, hasSupabaseEnv } from '../lib/supabase';

const BASELINE = 176;
const DEMO_CAP = BASELINE + 10;
const DEMO_INTERVAL_MS = 25_000;

export default function LiveCounter() {
  const [display, setDisplay] = useState(BASELINE);
  // We keep the "real" fractional value inside a ref so GSAP can mutate it
  // between renders without triggering unnecessary re-renders.
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
    // --- Supabase Realtime subscription ---
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

    // --- Demo fallback: tick +1 every 25 s, cap at BASELINE+10 ---
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
        @keyframes wc-grad-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .wc-live-counter {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          /* Yellow #FFE066 → lime-green #C4F649 wide gradient so the shift is visible */
          background: linear-gradient(
            120deg,
            #FFE066 0%,
            #D4F04A 40%,
            #C4F649 60%,
            #FFE066 100%
          );
          background-size: 250% 250%;
          animation: wc-grad-shift 5s ease infinite;
          white-space: nowrap;
          /* subtle shadow so it lifts off the bg */
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          /* min/max width keeps it stable as the number grows */
          min-width: 120px;
          max-width: 150px;
          justify-content: center;
          flex-shrink: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .wc-live-counter {
            animation: none;
          }
        }

        .wc-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #1a6b00;
          opacity: 0.85;
          flex-shrink: 0;
        }

        .wc-live-text {
          font-size: 12px;
          font-weight: 600;
          color: #1a3300;
          letter-spacing: -0.02em;
          line-height: 1;
        }
      `}</style>

      <span
        className="wc-live-counter"
        role="status"
        aria-label={`${display} members on Wecycle`}
      >
        <span className="wc-live-dot" aria-hidden="true" />
        <span className="wc-live-text">
          <span aria-live="polite" aria-atomic="true">{display.toLocaleString()}</span>
          {' '}on Wecycle
        </span>
      </span>
    </>
  );
}
