'use client';

/* ── The page takes on the colour of the thing ─────────────────────────────
 *
 * Spotify tints a playlist with its cover; Apple Music washes the player in
 * the artwork. A listing is the same object: a red kurta should feel red the
 * moment it opens, a green jacket green. This is that wash — the listing's own
 * photo, blurred past recognition and laid behind the top of the page, fading
 * to the page colour as you scroll into the details.
 *
 * Why the photo itself rather than a sampled colour: sampling needs a CORS
 * canvas read, which downloads the hero a second time in a different cache
 * mode. This reuses the exact bytes the card already fetched, costs no
 * JavaScript, and carries more than one colour — a two-tone print shows both.
 *
 * Decorative only: aria-hidden, pointer-events none, behind everything
 * (z-index -1 inside the screen's own stacking context).
 */
export default function AmbientArt({ src }: { src?: string | null }) {
  if (!src) return null;
  return (
    <div className="ambient-art" aria-hidden="true">
      <span style={{ backgroundImage: `url("${src.replace(/"/g, '%22')}")` }} />
    </div>
  );
}
