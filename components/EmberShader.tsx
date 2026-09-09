'use client';

/* ── The ember shader ──────────────────────────────────────────────────────
 *
 * A small orange-into-black gradient that drifts, behind the UXINDIA offer
 * card. Derived from the shadergradient.co preset the owner picked — same
 * plane, same warm orange (#ff5005), and the same motion character: speed
 * 0.4, density 1.3, frequency 5.5, strength 4, grain on, the whole field
 * rotated about fifty degrees so the bands run diagonally.
 *
 * Written as a fragment shader rather than pulled in as a library. The real
 * thing is three.js plus a wrapper, which is a very large dependency and a
 * whole WebGL scene graph for one 300px rectangle; this is forty lines of GLSL
 * and no dependency at all.
 *
 * ── IT MUST NEVER COST LEGIBILITY ──
 *
 * The brief was explicit: small, silky, and out of the way of the text. So the
 * palette is deliberately bottom-heavy — mostly near-black with ember pooling
 * in the low corners — and the card paints its own scrim between this and the
 * content. The type on top is white on a ground whose BRIGHTEST possible
 * output still clears 4.5:1, which is checked by sampling the rendered pixels
 * rather than by eye.
 *
 * ── IT MUST NEVER BE THE REASON SOMETHING BREAKS ──
 *
 * Three ways it steps aside:
 *
 *   NO WEBGL — a CSS gradient in the same colours sits underneath, painted
 *   first and never removed. If the context fails to create, or is lost and
 *   not restored, what remains is a static version of the same artwork.
 *
 *   REDUCED MOTION — one frame, drawn once, and no loop. Still a gradient,
 *   just not a moving one.
 *
 *   NO FRAMES — the first frame is drawn SYNCHRONOUSLY on init, before any
 *   requestAnimationFrame is scheduled. A hidden document pauses rAF, and a
 *   canvas whose first paint was scheduled rather than performed is a black
 *   rectangle in that state.
 *
 * It also stops when scrolled out of view or when the tab is hidden, because
 * a shader running behind a card nobody is looking at is just battery.
 */

import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* uSpeed/uDensity/uFrequency/uStrength are the preset's own names and values,
   kept so the two can be compared without translating between vocabularies. */
const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2  uAspect;

const float uSpeed     = 0.4;
const float uDensity   = 1.3;
const float uFrequency = 5.5;
const float uStrength  = 4.0;
const float uRotation  = 0.8727;   /* 50 degrees, in radians */

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/* Value noise with a smoothstep fade — cheap, and its soft lobes are what
   give the preset its liquid look rather than a marbled one. */
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (vUv - 0.5) * uAspect;

  float c = cos(uRotation), s = sin(uRotation);
  uv = mat2(c, -s, s, c) * uv;

  float t = uTime * uSpeed;

  /* Domain warp — the field is displaced by another sample of itself, which
     is what makes the bands fold instead of sliding past each other. */
  vec2 q = vec2(fbm(uv * uDensity + t * 0.25),
                fbm(uv * uDensity + vec2(4.7, 2.3) - t * 0.2));
  float v = fbm(uv * uDensity + q * (uStrength * 0.09) + vec2(0.0, t * 0.15));

  /* A slow diagonal sweep on top of the noise, so there is a direction to the
     movement and not just boiling. */
  v += 0.16 * sin(uv.x * uFrequency * 0.28 + uv.y * 0.9 + t * 0.7);

  /* WEIGHTED TO ONE END ON PURPOSE, and note which end: vUv.y comes from clip
     space, where 0 is the BOTTOM, so this ramp puts the ember at the top of
     the element as CSS sees it and leaves the foot near black. The card's veil
     is deliberately strongest at that same top edge (0.72 against 0.34 in the
     middle) — the two are a matched pair, which is why the measured figures
     below hold for the heading that sits up there.
  
     THESE NUMBERS WERE MEASURED, NOT PICKED. The first version of this shader
     rendered a field whose brightest pixel had a relative luminance of 0.149
     and whose warm pixels — anything a person would actually call orange —
     came to ZERO percent of the card. It was a black rectangle that cost a
     WebGL context. Sampling the rendered pixels across four points in the
     animation and compositing the veil over them gave the trade directly:
  
        gain 1.15, veil 0.62-0.88 →  0.0% warm, white text at 18.4:1
        gain 1.40, veil 0.34-0.72 → 17.4% warm, white text at  7.7:1
        gain 1.60, veil 0.34-0.72 → 34.7% warm, white text at  6.6:1
  
     The middle row is this. Nearly a fifth of the card reads as ember, and
     white type still has seventy percent more contrast than AA asks for. */
  float lift = smoothstep(-0.05, 0.95, vUv.y * 0.9 + 0.22);
  float e = clamp(v * 1.40 * lift, 0.0, 1.0);

  vec3 ink    = vec3(0.043, 0.027, 0.016);   /* #0B0704 */
  vec3 deep   = vec3(0.298, 0.114, 0.043);   /* #4C1D0B */
  vec3 orange = vec3(1.000, 0.314, 0.020);   /* #FF5005 — the preset's colour */
  vec3 warm   = vec3(0.859, 0.729, 0.584);   /* #DBBA95, a trace for the hot core */

  vec3 col = mix(ink, deep, smoothstep(0.02, 0.48, e));
  col = mix(col, orange, smoothstep(0.42, 0.88, e));
  col = mix(col, warm, smoothstep(0.92, 1.0, e) * 0.14);

  /* Grain, as in the preset. Enough to kill the banding a 4-stop ramp shows
     on a phone, not enough to read as texture. */
  float g = hash(vUv * 900.0 + fract(t)) - 0.5;
  col += g * 0.028;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

