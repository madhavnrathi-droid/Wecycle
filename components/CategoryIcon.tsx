'use client';

/* One renderer for a category's icon, so the home strip and the desktop
 * marketplace cannot drift apart the way their category LISTS once did.
 *
 * Voxel renders, one per category (public/icons/categories). These are the
 * one deliberate exception to the thin-glyph rule in docs/design-system.md:
 * the category strip is the shop window's aisle signs, and the owner wants
 * them as objects, not line drawings (18 Oct 2026).
 *
 * "All" is a filter, not a category, so the original sheet has no tile for it.
 * scripts/make-voxel-all.py draws one in the same projection, palette and
 * lighting: the usual four-squares "everything" glyph, built from voxels. */

const ALL_SRC = '/icons/categories/all.webp';

export default function CategoryIcon({
  id, src, emoji, size = 56,
}: {
  id: string;
  src?: string;
  /** Fallback for anything without artwork. */
  emoji?: string;
  size?: number;
}) {
  const url = id === 'all' ? ALL_SRC : src;
  if (url) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );
  }
  return <>{emoji}</>;
}
