'use client';

/* ── FitImage — show a whole image in a fixed box, never cropped ───────────
 *
 * The problem it solves: our tiles are fixed-ratio boxes (a 4:5 card, a 2:3
 * poster) and every one of them used `object-fit: cover`. Cover fills the box by
 * CROPPING whatever doesn't fit, so a 9:16 phone photo lost its top and bottom
 * and a 16:9 screenshot lost its sides. Posters and screenshots — where the
 * content IS the edges — came out unreadable.
 *
 * `object-fit: contain` alone fixes the cropping but leaves dead bars, which
 * reads as a broken image. So we do what Instagram, WhatsApp and YouTube do:
 * contain the real image, and fill the leftover space with a blurred, scaled-up
 * copy of the same image. Nothing is cut, the tile keeps its uniform shape, and
 * the fill looks deliberate. The poster does nothing and picks nothing — it just
 * works for any ratio they happen to upload.
 *
 * It's the same `src` twice, so the browser fetches and decodes once.
 *
 * When the image's ratio is already close to the box's, contain and cover agree
 * to within a hair, so the blurred layer is invisible anyway — no cost to the
 * common case.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* useLayoutEffect, so a photo that is not in the cache yet is hidden before the
   first paint rather than flashing in and back out; useEffect on the server,
   where layout effects don't run. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface FitImageProps {
  src: string;
  /** Decorative by default — these sit inside cards that carry their own label. */
  alt?: string;
  /** `true` for above-the-fold heroes; everything else lazy-loads. */
  eager?: boolean;
  /** Extra class on the wrapper, for sizing from the parent. */
  className?: string;
  /** Transparent cut-outs (background-removed PNGs) want a clean white bed
   *  rather than a blurred copy of their own transparency. */
  cutout?: boolean;
}

export default function FitImage({ src, alt = '', eager, className, cutout }: FitImageProps) {
  /* ── Arriving, not appearing ──
     A photo still on its way is held invisible over the inset ground (with a
     soft sheen if it takes longer than 300ms), then fades in and settles from
     103% — the way Photos and Spotify bring artwork in. A photo already in the
     cache never enters this state: it is simply there, because animating
     something the reader has already seen is decoration. */
  const fgRef = useRef<HTMLImageElement>(null);
  const [pending, setPending] = useState(false);
  useIsoLayoutEffect(() => {
    const img = fgRef.current;
    setPending(!!img && !(img.complete && img.naturalWidth > 0));
  }, [src]);
  const settle = () => setPending(false);

  return (
    <span
      className={`fit-img${cutout ? ' fit-img--cutout' : ''}${className ? ` ${className}` : ''}`}
      data-pending={pending || undefined}
    >
      {!cutout && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="fit-img-bg"
          src={src}
          alt=""
          aria-hidden="true"
          loading={eager ? 'eager' : 'lazy'}
          draggable={false}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={fgRef}
        className="fit-img-fg"
        src={src}
        alt={alt}
        onLoad={settle}
        onError={settle}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
