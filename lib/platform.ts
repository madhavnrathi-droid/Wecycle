import { Capacitor } from '@capacitor/core';

/**
 * Native-vs-web helpers for the Capacitor app.
 *
 * The native build bundles a STATIC export with no `/api` routes, so anything
 * server-backed (currently just the remove.bg proxy) targets the deployed web
 * origin instead of being same-origin. On the web `apiBase()` is '' (same-origin).
 */
export const WEB_ORIGIN = 'https://wecycle-seven.vercel.app';

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/** Prefix for server-route fetches: '' on web, the web origin inside the app. */
export function apiBase(): string {
  return isNativeApp() ? WEB_ORIGIN : '';
}
