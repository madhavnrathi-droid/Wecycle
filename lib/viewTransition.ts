'use client';

/* ── Card → detail, as one continuous object ───────────────────────────────
 *
 * Tapping a card currently cuts to the detail page. A cut makes the reader
 * re-find what they were looking at: the photo they tapped is now somewhere
 * else, at a different size, and nothing connected the two. Carrying the image
 * across turns "a new screen appeared" into "I opened this thing", which is the
 * whole difference between navigation and teleportation.
 *
 * Built on the View Transitions API rather than hand-animated, because the
 * browser can interpolate between two DOM states that never coexist — which is
 * exactly the case here, since the card unmounts as the detail page mounts.
 * Doing it manually would mean cloning the image into a fixed overlay, tracking
 * both rectangles, and cleaning up when the navigation is interrupted.
 *
 * Three deliberate limits:
 *
 *   ONLY THE IMAGE crosses. Titles, prices and seller rows fade in place. A
 *   page where everything flies is a page that announces itself; carrying one
 *   element says "this became that" and leaves the rest alone.
 *
 *   NO POLYFILL. Where the API is missing the navigation happens instantly,
 *   which is exactly today's behaviour. A transition is an enhancement and must
 *   never be able to delay or break the thing it decorates.
 *
 *   REDUCED MOTION WINS. Someone who has asked for less movement gets the cut,
 *   and gets it without argument.
 */

interface ViewTransitionHandle {
  /* Both of these REJECT when a transition is abandoned, and both must be
     handled — see withViewTransition. */
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
}
type StartViewTransition = (cb: () => void) => ViewTransitionHandle;

function supported(): boolean {
  if (typeof document === 'undefined') return false;
  if (!('startViewTransition' in document)) return false;
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * Run a navigation as a view transition when the browser can, or immediately
 * when it cannot.
 *
 * `update` must perform the state change synchronously — React will flush it,
 * and the browser snapshots before and after.
 */
export function withViewTransition(update: () => void): void {
  if (!supported()) { update(); return; }
  const doc = document as Document & { startViewTransition?: StartViewTransition };
  try {
    const t = doc.startViewTransition!(() => { update(); });

    /* ── Swallow the rejections, or they surface as uncaught ──
     *
     * The try/catch above only ever caught a SYNCHRONOUS throw, and
     * startViewTransition almost never throws synchronously. What it does is
     * return promises that reject when the transition is abandoned — and a
     * transition is abandoned routinely, by design: tapping a second card
     * before the first has settled skips the running one, and so does the tab
     * going to the background mid-navigation.
     *
     * Unhandled, each of those became
     *   Uncaught (in promise) InvalidStateError: Transition was aborted
     *      because of invalid state
     * in the console — three of them in one ordinary sweep of the app. They
     * were harmless to the navigation, which had already happened inside the
     * callback, but an uncaught rejection is not free: it is noise that hides
     * real errors during debugging, and anything wired to
     * `unhandledrejection` reports it as a crash the user never experienced.
     *
     * So both promises get a no-op catch. Nothing is being suppressed that we
     * would otherwise act on — an abandoned decoration needs no recovery, and
     * the state change is not waiting on it. */
    t?.finished?.catch(() => {});
    t?.ready?.catch(() => {});
    t?.updateCallbackDone?.catch(() => {});
  } catch {
    /* Kept for the genuinely synchronous failures — an unsupported call shape,
       or a document that refuses outright. The navigation matters and the
       animation does not. */
    update();
  }
}

/** The name both ends of the transition share.
 *
 *  Per LISTING, not per screen: two different cards must not claim the same
 *  name or the browser has no way to know which one became the detail image,
 *  and it refuses the transition outright when a name is duplicated in a single
 *  snapshot. */
export function transitionName(id: string): string {
  /* Must be a valid CSS custom-ident: letters, digits, dashes, underscores.
     Listing ids are UUIDs, which qualify once the dashes are kept and nothing
     else sneaks in. */
  return `post-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * Style props that mark an element as one end of the transition.
 *
 * Applied to the card's image on the feed and to the hero image on the detail
 * screen. `contain: paint` is what lets the browser snapshot the element on its
 * own rather than as part of a larger layer.
 */
export function transitionStyle(id: string | null | undefined): React.CSSProperties {
  if (!id) return {};
  return {
    viewTransitionName: transitionName(id),
    contain: 'paint',
  } as React.CSSProperties;
}
