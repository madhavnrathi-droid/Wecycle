'use client';

/* ── The UXINDIA offer, on the event page ──────────────────────────────────
 *
 * Three states, and the difference between them is the whole design:
 *
 *   SIGNED OUT   Shows the SIZE of the benefit and how to get it, never the
 *                code. Hiding the number as well would make the sign-in
 *                prompt an act of faith — "sign in for a surprise" converts
 *                far worse than "sign in for 25% off a ₹5,299 pass", and it
 *                would also be the only screen in the app that asks for an
 *                account without saying why.
 *
 *   SIGNED IN    The code, under foil. See ScratchCode.
 *
 *   SIGCHI       A separate, quieter path. It is not a bigger button next to
 *                the members' one, because it is not a better offer that
 *                everyone should want — it is a different offer that a small
 *                number of people qualify for, and dangling it in front of
 *                everyone else manufactures the feeling of missing out on
 *                something they were never eligible for.
 *
 * The panel is orange-on-black and nothing else in the app is. That is
 * deliberate: this content belongs to a partner, and a member should be able
 * to see at a glance that the discount is not Wecycle's own inventory.
 */

import { ArrowUpRight, BadgeCheck, Lock, Ticket } from 'lucide-react';
import ScratchCode from './ScratchCode';
import {
  MEMBER_TIER, SIGCHI_TIER, UX_INDIA_TICKETS_URL, UX_INDIA_EVENT,
  canRevealMemberCode, sigchiApplicationMailto, sigchiHeadline,
} from '../lib/eventOffer';
import { track, EVT } from '../lib/analytics';

export interface PartnerOfferPanelProps {
  isSignedIn: boolean;
  memberName?: string | null;
  memberEmail?: string | null;
  onRequireAuth: () => void;
}

export default function PartnerOfferPanel({
  isSignedIn, memberName, memberEmail, onRequireAuth,
}: PartnerOfferPanelProps) {
  const canReveal = canRevealMemberCode(isSignedIn);
  const sigchi = sigchiHeadline();

  return (
    <section className="uxi-panel" aria-labelledby="uxi-offer-heading">
      <header className="uxi-head">
        <span className="uxi-eyebrow">
          <Ticket size={12} strokeWidth={2.2} aria-hidden="true" />
          Exclusive on Wecycle
        </span>
        <h3 id="uxi-offer-heading" className="uxi-title">
          {MEMBER_TIER.percent}% off {UX_INDIA_EVENT.presenter} tickets
        </h3>
        <p className="uxi-sub">
          Valid on the {MEMBER_TIER.appliesTo}.
        </p>
      </header>

      {canReveal ? (
        <ScratchCode
          code={MEMBER_TIER.code}
          label={`${MEMBER_TIER.percent}% off · Wecycle members`}
          onReveal={() => track(EVT.offer_code_revealed, { tier: 'member', percent: MEMBER_TIER.percent })}
          onCopy={() => track(EVT.offer_code_copied, { tier: 'member', percent: MEMBER_TIER.percent })}
        />
      ) : (
        <button type="button" className="uxi-locked" onClick={onRequireAuth}>
          <span className="uxi-locked-icon" aria-hidden="true"><Lock size={15} strokeWidth={2} /></span>
          <span className="uxi-locked-text">
            <strong>Sign in to get your code</strong>
            <span>Free for every Wecycle member. Takes a minute.</span>
          </span>
          <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      <a
        className="uxi-cta"
        href={UX_INDIA_TICKETS_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track(EVT.offer_tickets_opened, { source: 'event_detail' })}
      >
        <span>Book on {UX_INDIA_EVENT.presenter}</span>
        <ArrowUpRight size={15} strokeWidth={2.2} aria-hidden="true" />
      </a>

      {/* ── SIGCHI ── */}
      <div className="uxi-sigchi">
        <p className="uxi-sigchi-line">
          <BadgeCheck size={13} strokeWidth={2} aria-hidden="true" />
          <span>
            SIGCHI member? You can get <strong>{sigchi.headline}</strong> off the{' '}
            {SIGCHI_TIER.appliesTo}.
            {sigchi.breakdown ? <> {sigchi.breakdown}</> : null}
          </span>
        </p>
        {isSignedIn ? (
          <a
            className="uxi-sigchi-btn"
            href={sigchiApplicationMailto({ memberName, memberEmail })}
            onClick={() => track(EVT.offer_sigchi_applied, { percent: SIGCHI_TIER.percent })}
          >
            Apply with your SIGCHI ID
          </a>
        ) : (
          <button type="button" className="uxi-sigchi-btn" onClick={onRequireAuth}>
            Sign in to apply
          </button>
        )}
        {/* Says what happens next, because the next thing is a wait. An
            unexplained wait after pressing a button reads as a failure. */}
        <p className="uxi-sigchi-note">
          Opens an email to the Wecycle team. We verify your membership by hand and
          reply with your code — usually within a working day.
        </p>
      </div>
    </section>
  );
}
