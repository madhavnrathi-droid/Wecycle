'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { onToast, toast, type ToastMsg } from '../lib/toast';
import { DUR, EASE, SPRING, reducedMotion } from '../lib/motion';

/* ── The toast, as an object with weight ──
 *
 * It rises from just above the nav on the snappy spring (a 3% overshoot you
 * feel more than see), sits for 3.2 s, and sinks out on the exit curve in two
 * thirds of the time it took to arrive. A swipe down sends it away early, at
 * the speed it was thrown. A replacement doesn't queue behind it: the old one
 * is crossfaded out as the new one lands, so the newest fact is always what's
 * on screen.
 *
 * role="status" + aria-live="polite": announced without stealing focus, and
 * the text alone carries the meaning — the icon is decoration.
 */
export default function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  /* Development only: window.__wecycleToast('…') to see a toast without
     having to post or sell something. Compiled out of production builds. */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __wecycleToast?: typeof toast }).__wecycleToast = toast;
  }, []);

  useEffect(() => onToast(next => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!next) { leave(); return; }
    setMsg(next);
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Arrive, then schedule the leave. Keyed on id so a replacement replays. */
  useEffect(() => {
    if (!msg) return;
    const el = elRef.current;
    if (el && !reducedMotion()) {
      el.animate(
        [{ translate: '0 140%', opacity: 0, scale: '0.96' }, { translate: '0 0', opacity: 1, scale: '1' }],
        { duration: DUR[4], easing: SPRING.snappy },
      );
    }
    timer.current = window.setTimeout(leave, msg.duration ?? 3200);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [msg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function leave() {
    const el = elRef.current;
    if (!el) { setMsg(null); return; }
    const a = el.animate(
      [{ translate: el.style.translate || '0 0', opacity: 1 }, { translate: '0 120%', opacity: 0 }],
      { duration: reducedMotion() ? 120 : DUR[3], easing: EASE.exit, fill: 'forwards' },
    );
    a.finished.catch(() => {}).then(() => setMsg(null));
  }

  /* Swipe down to dismiss. */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = e.currentTarget;
    const y0 = e.clientY;
    let dy = 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (timer.current) window.clearTimeout(timer.current);
    const move = (ev: PointerEvent) => {
      const raw = ev.clientY - y0;
      dy = raw > 0 ? raw : -6 * (1 - Math.exp(raw / 30));
      el.style.translate = `0 ${dy}px`;
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (dy > 28) { leave(); return; }
      el.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: DUR[3], easing: SPRING.snappy });
      el.style.translate = '';
      timer.current = window.setTimeout(leave, 1800);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div className="toaster" role="status" aria-live="polite" aria-atomic="true">
      {msg && (
        <div
          key={msg.id}
          ref={elRef}
          className="toast"
          data-tone={msg.tone}
          onPointerDown={onPointerDown}
        >
          {msg.tone === 'success' && <span className="toast-ico" aria-hidden="true"><Check size={14} strokeWidth={2.6} /></span>}
          {msg.tone === 'error' && <span className="toast-ico" aria-hidden="true"><AlertCircle size={15} strokeWidth={2.2} /></span>}
          <span className="toast-text">{msg.text}</span>
          {msg.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => { msg.action?.onClick(); leave(); }}
            >
              {msg.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
