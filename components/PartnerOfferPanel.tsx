'use client';

/* ── The UXINDIA offer, on the event page ──────────────────────────────────
 *
 * Two offers on one card, and keeping them from competing is the whole design:
 *
 *   EVERY MEMBER   25% off, under foil. Signed out, the panel shows the SIZE
 *                  of the benefit and how to get it but never the code —
 *                  hiding the number as well would make signing in an act of
 *                  faith, and "sign in for a surprise" converts far worse than
 *                  "sign in for 25% off a ₹5,299 pass".
 *
 *   SIGCHI MEMBERS 35%, and it is now VERIFIED IN THE PRODUCT. A member types
 *                  the address they registered to SIGCHI with and gets their
 *                  code, or gets told plainly that it did not match. It used
 *                  to be an email and a day of waiting for an answer the
 *                  roster already contained.
 *
 * The SIGCHI path stays visually quieter than the members' one. It is not a
 * better offer that everyone should want — it is a different offer that a
 * small number of people qualify for, and dangling it in front of everyone
 * else manufactures the feeling of missing out on something they were never
 * eligible for.
 *
 * ── WHY THE CHECK IS NOT AUTOMATIC ON MOUNT ──
 *
 * Running it for every visitor would spend a server round trip and a throttle
 * slot on people who have never heard of SIGCHI, and the throttle is what
 * stops the roster being enumerated. It runs on intent — a press.
 *
 * ── WHY A FAILED AUTO-CHECK IS NOT AN ERROR ──
 *
 * The first thing tried is the member's Wecycle address, and almost every
 * Wecycle account is @learner.manipal.edu while almost every SIGCHI
 * registration is a personal address. So that check USUALLY fails, and
 * reporting it as a failure would open the flow with a red message about
 * something the member never asked us to try. It goes straight to the field
 * instead, with a neutral prompt.
 *
 * The panel is orange-on-black and nothing else in the app is. That is
 * deliberate: this content belongs to a partner, and a member should be able
 * to see at a glance that the discount is not Wecycle's own inventory.
 */

import { useCallback, useRef, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Loader2, Lock, Ticket } from 'lucide-react';
import ScratchCode from './ScratchCode';
import SigchiRevealCard from './SigchiRevealCard';
import {
  MEMBER_TIER, SIGCHI_TIER, UX_INDIA_TICKETS_URL, UX_INDIA_EVENT,
  canRevealMemberCode, sigchiMismatchMailto, sigchiHeadline,
} from '../lib/eventOffer';
import { claimSigchiOffer, looksLikeEmail } from '../lib/sigchi';
import { track, EVT } from '../lib/analytics';

export interface PartnerOfferPanelProps {
  isSignedIn: boolean;
  memberName?: string | null;
  memberEmail?: string | null;
  onRequireAuth: () => void;
}

type Phase =
  | { s: 'idle' }
  | { s: 'checking' }
  /** The field. `note` explains why it is being asked for. */
  | { s: 'ask'; note: 'first' | 'again' }
  | { s: 'throttled' }
  | { s: 'error'; message: string };

