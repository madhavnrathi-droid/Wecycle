'use client';

/* ── The UXINDIA spotlight, in the feed ────────────────────────────────────
 *
 * One row in the feed that is not a rail of listings, because the thing it is
 * advertising is not a listing: it is a discount on somebody else's ticket,
 * and it expires. Everything around it is browsable forever; this is the only
 * row with a deadline on it.
 *
 * ── Why it looks different ──
 *
 * It is deliberately the only dark object on a cream page. Not for emphasis
 * for its own sake — a feed where one row shouts is a feed people learn to
 * scroll past — but because a member should be able to tell without reading
 * that this is a partner's offer rather than a neighbour's sofa. The same
 * orange and the same near-black as the offer panel on the event page and the
 * share card, so arriving at any of the three feels like the same object seen
 * from a different angle.
 *
 * ── Why it is placed low rather than first ──
 *
 * The feed's job is still the marketplace. Putting a paid-partner card above
 * "Just dropped" would teach people that the top of the feed is advertising,
 * which is the fastest way to lose the top of the feed. It sits after the
 * first few rows: high enough to be found without hunting, late enough that
 * the app has already shown what it is for.
 *
 * ── The number is the headline ──
 *
 * "25% off" leads, not "UXINDIA 2026". The percentage is what makes anyone
 * stop; the brand is what makes it credible once they have. Reversing those
 * two is the most common way a promo card gets ignored.
 */

import { ArrowRight } from 'lucide-react';
import { Logomark } from './Brand';
import { MEMBER_TIER, UX_INDIA_EVENT } from '../lib/eventOffer';
import { track, EVT } from '../lib/analytics';

export interface UxIndiaSpotlightProps {
  /** The event's own cover art. Falls back to type alone when absent. */
  posterUrl?: string | null;
  onOpen: () => void;
}

export default function UxIndiaSpotlight({ posterUrl, onOpen }: UxIndiaSpotlightProps) {
  return (
    <section className="uxi-spot-wrap" aria-labelledby="uxi-spot-title">
      <button
        type="button"
        className="uxi-spot"
        onClick={() => {
          track(EVT.offer_spotlight_tapped, { percent: MEMBER_TIER.percent });
          onOpen();
        }}
        aria-label={`${MEMBER_TIER.percent}% off ${UX_INDIA_EVENT.presenter} tickets — ${UX_INDIA_EVENT.track}, ${UX_INDIA_EVENT.dates}. Open event.`}
      >
        {/* The poster, bled to the right and faded into the panel rather than
            boxed. A framed thumbnail beside text would make this look like
            every other row; letting the art run off the edge is what makes it
            read as a poster on a wall. */}
        {posterUrl && (
          <span className="uxi-spot-art" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterUrl} alt="" loading="lazy" decoding="async" draggable={false} />
          </span>
        )}

        <span className="uxi-spot-body">
          <span className="uxi-spot-eyebrow">
            {/* White, because the panel is near-black and the gradient mark
                loses its blue end at this size on this ground. */}
            <Logomark size={13} variant="white" alt="" />
            Exclusive on Wecycle
          </span>

          <span id="uxi-spot-title" className="uxi-spot-title">
            <b>{MEMBER_TIER.percent}% off</b> {UX_INDIA_EVENT.presenter}
          </span>

          {/* Track and dates only. The venue is one fact too many for a card
              whose job is to get the tap — it is the first thing on the event
              page, which is one tap away. Three facts wrapped to two lines and
              made the block look like a paragraph. */}
          <span className="uxi-spot-meta">
            {UX_INDIA_EVENT.track} · {UX_INDIA_EVENT.dates}
          </span>

          <span className="uxi-spot-cta">
            Get your code
            <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </span>
      </button>
    </section>
  );
}
