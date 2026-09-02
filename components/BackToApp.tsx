'use client';

/* The "← Back to Wecycle" control shared by every standalone legal page
 * (/terms, /privacy, /copyright, /support, /mission, /delete-account).
 *
 * It replaces a bare `<a href="/">` that had three separate problems, all of
 * them visible on a phone:
 *
 *   1. It sat under the status bar. The root layout ships
 *      viewport-fit=cover with a black-translucent status bar, so the page
 *      genuinely extends behind the clock — and the pages only had a flat 32px
 *      of top padding, which on a notched iPhone puts the link squarely
 *      underneath the time. Unreadable, and untappable: the status bar eats
 *      the touch before the page sees it.
 *
 *   2. The tap target was a 14px line of text with no padding — around 17px
 *      tall against the 44pt minimum in Apple's HIG. Even clear of the clock
 *      it was a hard thing to hit.
 *
 *   3. `href="/"` did not go BACK, it went HOME, and those differ here. Every
 *      screen in this app is a client component swapped inside the one route,
 *      so returning to "/" reboots the SPA at the feed. Someone who opened
 *      Terms from the sign-up form — the exact path App Review takes — lost
 *      the half-filled form and landed somewhere else entirely.
 *
 * So: honour real history when there is any, fall back to "/" when there
 * isn't (these pages are also opened in a fresh tab, where back has nowhere to
 * go), and stay a real anchor so it still works before hydration and on a
 * right-click.
 */

import { useEffect, useState } from 'react';

export default function BackToApp() {
  /* Whether a same-tab history entry exists to return to. Resolved after mount
     because it cannot be known while server-rendering, and defaulting to false
     keeps the pre-hydration anchor pointing at "/" — the safe answer when this
     page was opened cold in its own tab. */
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    /* Two conditions, and both matter. A history length above 1 means this tab
       has somewhere to go back to, but that somewhere could be another site
       (someone following a link to our policy from elsewhere), and bouncing a
       visitor off Wecycle is not what this control promises. A same-origin
       referrer confirms the previous entry is ours. When the referrer is blank
       — a fresh tab from target=_blank, which is how Settings opens these —
       there is no prior entry of ours and "/" is correct. */
    try {
      const sameOrigin = document.referrer
        && new URL(document.referrer).origin === window.location.origin;
      setCanGoBack(window.history.length > 1 && Boolean(sameOrigin));
    } catch {
      setCanGoBack(false);
    }
  }, []);

  return (
    <a
      href="/"
      onClick={e => {
        if (!canGoBack) return;   /* let the anchor navigate to "/" */
        e.preventDefault();
        window.history.back();
      }}
      style={{
        /* Inline-flex with real padding: the pill IS the hit area, so the
           whole thing is tappable rather than just the glyphs. 44px min-height
           is the HIG floor, and the horizontal padding takes the width well
           past it. */
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        padding: '10px 16px 10px 12px',
        margin: '0 0 4px -12px',   /* pull the fill back so the TEXT stays optically flush left */
        borderRadius: 999,
        background: 'rgba(92, 122, 0, 0.08)',
        color: '#4A6300',
        textDecoration: 'none',
        fontSize: 'calc(15px * var(--text-scale))',
        fontWeight: 600,
        lineHeight: 1,
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 140ms ease',
      }}
    >
      {/* Drawn rather than typed. The old label opened with a literal "←", and
          that character renders at wildly different weights across fonts —
          hairline next to a 600-weight label on the system stack. A stroked
          SVG matches the text weight and scales with it. */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        style={{ flexShrink: 0 }}>
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to Wecycle
    </a>
  );
}
