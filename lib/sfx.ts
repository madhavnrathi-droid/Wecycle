'use client';

import { getSettings } from './settings';

/*
 * Tiny Web-Audio sound design — no asset files, synthesised on the fly.
 *
 * Tasteful, "positive but not childish" UI cues:
 *   • sfxOpen()  — a soft two-note bloom when the share card materialises
 *   • sfxShare() — a clean ascending major triad (C–E–G) on a successful share
 *   • sfxTap()   — a quiet click for secondary actions (save / copy)
 *
 * Kept low-gain and short so it reads as polish, not a toy. Honours
 * prefers-reduced-motion as a proxy for "reduce non-essential effects".
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function reduceMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** One enveloped oscillator note. */
function note(
  c: AudioContext,
  freq: number,
  startOffset: number,
  dur: number,
  gain = 0.05,
  type: OscillatorType = 'sine',
) {
  const t = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.connect(g);
  g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Soft bloom — card appears. */
export function sfxOpen() {
  if (reduceMotion()) return;
  const c = audio();
  if (!c) return;
  note(c, 523.25, 0, 0.20, 0.045, 'sine');   // C5
  note(c, 784.0, 0.045, 0.26, 0.04, 'sine');  // G5
}

/** Bright ascending triad — share succeeded. */
export function sfxShare() {
  const c = audio();
  if (!c) return;
  note(c, 523.25, 0, 0.22, 0.05, 'triangle');  // C5
  note(c, 659.25, 0.085, 0.24, 0.046, 'triangle'); // E5
  note(c, 987.77, 0.17, 0.42, 0.044, 'triangle');  // B5 — open, hopeful
}

/** Quiet click — save / copy. */
export function sfxTap() {
  if (reduceMotion()) return;
  const c = audio();
  if (!c) return;
  note(c, 660, 0, 0.07, 0.03, 'sine');
}

/** A message left — a short, soft upward blip. Only when the member has
 *  chat sounds on (Settings → Notifications → Sound); a sound on every send
 *  nobody asked for is an interruption, not polish. */
export function sfxSend(enabled: boolean) {
  if (!enabled || reduceMotion()) return;
  const c = audio();
  if (!c) return;
  note(c, 880, 0, 0.09, 0.028, 'sine');      // A5
  note(c, 1318.5, 0.05, 0.12, 0.022, 'sine'); // E6
}

/* ══ The action set ═══════════════════════════════════════════════════════════
 *
 * Sounds that answer something the member just did. Six rules, one per line of
 * the function below:
 *
 *   1. They follow appearance.actionSounds — on in the apps, off on the web
 *      unless switched on (see lib/settings.ts for why those differ).
 *   2. Reduced motion is NOT a sound setting, so it no longer silences these;
 *      the switch does.
 *   3. One sound per id per 1.2 s. A double-tap does not get a double chime.
 *   4. Every one is under 650 ms and peaks near or below −22 dBFS (gain ≤ 0.05
 *      per voice), so none of them is louder than a keyboard click.
 *   5. None of them carries information on its own — each arrives with a
 *      visual change and a haptic that already say the same thing.
 *   6. Browsing never makes a sound. Nothing here is called from a scroll, an
 *      open, or a tab switch.
 */

const lastPlayed = new Map<string, number>();

function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export function actionSoundsOn(): boolean {
  try {
    const v = getSettings().appearance.actionSounds;
    return typeof v === 'boolean' ? v : isNativeShell();
  } catch { return false; }
}

function gate(id: string): AudioContext | null {
  if (!actionSoundsOn()) return null;
  const now = Date.now();
  if (now - (lastPlayed.get(id) ?? 0) < 1200) return null;
  lastPlayed.set(id, now);
  return audio();
}

/** A pitch sweep, for the one sound that should feel like a sigh, not a beep. */
function glide(c: AudioContext, f1: number, f2: number, dur: number, gain: number) {
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f1, t);
  osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
  osc.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.03);
}

/** Saved — one soft tick. 660 Hz, 70 ms. */
export function sfxSave() {
  const c = gate('save'); if (!c) return;
  note(c, 660, 0, 0.07, 0.032);
}

/** Your post is live — C5 E5 G5 C6 on a triangle, 60 ms apart. Rising and
 *  resolved: the "it's out there" sound. */
export function sfxLive() {
  const c = gate('live'); if (!c) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    note(c, f, i * 0.06, i === 3 ? 0.42 : 0.24, 0.045, 'triangle'));
}

/** Sold — a G5/B5 dyad, then a D6 bell with a faint octave shimmer. Warmer
 *  and rounder than "live": this one is an ending. */
export function sfxSold() {
  const c = gate('sold'); if (!c) return;
  note(c, 783.99, 0, 0.3, 0.04);
  note(c, 987.77, 0, 0.3, 0.034);
  note(c, 1174.66, 0.12, 0.52, 0.05);
  note(c, 2349.3, 0.12, 0.3, 0.012);
}

/** A reply arrived in the chat you have open — E6 → A6, quieter than send.
 *  Gated by the MESSAGE chime setting, not actionSounds: this announces someone
 *  else's activity, which is exactly the interruption that setting governs. */
export function sfxReceive(enabled: boolean) {
  if (!enabled) return;
  const now = Date.now();
  if (now - (lastPlayed.get('receive') ?? 0) < 1200) return;
  lastPlayed.set('receive', now);
  const c = audio(); if (!c) return;
  note(c, 1318.5, 0, 0.08, 0.024);
  note(c, 1760, 0.06, 0.14, 0.02);
}

/** Something failed — a low, falling sine. Never a buzzer. */
export function sfxError() {
  const c = gate('error'); if (!c) return;
  glide(c, 220, 196, 0.18, 0.032);
}