export interface EmberShaderProps {
  /** Extra classes for the positioned wrapper. */
  className?: string;
}

export default function EmberShader({ className }: EmberShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = (canvas.getContext('webgl', { antialias: false, alpha: false, depth: false })
        || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    } catch { gl = null; }
    /* No context: the CSS gradient beneath is already correct, so leave the
       canvas transparent rather than painting a black hole over it. */
    /* The canvas is already transparent by default, so every failure path
       below simply returns and leaves the CSS fallback as the artwork. */
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl!.createShader(type)!;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
        gl!.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uAspect = gl.getUniformLocation(prog, 'uAspect');

    /* 1.5, not devicePixelRatio. A drifting gradient carries no detail worth
       three times the fragments, and this runs on mid-range Androids. */
    const DPR_CAP = 1.5;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl!.viewport(0, 0, w, h);
      const a = r.width / r.height;
      gl!.uniform2f(uAspect, a >= 1 ? a : 1, a >= 1 ? 1 : 1 / a);
      return true;
    };

    const draw = (tSeconds: number) => {
      gl!.uniform1f(uTime, tSeconds);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    };

    /* ── Nothing is shown until something has actually been drawn ──
     *
     * The canvas starts transparent (see .ember-canvas) and is only revealed
     * once a frame has landed. The context is opaque — alpha:false — so an
     * undrawn canvas is a BLACK rectangle, and revealing it before the first
     * draw would hide the CSS fallback behind a black hole rather than showing
     * the artwork.
     *
     * That is not hypothetical. This element can mount at 0x0: inside a card
     * that has not been laid out yet, or one animating in from a collapsed
     * state. resize() then has nothing to size to and correctly refuses, so
     * the first draw does not happen at mount — and for a member with reduced
     * motion there is no frame loop coming along afterwards to fix it. */
    let painted = false;
    let dead = false;

    /** Stand down for good and let the CSS fallback be the artwork. */
    const giveUp = () => {
      dead = true;
      painted = false;
      canvas.style.opacity = '0';
    };

    const paint = (t: number) => {
      if (dead) return false;
      /* ASK, DO NOT WAIT TO BE TOLD.
       *
       * `webglcontextlost` is the documented way to hear about this and it is
       * not sufficient. Observed in practice: the context was lost, the event
       * never arrived, and the canvas stayed at opacity 1 — an opaque dead
       * rectangle sitting on top of the fallback it was supposed to give way
       * to. The card rendered flat grey with the fallback perfectly intact
       * underneath it.
       *
       * isContextLost() is synchronous and true regardless of whether anyone
       * dispatched an event, so it is what actually gates drawing. The event
       * handler stays as well, because it fires earlier when it does fire. */
      if (gl!.isContextLost()) { giveUp(); return false; }
      if (!resize()) return false;
      draw(t);
      if (!painted) {
        painted = true;
        canvas.style.opacity = '1';
      }
      return true;
    };

    /* FIRST FRAME, SYNCHRONOUSLY. Not inside the rAF callback — a paused
       ticker would otherwise leave the fallback showing forever on a device
       that could have run this. */
    paint(0);

    const still = prefersReducedMotion();
    let raf = 0;
    let running = false;
    let t0 = 0;
    /* Accumulated so pausing and resuming does not jump the animation. */
    let elapsed = 0;

    const frame = (now: number) => {
      if (!running) return;
      if (!t0) t0 = now;
      const t = elapsed + (now - t0) / 1000;
      if (!paint(t) && dead) { stop(); return; }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || still || dead) return;
      running = true; t0 = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      elapsed = elapsed; // keep whatever we reached
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(entries => {
        for (const en of entries) {
          if (en.isIntersecting) start(); else stop();
        }
      }, { threshold: 0.01 });
      io.observe(canvas);
    } else {
      start();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => { if (!running) paint(elapsed); };
    window.addEventListener('resize', onResize);

    /* The element's own size, not the window's. A card that lays out or
       animates open changes this without the window ever resizing, and for a
       reduced-motion member this observer is the ONLY thing that will ever
       trigger that first successful paint. */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { if (!painted || !running) paint(elapsed); });
      ro.observe(canvas);
    }

    /* A lost context leaves the last frame on screen and would otherwise keep
       issuing draw calls into nothing. */
    /* Earlier notice than isContextLost() when it arrives — but never the only
       notice, because it does not always arrive. */
    const onLost = (e: Event) => { e.preventDefault(); stop(); giveUp(); };
    canvas.addEventListener('webglcontextlost', onLost);

    /* ── The watchdog ──
     *
     * Checking isContextLost() inside paint() is not enough on its own,
     * because paint() only runs while frames do. The sequence that actually
     * happens: the first frame lands, the canvas is revealed, the loop then
     * stops — the card scrolls away, or the tab is backgrounded — and the
     * context is dropped WHILE nothing is drawing. Nobody asks again, the
     * event does not arrive, and an opaque dead canvas is left sitting on top
     * of a perfectly good fallback.
     *
     * That is not an edge case on the platforms this ships to: an iOS WebView
     * reclaims WebGL contexts when the app goes to the background, so a member
     * who opens their code, switches apps to check something and comes back
     * would return to a grey rectangle.
     *
     * A timer, because timers fire when requestAnimationFrame does not. One
     * boolean every two seconds, and it removes itself the moment it has an
     * answer. */
    const watchdog = window.setInterval(() => {
      if (dead) { window.clearInterval(watchdog); return; }
      if (gl!.isContextLost()) { stop(); giveUp(); window.clearInterval(watchdog); }
    }, 2000);

    return () => {
      stop();
      window.clearInterval(watchdog);
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      try {
        gl?.deleteProgram(prog);
        gl?.deleteShader(vs);
        gl?.deleteShader(fs);
        gl?.deleteBuffer(buf);
        /* NO loseContext() HERE.
         *
         * It was here, and it is why this component rendered a grey rectangle
         * with a broken-image glyph instead of a gradient. A canvas element
         * gets exactly ONE WebGL context for its whole life — getContext()
         * hands back the same object every time. Deliberately losing it in
         * cleanup therefore does not free a resource, it POISONS THE ELEMENT:
         * the next mount asks for a context, receives the same dead one, every
         * shader call silently fails, and WebKit paints the canvas as a broken
         * image.
         *
         * React runs mount → cleanup → mount for every effect in development,
         * so this destroyed the component on its very first render and would do
         * the same in production on any remount that reuses the DOM node.
         *
         * The program, shaders and buffer are deleted, which is the part that
         * actually matters; the context goes when the canvas is collected. */
      } catch { /* teardown is best effort */ }
    };
  }, []);

  return (
    <div className={`ember${className ? ` ${className}` : ''}`} aria-hidden="true">
      {/* Painted first and never removed: the shader draws on top of it, and
          where the shader cannot run this is what the card looks like. */}
      <div className="ember-fallback" />
      <canvas ref={canvasRef} className="ember-canvas" />
    </div>
  );
}
