'use client';

/* ── Scratch to reveal a discount code ─────────────────────────────────────
 *
 * The code is worth about ₹1,325 off a student pass, and handing it over as
 * plain text makes it feel like a line of config. Scratching it makes the
 * member do one small thing to get it, which is the whole difference between
 * being given something and finding something.
 *
 * It is a real scratch, not a picture of one: the foil is a <canvas> and the
 * pointer erases it with destination-out compositing. Faking it (a mask that
 * jumps at 50%) is obvious the moment somebody scratches slowly.
 *
 * ── Why there is always a button as well ──
 *
 * WCAG 2.5.7 requires a single-pointer alternative to any dragging action, and
 * a scratch is dragging. It is also unreachable by keyboard and meaningless to
 * a screen reader. So "Reveal" sits beside it and does the same job in one
 * press — not a fallback that appears when something fails, but an equal path
 * that is always there. The canvas is aria-hidden and the button owns the
 * accessible name.
 *
 * ── Why it stays revealed ──
 *
 * Scratching is a moment, not a chore. Once a member has uncovered their code
 * it is remembered per code, so coming back to copy it again does not make
 * them earn it a second time. Stored per code rather than per event so that
 * issuing a different code later correctly asks again.
 *
 * ── Reduced motion ──
 *
 * Someone who has asked for less movement gets the code revealed outright: no
 * foil, no tilt, no sheen. The scratch is decoration, and decoration is the
 * first thing to go.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Check, Copy } from 'lucide-react';
import { haptics } from '../lib/haptics';

/** Fraction of foil that must be gone before it clears itself. Chosen by
 *  scratching it: below about a third it clears while the code is still mostly
 *  covered, which feels like it was never scratched at all. */
const CLEAR_AT = 0.38;

/** Radius of the scratch head in CSS px. A fingertip is wider than a cursor,
 *  but one radius for both keeps the erased path continuous either way. */
const SCRATCH_RADIUS = 22;

const revealKey = (code: string) => `wecycle.scratched.${code}`;

function alreadyScratched(code: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(revealKey(code)) === '1'; } catch { return false; }
}

