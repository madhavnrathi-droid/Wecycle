'use client';

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
 * So: one image, obviously an illustration, obviously not a photograph of the
 * thing. It says "no photo" in a way no photograph can, and being the same
 * everywhere means readers learn it once and never mis-read it again.
 *
 * Sized to a fraction of its box and centred rather than filling it, for the
 * same reason: a placeholder that bleeds to the edges reads as a photo. The
 * margin is what tells you it is furniture, not content.
 */

/** The default image. One file, one meaning, used app-wide. */
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={NO_PHOTO_SRC} alt="" loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
