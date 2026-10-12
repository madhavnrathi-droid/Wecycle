'use client';

/* A lush, noisy gradient in a brand's colours — the background of brand share
 * cards.
 *
 * This is the "Foku lush gradient" shader fill from the team's Figma library
 * (authored with the figma-shaders skill; tune it there, then copy the
 * numbers here), ported from WGSL to WebGL 1 so it runs on any phone:
 *
 *   · Perlin fbm, domain-warped twice (q, then r), so the colour pools and
 *     folds like ink rather than banding like a linear gradient;
 *   · the field picks a colour along the brand's stops, blended in OKLCH —
 *     round the hue wheel, so every transition stays a colour, never grey;
 *   · a soft light from the top-left, a touch of depth where the warp folds,
 *     and per-pixel film grain, which is what makes it read as printed rather
 *     than rendered (and hides any banding in an 8-bit PNG).
 *
 * Every render takes a seed, so "Remix" on the share sheet is a new seed.
 * Where WebGL is missing the same palette is laid down as soft radial pools
 * with grain on a 2D canvas — less lush, never blank. */

export interface LushOptions {
  width: number;
  height: number;
  /** Up to four colours, as #rrggbb, in order along the gradient. */
  colors: string[];
  /** Stop positions 0..1, one per colour. Evenly spread when omitted. */
  stops?: number[];
  scale?: number;
  flow?: number;
  /** How far the noise reaches toward the end colours. Higher = bigger pools
   *  of the first and last colour, less of the middle. */
  spread?: number;
  /** Colour richness: 1 is the stops as given, ~1.2 is lush. */
  chroma?: number;
  /** How much the folds of the noise darken, 0..1. Gives the field depth. */
  depth?: number;
  grain?: number;
  glow?: number;
  seed?: number;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uA;      // aspect, scale, flow, grain
uniform vec4 uB;      // seed, glow, count, spread
uniform vec4 uD;      // chroma, depth, -, -
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec4 uStops;

vec3 hash33(vec3 p) {
  vec3 q = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                dot(p, vec3(269.5, 183.3, 246.1)),
                dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}
vec3 smootherCurve(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float gradDot(vec3 cell, vec3 o, vec3 l) { return dot(hash33(cell + o), l - o); }
float perlin3(vec3 p) {
  vec3 cell = floor(p);
  vec3 l = fract(p);
  vec3 w = smootherCurve(l);
  float n000 = gradDot(cell, vec3(0.0, 0.0, 0.0), l);
  float n100 = gradDot(cell, vec3(1.0, 0.0, 0.0), l);
  float n010 = gradDot(cell, vec3(0.0, 1.0, 0.0), l);
  float n110 = gradDot(cell, vec3(1.0, 1.0, 0.0), l);
  float n001 = gradDot(cell, vec3(0.0, 0.0, 1.0), l);
  float n101 = gradDot(cell, vec3(1.0, 0.0, 1.0), l);
  float n011 = gradDot(cell, vec3(0.0, 1.0, 1.0), l);
  float n111 = gradDot(cell, vec3(1.0, 1.0, 1.0), l);
  float nx00 = mix(n000, n100, w.x);
  float nx10 = mix(n010, n110, w.x);
  float nx01 = mix(n001, n101, w.x);
  float nx11 = mix(n011, n111, w.x);
  return mix(mix(nx00, nx10, w.y), mix(nx01, nx11, w.y), w.z) * 1.1547;
}
float fbm(vec3 p) {
  vec3 q = p;
  float total = 0.0;
  float amp = 1.0;
  float weight = 0.0;
  for (int i = 0; i < 4; i++) {
    total += perlin3(q) * amp;
    weight += amp;
    q = vec3(0.8 * q.y + 0.6 * q.z, -0.8 * q.x + 0.36 * q.y - 0.48 * q.z, -0.6 * q.x - 0.48 * q.y + 0.64 * q.z) * 2.02 + vec3(3.7, 1.9, 6.3);
    amp *= 0.5;
  }
  return total / max(weight, 0.0001);
}
float grainHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 srgbToLinear(vec3 c) {
  vec3 v = max(c, vec3(0.0));
  return mix(v / 12.92, pow((v + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), v));
}
vec3 linearToSrgb(vec3 c) {
  vec3 v = max(c, vec3(0.0));
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v));
}
vec3 toOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  float lc = pow(max(l, 0.0), 1.0 / 3.0);
  float mc = pow(max(m, 0.0), 1.0 / 3.0);
  float sc = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * lc + 0.7936177850 * mc - 0.0040720468 * sc,
              1.9779984951 * lc - 2.4285922050 * mc + 0.4505937099 * sc,
              0.0259040371 * lc + 0.7827717662 * mc - 0.8086757660 * sc);
}
vec3 fromOklab(vec3 c) {
  float lc = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float mc = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float sc = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = lc * lc * lc;
  float m = mc * mc * mc;
  float s = sc * sc * sc;
  return vec3( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 colorAt(int i) {
  if (i == 0) return uC0;
  if (i == 1) return uC1;
  if (i == 2) return uC2;
  return uC3;
}
float stopAt(int i) {
  if (i == 0) return uStops.x;
  if (i == 1) return uStops.y;
  if (i == 2) return uStops.z;
  return uStops.w;
}
vec3 gradientAt(float t) {
  int count = int(uB.z + 0.5);
  int lo = 0;
  for (int i = 0; i < 3; i++) {
    if (i < count - 1 && t >= stopAt(i)) lo = i;
  }
  int hi = lo + 1;
  if (hi > count - 1) hi = count - 1;
  float a = stopAt(lo);
  float b = stopAt(hi);
  float amt = clamp((t - a) / max(b - a, 0.0001), 0.0, 1.0);
  amt = amt * amt * (3.0 - 2.0 * amt);
  vec3 la = toOklab(srgbToLinear(colorAt(lo)));
  vec3 lb = toOklab(srgbToLinear(colorAt(hi)));
  /* Blend in OKLCH, around the hue wheel, so neighbouring colours meet
     through the hues between them rather than through grey — no transition
     turns to mud. (Neighbours must be less than half the wheel apart, or the
     short way round is the wrong way: hence the bridge colours in a brand's
     palette.) Then a chroma lift: richer colour at the same lightness, which
     reads as lush rather than as louder. */
  float ca = length(la.yz);
  float cb = length(lb.yz);
  float ha = atan(la.z, la.y);
  float hb = atan(lb.z, lb.y);
  float dh = hb - ha;
  if (dh > 3.14159265) dh -= 6.28318531;
  if (dh < -3.14159265) dh += 6.28318531;
  float h = ha + dh * amt;
  float c = mix(ca, cb, amt) * max(uD.x, 0.0);
  vec3 lab = vec3(mix(la.x, lb.x, amt), c * cos(h), c * sin(h));
  return linearToSrgb(fromOklab(lab));
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  float aspect = max(uA.x, 0.001);
  float scale = uA.y;
  float flow = uA.z;
  float grain = uA.w;
  float seed = uB.x;
  float glow = uB.y;

  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * scale + vec2(seed * 1.37, seed * 0.71);
  float z = seed * 0.29;
  vec2 q = vec2(fbm(vec3(p, z)), fbm(vec3(p + vec2(5.2, 1.3), z)));
  vec2 r = vec2(fbm(vec3(p + q * 4.0 * flow + vec2(1.7, 9.2), z + 1.0)),
                fbm(vec3(p + q * 4.0 * flow + vec2(8.3, 2.8), z + 2.0)));
  float f = fbm(vec3(p + r * 3.0 * flow, z + 3.0));
  float t = clamp(f * 0.5 + 0.5, 0.0, 1.0);
  float spread = uB.w > 0.0 ? uB.w : 2.3;
  t = clamp((t - 0.5) * spread + 0.5, 0.0, 1.0);

  vec3 col = gradientAt(t);
  float depth = clamp(uD.y, 0.0, 1.0);
  col *= (1.0 - depth) + depth * clamp(length(q) * 1.6, 0.0, 1.0);
  float d = distance(uv, vec2(0.1, 0.04));
  col = mix(col, vec3(1.0), glow * 0.38 * (1.0 - smoothstep(0.0, 0.95, d)));
  float g = grainHash(floor(gl_FragCoord.xy) + vec2(seed * 17.0, seed * 31.0)) - 0.5;
  col += vec3(g * grain);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function evenStops(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i / (n - 1)));
}

function webgl(o: Required<LushOptions>): HTMLCanvasElement | null {
  let canvas: HTMLCanvasElement;
  try { canvas = document.createElement('canvas'); } catch { return null; }
  canvas.width = o.width;
  canvas.height = o.height;
  const gl = (canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false })
    ?? canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true })) as WebGLRenderingContext | null;
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const colors = o.colors.slice(0, 4);
  while (colors.length < 4) colors.push(colors[colors.length - 1] ?? '#808080');
  const stops = o.stops.slice(0, 4);
  while (stops.length < 4) stops.push(1);

  gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), o.width, o.height);
  gl.uniform4f(gl.getUniformLocation(prog, 'uA'), o.width / o.height, o.scale, o.flow, o.grain);
  gl.uniform4f(gl.getUniformLocation(prog, 'uB'), o.seed, o.glow, Math.min(4, o.colors.length), o.spread);
  colors.forEach((c, i) => gl.uniform3f(gl.getUniformLocation(prog, `uC${i}`), ...hexToRgb(c)));
  gl.uniform4f(gl.getUniformLocation(prog, 'uStops'), stops[0], stops[1], stops[2], stops[3]);
  gl.uniform4f(gl.getUniformLocation(prog, 'uD'), o.chroma, o.depth, 0, 0);

  gl.viewport(0, 0, o.width, o.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return gl.getError() === gl.NO_ERROR ? canvas : null;
}

