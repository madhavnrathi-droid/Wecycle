'use client';

/* The brand's canvas — the top of a brand page. Each brand's in its own
 * motion: Foku's colour cycle (below) or Kinnu's stall (StallCanvas).
 *
 * Built from the brand's own motion, not a stock hero: Foku's animation is its
 * cloud mascot on a field that changes colour every beat — teal, pink,
 * mustard — with the cloud's face cut out so it always shows the colour
 * behind it. This does the same thing, smoothed:
 *
 *   · every few seconds the next brand colour spreads out from the mascot as a
 *     disc (a scale, so it stays on the compositor) and becomes the field;
 *   · the field is never flat: a white light from the top-left and a glow of
 *     the NEXT brand colour from the bottom-right make it a gradient made only
 *     of the brand's colours, and the glow crossfades with the field;
 *   · the mascot bobs, and gives a small squash each time the colour lands —
 *     the colour change is an event, so it gets a reaction (HyperFrames'
 *     "stamp on a state change");
 *   · on arrival the wordmark's letters rise in one after another on a smooth
 *     settle, and only the mascot is allowed to bounce: it is a playful
 *     brand, but one bouncy thing reads as character and five read as a toy.
 *
 * Tapping the mascot moves to the next colour straight away.
 *
 * It stops when it is off screen or the tab is hidden, and under reduced
 * motion it is a still gradient in the first colour — the brand is all there,
 * just not performed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Brand } from '../../lib/brands';
import { haptics } from '../../lib/haptics';
import { reducedMotion } from '../../lib/motion';
import BrandWordmark from './BrandWordmark';

const BEAT_MS = 4200;

interface BrandCanvasProps {
  brand: Brand;
  /** The page's h1 lives here: the wordmark is the brand's name. */
  headingId?: string;
}

export default function BrandCanvas(props: BrandCanvasProps) {
  return props.brand.canvas.kind === 'stall' ? <StallCanvas {...props} /> : <CycleCanvas {...props} />;
}

/* ── Kinnu: the stall ────────────────────────────────────────────────────────
 * Kinnu's intro is a navy field, a red disc in one corner and a marigold one
 * in the other, and the wordmark's letters dropping in at a tilt and landing
 * straight. So: the discs grow out of their corners (their centres ARE the
 * corners, so scaling from the centre is growing from the corner), then
 * breathe very slowly; the letters drop in one after another on a snappy
 * settle; the tagline follows in Kinnu's serif. Tapping the wordmark drops
 * the letters again. Under reduced motion it is all simply there. */
function StallCanvas({ brand, headingId }: BrandCanvasProps) {
  const discs = brand.canvas.kind === 'stall' ? brand.canvas.discs : [];
  const [hop, setHop] = useState(0);
  return (
    <div
      className="bc bc--stall"
      style={{
        ['--bc-ink' as string]: brand.palette.ink,
        ['--bc-c' as string]: brand.palette.fields[0],
      }}
    >
      <div className="bc-base" aria-hidden="true" />
      {discs.map((d, i) => (
        <span key={i} className="bc-disc" data-corner={d.corner} style={{ ['--i' as string]: i }} aria-hidden="true">
          <i style={{ background: d.color }} />
        </span>
      ))}
      <div className="bc-stage">
        <h1 id={headingId} className="bc-title" onClick={() => { haptics.selection(); setHop(h => h + 1); }}>
          <BrandWordmark key={hop} src={brand.assets.wordmark} name={brand.name} ratio={brand.assets.wordmarkRatio} className="bc-wordmark" />
        </h1>
        <p className="bc-tagline">{brand.tagline}</p>
      </div>
    </div>
  );
}