function rememberScratched(code: string) {
  try { localStorage.setItem(revealKey(code), '1'); } catch { /* private mode */ }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * Whether a decorative tween may run at all.
 *
 * Not just "does the member want motion" — also "can motion actually happen".
 * GSAP is driven by requestAnimationFrame, which is paused while the document
 * is hidden. A tween started in that state applies its FROM values and then
 * never advances, so `fromTo(code, {opacity: .5}, {opacity: 1})` left the code
 * permanently half-faded. Anything that begins by making an element wrong and
 * relies on frames to make it right has to be skipped outright when there are
 * no frames.
 */
function canAnimate(): boolean {
  if (typeof document === 'undefined') return false;
  if (prefersReducedMotion()) return false;
  return document.visibilityState === 'visible';
}

export interface ScratchCodeProps {
  code: string;
  /** Small line above the code, e.g. "25% off · Wecycle members". */
  label: string;
  /** Called once, the first time it is revealed. */
  onReveal?: () => void;
  onCopy?: () => void;
}

export default function ScratchCode({ code, label, onReveal, onCopy }: ScratchCodeProps) {
  const [revealed, setRevealed] = useState(false);
  /* Tracked apart from `revealed` so the foil can animate OUT after the code
     is already, truthfully, revealed. See finish(). */
  const [foilVisible, setFoilVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  /* Guards the reveal so a scratch that crosses the threshold mid-stroke
     cannot fire the animation on every subsequent move event. */
  const settled = useRef(false);

  /* Mount decides the starting state: an already-scratched code, or someone
     who has asked for less motion, skips straight to the answer. Read on the
     client only — localStorage and matchMedia do not exist on the server. */
  useEffect(() => {
    const skip = alreadyScratched(code) || prefersReducedMotion();
    if (skip) { settled.current = true; setRevealed(true); setFoilVisible(false); }
    setReady(true);
  }, [code]);

  /* ── Paint the foil ── */
  const paintFoil = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const { width, height } = wrap.getBoundingClientRect();
    if (!width || !height) return;

    /* Back the canvas at device resolution or the foil looks soft against the
       type underneath it. */
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    /* Ember: orange burning down into near-black, on the diagonal so the
       sheen that sweeps across on reveal has somewhere to travel. */
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#F59E0B');
    g.addColorStop(0.42, '#EA580C');
    g.addColorStop(0.78, '#9A3412');
    g.addColorStop(1, '#1A0F06');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    /* A little grain, so it reads as foil rather than as a gradient rectangle.
       Sparse on purpose — dense noise over orange turns to mud. */
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < Math.round((width * height) / 900); i++) {
      ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 12px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scratch to reveal', width / 2, height / 2 + 4);
  }, []);

  useEffect(() => {
    if (!ready || !foilVisible || revealed) return;
    paintFoil();
    const onResize = () => paintFoil();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ready, foilVisible, revealed, paintFoil]);

  /* ── The reveal ── */
  const finish = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    rememberScratched(code);
    haptics.success();

    /* STATE FIRST, ANIMATION SECOND — never the other way round.
     *
     * This used to reveal the code inside gsap's onComplete, which quietly made
     * the outcome depend on the animation finishing. GSAP's ticker is driven by
     * requestAnimationFrame, and rAF does not run while the document is hidden:
     * background the app mid-scratch and the code stayed under the foil until
     * you came back. Caught on a hidden preview pane, where the reveal never
     * fired at all and the erased canvas sat there at 100% scratched.
     *
     * So the member is considered to have their code the instant they earn it.
     * The button becomes Copy, the accessible name updates, and nothing about
     * that is contingent on a decoration being able to run. */
    setRevealed(true);
    onReveal?.();

    const canvas = canvasRef.current;
    const codeEl = codeRef.current;

    if (!canAnimate() || !canvas) {
      setFoilVisible(false);
      return;
    }

    /* Foil lifts and blows out; the code lands a beat later so the two read as
       cause and effect rather than as one crossfade. Purely decorative now. */
    gsap.to(canvas, {
      opacity: 0, scale: 1.06, filter: 'blur(6px)',
      duration: 0.42, ease: 'power2.out',
    });
    if (codeEl) {
      gsap.fromTo(codeEl,
        { scale: 0.94, opacity: 0.5 },
        { scale: 1, opacity: 1, duration: 0.5, delay: 0.12, ease: 'back.out(1.7)' });
    }
    /* setTimeout, not the tween's onComplete: timers still fire when the
       document is hidden, so the foil is always removed even if the animation
       never got a frame to run in. */
    window.setTimeout(() => setFoilVisible(false), 460);
  }, [code, onReveal]);

  /** How much foil has been erased. Sampled on a grid rather than per-pixel —
   *  a full getImageData scan on every pointer move drops frames on a phone. */
  const erasedFraction = useCallback((): number => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return 0;
    const step = 8;
    const { width, height } = canvas;
    let clear = 0, total = 0;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        total++;
        if (data[(y * width + x) * 4 + 3] < 24) clear++;
      }
    }
    return total ? clear / total : 0;
  }, []);

  const scratchAt = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = SCRATCH_RADIUS * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const from = lastPt.current;
    ctx.beginPath();
    if (from) { ctx.moveTo(from.x, from.y); ctx.lineTo(x, y); ctx.stroke(); }
    ctx.arc(x, y, SCRATCH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    lastPt.current = { x, y };
  }, []);

  const pointTo = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (revealed || settled.current) return;
    drawing.current = true;
    lastPt.current = null;
    /* Capture here — unlike the feed's tap guard, this element WANTS every
       move even when the finger wanders outside it, and it is not inside a
       scroller competing for the gesture. */
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = pointTo(e);
    scratchAt(p.x, p.y);
    haptics.selection();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || revealed || settled.current) return;
    const p = pointTo(e);
    scratchAt(p.x, p.y);
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
    if (!settled.current && erasedFraction() >= CLEAR_AT) finish();
  };

  /* ── 3D tilt ── */
  const onTilt = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap || !canAnimate() || e.pointerType === 'touch') return;
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    /* Six degrees. Enough to read as a physical object catching the light,
       little enough that the code underneath stays square to the eye. */
    gsap.to(wrap, {
      rotateY: px * 6, rotateX: -py * 6,
      duration: 0.4, ease: 'power2.out', transformPerspective: 700,
    });
  };
  const resetTilt = () => {
    if (!wrapRef.current) return;
    gsap.to(wrapRef.current, { rotateX: 0, rotateY: 0, duration: 0.6, ease: 'power3.out' });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      haptics.success();
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can be refused (insecure context, denied permission). Select
         the text so it can be copied by hand rather than pretending it worked. */
      const el = codeRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  if (!ready) {
    /* Server and first client paint agree on this, so the foil never flashes
       over a code that was already scratched. */
    return <div className="scratch" aria-hidden="true" />;
  }

  return (
    <div className="scratch-row">
      <div
        ref={wrapRef}
        className="scratch"
        data-revealed={revealed || undefined}
        onPointerMove={onTilt}
        onPointerLeave={resetTilt}
      >
        <div ref={codeRef} className="scratch-code">
          <span className="scratch-label">{label}</span>
          <span className="scratch-value">{code}</span>
        </div>

        {foilVisible && (
          <canvas
            ref={canvasRef}
            className="scratch-foil"
            data-spent={revealed || undefined}
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
      </div>

      {revealed ? (
        <button type="button" className="scratch-btn" onClick={copy}
          aria-label={`Copy discount code ${code}`}>
          {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      ) : (
        /* The equal path, not a fallback. Reachable by keyboard, announced by
           screen readers, and the only way in for anyone who cannot drag. */
        /* Quieter than Copy on purpose. It has to be present and fully
           operable — it is the non-dragging path, not a fallback — but the foil
           is the invitation, and two solid orange blocks side by side would
           make the scratch look like the long way round. Same size, same
           target, less shout. */
        <button type="button" className="scratch-btn scratch-btn--ghost" onClick={finish}
          aria-label="Reveal discount code">
          <span>Reveal</span>
        </button>
      )}
    </div>
  );
}
