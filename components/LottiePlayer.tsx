'use client';

/* Lightweight Lottie host built on lottie-web's `lottie_light` build (no
 * expressions engine → smaller bundle). Renders a vector animation from a
 * JSON file in /public/animations.
 *
 * Design notes:
 *  - Honors prefers-reduced-motion: when the user opts out of motion we render
 *    the final frame statically instead of looping, so the UI stays calm and
 *    accessible (Apple HIG + WCAG 2.3.3).
 *  - Fails gracefully: if the asset can't load, an optional `fallback` node is
 *    shown so an empty state never collapses to blank space.
 *  - Cleans up the animation instance on unmount to avoid leaks on screen
 *    changes. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AnimationItem } from 'lottie-web';

interface LottiePlayerProps {
  /** Path under /public, e.g. "/animations/bloom.json". */
  src: string;
  /** Pixel size of the square canvas. */
  size?: number;
  /** Loop the animation (default true). Ignored under reduced-motion. */
  loop?: boolean;
  /** Play once and stop on the last frame (e.g. a success check). */
  autoplay?: boolean;
  /** Shown if the animation fails to load. */
  fallback?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export default function LottiePlayer({
  src,
  size = 96,
  loop = true,
  autoplay = true,
  fallback = null,
  className,
  'aria-label': ariaLabel,
}: LottiePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let anim: AnimationItem | null = null;
    let cancelled = false;

    // Dynamic import keeps lottie-web (which touches `document` at module load)
    // off the server — required so the statically-prerendered "/" doesn't crash.
    Promise.all([
      import('lottie-web/build/player/lottie_light'),
      fetch(src).then(r => {
        if (!r.ok) throw new Error(`Lottie ${r.status}`);
        return r.json();
      }),
    ])
      .then(([mod, data]) => {
        if (cancelled || !host) return;
        const lottie = mod.default;
        anim = lottie.loadAnimation({
          container: host,
          renderer: 'svg',
          loop: reduce ? false : loop,
          autoplay: reduce ? false : autoplay,
          animationData: data,
        });
        // Under reduced motion, freeze on the last frame so it reads as a
        // finished, intentional graphic rather than a paused loader.
        if (reduce && anim) {
          anim.goToAndStop(anim.totalFrames - 1, true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [src, loop, autoplay]);

  if (failed) return <>{fallback}</>;

  return (
    <div
      ref={hostRef}
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{ width: size, height: size, lineHeight: 0 }}
    />
  );
}
