'use client';

/* ── The one banner on the home feed ──────────────────────────────────────
 *
 * The top of the feed used to carry a six-slide carousel pitching Wecycle's
 * own features — share, request, events, lost & found, jobs, invite. Those
 * slides are parked (see the note in FeedScreen) and this stands in their
 * place, alone: the partnership with UXINDIA and the discount that comes with
 * it, which is the one thing on the home screen with a deadline on it.
 *
 * ── WHY IT IS ITS OWN COMPONENT AND NOT A SEVENTH SLIDE ──
 *
 * MarketingBanner is a carousel — auto-advance, dot indicator, scroll-snap,
 * a measured cards-per-view, swipe scrubbing — and every one of those exists
 * to move between slides. With one slide they are all dead weight, and its
 * slide chrome (a full-bleed illustration, drifting blobs, a CSS gradient
 * behind flat art) is the opposite of what was asked for here. This is a
 * black field, a shader, three lines of type and an arrow.
 *
 * ── THE COMPOSITION ──
 *
 * Borrowed from the printed poster for this event, because a student who has
 * seen one should recognise the other: the co-brand lock at the top left, a
 * large light headline under it on the left, the small print beneath that, and
 * the warm light coming in from the right. What is deliberately NOT borrowed
 * is the poster's illustration — the climbing figures are a metre tall on a
 * poster and forty pixels here, and they would leave no room for the words.
 * The shader is the artwork.
 *
 * ── LEGIBILITY IS NOT NEGOTIABLE ──
 *
 * The shader drifts, so the ground under the headline changes every frame and
 * the contrast figure has to hold at the WORST one, not on average. Two things
 * make that true: the ember is biased to the right (see EmberShader's `bias`)
 * so the left of the card is near-black by construction, and the scrim over it
 * holds its full strength across the whole type column before falling away.
 *
 * Every number in the CSS was measured — readPixels on the shader canvas,
 * the scrim composited over it in JS, contrast taken against the shader's
 * palette CEILING seen through the thinnest veil inside each text box. The
 * first two scrims written here both failed that check, and one of them failed
 * while looking perfectly fine on screen, which is the reason the method is
 * written down beside the values.
 *
 * ── THE NUMBERS COME FROM ONE PLACE ──
 *
 * The percentage is read from MEMBER_TIER, never typed in here. That tier has
 * a flag that raises it from 25 to 30, and a banner with its own copy of the
 * old number would go on advertising 25% off from the top of the home screen
 * on the day the offer improved.
 */

import { ArrowUpRight } from 'lucide-react';
import EmberShader from './EmberShader';
import { Logomark } from './Brand';
import { MEMBER_TIER, UX_INDIA_EVENT } from '../lib/eventOffer';

export interface UxIndiaBannerProps {
  /** Opens the event detail screen. */
  onOpen: () => void;
}

/* ── The compact UXINDIA mark ──
 *
 * The supplied lockup is 1287x220 and carries four things: the shield, the
 * UXINDIA wordmark, "23-27 SEPT | BENGALURU" beneath it, and "Design
 * Leadership Week 2026" in a column to the right. Only the first two are
 * legible at the size a banner can give a partner logo, and the other two say
 * — badly — what the banner's own meta line says in words.
 *
 * So it is CROPPED, to the left 916px and top 140px. Not with object-fit:
 * tried that first and it did nothing, because cover scales to the larger of
 * the two ratios and 916/140 is within a hair of 1287/220 — the "crop" came
 * out as two pixels off the bottom and the full lockup squashed into 124px,
 * with the date line as an illegible grey smear. Cropping needs a box that
 * clips and an image larger than it, which is what this is:
 *
 *   scale = markH / 140    so the 140px-tall region becomes markH tall
 *   img   = 1287 x 220, scaled           (overflows the box on both axes)
 *   box   = 916 * scale wide, markH tall (clips the overflow away)
 *
 * By arithmetic rather than by a second exported file, so there stays one
 * asset to replace if the lockup is ever reissued. */
const UXI_LOCKUP = { w: 1287, h: 220, cropW: 916, cropH: 140, src: '/brand/uxindia-white.png' };

export default function UxIndiaBanner({ onOpen }: UxIndiaBannerProps) {
  const markH = 19;

  return (
    <button
      type="button"
      className="uxib"
      onClick={onOpen}
      /* One composed name rather than the concatenation of five nodes. The
         marks are alt="" because the lock is decorative here — the sentence
         below names both parties in words, which is what a screen reader
         needs, and "Wecycle logo UXINDIA logo 25% off" is not a sentence. */
      aria-label={
        `${MEMBER_TIER.percent}% off ${UX_INDIA_EVENT.presenter} passes for Wecycle members. `
        + `${UX_INDIA_EVENT.track}, ${UX_INDIA_EVENT.dates}. Open the event.`
      }
    >
      <EmberShader className="uxib-bg" bias="right" />
      {/* Between the shader and the words. Its shape is measured, not
          decorative — see the note on .uxib-veil, which includes what a flat
          overlay and a naive left-to-right ramp each scored. */}
      <span className="uxib-veil" aria-hidden="true" />

      <span className="uxib-inner">
        <span className="uxib-lock">
          <Logomark size={markH + 3} variant="white" alt="" />
          {/* The collaboration mark. A hairline rule would be tidier and say
              less — this is a partnership, and "x" is how everyone involved
              has been writing it. */}
          <span className="uxib-x" aria-hidden="true">✕</span>
          <span
            className="uxib-uxi"
            style={{
              width: Math.round((UXI_LOCKUP.cropW / UXI_LOCKUP.cropH) * markH),
              height: markH,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={UXI_LOCKUP.src}
              alt=""
              decoding="async"
              draggable={false}
              /* In the style attribute, not width/height attributes: those are
                 only a layout hint and a global `max-width: 100%` beat them,
                 clamping the oversized image back to the clip box and undoing
                 the crop. */
              style={{
                width: (UXI_LOCKUP.w / UXI_LOCKUP.cropH) * markH,
                height: (UXI_LOCKUP.h / UXI_LOCKUP.cropH) * markH,
              }}
            />
          </span>
        </span>

        <span className="uxib-copy">
          <span className="uxib-eyebrow">Exclusive for members</span>
          {/* The number leads. "Rising Leaders Forum" is the headline on the
              poster, where there is room to explain what it is; here it is the
              small print, because a student scrolling past has no idea what
              RLF is and every idea what 25% off means. */}
          <span className="uxib-head">
            {MEMBER_TIER.percent}% off <span className="uxib-head-dim">{UX_INDIA_EVENT.presenter}</span>
          </span>
          <span className="uxib-meta">
            {UX_INDIA_EVENT.track} · {UX_INDIA_EVENT.dates}
          </span>
        </span>
      </span>

      <span className="uxib-go" aria-hidden="true">
        <ArrowUpRight size={17} strokeWidth={2.2} />
      </span>
    </button>
  );
}
