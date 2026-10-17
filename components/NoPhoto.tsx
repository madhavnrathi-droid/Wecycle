'use client';

import { ImagePlus } from '@/lib/icons';

/* ── The one thing shown when a post has no photo ──────────────────────────
 *
 * Every tile in the app is a fixed-ratio box, and every box has to show
 * SOMETHING. For a long time "something" was a stock photograph picked by
 * category, by event type, or by the emoji the poster happened to choose — a
 * charger for anything lost, a clothing rack for any swap, a lit desk for
 * anything filed under electronics.
 *
 * That is not a placeholder, it is a wrong answer rendered confidently. Someone
 * scrolling Lost & Found saw a photo of a USB-C charger and reasonably believed
 * a charger had been found; what had actually happened was that nobody uploaded
 * a picture. A placeholder that can be mistaken for content is worse than an
 * empty box, because an empty box is at least honest about knowing nothing.
 *
 * So: a thin picture glyph on a soft fill, with the words "No photo" set in
 * the mono label voice. It cannot be mistaken for a photograph of anything,
 * and being the same everywhere means readers learn it once. (It used to be a
 * 3D voxel illustration — honest, but the most artificial-looking object on
 * any screen it appeared on.)
 */

/** Kept for any caller that still wants the old illustration's path. */
export const NO_PHOTO_SRC = '/brand/no-photo.webp';

interface NoPhotoProps {
  /** Softer variant for small tiles (thumbnails, compact rows) where the full
   *  illustration would be a smudge. */
  small?: boolean;
  /** The item's own tint, kept so a wall of photo-less cards is not a wall of
   *  identical grey. Falls back to the inset surface. */
  tint?: string;
  /** Extra class for callers that position the box themselves. */
  className?: string;
}

export default function NoPhoto({ small, tint, className }: NoPhotoProps) {
  return (
    <span
      className={`nophoto${small ? ' nophoto--sm' : ''}${className ? ` ${className}` : ''}`}
      style={tint ? { background: tint } : undefined}
      /* Decorative: the card already carries the title, and "no photo" is not
         information a screen reader needs read aloud on every tile. */
      aria-hidden="true"
    >
      <span className="nophoto-mark">
        <ImagePlus size={small ? 18 : 26} />
        {!small && <span className="nophoto-label">No photo</span>}
      </span>
    </span>
  );
}
