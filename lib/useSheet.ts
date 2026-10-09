'use client';

/* ── Sheets that leave, and can be thrown ──────────────────────────────────
 *
 * Every sheet in the app used to vanish on close — `if (!open) return null` —
 * and its drag handle was a picture of a drag handle. On a phone that is the
 * single most physical object in the interface, and it had no physics at all.
 *
 * This hook gives a sheet three things, the way iOS sheets behave:
 *
 *   PRESENCE. When the sheet is told to close, it stays mounted long enough to
 *   leave (--dur-3 on the exit curve), then unmounts. Leaving is quicker than
 *   arriving (--dur-4), because nobody waits on a door closing.
 *
 *   A HANDLE THAT WORKS. Drag the handle or the header down and the sheet
 *   follows the finger 1:1 while the backdrop thins. Let go past a quarter of
 *   its height, or flick faster than 0.5 px/ms, and it carries on out at the
 *   speed you threw it; otherwise it springs home. Dragging UP rubber-bands —
 *   the sheet gives a little and resists, so it never feels stuck.
 *
 *   ONE HAPTIC, AT THE EDGE. Crossing the dismiss threshold ticks once, so you
 *   feel the moment letting go will close it — the same cue iOS gives.
 *
 * Positions are written to the `translate` property, not `transform`. The
 * sheet is centred with transform: translateX(-50%); writing a translateY into
 * transform would throw that away mid-gesture. `translate` composes with it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { haptics } from './haptics';
import { DUR, EASE, SPRING, reducedMotion } from './motion';

const DISMISS_FRACTION = 0.25;
const FLICK_PX_PER_MS = 0.5;

function isSheetLayout(): boolean {
  try { return !window.matchMedia('(min-width: 1024px)').matches; } catch { return true; }
}

function animateOut(sheet: HTMLElement | null, backdrop: HTMLElement | null, opts?: { fromY?: number; velocity?: number }): Promise<void> {
  if (!sheet) return Promise.resolve();
  const anims: Animation[] = [];
  try {
    if (reducedMotion()) {
      anims.push(sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
      if (backdrop) anims.push(backdrop.animate([{ opacity: getComputedStyle(backdrop).opacity }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
    } else if (isSheetLayout()) {
      const h = sheet.getBoundingClientRect().height || 600;
      const from = opts?.fromY ?? 0;
      /* A throw keeps its speed: the remaining distance at the release
         velocity, clamped so a slow drop is not sluggish and a hard flick
         still reads as motion rather than a cut. */
      const v = Math.max(opts?.velocity ?? 0, 0);
      const duration = v > 0.3
        ? Math.min(DUR[3], Math.max(140, (h - from) / v))
        : DUR[3];
      anims.push(sheet.animate(
        [{ translate: `0 ${from}px` }, { translate: '0 100%' }],
        { duration, easing: v > 0.3 ? EASE.standard : EASE.exit, fill: 'forwards' },
      ));
      if (backdrop) anims.push(backdrop.animate(
        [{ opacity: getComputedStyle(backdrop).opacity }, { opacity: 0 }],
        { duration, easing: EASE.standard, fill: 'forwards' },
      ));
    } else {
      anims.push(sheet.animate(
        [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.97' }],
        { duration: DUR[2], easing: EASE.exit, fill: 'forwards' },
      ));
      if (backdrop) anims.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR[2], easing: EASE.standard, fill: 'forwards' }));
    }
  } catch { return Promise.resolve(); }
  return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {});
}

interface UseSheet {
  /** Whether to render at all — true through the exit animation. */
  present: boolean;
  sheetRef: React.RefObject<HTMLDivElement>;
  backdropRef: React.RefObject<HTMLDivElement>;
  /** Animate out, then call onClose. Use for X, backdrop, Escape. */
  requestClose: () => void;
  /** Spread onto the handle and the header — the draggable zone. */
  dragProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
}

export function useSheet({ open, onClose }: { open: boolean; onClose: () => void }): UseSheet {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  /* Set once the exit has already been performed by requestClose, so the
     parent flipping `open` afterwards unmounts without a second animation. */
  const exited = useRef(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (open) { setPresent(true); exited.current = false; leaving.current = false; return; }
    if (!present) return;
    if (exited.current) { setPresent(false); return; }
    /* Closed from outside (a form submitted, a route changed): still leave. */
    let alive = true;
    leaving.current = true;
    animateOut(sheetRef.current, backdropRef.current).then(() => { if (alive) setPresent(false); });
    return () => { alive = false; };
  }, [open, present]);

  const requestClose = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    animateOut(sheetRef.current, backdropRef.current).then(() => {
      exited.current = true;
      onCloseRef.current();
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!isSheetLayout() || e.button !== 0 || leaving.current) return;
    /* Buttons and fields in the header keep their own taps. */
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const backdrop = backdropRef.current;
    const h = sheet.getBoundingClientRect().height || 600;
    const startY = e.clientY;
    let y = 0;
    let armed = false;
    const samples: { t: number; y: number }[] = [{ t: performance.now(), y: 0 }];
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch { /* old WebKit */ }
    /* Stop the CSS entrance from fighting the finger if it is still running. */
    sheet.getAnimations().forEach(a => a.cancel());

    const move = (ev: PointerEvent) => {
      const raw = ev.clientY - startY;
      /* Down: 1:1. Up: rubber-band — the first 40px give 12px and it stiffens. */
      y = raw >= 0 ? raw : -12 * (1 - Math.exp(raw / 40));
      sheet.style.translate = `0 ${y}px`;
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / (h * 1.1)));
      samples.push({ t: performance.now(), y });
      if (samples.length > 6) samples.shift();
      const past = y > h * DISMISS_FRACTION;
      if (past !== armed) { armed = past; if (past) haptics.snap(); }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const a = samples[0], b = samples[samples.length - 1];
      const velocity = (b.y - a.y) / Math.max(1, b.t - a.t);
      if (y > h * DISMISS_FRACTION || velocity > FLICK_PX_PER_MS) {
        leaving.current = true;
        animateOut(sheet, backdrop, { fromY: y, velocity }).then(() => {
          exited.current = true;
          onCloseRef.current();
        });
        return;
      }
      /* Home, on the snappy spring. */
      const back = sheet.animate([{ translate: `0 ${y}px` }, { translate: '0 0' }], { duration: DUR[4], easing: SPRING.snappy });
      sheet.style.translate = '';
      if (backdrop) {
        backdrop.animate([{ opacity: backdrop.style.opacity || '1' }, { opacity: 1 }], { duration: DUR[3], easing: EASE.standard });
        backdrop.style.opacity = '';
      }
      void back;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }, []);

  return {
    present,
    sheetRef,
    backdropRef,
    requestClose,
    /* touch-action: none so the browser hands the vertical drag to us rather
       than scrolling the page under the sheet. */
    dragProps: { onPointerDown, style: { touchAction: 'none', cursor: 'grab' } },
  };
}