/* ── Foku: the colour cycle (described at the top of the file) ── */
function CycleCanvas({ brand, headingId }: BrandCanvasProps) {
  const fields = brand.palette.fields;
  const n = fields.length;
  const [idx, setIdx] = useState(0);
  /* The colour on its way in, keyed so each wipe is a fresh element. */
  const [wipe, setWipe] = useState<{ to: number; key: number; x: number; y: number } | null>(null);
  const wipeRef = useRef(wipe);
  wipeRef.current = wipe;
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [still, setStill] = useState(true);

  useEffect(() => { setStill(reducedMotion()); }, []);

  const advance = useCallback(() => {
    if (wipeRef.current || n < 2) return;
    seq.current += 1;
    /* The colour comes out of the mascot, wherever the layout put it. */
    const root = rootRef.current?.getBoundingClientRect();
    const m = mascotRef.current?.getBoundingClientRect();
    const x = root && m ? m.left + m.width / 2 - root.left : (root?.width ?? 0) / 2;
    const y = root && m ? m.top + m.height / 2 - root.top : (root?.height ?? 0) * 0.4;
    setWipe({ to: (idxRef.current + 1) % n, key: seq.current, x, y });
  }, [n]);

  /* Visible and in a visible tab — otherwise there is no one to show it to. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (still || !onScreen) return;
    let timer = 0;
    const tick = () => { if (document.visibilityState === 'visible') advance(); };
    /* The first beat waits for the arrival to finish. */
    timer = window.setInterval(tick, BEAT_MS);
    return () => window.clearInterval(timer);
  }, [still, onScreen, advance]);

  /* If a wipe's animationend is ever missed (tab hidden mid-wipe), land it
     anyway rather than freezing the cycle. */
  useEffect(() => {
    if (!wipe) return;
    const t = window.setTimeout(() => { setIdx(wipe.to); setWipe(null); }, 1600);
    return () => window.clearTimeout(t);
  }, [wipe]);

  const land = () => {
    const w = wipeRef.current;
    if (!w) return;
    setIdx(w.to);
    setWipe(null);
  };

  const tapMascot = () => {
    haptics.selection();
    if (still) { setIdx(i => (i + 1) % n); return; }
    advance();
  };

  /* The glow shown is the next colour after the field — during a wipe, the
     one after the incoming colour, so it turns over with the field. */
  const glowFor = wipe ? (wipe.to + 1) % n : (idx + 1) % n;

  return (
    <div
      ref={rootRef}
      className="bc"
      data-still={still || undefined}
      style={{
        ['--bc-ink' as string]: brand.palette.ink,
        ['--bc-c' as string]: fields[idx],
      }}
    >
      <div className="bc-base" aria-hidden="true" />
      {wipe && (
        <div
          key={wipe.key}
          className="bc-wipe"
          aria-hidden="true"
          style={{ ['--bc-c' as string]: fields[wipe.to], left: wipe.x, top: wipe.y }}
          onAnimationEnd={land}
        />
      )}
      <div className="bc-glows" aria-hidden="true">
        {fields.map((c, i) => (
          <span key={c + i} className="bc-glow" data-on={i === glowFor || undefined} style={{ ['--bc-g' as string]: c }} />
        ))}
      </div>
      <div className="bc-light" aria-hidden="true" />

      <div className="bc-stage">
        {/* Decorative: the colour change it triggers carries no information,
            so it stays out of the tab order and the accessibility tree. */}
        {brand.assets.mascot && (
        <div className="bc-mascot-float" aria-hidden="true" ref={mascotRef}>
          <div className="bc-mascot-in">
            {/* Re-keyed on every colour so the squash plays each time it lands. */}
            <span key={idx} className="bc-squash" data-on={seq.current > 0 || undefined}>
              <img
                src={brand.assets.mascot}
                alt=""
                className="bc-mascot"
                draggable={false}
                onClick={tapMascot}
              />
            </span>
          </div>
        </div>
        )}
        <h1 id={headingId} className="bc-title">
          <BrandWordmark src={brand.assets.wordmark} name={brand.name} ratio={brand.assets.wordmarkRatio} className="bc-wordmark" />
        </h1>
        <p className="bc-tagline">{brand.tagline}</p>
      </div>
    </div>
  );
}
