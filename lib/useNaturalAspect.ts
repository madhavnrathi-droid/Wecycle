'use client';

import { useEffect, useState } from 'react';

/* ── useNaturalAspect ─────────────────────────────────────────────────────
 *
 * Detail heroes used to be hard-coded to 4:5, so a 16:9 screenshot or a 9:16
 * phone photo got cropped to fit. This measures what the poster actually
 * uploaded and hands back a CSS aspect-ratio for the frame, so the frame adapts
 * to the image instead of the image being cut to the frame. The uploader picks
 * nothing and sees no crop tool — it just comes out right.
 *
 * Clamped, because "any ratio" can't mean "any shape of hole in the page": an
 * 8:1 panorama would become a letterbox slit and a 1:4 banner would push
 * everything below it off-screen. Inside the clamp the frame matches exactly and
 * nothing is cropped; outside it, the frame stops at the limit and FitImage's
 * contain + blurred bed keeps the whole image visible anyway. So nothing is ever
 * cut either way — the clamp only bounds how much page the image may take.
 *
 * Bounds cover every common camera and social ratio:
 *   9:16 (0.5625) portrait video / stories · 2:3 · 3:4 · 4:5 · 1:1
 *   4:3 · 3:2 · 16:9 (1.777) landscape
 */
const MIN_RATIO = 0.5625;  /*  9:16 — tallest we'll let a hero get */
const MAX_RATIO = 1.7778;  /* 16:9  — widest */

export function useNaturalAspect(
  src: string | undefined,
  fallback = '4 / 5',
): string {
  const [ratio, setRatio] = useState<string>(fallback);

  useEffect(() => {
    if (!src) { setRatio(fallback); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) return;
      const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h));
      /* Emit the real numbers when they're inside the clamp so the frame is
         exact to the pixel; only fall back to the bound when it isn't. */
      setRatio(clamped === w / h ? `${w} / ${h}` : String(clamped));
    };
    /* A failed load keeps the fallback — never leave the frame with no ratio,
       or the box collapses to zero height and the card looks empty. */
    img.src = src;
    return () => { alive = false; };
  }, [src, fallback]);

  return ratio;
}
