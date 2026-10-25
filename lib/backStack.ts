'use client';

/* ── One back stack for the whole app ──────────────────────────────────────
 *
 * Wecycle is one URL with screens and overlays drawn over it, and for most of
 * its life it never told the browser about any of them. So "back" — the
 * browser's button, a mouse's thumb button, Android's back gesture, the
 * hardware key — had nothing to go back to: on the web it left the site from
 * three screens deep, and on Android it closed the app from inside a chat.
 *
 * Every native platform has ONE back stack that everything open is on, in the
 * order it was opened, and back always closes the top of it. This is that:
 *
 *   • Anything that can be "gone back from" — a post, a profile, a chat, a
 *     sheet, the drawer, a non-Home tab — registers a LAYER while it is open
 *     (useBackLayer). Layers stack in the order they open.
 *   • The manager keeps one history entry per open layer. When a layer opens,
 *     an entry is pushed; when the app closes one itself (its own back button,
 *     Escape, a tap on the backdrop) the spare entry is taken back off. The
 *     browser's history and the app's stack never disagree for long — the
 *     reconcile step runs after every change and only ever moves history by
 *     the difference.
 *   • When the BROWSER goes back (any of the ways above), the topmost layer's
 *     close() runs — the same function its own back button calls. If it
 *     declines to close (a "Discard your changes?" confirm), its entry is put
 *     back, so the next press asks again rather than skipping past it.
 *
 * On Android the hardware/gesture back arrives through Capacitor's App plugin.
 * With layers open it walks the same history; at the root it backgrounds the
 * app, which is what Android 12+ does for every launcher app.
 *
 * A layer may carry a URL (a post is `?p=<id>`, a profile `?u=<id>`), so on the
 * web the address bar names what is on screen, and copying it shares that.
 *
 * Next.js 13's app router reloads the page on any popstate whose entry it did
 * not create. Our entries are caught in the capture phase and stopped before it
 * sees them, and each carries Next's own state too, so if one ever does reach
 * it, it restores instead of reloading.
 */

import { useEffect, useRef } from 'react';

interface Layer {
  id: number;
  close: () => void;
  url?: () => string | null | undefined;
}

type HistState = Record<string, unknown> & { wcd?: number };

const layers: Layer[] = [];
let seq = 0;
/** Our entries above the base entry that history currently holds. */
let depth = 0;
/** A history.go() of ours is in flight; its popstate is not the user's. */
let pending = false;
let scheduled = false;
let installed = false;
let baseUrl = '';
/** True while handling a back that came from outside the app's own UI. */
let external = false;

function canUse(): boolean {
  return typeof window !== 'undefined' && typeof window.history?.pushState === 'function';
}

