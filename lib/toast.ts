'use client';

/* ── Toasts: one quiet sentence that something worked ──────────────────────
 *
 * The app had a different ad-hoc toast in each screen that needed one. This is
 * the shared one: call `toast('Link copied')` from anywhere, and <Toaster/>
 * (mounted once in app/page.tsx) shows it.
 *
 * One at a time. A new toast replaces the current one rather than stacking —
 * a pile of confirmations is a log, not feedback. Text says what happened, in
 * the past tense, with no exclamation marks ("Saved", "Link copied", "Live in
 * Manipal (MAHE)").
 */
export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastMsg {
  id: number;
  text: string;
  tone: ToastTone;
  /** An optional single action ("View", "Undo"). */
  action?: { label: string; onClick: () => void };
  /** ms on screen; default 3200, longer when there is an action to reach. */
  duration?: number;
}

type Listener = (t: ToastMsg | null) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function toast(text: string, opts: { tone?: ToastTone; action?: ToastMsg['action']; duration?: number } = {}) {
  const msg: ToastMsg = {
    id: ++seq,
    text,
    tone: opts.tone ?? 'neutral',
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 4800 : 3200),
  };
  listeners.forEach(l => l(msg));
}

export function dismissToast() {
  listeners.forEach(l => l(null));
}

export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
