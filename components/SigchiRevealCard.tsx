'use client';

/* ── The moment a SIGCHI membership is confirmed ───────────────────────────
 *
 * A verified member has just been recognised by name from a roster they never
 * saw, and the reward is a string of fourteen characters. Rendering that as a
 * new paragraph in the panel would be accurate and completely flat, so it
 * arrives as its own card: it swings in on the vertical axis, settles, and the
 * code is under foil to be scratched off.
 *
 * ── WHY IT IS A SEPARATE SURFACE ──
 *
 * Not for spectacle. The check happens inside a panel that is already dense —
 * a heading, the members' 25% code, a Book button, the SIGCHI line — and
 * dropping a second code into it produces two discount codes stacked on one
 * card, which is the one arrangement guaranteed to make somebody use the wrong
 * one. Lifting the 35% out into its own surface makes it unmistakably THE
 * answer, and closing it returns you to the page you were on.
 *
 * ── THE ANIMATION MAY NEVER DECIDE ANYTHING ──
 *
 * Same discipline as ScratchCode, for the same reason. GSAP runs on
 * requestAnimationFrame and rAF is paused while the document is hidden, so
 * anything that begins by putting an element in a WRONG state and relies on
 * frames to correct it will strand it there. Here that would be a card frozen
 * edge-on at rotateY(-95deg) — an invisible sliver, with the member's code
 * inside it.
 *
 * So: the final state is what the CSS says, the from-state is only ever
 * applied when frames are known to be running, and a timer clears the
 * transform regardless of whether a single frame arrived.
 */

import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowUpRight, BadgeCheck, X } from 'lucide-react';
import EmberShader from './EmberShader';
import ScratchCode from './ScratchCode';
import { SIGCHI_TIER, UX_INDIA_EVENT, UX_INDIA_TICKETS_URL } from '../lib/eventOffer';
import { lockBodyScroll } from '../lib/bodyLock';
import { track, EVT } from '../lib/analytics';

function canAnimate(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch { /* treat as allowed */ }
  return document.visibilityState === 'visible';
}

/** First name only. "You're on the list, Samaavrutha Dhananjaya" reads like a
 *  form letter; the first name reads like being recognised. */
function firstName(full: string | null): string | null {
  if (!full) return null;
  const f = full.trim().split(/\s+/)[0];
  return f ? f : null;
}

export interface SigchiRevealCardProps {
  code: string;
  /** From the roster, so it is only ever the name of the person who matched. */
  name: string | null;
  onClose: () => void;
}

export default function SigchiRevealCard({ code, name, onClose }: SigchiRevealCardProps) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Where focus came from, so it can be put back. */
  const returnTo = useRef<Element | null>(null);

  const close = useCallback(() => { onClose(); }, [onClose]);

  useEffect(() => {
    returnTo.current = document.activeElement;
    const unlock = lockBodyScroll();
    /* Focus the close button rather than the card: it is the one control that
       is certain to be operable, and it names the escape route for a screen
       reader before describing the prize. */
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      const back = returnTo.current;
      if (back instanceof HTMLElement) { try { back.focus(); } catch { /* gone */ } };
    };
  }, [close]);

  /* ── Entrance ── */
  useEffect(() => {
    const card = cardRef.current;
    const scrim = scrimRef.current;
    if (!card) return;

    if (!canAnimate()) return;   // CSS already has it at its final state

    const tl = gsap.timeline();
    if (scrim) tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0);
    tl.fromTo(card,
      /* Edge-on and slightly below, so it reads as a physical card being
         turned face-up rather than a box that faded in. */
      { rotateY: -88, rotateX: 8, y: 26, scale: 0.9, opacity: 0 },
      {
        rotateY: 0, rotateX: 0, y: 0, scale: 1, opacity: 1,
        duration: 0.72, ease: 'power3.out', transformPerspective: 1100,
      }, 0.04);

    /* The safety net. If frames stop arriving part-way through — the tab goes
       to the background mid-swing — this clears the transform outright so the
       card is never left edge-on with the code inside it. Timers fire when
       rAF does not. */
    const settle = window.setTimeout(() => {
      tl.kill();
      gsap.set(card, { rotateY: 0, rotateX: 0, y: 0, scale: 1, opacity: 1, clearProps: 'transform' });
      if (scrim) gsap.set(scrim, { opacity: 1 });
    }, 900);

    return () => { window.clearTimeout(settle); tl.kill(); };
  }, []);

  const who = firstName(name);

  return (
    <div
      ref={scrimRef}
      className="sigchi-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sigchi-reveal-title"
      /* Backdrop dismiss, but only when the backdrop itself is the target —
         a pointer-up that started inside the card must not close it. */
      onPointerDown={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div ref={cardRef} className="sigchi-card">
        <EmberShader className="sigchi-card-bg" />
        {/* Between the shader and the words. The shader drifts, and the one
            thing it is not allowed to do is take the contrast of the text with
            it as it moves. */}
        <div className="sigchi-card-veil" aria-hidden="true" />

        <button
          ref={closeRef}
          type="button"
          className="sigchi-card-close"
          onClick={close}
          aria-label="Close"
        >
          <X size={16} strokeWidth={2.2} />
        </button>

        <div className="sigchi-card-body">
          <span className="sigchi-card-verified">
            <BadgeCheck size={13} strokeWidth={2.4} aria-hidden="true" />
            SIGCHI member verified
          </span>

          <h2 id="sigchi-reveal-title" className="sigchi-card-title">
            {who ? <>Found you, {who}.</> : <>You&rsquo;re on the list.</>}
          </h2>

          <p className="sigchi-card-sub">
            <strong>{SIGCHI_TIER.percent}% off</strong> the {SIGCHI_TIER.appliesTo}
            {' '}at {UX_INDIA_EVENT.presenter}.
          </p>

          <ScratchCode
            code={code}
            label={`${SIGCHI_TIER.percent}% off · SIGCHI member`}
            onReveal={() => track(EVT.offer_code_revealed, { tier: 'sigchi', percent: SIGCHI_TIER.percent })}
            onCopy={() => track(EVT.offer_code_copied, { tier: 'sigchi', percent: SIGCHI_TIER.percent })}
          />

          <a
            className="sigchi-card-cta"
            href={UX_INDIA_TICKETS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track(EVT.offer_tickets_opened, { source: 'sigchi_reveal' })}
          >
            <span>Book on {UX_INDIA_EVENT.presenter}</span>
            <ArrowUpRight size={15} strokeWidth={2.2} aria-hidden="true" />
          </a>

          {/* The order of operations, which is the one thing people get wrong.
              Copy first, then book — the other way round means paying full
              price and being annoyed at us rather than pleased. */}
          <p className="sigchi-card-note">
            Copy the code first, then apply it at checkout on ux-india.org.
          </p>
        </div>
      </div>
    </div>
  );
}
