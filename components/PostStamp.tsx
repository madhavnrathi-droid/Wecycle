'use client';

import { useEffect, useState } from 'react';
import { isJustSold, clearJustSold } from '../lib/moments';

/* ── The stamp on a closed post ───────────────────────────────────────────
 *
 * SOLD, TAKEN, RENTED, SWAPPED — across the photo, at an angle, for any tile-
 * shaped card: Inventory and the seller storefront. The feed's ProductCard
 * draws the same .pcard-stamp inline, so there is one look for a closed post
 * wherever a post can appear.
 *
 * Its own file rather than exported from a screen: StorefrontScreen and
 * InventoryScreen are separate chunks, and importing one from the other would
 * load a whole screen to draw a word.
 *
 * aria-hidden. The state belongs in the card's accessible name, which every
 * caller sets beside data-closed — a stamp announced separately would read the
 * word twice, or out of order with the title it describes.
 */
export default function PostStamp({ label, postId }: { label: string; postId?: string }) {
  /* Dropped in only when this post was JUST marked — see lib/moments.ts. A
     screen full of past sales shows its stamps at rest. */
  const [fresh] = useState(() => !!postId && isJustSold(postId));
  useEffect(() => {
    if (!fresh || !postId) return;
    const t = window.setTimeout(() => clearJustSold(postId), 700);
    return () => window.clearTimeout(t);
  }, [fresh, postId]);
  return (
    <span className="post-stamp-wrap" aria-hidden="true">
      <span className="pcard-stamp" data-fresh={fresh || undefined}>{label}</span>
    </span>
  );
}
