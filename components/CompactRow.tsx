'use client';

/* ── The compact row ───────────────────────────────────────────────────────
 *
 * A horizontal 88px thumbnail with the text beside it, in a vertical list.
 *
 * This exists because not every kind of content is answered by looking at a
 * photograph. A card is the right shape when the image IS the decision — a
 * jacket, a desk, a camera. It is the wrong shape for:
 *
 *   Lost & Found — the question is "is that mine", answered by a name and a
 *   place, and a wall of large photos of other people's lost keys is slow to
 *   read and faintly grim.
 *
 *   Services — the deliverable usually has no photograph at all, so a big
 *   image well gets filled with a banner, an avatar, or nothing.
 *
 * A row fits roughly three items in the height one card takes, and it is
 * scanned top-to-bottom in one column rather than swiped sideways — which
 * matters, because horizontal rails hide their contents behind a gesture and
 * lists do not.
 *
 * The whole row is one hit target, 104px tall against a 44px floor, so this is
 * also the least mis-tappable surface in the app. It still goes through the
 * tap guard: a list is inside the vertical scroller, which is exactly where a
 * drag gets mistaken for a tap.
 */

import { MapPin } from 'lucide-react';
import { useTap } from '../lib/useTap';
import NoPhoto from './NoPhoto';

export interface CompactRowProps {
  title: string;
  /** The line that carries the money or the status — the one the eye lands on
   *  after the title. */
  lead?: string;
  /** Tone for that line, matching the product card's price tones. */
  leadTone?: 'free' | 'wanted' | 'lost' | 'found';
  location?: string;
  /** Anything else worth one short phrase: a time, an author, a rate period. */
  meta?: string;
  imageUrl?: string | null;
  /** Tint behind the placeholder, so a list of photo-less rows is not a column
   *  of identical grey squares. */
  fallbackTint?: string;
  /** Small status word, top-left of the thumbnail. */
  badge?: string;
  badgeTone?: string;
  /** Round the thumbnail and inset it — for rows whose subject is a PERSON.
   *  A service is bought from someone, not off a shelf, and a square photo
   *  frame around a face reads as merchandise. */
  portrait?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

export default function CompactRow({
  title, lead, leadTone, location, meta,
  imageUrl, fallbackTint, badge, badgeTone, portrait, onClick, ariaLabel,
}: CompactRowProps) {
  const tap = useTap(onClick);
  return (
    <button
      type="button"
      className="crow"
      data-pressed={tap.pressed || undefined}
      aria-label={ariaLabel ?? title}
      onPointerDown={tap.onPointerDown}
      onPointerMove={tap.onPointerMove}
      onPointerUp={tap.onPointerUp}
      onPointerCancel={tap.onPointerCancel}
      onClick={tap.onClick}
    >
      <span
        className="crow-media"
        data-portrait={portrait || undefined}
        style={fallbackTint && !imageUrl ? { background: fallbackTint } : undefined}
      >
        {imageUrl
          ? <img src={imageUrl} alt="" loading="lazy" decoding="async" />
          : <NoPhoto small />}
        {badge && <span className="crow-badge" data-kind={badgeTone}>{badge}</span>}
      </span>

      <span className="crow-body">
        <span className="crow-title">{title}</span>
        {lead && <span className="crow-lead" data-tone={leadTone}>{lead}</span>}
        {(location || meta) && (
          <span className="crow-meta">
            {location && (
              <>
                <MapPin size={11} strokeWidth={2} aria-hidden="true" />
                <span className="crow-meta-text">{location}</span>
              </>
            )}
            {location && meta && <span aria-hidden="true">·</span>}
            {meta && <span className="crow-meta-text">{meta}</span>}
          </span>
        )}
      </span>
    </button>
  );
}