/* Small seeded random, so the 2D fallback is as repeatable as the shader. */
function rng(seed: number) {
  let s = (Math.floor(seed * 9973) ^ 0x9e3779b9) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function fallback(o: Required<LushOptions>): HTMLCanvasElement | null {
  let canvas: HTMLCanvasElement;
  try { canvas = document.createElement('canvas'); } catch { return null; }
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rand = rng(o.seed);
  ctx.fillStyle = o.colors[0];
  ctx.fillRect(0, 0, o.width, o.height);
  const big = Math.max(o.width, o.height);
  for (let i = 0; i < 9; i++) {
    const c = o.colors[(i + 1) % o.colors.length];
    const x = rand() * o.width, y = rand() * o.height, r = big * (0.35 + rand() * 0.45);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${c}ee`);
    g.addColorStop(1, `${c}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, o.width, o.height);
  }
  const light = ctx.createRadialGradient(o.width * 0.1, o.height * 0.04, 0, o.width * 0.1, o.height * 0.04, big * 0.9);
  light.addColorStop(0, `rgba(255,255,255,${0.38 * o.glow})`);
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, o.width, o.height);
  try {
    const img = ctx.getImageData(0, 0, o.width, o.height);
    const amp = o.grain * 255;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * amp;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* grain is a nicety */ }
  return canvas;
}

/** Render the gradient to a canvas of the requested size, or null if this
 *  device can draw neither WebGL nor 2D canvas. */
export function renderLushGradient(opts: LushOptions): HTMLCanvasElement | null {
  const o: Required<LushOptions> = {
    scale: 1.6, flow: 0.85, spread: 2.3, chroma: 1, depth: 0.1, grain: 0.07, glow: 0.6, seed: 7,
    stops: evenStops(opts.colors.length),
    ...opts,
  } as Required<LushOptions>;
  if (!o.colors.length) return null;
  if (o.stops.length !== o.colors.length) o.stops = evenStops(o.colors.length);
  try {
    const gl = webgl(o);
    if (gl) return gl;
  } catch { /* fall through */ }
  return fallback(o);
}
