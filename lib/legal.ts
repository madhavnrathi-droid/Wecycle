/* Opening the Terms and the Privacy Policy from inside the app.
 *
 * On the web an <a target="_blank"> is all this needs. Inside the Capacitor
 * WebView it is not: the app is served from a local bundle, so a RELATIVE href
 * resolves against capacitor://localhost rather than the site, and target=_blank
 * asks for a second window the WKWebView will not create on its own. The link
 * either does nothing at all or opens a blank sheet — which is what happens
 * today when you tap Terms during sign-up in TestFlight.
 *
 * That matters beyond the annoyance. Guideline 1.2 requires the agreement a user
 * accepts before registering to be reachable, and 5.1.1 requires the privacy
 * policy to be reachable in-app. A reviewer tapping either link and getting a
 * blank screen is a rejection, and the reviewer cannot know the text exists.
 *
 * So on native these go through @capacitor/browser, which presents
 * SFSafariViewController over the app — the user stays inside Wecycle and comes
 * back with Done — and they point at the ABSOLUTE https URL, so the reviewer
 * reads the live policy rather than whatever was bundled at build time.
 */

import { Browser } from '@capacitor/browser';
import { isNativeApp, WEB_ORIGIN } from './platform';

export const LEGAL_TERMS = '/terms';
export const LEGAL_PRIVACY = '/privacy';
/** The community rules, which is the section Guideline 1.2 is really about. */
export const LEGAL_RULES = '/terms#rules';

/**
 * Open a legal page.
 *
 * Returns true when it handled the navigation itself, false when the caller
 * should let an ordinary anchor do its job. Written this way so the markup can
 * stay a real <a href> — that keeps cmd-click, right-click "open in new tab",
 * crawlers, and the pre-hydration case all working on the web, and only takes
 * over where the anchor is known not to work.
 */
export async function openLegal(path: string): Promise<boolean> {
  if (!isNativeApp()) return false;

  const url = `${WEB_ORIGIN}${path}`;
  try {
    await Browser.open({ url, presentationStyle: 'popover' });
    return true;
  } catch {
    /* If the plugin is unavailable the policy still has to be reachable —
       an unreachable one is the rejection. window.open with an absolute URL
       is handled by the WebView's navigation delegate and hands off to the
       system browser. */
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* nothing left to try */ }
    return true;
  }
}

/**
 * Props for an anchor that must also work inside the native app.
 *
 * Spread onto an <a>: it keeps the real href and target for the web, and
 * intercepts the click only on native, where that href cannot resolve.
 */
export function legalLinkProps(path: string) {
  return {
    href: path,
    target: '_blank' as const,
    rel: 'noopener noreferrer',
    onClick: (e: React.MouseEvent) => {
      /* stopPropagation because these links sit inside a <label> wrapping the
         terms checkbox — without it, following the link also toggles consent,
         which is the one checkbox that must only ever be set deliberately. */
      e.stopPropagation();
      if (!isNativeApp()) return;
      e.preventDefault();
      void openLegal(path);
    },
  };
}
