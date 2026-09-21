'use client';

/* ── CardMedia — every photo on the card, not just the first ───────────────
 *
 * A listing can carry several photos, and until now the card showed photo one
 * and kept the rest behind a tap. That is a real loss on a marketplace: the
 * second photo is usually the one that answers the question — the back of the
 * jacket, the scratch on the lid, the other side of the desk — and deciding
 * whether to open a listing at all is exactly when you want it.
 *
 * ── WHY A SCROLLER AND NOT A DRAG HANDLER ──────────────────────────────────
 *
 * The obvious build is pointer handlers and a transform. It is the wrong one
 * here, because this strip lives INSIDE the card's open-button, and that button
 * already has a carefully built tap guard (lib/useTap.ts) which exists because
 * scrolling the feed used to open listings by accident.
 *
 * A hand-rolled drag would have to fight that guard: capture the pointer (which
 * starves the feed of the move events it needs to scroll at all), then
 * re-implement direction locking, momentum and rubber-banding, and then teach
 * the tap guard about a third kind of gesture.
 *
 * A native scroll container needs none of it. The browser already does
 * direction locking, momentum and snapping — and, more importantly, useTap
 * ALREADY cancels a tap when any scrollable ancestor moved, precisely so a
 * still finger stopping a coasting page does not count as a tap. This strip is
 * such an ancestor. So swiping to photo two cannot open the listing, and that
 * falls out of a guard that was written before this component existed, rather
 * than out of anything added here.
 *
 * ── THE DESKTOP HALF ───────────────────────────────────────────────────────
 *
 * Swipe is a touch gesture and a mouse has no equivalent, so a desktop visitor
 * without a trackpad could see the dots and never reach photo two. Hover
 * therefore exposes two arrows.
 *
 * They are SPANS, not buttons, and that is deliberate. This strip renders
 * inside the card's open-button, and a <button> inside a <button> is invalid
 * HTML that browsers recover from differently and screen readers announce
 * differently. Spans are phrasing content, so the markup stays valid; they
 * carry aria-hidden and no role, so assistive technology never sees a nested
 * control at all. Nothing is lost by that: the card is still one button that
 * opens a detail view with the real, focusable gallery, and these are a mouse
 * convenience on top of a gesture that already works.
 *
 * They stop their own pointerdown, which is what keeps a click on an arrow
 * from also opening the listing — useTap never starts a tap candidate, so its
 * pointerup has nothing to act on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import FitImage from './FitImage';
import NoPhoto from './NoPhoto';
import type { MediaEntry } from '../lib/photos';

/** Past this many, dots stop being countable at a glance and become a texture;
 *  a plain "3/11" says the same thing in less space and stays readable. */
const MAX_DOTS = 5;

const srcOf = (m: MediaEntry): string | undefined =>
  typeof m === 'string' ? m : (m.poster ?? m.src);
const isVideo = (m: MediaEntry): boolean => typeof m !== 'string';
/* A background-removed photo is stored as a transparent PNG; it wants a white
   bed rather than a blurred copy of its own transparency. */
const isCutout = (u?: string): boolean => !!u && /\.png(\?|$)/i.test(u);

export interface CardMediaProps {
  media: MediaEntry[];
  /** Tint for the placeholder when there is no photo at all. */
  tint?: string;
  /** Above-the-fold cards may load the first frame eagerly. */
  eager?: boolean;
}

export default function CardMedia({ media, tint, eager }: CardMediaProps) {
  const usable = media.filter(m => !!srcOf(m));

  if (usable.length === 0) return <NoPhoto tint={tint} />;
  /* One photo is the common case and must stay exactly as cheap as it was:
     no scroller, no listener, no state. */
  if (usable.length === 1) {
    const src = srcOf(usable[0])!;
    return <FitImage src={src} cutout={isCutout(src)} eager={eager} />;
  }
  return <Strip media={usable} eager={eager} />;
}

function Strip({ media, eager }: { media: MediaEntry[]; eager?: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [index, setIndex] = useState(0);
  const frame = useRef(0);

  /* Read the index off scrollLeft rather than tracking it ourselves, so the
     dots stay honest no matter what moved the strip — a swipe, an arrow, a
     trackpad, or the browser restoring scroll position. */
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      setIndex(prev => (prev === i ? prev : Math.max(0, Math.min(media.length - 1, i))));
    });
  }, [media.length]);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  /* Assigns scrollLeft rather than scrollTo({behavior:'smooth'}), and the
     strip deliberately does not set scroll-behavior either. Smooth scrolling
     was observed doing nothing here — no error, no movement — and a smooth
     scroll that is unavailable does not fall back to a jump, it simply never
     happens. An arrow that moves instantly is fine; one that silently fails
     is a bug. The swipe keeps its native momentum regardless. */
  const go = useCallback((delta: number) => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const next = Math.max(0, Math.min(media.length - 1, Math.round(el.scrollLeft / w) + delta));
    el.scrollLeft = next * w;
    /* Set the index here too rather than waiting for the scroll event to
       report back. The arrow already knows exactly which photo it is moving
       to, so making the dots wait for a round trip through an event makes them
       lag at best — and where a programmatic scroll emits no scroll event at
       all (which happens), they would never move. onScroll below still governs
       swiping, where the position genuinely is only discoverable afterwards. */
    setIndex(next);
  }, [media.length]);

  return (
    <>
      <span className="cmedia" ref={ref} onScroll={onScroll}>
        {media.map((m, i) => {
          const src = srcOf(m)!;
          return (
            <span className="cmedia-slide" key={`${src}-${i}`}>
              <FitImage src={src} cutout={isCutout(src)} eager={eager && i === 0} />
              {isVideo(m) && (
                <span className="cmedia-play" aria-hidden="true">
                  <Play size={13} strokeWidth={2.6} fill="currentColor" />
                </span>
              )}
            </span>
          );
        })}
      </span>

      {/* Decorative: the photo count is announced through the card's own
          aria-label, so a screen reader is not read a row of bullets. */}
      {media.length <= MAX_DOTS ? (
        <span className="cmedia-dots" aria-hidden="true">
          {media.map((_, i) => (
            <span key={i} className="cmedia-dot" data-on={i === index || undefined} />
          ))}
        </span>
      ) : (
        <span className="cmedia-count" aria-hidden="true">{index + 1}/{media.length}</span>
      )}

      {/* Hover-only, and hidden from assistive tech: the strip is reachable by
          scrolling and the card opens to a full gallery, so these are a mouse
          convenience rather than the only way through. */}
      <span
        className="cmedia-arrow cmedia-arrow--prev" aria-hidden="true"
        data-hide={index === 0 || undefined}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); go(-1); }}
      >
        <ChevronLeft size={16} strokeWidth={2.4} />
      </span>
      <span
        className="cmedia-arrow cmedia-arrow--next" aria-hidden="true"
        data-hide={index === media.length - 1 || undefined}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); go(1); }}
      >
        <ChevronRight size={16} strokeWidth={2.4} />
      </span>
    </>
  );
}
