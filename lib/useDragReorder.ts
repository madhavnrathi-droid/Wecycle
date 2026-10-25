'use client';

/* ── Drag to reorder, for a grid of tiles ──────────────────────────────────
 *
 * The photo editor needed what every listing app ships (Etsy, Vinted, Depop,
 * Facebook Marketplace): pick a photo up and put it somewhere else. This is the
 * smallest version of that which behaves on a phone.
 *
 *   MOUSE   drags as soon as it has moved 4px — on a desktop a press-and-move
 *           on a tile can only mean "move this".
 *   TOUCH   waits for a 260ms long-press before lifting, and gives up if the
 *           finger travels 10px first — that was a scroll, and the page must
 *           keep scrolling under a thumb. Once lifted, the page stops
 *           scrolling (a non-passive touchmove) so the tile follows the finger.
 *
 * While dragging, the tile under the pointer is found by hit-testing the
 * grid's `[data-drag-key]` children, and the order changes the moment the
 * pointer enters another tile — the grid rearranges live, so where the photo
 * will land is always visible. A tile that was just displaced is ignored until
 * the pointer has left it once: with tiles of different sizes (the big cover)
 * the displaced tile can end up under the pointer again, and without that the
 * two would trade places on every frame.
 *
 * Near the top or bottom edge of the scroll container the page scrolls, faster
 * the closer the pointer gets. A drag ends on release, and a release after a
 * real drag swallows the click that follows, so dropping a photo never also
 * opens its menu. Escape, a cancelled pointer or losing focus put nothing
 * back — the order already on screen is the order you chose.
 *
 * The hook owns no list. It reports moves through `move(from, to)` and the
 * caller decides whether to accept them (`canMove`), so the same hook can sit
 * over photos, videos, or anything else with a fixed rule about order.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragGhost {
  key: string;
  /** Top-left of the ghost, viewport px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Options {
  /** Keys in their current order. */
  keys: string[];
  move: (from: number, to: number) => void;
  canMove?: (from: number, to: number) => boolean;
  /** The element whose descendants carry `data-drag-key`. Must be positioned
   *  (relative is enough) — tile positions are measured against it. */
  container: React.RefObject<HTMLElement | null>;
  /** Scrolled when the pointer nears its top or bottom edge. */
  scroller?: React.RefObject<HTMLElement | null>;
  longPressMs?: number;
  onLift?: (key: string) => void;
  onStep?: (key: string, to: number) => void;
  onDrop?: (key: string, from: number, to: number) => void;
}

const MOUSE_SLOP = 4;
const TOUCH_SLOP = 10;
const EDGE = 64;

