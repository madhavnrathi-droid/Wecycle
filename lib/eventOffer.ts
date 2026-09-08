/* ── Partner discounts on an event ─────────────────────────────────────────
 *
 * Wecycle has exclusive codes for UXINDIA 2026, and members get them free.
 * This module is the ONLY place that knows the codes, who may see them, and
 * how the benefit is worded — so the event card, the detail screen and the
 * share card can never disagree about what a member is entitled to.
 *
 * Two things it exists to keep honest:
 *
 *   A CODE IS WORTH SOMETHING. The 25% tier is roughly ₹1,325 off a ₹5,299
 *   student pass. It is not decoration, so it is gated: signed-in members see
 *   it, everyone else sees what they would get and how to get it. That gate is
 *   stated once here rather than re-derived at each call site, because a
 *   privacy or entitlement rule that is written in three places is written
 *   wrong in at least one of them.
 *
 *   NOT EVERY CODE IS FOR SHOWING. Three codes exist; two are live. The 30%
 *   is held back deliberately, and the way it is held back is a flag rather
 *   than a comment — an unused constant with THIRTY_PERCENT_IS_LIVE next to it
 *   is much harder to leak by accident than a code someone pasted into a
 *   component "temporarily".
 *
 * The gate is a UI gate, not a secret. These codes are typed into UXINDIA's
 * checkout, which is a system Wecycle does not control, so anyone who obtains
 * one can use it. Treat the gating as "who do we show this to", not as
 * security — and do not add server enforcement on the strength of the wording
 * here, because there is nothing to enforce.
 */

/** The event these offers belong to, in `events`. */
export const UX_INDIA_EVENT_ID = '3f22523a-4e96-4014-9405-9877d51f80ed';

/** Where a member goes to actually buy the ticket. */
export const UX_INDIA_TICKETS_URL = 'https://www.ux-india.org/tickets';

/** Who verifies SIGCHI membership by hand. */
export const SIGCHI_VERIFY_EMAIL = 'madhav.smiblr2024@learner.manipal.edu';

/* ── The 30% code ──────────────────────────────────────────────────────────
 *
 * Exists, is not in use, and must not render anywhere while this is false.
 * When it goes live, flip the flag: the members' tier moves to 30%, and the
 * SIGCHI benefit starts reading "30% + 5%" instead of a flat 35% — the same
 * single code, described the way the owner asked for it to be described once
 * the base rate is public. Nothing else needs editing.
 */
const THIRTY_PERCENT_IS_LIVE = false;
const HELD_BACK_CODE = 'UXI26WECYCRLF30';

export interface OfferTier {
  /** The literal string a member types into UXINDIA's checkout. */
  code: string;
  /** Whole percent off. */
  percent: number;
  /** Which UXINDIA tracks it applies to, in the member's words. */
  appliesTo: string;
}

/** Every signed-in Wecycle member. Valid on both UXINDIA tracks. */
export const MEMBER_TIER: OfferTier = {
  code: THIRTY_PERCENT_IS_LIVE ? HELD_BACK_CODE : 'UXI26WECYCLE25',
  percent: THIRTY_PERCENT_IS_LIVE ? 30 : 25,
  appliesTo: 'Leadership Summit and Rising Leaders Forum',
};

/** Verified SIGCHI members, on the Rising Leaders Forum only. Issued by hand
 *  after verification — never rendered in the app, only sent by reply. */
export const SIGCHI_TIER: OfferTier = {
  code: 'UXI26WECYRLF35',
  percent: 35,
  appliesTo: 'Rising Leaders Forum',
};

/**
 * How the SIGCHI benefit is written.
 *
 * A flat "35%" today. Once the 30% base is public, the owner wants it read as
 * "30% + 5%" so the extra is legible as a members' bonus rather than a
 * different, larger number that invites "why didn't I get that one".
 */
export function sigchiHeadline(): { headline: string; breakdown: string | null } {
  if (!THIRTY_PERCENT_IS_LIVE) {
    return { headline: '35%', breakdown: null };
  }
  return {
    headline: '30% + 5%',
    breakdown: `${MEMBER_TIER.percent}% for every member, plus 5% for verified SIGCHI members.`,
  };
}

/** True when this event carries the UXINDIA offer. */
export function hasPartnerOffer(eventId: string | undefined): boolean {
  return eventId === UX_INDIA_EVENT_ID;
}

/**
 * Who may see the member code.
 *
 * Signed in is the whole rule — deliberately not "signed in AND RSVP'd". An
 * RSVP gate would buy a cleaner attendee list at the cost of putting a second
 * hurdle in front of the thing the partnership exists to hand out.
 */
export function canRevealMemberCode(isSignedIn: boolean): boolean {
  return isSignedIn;
}

/* ── The SIGCHI application email ──────────────────────────────────────────
 *
 * Opens the member's own mail app with the message already written, because
 * the alternative is asking somebody to compose a formal-sounding request to a
 * stranger, which is where people give up. They still send it themselves, so
 * nothing is sent on their behalf and the reply lands in their own inbox.
 *
 * encodeURIComponent, not a template with raw text: a name with an ampersand
 * in it would otherwise truncate the body at that character and send a
 * half-written application.
 */
export function sigchiApplicationMailto(opts: {
  memberName?: string | null;
  memberEmail?: string | null;
}): string {
  const name = (opts.memberName ?? '').trim();
  const email = (opts.memberEmail ?? '').trim();

  const subject = 'SIGCHI discount — UXINDIA 2026 Rising Leaders Forum';

  const body = [
    'Hello,',
    '',
    `I'd like to apply for the ${SIGCHI_TIER.percent}% SIGCHI member discount for the`,
    'Rising Leaders Forum at UXINDIA 2026, via Wecycle.',
    '',
    name ? `Name: ${name}` : 'Name:',
    email ? `Wecycle account: ${email}` : 'Wecycle account:',
    'SIGCHI membership ID:',
    '',
    'I can share proof of my current SIGCHI membership if needed.',
    '',
    'Thank you,',
    name || '',
  ].join('\n');

  return `mailto:${SIGCHI_VERIFY_EMAIL}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
}

/* ── The event, in the words the share card and the promo card both use ──── */

export const UX_INDIA_EVENT = {
  track: 'Rising Leaders Forum',
  presenter: 'UXINDIA 2026',
  dates: '26 & 27 September',
  venue: 'MAHE Bengaluru',
  partner: 'in collaboration with Srishti',
} as const;

/** One line, for a card that has room for exactly one. */
export function offerStrapline(isSignedIn: boolean): string {
  return isSignedIn
    ? `Your ${MEMBER_TIER.percent}% code is ready`
    : `Members get ${MEMBER_TIER.percent}% off tickets`;
}
