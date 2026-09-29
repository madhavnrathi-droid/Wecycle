'use client';

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
