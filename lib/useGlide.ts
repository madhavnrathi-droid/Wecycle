'use client';

/* ── One selection, travelling ─────────────────────────────────────────────
 *
 * A segmented control used to repaint: the old tab went grey and the new one
 * went black, in the same frame. Swiggy, Zomato and iOS all slide one pill
 * from the old tab to the new one instead, so the eye follows the choice
 * rather than re-finding it. This hook does that for any `.segmented` row.
 *
 * It measures the [data-active] button and writes its offset and width as CSS
 * variables; the stylesheet draws the pill as the row's own ::before and moves
 * it on the snappy spring. The first placement is still (data-glide="still"),
 * so a screen opening with a tab selected doesn't animate a pill in from the
 * left edge; every change after that travels.
 *
 * Before hydration — and wherever this hook isn't attached — the row falls
 * back to the old per-button fill, so nothing depends on it.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useGlide<T extends HTMLElement = HTMLDivElement>(active: unknown) {
  const ref = useRef<T>(null);
  const placed = useRef(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = (animate: boolean) => {
      const btn = el.querySelector<HTMLElement>('[data-active]');
      if (!btn) { el.style.setProperty('--glide-o', '0'); return; }
      el.style.setProperty('--glide-x', `${btn.offsetLeft}px`);
      el.style.setProperty('--glide-w', `${btn.offsetWidth}px`);
      el.style.setProperty('--glide-o', '1');
      el.dataset.glide = animate ? 'on' : 'still';
      /* In a scrolling row, bring the choice into view — gently. */
      if (animate && el.scrollWidth > el.clientWidth) {
        const left = btn.offsetLeft - 16;
        const right = btn.offsetLeft + btn.offsetWidth + 16 - el.clientWidth;
        if (left < el.scrollLeft) el.scrollTo({ left, behavior: 'smooth' });
        else if (right > el.scrollLeft) el.scrollTo({ left: right, behavior: 'smooth' });
      }
    };
    place(placed.current);
    placed.current = true;
    /* Labels change width with "Larger text" and with counts arriving; keep
       the pill matched without animating those corrections. */
    if (typeof ResizeObserver === 'undefined') return;
    /* An observer reports once immediately on observe(); answering that would
       reset the row to "still" in the middle of the glide this run just
       started. Only a real change in the row's size re-measures. */
    let w = el.offsetWidth, h = el.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === w && el.offsetHeight === h) return;
      w = el.offsetWidth; h = el.offsetHeight;
      place(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return ref;
}