function currentUrl(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

/** The URL history should show with `n` layers open: the nearest layer at or
 *  below n that names one, else the base page. */
function urlAt(n: number): string {
  for (let i = n - 1; i >= 0; i--) {
    const u = layers[i]?.url?.();
    if (u) return u;
  }
  return baseUrl;
}

function stateFor(n: number): HistState {
  /* Carry Next's router state (__NA, tree) so its own handler, if it ever sees
     one of ours, restores instead of reloading. */
  const prev = (window.history.state ?? {}) as HistState;
  return { ...prev, wcd: n };
}

function reconcile() {
  scheduled = false;
  if (!canUse() || pending) return;
  const want = layers.length;
  if (depth < want) {
    for (let i = depth + 1; i <= want; i++) window.history.pushState(stateFor(i), '', urlAt(i));
    depth = want;
  } else if (depth > want) {
    pending = true;
    window.history.go(want - depth);
  } else {
    const url = urlAt(depth);
    if (url !== currentUrl()) window.history.replaceState(stateFor(depth), '', url);
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  /* After React finishes the commit that opened or closed things, so a screen
     that replaces another (close one, open one) nets out to a replace rather
     than a back-then-push race. */
  setTimeout(reconcile, 0);
}

function onPop(e: PopStateEvent) {
  const st = e.state as HistState | null;
  const ours = !!st && typeof st.wcd === 'number';
  /* A popstate into an entry with no depth of ours is the base page (or an
     entry Next rewrote); treat it as one step back. */
  const d = ours ? (st!.wcd as number) : Math.max(0, depth - 1);
  /* Ours — keep Next's router from reloading the page over it. */
  if (ours || layers.length) e.stopImmediatePropagation();
  depth = d;
  if (pending) {
    pending = false;
    schedule();
    return;
  }
  if (d < layers.length) {
    /* The browser went back: close what is above the new depth, top first. */
    external = true;
    try {
      const closing = layers.slice(d).reverse();
      for (const l of closing) l.close();
    } finally {
      external = false;
    }
  }
  schedule();
}

/** Install once, on the client. */
export function installBackStack() {
  if (installed || !canUse()) return;
  installed = true;
  baseUrl = currentUrl();
  const st = window.history.state as HistState | null;
  /* A reload from a deep entry: the layers it described are gone, so walk
     history back to the base on the first reconcile. */
  depth = st && typeof st.wcd === 'number' ? st.wcd : 0;
  if (depth === 0) window.history.replaceState(stateFor(0), '', baseUrl);
  window.addEventListener('popstate', onPop, true);
  if (depth > 0) schedule();
  void installNativeBack();
}

/** Strip query params from the page's base URL (deep-link params once used). */
export function setBaseUrl(url: string) {
  baseUrl = url;
  if (canUse() && depth === 0 && !pending) window.history.replaceState(stateFor(0), '', url);
  else schedule();
}

/** Did the current close come from the browser/OS rather than the app's UI?
 *  iOS Safari animates its own swipe-back, so screens skip theirs. */
export function backIsExternal(): boolean {
  return external;
}

/** Programmatic back, as if the system back were pressed. */
export function goBack(): boolean {
  if (!layers.length) return false;
  if (canUse() && depth > 0 && !pending) { window.history.back(); return true; }
  layers[layers.length - 1].close();
  return true;
}

export function openLayerCount(): number {
  return layers.length;
}

/* ── Android's back key / gesture ── */
async function installNativeBack() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      if (goBack()) return;
      /* At the root: background the app, as Android does for launcher apps. */
      const app = App as unknown as { minimizeApp?: () => Promise<void> };
      if (app.minimizeApp) void app.minimizeApp(); else void App.exitApp();
    });
  } catch { /* not native, or the plugin is missing — the web path covers it */ }
}

/* ── Registering a layer ── */

/** Put something on the back stack; returns the function that takes it off.
 *  `close` is what Back does. useBackLayer below is the usual way in. */
export function addBackLayer(close: () => void, url?: () => string | null | undefined): () => void {
  installBackStack();
  const layer: Layer = { id: ++seq, close, url };
  layers.push(layer);
  schedule();
  return () => {
    const i = layers.indexOf(layer);
    if (i >= 0) layers.splice(i, 1);
    schedule();
  };
}

/**
 * While `active`, this thing is a step the back button can undo.
 * `close` is what Back does (the same as the thing's own back/close button).
 * `url`, when given, is shown in the address bar while it is the top layer.
 */
export function useBackLayer(active: boolean, close: () => void, url?: string | null) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const urlRef = useRef(url);
  urlRef.current = url;
  useEffect(() => {
    if (!active) return;
    return addBackLayer(() => closeRef.current(), () => urlRef.current);
  }, [active]);
  /* A layer whose URL changes while open (a post replaced in place). */
  useEffect(() => { if (active) schedule(); }, [active, url]);
}

/** Test seam. */
export const __backStackForTests = {
  layers,
  reset: () => { layers.length = 0; depth = 0; pending = false; scheduled = false; installed = false; external = false; baseUrl = ''; },
};