export default function PartnerOfferPanel({
  isSignedIn, memberName, memberEmail, onRequireAuth,
}: PartnerOfferPanelProps) {
  const canReveal = canRevealMemberCode(isSignedIn);
  const sigchi = sigchiHeadline();

  const [phase, setPhase] = useState<Phase>({ s: 'idle' });
  const [typed, setTyped] = useState('');
  const [prize, setPrize] = useState<{ code: string; name: string | null } | null>(null);
  /** The last address actually submitted, so the fallback email can carry it. */
  const [lastTried, setLastTried] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** One place that turns a SigchiResult into a phase, so the auto-check and
   *  the typed check cannot drift apart in how they report the same outcome. */
  const apply = useCallback((
    result: Awaited<ReturnType<typeof claimSigchiOffer>>,
    tried: string,
    origin: 'account' | 'typed',
  ) => {
    setLastTried(tried);
    switch (result.kind) {
      case 'matched':
        track(EVT.offer_sigchi_verified, { origin, percent: SIGCHI_TIER.percent });
        setPrize({ code: result.code, name: result.name });
        setPhase({ s: 'idle' });
        return;
      case 'no-match':
        track(EVT.offer_sigchi_no_match, { origin });
        /* An account address that did not match is expected, not a failure —
           see the header. A typed one that did not match is news. */
        setPhase({ s: 'ask', note: origin === 'account' ? 'first' : 'again' });
        /* Focus the field only when it is newly appearing; stealing focus
           after a failed retry would move the caret away mid-correction. */
        if (origin === 'account') {
          window.setTimeout(() => inputRef.current?.focus(), 60);
        }
        return;
      case 'signin':
        onRequireAuth();
        setPhase({ s: 'idle' });
        return;
      case 'throttled':
        setPhase({ s: 'throttled' });
        return;
      default:
        setPhase({ s: 'error', message: result.message });
    }
  }, [onRequireAuth]);

  /** Step one: try the address we already hold. */
  const startCheck = useCallback(async () => {
    if (!isSignedIn) { onRequireAuth(); return; }
    track(EVT.offer_sigchi_checked, { origin: 'account' });
    const account = (memberEmail ?? '').trim();
    /* No usable address on the account — skip straight to asking rather than
       spending a round trip on an empty string. */
    if (!looksLikeEmail(account)) {
      setPhase({ s: 'ask', note: 'first' });
      window.setTimeout(() => inputRef.current?.focus(), 60);
      return;
    }
    setPhase({ s: 'checking' });
    apply(await claimSigchiOffer(account), account, 'account');
  }, [isSignedIn, memberEmail, onRequireAuth, apply]);

  /** Step two: the address they registered to SIGCHI with. */
  const submitTyped = useCallback(async () => {
    const value = typed.trim();
    if (!looksLikeEmail(value)) {
      setPhase({ s: 'ask', note: 'again' });
      inputRef.current?.focus();
      return;
    }
    track(EVT.offer_sigchi_checked, { origin: 'typed' });
    setPhase({ s: 'checking' });
    apply(await claimSigchiOffer(value), value, 'typed');
  }, [typed, apply]);

  const asking = phase.s === 'ask';
  const busy = phase.s === 'checking';

  return (
    <>
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

          {!isSignedIn ? (
            <button type="button" className="uxi-sigchi-btn" onClick={onRequireAuth}>
              Sign in to check
            </button>
          ) : !asking ? (
            <>
              <button
                type="button"
                className="uxi-sigchi-btn"
                onClick={startCheck}
                disabled={busy}
              >
                {busy ? (
                  <><Loader2 size={14} strokeWidth={2.4} className="uxi-spin" aria-hidden="true" /> Checking…</>
                ) : 'Check my membership'}
              </button>
              <p className="uxi-sigchi-note">
                Verified against the SIGCHI registration list. Instant — no waiting
                on a reply.
              </p>
            </>
          ) : (
            /* A form, so Enter submits and password managers behave. */
            <form
              className="uxi-sigchi-form"
              onSubmit={e => { e.preventDefault(); void submitTyped(); }}
            >
              <label className="uxi-sigchi-label" htmlFor="sigchi-email">
                {phase.note === 'first'
                  ? 'Which email did you register to SIGCHI with?'
                  : 'That address isn’t on the SIGCHI list. Try another?'}
              </label>
              <div className="uxi-sigchi-field">
                <input
                  ref={inputRef}
                  id="sigchi-email"
                  className="uxi-sigchi-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="you@example.com"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  aria-describedby="sigchi-email-help"
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="uxi-sigchi-go"
                  disabled={busy || !looksLikeEmail(typed)}
                >
                  {busy
                    ? <Loader2 size={15} strokeWidth={2.4} className="uxi-spin" aria-hidden="true" />
                    : 'Check'}
                </button>
              </div>
              <p id="sigchi-email-help" className="uxi-sigchi-note">
                Often a personal address rather than your Manipal one. We check it
                against the registration list and never store it against your
                profile.
              </p>
              {/* The escape hatch, and only once the automatic path has
                  actually failed — offering it sooner invites people to email
                  instead of using the check that would have answered them. */}
              {phase.note === 'again' && (
                <a
                  className="uxi-sigchi-help"
                  href={sigchiMismatchMailto({ memberName, memberEmail, triedEmail: lastTried })}
                  onClick={() => track(EVT.offer_sigchi_applied, { percent: SIGCHI_TIER.percent })}
                >
                  Sure you’re a member? Email us and we’ll check by hand
                </a>
              )}
            </form>
          )}

          {phase.s === 'throttled' && (
            <p className="uxi-sigchi-warn" role="alert">
              That’s a lot of tries. Give it a few minutes, then check again.
            </p>
          )}
          {phase.s === 'error' && (
            <p className="uxi-sigchi-warn" role="alert">
              Couldn’t check just now — {phase.message}.{' '}
              <button type="button" className="uxi-sigchi-retry" onClick={startCheck}>
                Try again
              </button>
            </p>
          )}
        </div>
      </section>

      {prize && (
        <SigchiRevealCard
          code={prize.code}
          name={prize.name}
          onClose={() => setPrize(null)}
        />
      )}
    </>
  );
}