export function useDragReorder({
  keys, move, canMove, container, scroller, longPressMs = 260, onLift, onStep, onDrop,
}: Options) {
  const [ghost, setGhost] = useState<DragGhost | null>(null);

  /* Everything the window listeners read lives in refs: they are attached once
     per gesture and must see the latest order, not the order at pointerdown. */
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const cb = useRef({ move, canMove, onLift, onStep, onDrop });
  cb.current = { move, canMove, onLift, onStep, onDrop };

  const g = useRef<{
    key: string;
    pointerId: number;
    type: string;
    startX: number;
    startY: number;
    offX: number;
    offY: number;
    lifted: boolean;
    fromIndex: number;
    displaced: string | null;
    timer: number | null;
    lastX: number;
    lastY: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const raf = useRef<number | null>(null);

  const tileOf = (key: string) =>
    container.current?.querySelector<HTMLElement>(`[data-drag-key="${CSS.escape(key)}"]`) ?? null;

  const end = useCallback((commit: boolean) => {
    const s = g.current;
    if (!s) return;
    if (s.timer) window.clearTimeout(s.timer);
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    g.current = null;
    if (s.lifted) {
      suppressClick.current = true;
      /* The click that follows a pointerup arrives in the same task; anything
         after that is a new tap and must not be eaten. */
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const to = keysRef.current.indexOf(s.key);
      if (commit) cb.current.onDrop?.(s.key, s.fromIndex, to);
    }
    setGhost(null);
  }, []);

  /* Auto-scroll: one rAF loop per drag, reading the last pointer position. */
  const tick = useCallback(() => {
    const s = g.current;
    const el = scroller?.current;
    if (!s || !s.lifted || !el) { raf.current = null; return; }
    const r = el.getBoundingClientRect();
    let dy = 0;
    if (s.lastY < r.top + EDGE) dy = -Math.ceil(((r.top + EDGE - s.lastY) / EDGE) * 14);
    else if (s.lastY > r.bottom - EDGE) dy = Math.ceil(((s.lastY - (r.bottom - EDGE)) / EDGE) * 14);
    if (dy) {
      el.scrollTop += dy;
      hitTest(s.lastX, s.lastY);
    }
    raf.current = requestAnimationFrame(tick);
  }, [scroller]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Where a tile LIVES, ignoring any transform: the grid animates tiles into
     their new places, and hit-testing the animated position makes the target
     slide out from under the pointer mid-move. Offsets are summed up to the
     container, which must be positioned. */
  const layoutRect = (el: HTMLElement, root: HTMLElement, base: DOMRect) => {
    let x = 0, y = 0;
    let n: HTMLElement | null = el;
    while (n && n !== root) {
      x += n.offsetLeft; y += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    if (n !== root) return el.getBoundingClientRect();
    const left = base.left + root.clientLeft + x, top = base.top + root.clientTop + y;
    return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight } as DOMRect;
  };

  const hitTest = (x: number, y: number) => {
    const s = g.current;
    const root = container.current;
    if (!s || !root) return;
    const base = root.getBoundingClientRect();
    const tiles = Array.from(root.querySelectorAll<HTMLElement>('[data-drag-key]'));
    let over: string | null = null;
    for (const t of tiles) {
      const k = t.dataset.dragKey!;
      if (k === s.key) continue;
      const r = layoutRect(t, root, base);
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { over = k; break; }
    }
    if (s.displaced && over !== s.displaced) s.displaced = null;
    if (!over || over === s.displaced) return;
    const order = keysRef.current;
    const from = order.indexOf(s.key);
    const to = order.indexOf(over);
    if (from < 0 || to < 0 || from === to) return;
    if (cb.current.canMove && !cb.current.canMove(from, to)) return;
    s.displaced = over;
    cb.current.move(from, to);
    cb.current.onStep?.(s.key, to);
  };

  const lift = () => {
    const s = g.current;
    const tile = s ? tileOf(s.key) : null;
    if (!s || !tile) return;
    const r = tile.getBoundingClientRect();
    s.lifted = true;
    s.offX = s.startX - r.left;
    s.offY = s.startY - r.top;
    s.fromIndex = keysRef.current.indexOf(s.key);
    setGhost({ key: s.key, x: r.left, y: r.top, w: r.width, h: r.height });
    cb.current.onLift?.(s.key);
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = g.current;
      if (!s || e.pointerId !== s.pointerId) return;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      const dist = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
      if (!s.lifted) {
        if (s.type === 'mouse') {
          if (dist >= MOUSE_SLOP) lift();
        } else if (dist >= TOUCH_SLOP) {
          /* Moved before the long-press finished: that was a scroll. */
          end(false);
        }
        return;
      }
      setGhost(gh => (gh ? { ...gh, x: e.clientX - s.offX, y: e.clientY - s.offY } : gh));
      hitTest(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      const s = g.current;
      if (!s || e.pointerId !== s.pointerId) return;
      end(true);
    };
    const onCancel = (e: PointerEvent) => {
      const s = g.current;
      if (!s || e.pointerId !== s.pointerId) return;
      end(true);
    };
    /* Once a tile is lifted on a touch screen, the page must not scroll under
       it. Non-passive, so preventDefault is honoured. */
    const onTouchMove = (e: TouchEvent) => {
      if (g.current?.lifted) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && g.current) end(true); };
    const onBlur = () => end(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [end]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Spread onto each tile (alongside `data-drag-key={key}`). */
  const bind = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || g.current) return;
      const s = {
        key, pointerId: e.pointerId, type: e.pointerType,
        startX: e.clientX, startY: e.clientY, offX: 0, offY: 0,
        lifted: false, fromIndex: -1, displaced: null, timer: null as number | null,
        lastX: e.clientX, lastY: e.clientY,
      };
      g.current = s;
      if (e.pointerType !== 'mouse') {
        s.timer = window.setTimeout(() => { if (g.current === s) lift(); }, longPressMs);
      }
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); }
    },
    /* A long-press on an image would otherwise open the browser's own menu. */
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); },
  });

  return { ghost, dragging: ghost?.key ?? null, bind };
}
