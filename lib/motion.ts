'use client';

/* ── Motion, for the moments CSS can't reach ────────────────────────────────
 *
 * The motion system lives in app/globals.css as tokens (--dur-1…5,
 * --ease-standard/enter/exit, --spring-snappy/bouncy). Almost everything moves
 * through those. This file is for the handful of moments that are not a state
 * change CSS can see — a burst around a heart, a number counting up, an item
 * landing where it was not before — and it uses the SAME numbers, so a scripted
 * moment and a styled one feel like one hand made them.
 *
 * Three rules every helper keeps:
 *
 *   NOTHING BLOCKS. Every animation is fire-and-forget and interruptible; no
 *   caller ever awaits one before doing the real work.
 *
 *   REDUCED MOTION WINS. With prefers-reduced-motion, movement becomes a short
 *   crossfade or nothing, and the end state is always applied — the change is
 *   still shown, just not performed.
 *
 *   TRANSFORM AND OPACITY ONLY. Nothing animates layout, so nothing here can
 *   jank a scroll or shift the page.
 */

export const DUR = { 1: 100, 2: 160, 3: 240, 4: 360, 5: 520 } as const;

export const EASE = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
} as const;

const LINEAR_SNAPPY = 'linear(0, 0.2348 7.5%, 0.6235 16.4%, 0.8854 25.3%, 1.0094 33.6%, 1.0373 40.2%, 1.0302 48%, 1.0056 64.3%, 0.9993 80.2%, 1)';
const LINEAR_BOUNCY = 'linear(0, 0.1925 6.6%, 0.6408 15.5%, 1.0151 24.6%, 1.1376 30.6%, 1.1659 35.4%, 1.1394 41.1%, 0.9978 57.3%, 0.9688 64.8%, 0.9726 73.3%, 1.0035 92.7%, 1)';

let linearOk: boolean | null = null;
function supportsLinear(): boolean {
  if (linearOk !== null) return linearOk;
  try {
    linearOk = typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)');
  } catch { linearOk = false; }
  return linearOk;
}

/** Springs as WAAPI easings, falling back where linear() is unknown. */
export const SPRING = {
  get snappy() { return supportsLinear() ? LINEAR_SNAPPY : 'cubic-bezier(0.25, 1.15, 0.5, 1)'; },
  get bouncy() { return supportsLinear() ? LINEAR_BOUNCY : 'cubic-bezier(0.3, 1.45, 0.45, 1)'; },
};

export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

interface Opts { duration?: number; easing?: string; delay?: number; fill?: FillMode }

/** Run keyframes on an element; under reduced motion, a 120ms fade of the
 *  final frame (or nothing, when the frames don't involve opacity). */
export function play(el: Element | null | undefined, frames: Keyframe[], opts: Opts = {}): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  try {
    if (reducedMotion()) {
      const last = frames[frames.length - 1] ?? {};
      if ('opacity' in last) {
        return (el as HTMLElement).animate([{ opacity: 0 }, { opacity: last.opacity as number }], { duration: 120, fill: opts.fill ?? 'none' });
      }
      return null;
    }
    return (el as HTMLElement).animate(frames, {
      duration: opts.duration ?? DUR[3],
      easing: opts.easing ?? EASE.standard,
      delay: opts.delay ?? 0,
      fill: opts.fill ?? 'none',
    });
  } catch { return null; }
}

/** An element arriving in a list: drops a few pixels and settles on the snappy
 *  spring, then rings once in lime. The "your thing is here now" moment. */
export function land(el: Element | null | undefined, { ring = false }: { ring?: boolean } = {}) {
  play(el, [
    { transform: 'translateY(-14px) scale(0.96)', opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { duration: DUR[4], easing: SPRING.snappy });
  if (ring) {
    play(el, [
      { boxShadow: '0 0 0 0 rgba(168, 221, 0, 0.55)' },
      { boxShadow: '0 0 0 12px rgba(168, 221, 0, 0)' },
    ], { duration: DUR[5], delay: DUR[4] - 60, easing: EASE.standard });
  }
}

/** A small radial burst from the centre of `anchor` — six dots on the first
 *  save of a session, so the moment is special rather than routine. Drawn in a
 *  fixed overlay so it can escape the card's overflow clipping. */
export function burst(anchor: Element | null | undefined, {
  count = 6, color = 'var(--accent-rose, #ED2E50)', distance = 22, size = 5,
}: { count?: number; color?: string; distance?: number; size?: number } = {}) {
  if (!anchor || reducedMotion() || typeof document === 'undefined') return;
  const r = anchor.getBoundingClientRect();
  if (!r.width) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed', left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`,
    width: '0', height: '0', pointerEvents: 'none', zIndex: '9999',
  });
  document.body.appendChild(layer);
  const anims: Animation[] = [];
  for (let i = 0; i < count; i++) {
    const a = (360 / count) * i + (i % 2 ? 12 : -8);
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      position: 'absolute', left: `${-size / 2}px`, top: `${-size / 2}px`,
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: color,
    });
    layer.appendChild(dot);
    const d = distance + (i % 3) * 4;
    const anim = dot.animate([
      { transform: `rotate(${a}deg) translateY(-6px) scale(1)`, opacity: 1 },
      { transform: `rotate(${a}deg) translateY(-${d}px) scale(0.4)`, opacity: 0 },
    ], { duration: DUR[4] + 40, easing: EASE.enter, fill: 'forwards' });
    anims.push(anim);
  }
  Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => layer.remove());
}

/** Counts a number up in place, tabular, on the enter curve. Writes the final
 *  value immediately under reduced motion. Returns a cancel function. */
export function countUp(el: HTMLElement | null, to: number, {
  from = 0, duration = 400, format = (n: number) => Math.round(n).toLocaleString('en-IN'),
}: { from?: number; duration?: number; format?: (n: number) => string } = {}): () => void {
  if (!el) return () => {};
  if (reducedMotion() || from === to) { el.textContent = format(to); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  /* cubic-bezier(0.05, 0.7, 0.1, 1) is steep then long — an ease-out quint is
     close enough for a number and needs no solver. */
  const ease = (t: number) => 1 - Math.pow(1 - t, 5);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    el.textContent = format(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** First-to-last: animate an element from where it WAS (a rect captured before
 *  a re-render) to where it is now. */
export function flipFrom(el: HTMLElement | null, first: DOMRect | null, opts: Opts = {}) {
  if (!el || !first) return;
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / (last.width || 1);
  const sy = first.height / (last.height || 1);
  if (!dx && !dy && sx === 1 && sy === 1) return;
  play(el, [
    { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
    { transformOrigin: 'top left', transform: 'none' },
  ], { duration: opts.duration ?? DUR[4], easing: opts.easing ?? SPRING.snappy });
}
