'use client';

/*
 * Haptics — one semantic API for tactile feedback across every platform
 * Wecycle ships on (web PWA, Android Chrome, iOS via the Expo WebView shell).
 *
 * THE iOS PROBLEM
 * ---------------
 * iOS Safari (and therefore an installed PWA) does NOT support the Web
 * Vibration API at all — `navigator.vibrate` is undefined. So a pure-web
 * haptic call silently no-ops on the exact platform where users most expect
 * the Taptic Engine.
 *
 * THE FIX
 * -------
 * When Wecycle runs inside a React-Native WebView wrapper (an earlier Expo
 * shell used this; the Capacitor shell doesn't need it), the page can talk
 * to the native layer via `window.ReactNativeWebView`.
 * We post a small JSON message; the Expo side catches it and calls
 * `expo-haptics`, which drives the real Taptic Engine. So:
 *
 *   - Native iOS (Expo shell)   → real Taptic Engine via expo-haptics
 *   - Android Chrome / PWA      → Web Vibration API
 *   - Desktop / unsupported     → silent no-op
 *
 * Components never need to know which path applies — they just call
 * `haptics.selection()`, `haptics.success()`, etc.
 *
 * The semantic names mirror Apple's UIFeedbackGenerator vocabulary so the
 * native bridge maps 1:1 onto iOS feedback styles.
 */

type HapticStyle =
  | 'selection'   /* light tick — tab switch, toggle, slider step */
  | 'light'       /* subtle bump — card tap, minor confirm */
  | 'medium'      /* standard press — button commit */
  | 'heavy'       /* deliberate — destructive confirm */
  | 'success'     /* notification: success — post created, saved */
  | 'warning'     /* notification: warning — validation issue */
  | 'error';      /* notification: error — failed action */

/* Web Vibration API durations (ms). Tuned to feel like iOS, not a buzzer:
 * short, crisp taps — never a long drone. Notification styles use a tiny
 * 2-pulse pattern so success/error feel distinct from a plain tap. */
const WEB_PATTERN: Record<HapticStyle, number | number[]> = {
  selection: 3,
  light: 6,
  medium: 10,
  heavy: 16,
  success: [8, 40, 12],
  warning: [10, 50, 10],
  error: [12, 40, 12, 40, 12],
};

interface ReactNativeWebViewBridge {
  postMessage: (msg: string) => void;
}

function getRNBridge(): ReactNativeWebViewBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ReactNativeWebView?: ReactNativeWebViewBridge };
  return w.ReactNativeWebView ?? null;
}

/** Master switch — lets Settings disable haptics globally later. Defaults on. */
let enabled = true;
export function setHapticsEnabled(on: boolean) { enabled = on; }

function fire(style: HapticStyle) {
  if (!enabled || typeof window === 'undefined') return;

  /* 1. Native bridge first — this is the ONLY path that works on iOS. */
  const bridge = getRNBridge();
  if (bridge) {
    try {
      bridge.postMessage(JSON.stringify({ type: 'haptic', style }));
      return; /* native handled it; don't also web-vibrate */
    } catch { /* fall through to web */ }
  }

  /* 2. Web Vibration API — Android Chrome + some PWAs. */
  const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate === 'function') {
    try { nav.vibrate(WEB_PATTERN[style]); } catch { /* swallow */ }
  }
  /* 3. Unsupported (desktop, iOS Safari without Expo shell) → no-op. */
}

/* ── The rule that matters most: browsing is silent ────────────────────────
 *
 * Nothing in the scroll–look–open loop fires a haptic. Not opening a card, not
 * scrolling a rail, not landing on a detail page. That is the single most
 * frequent thing anyone does in this app, and a buzz on every one of them turns
 * the phone into a noisy object people put down — Android's own guidance is
 * blunt that less is more, and Apple's is that a haptic needs a clear cause.
 *
 * Feedback is reserved for moments where something CHANGED and the change is
 * worth confirming without looking: a save landed, a post went up, an action
 * failed. If a new call site is about navigation or browsing, the correct
 * haptic is none.
 *
 * The names below are intents, not intensities. Call sites should say what
 * happened — `haptics.favorite()` — rather than how hard to buzz, so the
 * strength of any one moment can be retuned here without hunting through
 * components. */
export const haptics = {
  /** Tab switches, segmented controls, toggles, slider detents. */
  selection: () => fire('selection'),
  /** A card tap, opening a sheet, a minor affirmative. */
  light: () => fire('light'),
  /** A primary button commit. */
  medium: () => fire('medium'),
  /** Destructive confirmations (delete). */
  heavy: () => fire('heavy'),
  /** Post created, RSVP confirmed, transaction done — a real completion. */
  success: () => fire('success'),
  /** Form validation problem, soft block. */
  warning: () => fire('warning'),
  /** A request that failed. */
  error: () => fire('error'),

  /* ── Intent-named events ── */

  /** Hearting a listing. Deliberately NOT success: a save is a bookmark, not
   *  an achievement, and the two-pulse success pattern made tapping a heart
   *  feel like completing a purchase. Un-hearting is quieter still. */
  favorite: (on = true) => fire(on ? 'light' : 'selection'),
  /** Crossing the pull-to-refresh threshold — the tick that says "let go now". */
  refresh: () => fire('selection'),
  /** A bottom sheet snapping to a detent. */
  snap: () => fire('light'),
  /** A long-press opening a contextual menu. */
  longPress: () => fire('light'),
};
