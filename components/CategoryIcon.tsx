'use client';

/* One renderer for a category's icon, so the home strip and the desktop
   marketplace cannot drift apart the way their category LISTS once did.
 *
 * "All" is the odd one out and always will be: it is a filter, not a category,
 * so the voxel sheet has no tile for it and inventing one would be dishonest —
 * there is no object that means "everything". It gets a 2x2 grid glyph instead,
 * the standard "show me all of it" affordance, drawn in currentColor so it
 * inverts with the plate underneath it rather than disappearing when the tile
 * turns black. Leaving the old ⚡ emoji there was the alternative, and one
 * emoji sitting among twelve voxel illustrations reads as an oversight. */

export default function CategoryIcon({
  id, src, emoji, size = 40,
}: {
  id: string;
  src?: string;
  /** Fallback for anything without artwork. */
  emoji?: string;
  size?: number;
}) {
  if (id === 'all') {
    const s = Math.round(size * 0.52);
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <rect x="2"  y="2"  width="8.5" height="8.5" rx="2.6" />
        <rect x="13.5" y="2"  width="8.5" height="8.5" rx="2.6" />
        <rect x="2"  y="13.5" width="8.5" height="8.5" rx="2.6" />
        <rect x="13.5" y="13.5" width="8.5" height="8.5" rx="2.6" />
      </svg>
    );
  }

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <>{emoji}</>;
}
