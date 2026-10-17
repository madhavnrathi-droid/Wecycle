'use client';

import {
  Laptop, Armchair, TShirt, BookOpen, Bicycle, CookingPot, Basketball, Handshake,
  Ticket, Guitar, PaintBrush, PawPrint, SquaresFour, Tag, type LucideIcon,
} from '@/lib/icons';

/* One renderer for a category's icon, so the home strip and the desktop
 * marketplace cannot drift apart the way their category LISTS once did.
 *
 * Thin Phosphor glyphs, drawn in currentColor. The tiles used to carry 3D voxel
 * renders — twelve little dioramas in a row — and next to real photos of real
 * things they were the most artificial-looking objects on the screen. A line
 * glyph says "this is a filter" and leaves the photographs to be the pictures.
 *
 * "All" is a filter, not a category, so it gets the four-square grid: the
 * standard "show me all of it" glyph. */

const GLYPH: Record<string, LucideIcon> = {
  all: SquaresFour,
  electronics: Laptop,
  furniture: Armchair,
  fashion: TShirt,
  books: BookOpen,
  mobility: Bicycle,
  kitchen: CookingPot,
  sports: Basketball,
  services: Handshake,
  tickets: Ticket,
  hobbies: Guitar,
  art: PaintBrush,
  adopt: PawPrint,
};

export default function CategoryIcon({
  id, size = 56,
}: {
  id: string;
  /** The voxel artwork's path. Kept in the signature so callers need not
   *  change; no longer drawn. */
  src?: string;
  emoji?: string;
  /** The tile's size. A large tile draws the glyph at about half of it; a
   *  small one (an inline chip) draws it at the size given. */
  size?: number;
}) {
  const Glyph = GLYPH[id] ?? Tag;
  const px = size >= 40 ? Math.round(size * 0.46) : size;
  return <Glyph size={px} aria-hidden="true" />;
}
