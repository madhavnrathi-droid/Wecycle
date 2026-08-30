'use client';

/* ── Long-press on a card ──────────────────────────────────────────────────
 *
 * The only place the feed can hear "no".
 *
 * Everything else it learns is inferred from taps, and taps are a poor
 * instrument: they include the mistakes, the idle curiosity and the thing you
 * opened to check it was NOT what you wanted. There is no gesture in the app
 * that means "stop showing me this", so the ranker has to guess from absence —
 * and absence is indistinguishable from never having been shown.
 *
 * A long press is the right home for it. It is the one gesture on a card that
 * is not already spoken for: tap opens, the heart saves, horizontal drags
 * scroll the rail and vertical drags scroll the page. It is also undiscoverable
 * on its own, which is why nothing important lives here — every action in this
 * sheet is either reversible or available elsewhere.
 *
 * The sheet is deliberately four items and no submenus. A context menu that
 * needs reading is slower than the scroll it interrupted.
 */

import { useEffect, useRef } from 'react';
import { EyeOff, Flag, Share2, UserX } from 'lucide-react';
import { haptics } from '../lib/haptics';

export interface CardMenuProps {
  title: string;
  sellerName?: string;
  onNotInterested: () => void;
  onHideSeller?: () => void;
  onShare?: () => void;
  onReport?: () => void;
  onClose: () => void;
}

export default function CardMenu({
  title, sellerName, onNotInterested, onHideSeller, onShare, onReport, onClose,
}: CardMenuProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    /* Focus the sheet so the menu is reachable by keyboard once open, and so a
       screen reader announces it rather than leaving focus on the card behind. */
    sheetRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = (fn?: () => void) => () => { fn?.(); onClose(); };

  return (
    <>
      <div className="cardmenu-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="cardmenu"
        role="dialog"
        aria-modal="true"
        aria-label={`Options for ${title}`}
        ref={sheetRef}
        tabIndex={-1}
      >
        <p className="cardmenu-title">{title}</p>

        <button type="button" className="cardmenu-item" onClick={act(onNotInterested)}>
          <EyeOff size={18} strokeWidth={1.9} aria-hidden="true" />
          <span>
            Not interested
            <span className="cardmenu-sub">Fewer like this in your feed</span>
          </span>
        </button>

        {onHideSeller && sellerName && (
          <button type="button" className="cardmenu-item" onClick={act(onHideSeller)}>
            <UserX size={18} strokeWidth={1.9} aria-hidden="true" />
            <span>
              Hide {sellerName}
              <span className="cardmenu-sub">Stop showing their posts</span>
            </span>
          </button>
        )}

        {onShare && (
          <button type="button" className="cardmenu-item" onClick={act(onShare)}>
            <Share2 size={18} strokeWidth={1.9} aria-hidden="true" />
            <span>Share</span>
          </button>
        )}

        {onReport && (
          <button type="button" className="cardmenu-item cardmenu-item--danger" onClick={act(onReport)}>
            <Flag size={18} strokeWidth={1.9} aria-hidden="true" />
            <span>Report</span>
          </button>
        )}

        <button type="button" className="cardmenu-cancel" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

/** Long-press detection that does not fight the scroller.
 *
 *  Cancels on movement for the same reason the tap guard does: a press that
 *  turns into a drag is a scroll, and a menu appearing mid-scroll is worse than
 *  no menu at all. 500ms is the platform convention — short enough to feel
 *  deliberate, long enough that nobody triggers it while browsing. */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    origin.current = null;
  };

  return {
    /** True when the press has already opened the menu — the caller must then
     *  swallow the tap, or letting go would also navigate. */
    consumed: () => fired.current,
    reset: () => { fired.current = false; },
    handlers: enabled ? {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          fired.current = true;
          haptics.longPress();
          onLongPress();
        }, 500);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const o = origin.current;
        if (!o) return;
        if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => {
        /* Long-press on touch also raises the OS context menu, which would
           cover ours. On a mouse, right-click is the desktop equivalent of the
           same intent, so it opens the sheet instead of the browser's. */
        e.preventDefault();
        if (!fired.current) { fired.current = true; onLongPress(); }
      },
    } : {},
  };
}
