'use client';

/* ── Tap, as distinct from "a click happened" ──────────────────────────────
 *
 * The bug this exists to fix: scrolling the feed opens listings by accident.
 *
 * A browser fires `click` on a button whenever a press and a release land on
 * it, and it is not fussy about what happened in between. Three ordinary
 * things in a scrolling feed therefore read as taps:
 *
 *   1. A drag that starts on a card. The finger moves 30px pulling the page,
 *      lifts over the same card, and the browser calls that a click.
 *   2. Reaching for a horizontal rail. The intent is sideways; the target
 *      underneath is a navigation control.
 *   3. Worst of all — touching a coasting page to stop it. The finger barely
 *      moves, so no heuristic based on distance alone can catch it, and the
 *      user's intent was the exact opposite of "open this".
 *
 * So this does not trust `click`. It watches the whole pointer sequence and
 * decides for itself, on two independent tests:
 *
 *   MOVEMENT  — more than TAP_SLOP px travelled, and the gesture was a drag.
 *   SCROLL    — the nearest scrollable ancestor moved, and the gesture was a
 *               scroll, however still the finger was. This is the one that
 *               catches case 3, and it is the reason this is not just a
 *               distance check.
 *
 * Keyboard is deliberately left alone. A click from Enter or Space arrives
 * with `detail === 0` and no pointer sequence at all, so it is passed straight
 * through — the guard must never make the card unreachable without a mouse.
 */

import { useCallback, useRef, useState } from 'react';

/** Matches the ~10px slop native scroll views use before committing to a drag.
 *  Lower starts rejecting real taps from imprecise thumbs; higher starts
 *  accepting short drags as taps. */
const TAP_SLOP = 10;

/** A press held longer than this is a long-press or a hesitation, not a tap. */
const TAP_TIMEOUT_MS = 700;

/** Scroll movement past this counts as a scroll. 2px absorbs sub-pixel noise
 *  and rubber-banding without letting a real scroll through. */
const SCROLL_SLOP = 2;

interface Scrollers {
  el: Element;
  top: number;
  left: number;
}

/** Every scrollable ancestor, with its position at press time. Plural because
 *  a card sits inside a horizontal rail inside the vertical page, and either
 *  one moving means the gesture was not a tap. */
function scrollAncestors(node: Element | null): Scrollers[] {
  const out: Scrollers[] = [];
  let el: Element | null = node;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY + s.overflowX)) {
      out.push({ el, top: el.scrollTop, left: el.scrollLeft });
    }
    el = el.parentElement;
  }
  const doc = document.scrollingElement;
  if (doc) out.push({ el: doc, top: doc.scrollTop, left: doc.scrollLeft });
  return out;
}

export interface TapHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onClick: (e: React.MouseEvent) => void;
  /** True while a live tap candidate is down — drive the press state off this
   *  rather than :active, which lights up during scrolls too. */
  pressed: boolean;
}

export function useTap(onTap: () => void): TapHandlers {
  const start = useRef<{ x: number; y: number; t: number; scrollers: Scrollers[] } | null>(null);
  const rejected = useRef(false);
  const [pressed, setPressed] = useState(false);

  const cancel = useCallback(() => {
    rejected.current = true;
    setPressed(false);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    /* Secondary buttons are context menus, not taps. */
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    rejected.current = false;
    start.current = {
      x: e.clientX, y: e.clientY, t: performance.now(),
      scrollers: scrollAncestors(e.currentTarget as Element),
    };
    setPressed(true);
    /* Deliberately NOT setPointerCapture: capturing would starve the scroll
       container of the very move events it needs to scroll at all, which would
       fix accidental taps by breaking scrolling. */
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    if (!s || rejected.current) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP) cancel();
  }, [cancel]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setPressed(false);
    if (!s || rejected.current) { rejected.current = false; return; }

    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP) return;
    if (performance.now() - s.t > TAP_TIMEOUT_MS) return;
    /* The still-finger case: the page moved under it. */
    for (const sc of s.scrollers) {
      if (Math.abs(sc.el.scrollTop - sc.top) > SCROLL_SLOP) return;
      if (Math.abs(sc.el.scrollLeft - sc.left) > SCROLL_SLOP) return;
    }
    onTap();
  }, [onTap]);

  const onClick = useCallback((e: React.MouseEvent) => {
    /* detail === 0 means the click came from the keyboard, where there was no
       pointer sequence for the logic above to judge. Let it through. */
    if (e.detail === 0) { onTap(); return; }
    /* Otherwise pointerup has already decided, one way or the other. */
    e.preventDefault();
  }, [onTap]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel, onClick, pressed };
}
