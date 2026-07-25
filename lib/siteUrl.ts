/* The canonical public origin of the deployed web app — ONE place.
 *
 * Used for absolute URLs that can't be derived from `window.location`:
 *   - OG/Twitter image + canonical resolution (app/layout.tsx metadataBase)
 *   - the API base the NATIVE app calls (lib/platform.ts) — the Capacitor
 *     build bundles a static export with no /api routes of its own
 *
 * Everything user-facing (share links, /s/:id deep links, auth redirects)
 * derives from `window.location.origin` at runtime, so those follow whatever
 * domain the app is served from without any config.
 *
 * Override per-environment with NEXT_PUBLIC_SITE_URL (e.g. a staging domain).
 * No trailing slash.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://wecycle.page'
).replace(/\/+$/, '');
