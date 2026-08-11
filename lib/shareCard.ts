'use client';

/*
 * Shareable cards — editorial, brand-forward (Spotify / NFT-card energy).
 *
 * A card rendered on a transparent canvas with a soft drop shadow, for any
 * Wecycle post — item, request, event, lost & found. Drawn entirely on an
 * offscreen <canvas>, no deps. The card is BUILT AROUND THE PHOTO: the image
 * area takes the photo's exact aspect ratio (no crop, no letterbox fill) and
 * the card grows/shrinks to fit, so a post always reads the way it was shot.
 *
 * Design (from the in-house mockups):
 *   • Whole card is a soft per-kind gradient — green→blue (marketplace),
 *     amber→auburn (request), pink→purple (event), orange→red (lost & found).
 *     All copy is white.
 *   • A white kind pill (top-left) + the logomark in a white circle (top-right).
 *   • Photo inset on a WHITE base (a bg-removed cut-out always sits on white,
 *     never the dark UI behind it).
 *   • Footer: title + price, location, description, a translucent reward pill /
 *     event stat-chips, a clean person row (avatar · name · verified) and the
 *     Wecycle wordmark centred as the signature. No fake buttons — the
 *     card is shared as an image alongside the real product link.
 *
 * Shared as an IMAGE via the Web Share files API; falls back to PNG download +
 * link copy. Never throws — a tainted canvas re-renders without remote photos.
 */

import { haptics } from './haptics';

export type ShareCardKind = 'item' | 'request' | 'job' | 'event' | 'lost' | 'found';

export interface ShareCardSpec {
  kind: ShareCardKind;
  title: string;
  imageUrls?: string[];
  price?: number;
  badge?: string;
  location?: string;
  dateLine?: string;
  reward?: string;
  description?: string;
  byName?: string;
  byEmail?: string;
  byPhone?: string;
  byAvatar?: string;
  byInitials?: string;
  byColor?: string;
  verified?: boolean;
  dateBadge?: { mon: string; day: string; dow: string };
  eventChips?: string[];
  url?: string;
  /* Panel-only facts. Kept separate from `badge` so the bottom pill and the
     stats panel never show the same string twice. */
  roleLabel?: string;       // job: 'Hiring' | 'Offering'
  conditionLabel?: string;  // item: 'Like new' | 'Good' | 'Fair'
}

/* ── Palette ──────────────────────────────────────────────────────────────
 * Each board gets its own grainy multi-stop wash, in the spirit of a
 * shader-gradient: three colours pooled in different corners, then film grain
 * over the top. `light` says whether the wash is pale enough to need dark ink —
 * a white-and-green card with white text would be unreadable, so ink is a
 * per-theme decision rather than a global assumption.
 */
type Stops = [string, string, string, string];

interface Theme {
  label: string;                        // pill over the media's top edge
  colors: Stops;                        // 4-stop diagonal sweep
  light: boolean;                       // pale wash → dark ink
  glyph: string;                        // stand-in when there's no photo
  person: string;                       // attribution sub-label
  accent: string;                        // verified tick, dots, wordmark tint
}

/* Four-stop diagonal sweeps. Four rather than two because the reference
 * gradients travel — purple through magenta into orange before they reach
 * yellow — and a two-stop ramp reads as a flat CSS gradient no matter how much
 * grain you put on it.
 *
 * Marketplace = white → green. Requests share it (same board) and are told
 * apart by the pill. Jobs = green → yellow. Events = purple most of the way,
 * with yellow only arriving in the last third. Lost & Found = white → orange →
 * pinkish red.
 */
/* Every stop is dark enough for white text. Measured, not eyeballed — white on
 * each stop, and the 74%-white muted ink on each stop:
 *
 *              white   muted            white   muted
 *   MARKET  #04301B 14.55  8.55   #0A5C36  8.09  5.23
 *           #0E7A47  5.39  3.69   #128850  4.50  3.19
 *   WORK    #14330E 13.91  8.28   #1E4A12 10.28  6.43
 *           #356B14  6.43  4.35   #867710  4.51  3.26
 *   EVENTS  #2E1065 15.24  8.77   #5B21B6  8.98  5.56
 *           #9D2B8A  6.67  4.36   #996F1F  4.52  3.26
 *   FINDS   #4A1505 14.99  8.67   #7E2609  9.68  5.99
 *           #B83C10  5.69  3.79   #C42340  5.74  3.73
 *
 * Worst case across all sixteen stops is 4.50:1 for white and 3.19:1 for the
 * muted ink, so the whole surface clears WCAG AA for body text — not just the
 * 2.5:1 that was asked for.
 *
 * The events palette used to end on #F5B331, a bright amber that gave white
 * only 1.85:1: the one card already using white ink had a region that failed
 * the brief it was the model for. Its amber is now a deep gold. That is the
 * unavoidable cost of white-on-amber — amber has to be dark to carry white,
 * and there is no clever way around the physics.
 *
 * Each ramp keeps a luminance spread of 0.115–0.163, so the gradients still
 * visibly travel rather than reading as one flat dark field. */
const MARKET: Stops = ['#04301B', '#0A5C36', '#0E7A47', '#128850'];
const WORK:   Stops = ['#14330E', '#1E4A12', '#356B14', '#867710'];
const EVENTS: Stops = ['#2E1065', '#5B21B6', '#9D2B8A', '#996F1F'];
const FINDS:  Stops = ['#4A1505', '#7E2609', '#B83C10', '#C42340'];

const THEME: Record<ShareCardKind, Theme> = {
  /* `light: false` throughout now — every board carries white ink, which is
     what the events card was already doing and the look to match. The accents
     are the dot in the pill and the verified tick, so they moved up-key to stay
     visible on a dark wash; the old #0B7A46 green would have disappeared into
     its own background. Each clears 2.58:1 or better against the lightest stop
     of its own palette. */
  item:    { label: 'For sale',  colors: MARKET, light: false, glyph: '📦', person: 'Verified member', accent: '#4ADE80' },
  request: { label: 'Wanted',    colors: MARKET, light: false, glyph: '🙌', person: 'Verified member', accent: '#4ADE80' },
  job:     { label: 'Hiring',    colors: WORK,   light: false, glyph: '💼', person: 'Posted by',       accent: '#BEF264' },
  event:   { label: 'Event',     colors: EVENTS, light: false, glyph: '🎉', person: 'Organiser',       accent: '#FFD84D' },
  lost:    { label: 'Lost',      colors: FINDS,  light: false, glyph: '🔎', person: 'Reported by',     accent: '#FF9A6B' },
  found:   { label: 'Found',     colors: FINDS,  light: false, glyph: '✅', person: 'Found by',        accent: '#FF9A6B' },
};

/** Ink tokens derived from the wash's lightness — one place, so every text
 *  colour on the card stays legible against its own background. */
function inkFor(t: Theme) {
  return t.light
    ? {
        primary: '#111309',
        muted:   'rgba(17,19,9,0.62)',
        panel:   'rgba(255,255,255,0.62)',
        panelHair: 'rgba(17,19,9,0.08)',
        pillBg:  '#111309',
        pillInk: '#FFFFFF',
        valueBg: 'rgba(255,255,255,0.94)',
        valueInk: '#111309',
        wordmark: '#111309',
        /* Pale wash → a solid dark disc reads as the primary action. */
        arrowFill: '#111309',
        arrowInk: '#FFFFFF',
      }
    : {
        primary: '#FFFFFF',
        muted:   'rgba(255,255,255,0.74)',
        panel:   'rgba(255,255,255,0.14)',
        panelHair: 'rgba(255,255,255,0.20)',
        pillBg:  '#FFFFFF',
        pillInk: '#1A0B33',
        valueBg: 'rgba(20,8,40,0.86)',
        valueInk: '#FFFFFF',
        wordmark: '#FFFFFF',
        /* Deep wash → a white disc, as in the purple reference card. */
        arrowFill: '#FFFFFF',
        arrowInk: '#2A0F55',
      };
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const WORDMARK_AR = 1719 / 607; // ≈ 2.832

const WHITE = '#ffffff';


/* ── The wash ─────────────────────────────────────────────────────────────
 * A shader-gradient look, done in 2D canvas: three big soft radial pools of the
 * palette laid over a base fill, then film grain across the whole thing. The
 * grain is what makes it read as printed rather than as a CSS gradient — see the
 * reference swatches, where the noise is heavy enough to be a texture in its own
 * right.
 *
 * The pools are placed on a fixed diagonal rhythm rather than randomly, so a
 * card looks the same every time it's generated (share the same post twice and
 * you get the same picture) while still not looking like a two-stop ramp.
 */
function paintWash(ctx: CanvasRenderingContext2D, w: number, h: number, colors: Stops) {
  const [c0, c1, c2, c3] = colors;

  /* The travelling sweep, corner to corner. This is what carries the hue
     journey the reference gradients have. */
  const lin = ctx.createLinearGradient(0, 0, w, h);
  lin.addColorStop(0.00, c0);
  lin.addColorStop(0.34, c1);
  lin.addColorStop(0.68, c2);
  lin.addColorStop(1.00, c3);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, w, h);

  /* Pools break the ramp's straight banding into something that looks lit
     rather than interpolated. Fixed positions, so the same post always renders
     the same card. */
  const pool = (cx: number, cy: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha(color, alpha));
    g.addColorStop(0.6, withAlpha(color, alpha * 0.45));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  const long = Math.max(w, h);
  /* The hot corner has to actually pool, not tint: in the reference the deepest
     colour is unmistakably concentrated bottom-right while the opposite corner
     stays near-white. Two overlapping pools get that density; one reads as a
     wash over the whole card. */
  pool(w * 0.94, h * 0.92, long * 0.72, c3, 1);
  pool(w * 0.80, h * 0.78, long * 0.42, c3, 0.85);
  pool(w * 0.62, h * 0.60, long * 0.46, c2, 0.60);
  /* And the cool corner has to stay clean, or the title loses contrast. */
  pool(w * 0.02, h * 0.02, long * 0.52, c0, 0.95);
  pool(w * 0.24, h * 0.16, long * 0.34, c0, 0.60);

  /* Two passes at different scales: fine grain for the paper texture, a coarser
     pass to break up the smooth ramps the way the reference swatches do. */
  paintGrain(ctx, w, h, 0.19);
  paintGrain(ctx, w, h, 0.07, 2);
}

/** `#rrggbb` → `rgba(...)`. The pools need per-stop alpha, and canvas gradients
 *  won't take a separate alpha channel. */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* One 256px noise tile, generated once per document and repeated. Tiling at 1:1
 * keeps the grain crisp — scaling a small tile up to 1080px would smooth it into
 * mush, and generating noise for every pixel of every card is needless work. */
let grainTile: HTMLCanvasElement | null = null;
function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    /* Monochrome grain: same value in RGB, varying alpha. Colour noise would
       tint the wash; luminance noise just roughens it. */
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.14, scale = 1) {
  const pattern = ctx.createPattern(getGrainTile(), 'repeat');
  if (!pattern) return;
  ctx.save();
  /* overlay keeps the wash's hue and only pushes luminance around, which is how
     real film grain behaves; 'source-over' would grey the whole card out. */
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  if (scale !== 1) {
    /* Scale the pattern, not the canvas, so the coarse pass lands on the same
       pixels as the fine one. */
    ctx.scale(scale, scale);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w / scale, h / scale);
  } else {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/* ── geometry helpers ───────────────────────────── */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadImage(src: string, cors = true): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > rr) { sw = img.height * rr; sx = (img.width - sw) / 2; }
  else { sh = img.width / rr; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** object-fit: contain (whole image, never cropped). */
/** A blurred, scaled-up copy of the photo, drawn behind the contained one.
 *
 * The photo panel is a fixed height so the finished card keeps a shape WhatsApp
 * shows whole, but the photos are every ratio a phone camera produces. Contain
 * alone left dead white bars either side of anything portrait, which read as a
 * rendering bug rather than a design. This is the same treatment
 * components/FitImage gives uploads in the app: nothing is cropped, and the
 * leftover space looks deliberate.
 *
 * The blur comes from downscaling to a few dozen pixels and letting the canvas
 * smooth it back up, NOT from ctx.filter. Filter support in older iOS WebViews
 * is patchy, and a bed that silently fails to blur looks like the photo has
 * been printed twice — a worse failure than the bars it replaces.
 */
function blurredBed(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const TINY = 28;
  const tw = TINY;
  const th = Math.max(2, Math.round(TINY * (img.height / img.width)));
  let tiny: HTMLCanvasElement;
  try { tiny = document.createElement('canvas'); } catch { return; }
  tiny.width = tw; tiny.height = th;
  const tctx = tiny.getContext('2d');
  if (!tctx) return;
  tctx.drawImage(img, 0, 0, tw, th);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  /* Cover, so no edge of the panel is left unpainted. */
  const ir = tw / th, rr = w / h;
  const dw = ir > rr ? h * ir : w;
  const dh = ir > rr ? h : w / ir;
  ctx.drawImage(tiny, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  /* Knock it back so the sharp photo stays unambiguously the subject. */
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function containDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  let dw: number, dh: number;
  if (ir > rr) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test;
    } else if (lines.length === maxLines - 1) {
      cur = `${cur} ${words.slice(i).join(' ')}`;
      break;
    } else {
      lines.push(cur);
      cur = words[i];
    }
  }
  if (cur) lines.push(cur);
  const li = lines.length - 1;
  if (li >= 0 && ctx.measureText(lines[li]).width > maxWidth) {
    let last = lines[li];
    while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[li] = `${last.trimEnd()}…`;
  }
  return lines;
}

/* ── icons (simple, crisp line glyphs) ──────────── */

function setStroke(ctx: CanvasRenderingContext2D, color: string, w: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function checkBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, tick: string) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  setStroke(ctx, tick, r * 0.34);
  ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy + r * 0.02); ctx.lineTo(cx - r * 0.08, cy + r * 0.38); ctx.lineTo(cx + r * 0.46, cy - r * 0.36); ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, img: HTMLImageElement | null, initials?: string, color?: string) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) {
    coverDraw(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = color || '#ffffff';
    ctx.globalAlpha = 0.92;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#14161A';
    ctx.font = `700 ${r}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((initials || '?').slice(0, 2).toUpperCase(), cx, cy + 1);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
  ctx.restore();
}

function tintImage(img: HTMLImageElement, w: number, h: number, color: string): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(w));
  off.height = Math.max(1, Math.ceil(h));
  const o = off.getContext('2d')!;
  o.drawImage(img, 0, 0, w, h);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = color;
  o.fillRect(0, 0, off.width, off.height);
  return off;
}

/* ── renderer ───────────────────────────────────── */

export interface RenderedCard {
  blob: Blob | null;
  dataUrl: string;
}

interface FooterCtx {
  W: number; fx: number; imBottom: number;
  avatar: HTMLImageElement | null; wordmark: HTMLImageElement | null;
}

/* ── Card parts, shared by the renderer ─────────────────────────────────── */

/** Outlined capsule — the reference's "✦ EVENT" / "● FOR SALE" pill. */
function outlinePill(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number; h: number; text: string; ink: string; dot?: string },
) {
  ctx.save();
  const size = Math.round(o.h * 0.40);
  ctx.font = `700 ${size}px ${FONT}`;
  const track = size * 0.14;
  const tw = ctx.measureText(o.text).width + track * (o.text.length - 1);
  const dotW = o.dot ? size * 0.62 + 14 : 0;
  const w = Math.round(tw + dotW + o.h * 1.1);

  roundRect(ctx, o.x, o.y, w, o.h, o.h / 2);
  ctx.strokeStyle = withAlphaCss(o.ink, 0.42);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  let cursor = o.x + o.h * 0.55;
  if (o.dot) {
    ctx.beginPath();
    ctx.arc(cursor + size * 0.31, o.y + o.h / 2, size * 0.31, 0, Math.PI * 2);
    ctx.fillStyle = o.dot; ctx.fill();
    cursor += size * 0.62 + 14;
  }
  ctx.fillStyle = o.ink;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const ch of o.text) {
    ctx.fillText(ch, cursor, o.y + o.h / 2 + 1);
    cursor += ctx.measureText(ch).width + track;
  }
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  return w;
}

/** The reference's boxed date badge: small caps, big number, small caps. */
function dateBox(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number; w: number; h: number; top: string; mid: string; bot: string; ink: string },
) {
  roundRect(ctx, o.x, o.y, o.w, o.h, 18);
  ctx.strokeStyle = withAlphaCss(o.ink, 0.38);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = withAlphaCss(o.ink, 0.8);
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(o.top.toUpperCase(), o.x + o.w / 2, o.y + 40);
  ctx.fillStyle = o.ink;
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(o.mid, o.x + o.w / 2, o.y + o.h - 42);
  ctx.fillStyle = withAlphaCss(o.ink, 0.8);
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(o.bot.toUpperCase(), o.x + o.w / 2, o.y + o.h - 14);
  ctx.textAlign = 'left';
}

/** Circular "go" button, bottom-right of the meta row in every reference. */
function arrowButton(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, ink: string,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(3, r * 0.11);
  ctx.lineCap = 'round';
  const a = r * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx - a, cy); ctx.lineTo(cx + a, cy);
  ctx.moveTo(cx + a * 0.30, cy - a * 0.62); ctx.lineTo(cx + a, cy);
  ctx.lineTo(cx + a * 0.30, cy + a * 0.62);
  ctx.stroke();
}

/** `rgba()` from either a hex or an existing rgba string. */
function withAlphaCss(color: string, a: number): string {
  return color.startsWith('#') ? withAlpha(color, a) : color;
}

export async function renderShareCard(spec: ShareCardSpec): Promise<RenderedCard> {
  /* Geometry from the reference cards, scaled to 1080 wide. Two stacked panels:
   *   A — the gradient, carrying every word on the card
   *   B — the photo, carrying the Wecycle mark and the call to action
   * That split is the "two parter" in the brief, and it's why the text never has
   * to fight a photo for contrast: they live in separate panels. */
  const W = 1080;
  const PAD = 64;
  const R = 56;
  const FX = 72;            // content gutter (reference is generous)

  const t = THEME[spec.kind];
  const ink = inkFor(t);

  const canvas = document.createElement('canvas');
  canvas.width = W + PAD * 2;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [wordmark, logo, avatar, hero] = await Promise.all([
    loadImage('/brand/wordmark.png', false),
    loadImage('/brand/logomark.png', false),
    spec.byAvatar ? loadImage(spec.byAvatar, true) : Promise.resolve(null),
    urls[0] ? loadImage(urls[0], true) : Promise.resolve(null),
  ]);

  /* ── Panel A height, measured ── */
  /* Title auto-fit.
   *
   * The title is the one element on the card that must never be cut: a share
   * card whose headline reads "Lost black Casio watch near the libr…" has
   * failed at the only job it has. Fixed 92px/2-line wrapping ellipsised any
   * title past ~38 characters, so instead step down through size/line-count
   * pairs and take the first that fits whole. Big titles stay big; long ones
   * get smaller rather than truncated — the trade every editorial layout makes.
   *
   * Leading tracks the size (1.09×) so the block stays optically even at any
   * step, rather than the old hard-coded 100px that only suited 92px type. */
  const TITLE_MAXW = W - FX * 2 - 40;
  /* Ladder verified against real titles from 5 to 121 characters: nothing
     truncates. Order matters — hold 92px and spend a line first (a 39-char
     title stays big and goes to three lines), only then start shrinking.
     Shrinking before wrapping made short titles needlessly small. */
  const STEPS: [number, number][] = [
    [92, 2], [92, 3], [80, 3], [80, 4], [70, 4], [62, 4], [56, 4],
  ];
  let titleSize = 56;
  let titleLines = [spec.title];
  for (const [size, maxLines] of STEPS) {
    ctx.font = `800 ${size}px ${FONT}`;
    const lines = wrapText(ctx, spec.title, TITLE_MAXW, maxLines);
    titleSize = size; titleLines = lines;
    if (!lines[lines.length - 1].endsWith('…')) break;
  }
  const TITLE_LH = Math.round(titleSize * 1.09);
  const subtitle = (spec.description ?? '').trim();
  ctx.font = `400 38px ${FONT}`;
  const subLines = subtitle ? wrapText(ctx, subtitle, W - FX * 2 - 120, 2) : [];

  const TOP_ROW = 56 + 62;                       // pill row
  const TITLE_TOP = TOP_ROW + 50;
  const TITLE_H = titleLines.length * TITLE_LH;
  const SUB_H = subLines.length ? 20 + subLines.length * 50 : 0;
  const META_H = 188;                            // date box / columns + arrow
  const FOOT_H = 102;                            // attribution + tagline
  const panelA = Math.round(TITLE_TOP + TITLE_H + SUB_H + 38 + META_H + 28 + FOOT_H);

  /* ── The photo panel, which now leads the card ──
   *
   * Two constraints fight here and both are real.
   *
   * 1. The photo must never be cropped, at any source aspect ratio.
   * 2. The finished card must be a shape WhatsApp renders WHOLE in a chat
   *    bubble. Anything much taller than 4:5 gets clipped, and the recipient
   *    has to tap the card open to read the title — which is exactly the
   *    friction the card exists to remove.
   *
   * Sizing the photo purely from its own ratio satisfied (1) and broke (2):
   * a tall poster produced a ~0.62 card that arrived cut off. So the photo
   * takes whatever height is left after the info panel, aiming at a 4:5
   * canvas, then gets bounded:
   *
   *   - never taller than the photo's own natural height at this width, since
   *     past that point the extra pixels are just white bed, and
   *   - never shorter than PHOTO_MIN, so the image still leads the card even
   *     when a long title has eaten the budget.
   *
   * The photo is still drawn with containDraw, so whatever height it lands on
   * it is letterboxed, never cut. */
  const hasPhoto = !!hero;
  const STRIP = 96;                              // CTA strip, now the card's foot
  const natural = hero ? hero.width / hero.height : 1.6;

  /* The photo panel IS the photo — the frame takes the image's own ratio, so
   * the uploaded picture fills it edge to edge with nothing beside it.
   *
   * This replaces a fixed band sized from a 4:5 card budget. That band forced
   * every photo into the same shape, and anything that didn't match got a
   * blurred bed either side. It happened to look right on the event poster only
   * because that poster has a white background, so its bed was invisible; on a
   * photo of a wardrobe the panels were obvious and read as a border the poster
   * never asked for.
   *
   * Bounds are the same 9:16–16:9 as lib/useNaturalAspect, so a share card
   * frames a photo exactly the way the detail screen does. Inside the clamp the
   * fit is exact and there is no bed at all; only a genuine panorama or a
   * skyscraper-tall image falls outside, and those still get the bed rather than
   * being cropped.
   *
   * This makes cards taller — a portrait poster produces a tall card, which is
   * the shape the reference had. WhatsApp may clip the bottom of the bubble at
   * these ratios; the image being the subject is the explicit priority. */
  const NAT_MIN = 0.5625;                        // 9:16
  const NAT_MAX = 1.7778;                        // 16:9
  const framed = Math.min(NAT_MAX, Math.max(NAT_MIN, natural));
  const photoH = hasPhoto ? Math.round(W / framed) : 0;
  /* Exact fit whenever the ratio was inside the clamp — the bed is then dead
     weight and, worse, visible. */
  const photoFillsFrame = Math.abs(framed - natural) < 1e-6;

  const H = panelA + (hasPhoto ? photoH + STRIP : 0);
  canvas.height = H + PAD * 2;

  /* Panel A starts below the photo now. Every constant in the info panel is
     measured from its own origin, so the whole block is drawn inside one
     translate rather than having ~20 offsets rewritten. */
  const AY = hasPhoto ? photoH : 0;

  const paint = (useHero: boolean) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(PAD, PAD);

    /* Silhouette + shadow */
    ctx.save();
    ctx.shadowColor = 'rgba(17,24,39,0.34)';
    ctx.shadowBlur = 72;
    ctx.shadowOffsetY = 28;
    roundRect(ctx, 0, 0, W, H, R);
    ctx.fillStyle = t.colors[0];
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, 0, 0, W, H, R);
    ctx.clip();

    /* ══ THE PHOTO — top of the card ══
     * It leads because it is the only element that works at thumbnail size:
     * in a chat list nobody reads a title, they recognise a picture. */
    if (hasPhoto) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, photoH);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, photoH);
      const photo = useHero ? hero : null;
      if (photo) {
        /* No bed for the common case: the frame already matches the photo, so
           anything painted behind it would only show as side panels. */
        if (!photoFillsFrame) blurredBed(ctx, photo, 0, 0, W, photoH);
        containDraw(ctx, photo, 0, 0, W, photoH);
      }
      ctx.restore();
    }

    /* ══ THE INFO PANEL — below the photo ══ */
    ctx.save();
    ctx.translate(0, AY);
    paintWash(ctx, W, panelA, t.colors);
    /* With no photo the wash is the whole card. */
    if (!hasPhoto) paintWash(ctx, W, H, t.colors);

    /* Top row: outlined kind pill, and the wordmark opposite it. */
    outlinePill(ctx, {
      x: FX, y: 56, h: 62,
      text: t.label.toUpperCase(), ink: ink.primary, dot: t.accent,
    });
    if (wordmark) {
      const wmH = 40, wmW = wmH * WORDMARK_AR;
      ctx.drawImage(tintImage(wordmark, wmW, wmH, ink.primary), W - FX - wmW, 56 + (62 - wmH) / 2, wmW, wmH);
    }

    /* Title — the largest thing on the card, as in every reference. */
    ctx.font = `800 ${titleSize}px ${FONT}`;
    ctx.fillStyle = ink.primary;
    ctx.textBaseline = 'alphabetic';
    const capTop = Math.round(titleSize * 0.8);   // first baseline
    titleLines.forEach((ln, i) => ctx.fillText(ln, FX, TITLE_TOP + capTop + i * TITLE_LH));

    let y = TITLE_TOP + capTop + (titleLines.length - 1) * TITLE_LH;

    /* Subtitle */
    if (subLines.length) {
      ctx.font = `400 38px ${FONT}`;
      ctx.fillStyle = ink.muted;
      subLines.forEach((ln, i) => ctx.fillText(ln, FX, y + 62 + i * 50));
      y += 62 + (subLines.length - 1) * 50;
    }

    /* Hairline → meta row → hairline (reference's rhythm exactly) */
    y += 44;
    const hair = (yy: number) => {
      ctx.strokeStyle = withAlphaCss(ink.primary, 0.18);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(FX, yy); ctx.lineTo(W - FX, yy); ctx.stroke();
    };
    hair(y);

    const metaTop = y + 28;
    const arrowR = 48;
    const arrowCx = W - FX - arrowR;
    drawMeta(ctx, spec, t, ink, { fx: FX, top: metaTop, right: arrowCx - arrowR - 40 });
    arrowButton(ctx, arrowCx, metaTop + 56, arrowR,
      ink.arrowFill, ink.arrowInk);

    y = metaTop + META_H - 28;
    hair(y);

    /* Closing row: who posted it (left) against the tagline (right).
     *
     * This slot held a decorative barcode, copied from the reference labels. It
     * looked the part but carried nothing — a share card has one job, and a fake
     * barcode does not help anyone decide to tap. The poster's name and verified
     * tick do: "a real classmate listed this" is the single most persuasive thing
     * left to say once the price and the photo have been seen.
     *
     * Left-aligned attribution keeps the card's one alignment spine (pill,
     * title, subtitle, meta labels all start at FX); the tagline is the only
     * right-aligned element, so it reads as a sign-off rather than a stray. */
    const fy = y + 22;
    /* Both halves hang off two shared centrelines (ROW1/ROW2) and both are drawn
     * with textBaseline 'middle'. Mixing 'middle' on one side with 'alphabetic'
     * on the other is what makes a row like this look subtly broken — the two
     * halves land on different optical lines even though the numbers look
     * deliberate. One baseline system for the row, always. */
    const ROW1 = fy + 14;
    const ROW2 = fy + 46;
    ctx.textBaseline = 'middle';

    if (spec.byName) {
      const ar2 = 26;
      /* Avatar centres between the two rows, not on the first — an avatar
       * optically anchors the whole block it labels. */
      drawAvatar(ctx, FX + ar2, (ROW1 + ROW2) / 2, ar2, avatar, spec.byInitials, spec.byColor);
      const nx = FX + ar2 * 2 + 18;
      ctx.font = `700 30px ${FONT}`;
      ctx.fillStyle = ink.primary;
      const nm = wrapText(ctx, spec.byName, 360, 1)[0];
      ctx.fillText(nm, nx, ROW1);
      if (spec.verified) {
        checkBadge(ctx, nx + ctx.measureText(nm).width + 22, ROW1, 14, t.accent, '#ffffff');
      }
      ctx.font = `600 22px ${FONT}`;
      ctx.fillStyle = ink.muted;
      ctx.fillText(t.person.toUpperCase(), nx, ROW2);
    }

    /* Tagline sits a step below the name in size: the poster is the fact, the
     * tagline is only the sign-off, so it must not out-weigh a person's name. */
    ctx.textAlign = 'right';
    ctx.font = `600 28px ${FONT}`;
    /* Two lines of near-black bold out-shouted the name sitting opposite it.
       Dropping to ~70% keeps the line legible while letting the eye land on
       the person first — which is the half of this row that carries a fact. */
    ctx.fillStyle = withAlphaCss(ink.primary, 0.72);
    const tag = taglineFor(spec.kind);
    ctx.fillText(tag[0], W - FX, ROW1);
    ctx.fillText(tag[1], W - FX, ROW2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.restore();                               // end of the info panel translate

    /* ══ THE CTA STRIP — the card's foot ══
     * Last thing read, and the only instruction on the card. It used to sit
     * over the bottom of the photo; with the photo on top it belongs here, at
     * the very bottom edge, where a footer goes. */
    if (hasPhoto) {
      const sy = H - STRIP;
      ctx.fillStyle = '#0E0E08';
      ctx.fillRect(0, sy, W, STRIP);
      if (logo) ctx.drawImage(logo, FX, sy + 22, 52, 52);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 34px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(ctaFor(spec.kind), FX + 72, sy + 49);
      ctx.textAlign = 'right';
      ctx.font = `500 30px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText('wecycle.page', W - FX, sy + 49);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
    ctx.restore();
  };

  paint(true);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    paint(false);
    dataUrl = canvas.toDataURL('image/png');
  }
  const blob = await new Promise<Blob | null>(res => {
    try { canvas.toBlob(res, 'image/png', 0.95); } catch { res(null); }
  });
  return { blob, dataUrl };
}

/** The reference's two-line closing tagline, per board. */
function taglineFor(kind: ShareCardKind): [string, string] {
  switch (kind) {
    case 'event':   return ['Show up.', 'Take part.'];
    case 'job':     return ['Real work.', 'On campus.'];
    case 'request': return ['Someone needs this.', 'You might have it.'];
    case 'lost':    return ['Seen it?', 'Say something.'];
    case 'found':   return ['Someone lost this.', 'Help it home.'];
    default:        return ['Don’t buy new.', 'Buy from a batchmate.'];
  }
}

/** The instruction on the photo strip — the click driver. */
function ctaFor(kind: ShareCardKind): string {
  switch (kind) {
    case 'event':   return 'Register on Wecycle';
    case 'job':     return 'Apply on Wecycle';
    case 'request': return 'Help out on Wecycle';
    case 'lost':
    case 'found':   return 'Claim it on Wecycle';
    default:        return 'Get it on Wecycle';
  }
}

/** The meta row: a boxed date for events, otherwise labelled columns. */
function drawMeta(
  ctx: CanvasRenderingContext2D, spec: ShareCardSpec, t: Theme,
  ink: ReturnType<typeof inkFor>,
  box: { fx: number; top: number; right: number },
) {
  const { fx, top } = box;
  if (spec.kind === 'event' && spec.dateBadge) {
    dateBox(ctx, {
      x: fx, y: top, w: 120, h: 140,
      top: spec.dateBadge.dow, mid: spec.dateBadge.day, bot: spec.dateBadge.mon,
      ink: ink.primary,
    });
    const tx = fx + 150;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = ink.primary;
    if (spec.dateLine) ctx.fillText(wrapText(ctx, spec.dateLine, box.right - tx, 1)[0], tx, top + 44);
    ctx.font = `400 32px ${FONT}`;
    ctx.fillStyle = ink.muted;
    if (spec.location) {
      wrapText(ctx, spec.location, box.right - tx, 2)
        .forEach((ln, i) => ctx.fillText(ln, tx, top + 92 + i * 42));
    }
    return;
  }

  /* Labelled columns — the marketplace reference's POSTED ON / CONDITION /
     SELLER row. Never more than three, never an empty one. */
  const cells = metaColumns(spec);
  const colW = (box.right - fx) / Math.max(1, cells.length);
  cells.forEach((c, i) => {
    const cx = fx + colW * i;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = ink.muted;
    ctx.fillText(c.label.toUpperCase(), cx, top + 36);
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = ink.primary;
    /* Three lines, not two. "MIT Academic Block 2" in a third-of-the-width
       column needs the third line, and a half-printed location ("MIT Academic
       B…") is useless to someone trying to find the item. Fits inside META_H
       with room to spare: last baseline lands at top+170 of 200. */
    wrapText(ctx, c.value, colW - 24, 3).forEach((ln, j) => ctx.fillText(ln, cx, top + 86 + j * 42));
  });
}

function metaColumns(spec: ShareCardSpec): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const push = (label: string, v?: string | null) => {
    const val = (v ?? '').trim();
    if (val && out.length < 3) out.push({ label, value: val });
  };
  const price = spec.price != null ? `₹${spec.price.toLocaleString('en-IN')}` : spec.badge;

  if (spec.kind === 'job') {
    push('Rate', price);
    push('Type', spec.roleLabel);
    push('Where', spec.location);
  } else if (spec.kind === 'lost' || spec.kind === 'found') {
    /* No 'Posted by' column here: the footer attribution row already carries
       the name, avatar, and verified tick. Printing it in both places read as
       a bug ("Arjun Rao" twice, 200px apart) and spent a whole column on a
       fact the reader had already been given. */
    push(spec.kind === 'lost' ? 'Last seen' : 'Found at', spec.location);
    push('Reward', spec.reward);
  } else {
    push('Price', price);
    push('Condition', spec.conditionLabel);
    push('Where', spec.location);
  }
  return out;
}

/* ── Footer ───────────────────────────────────────────────────────────────
 * One footer for every board (the old code had two that had drifted apart).
 * Order and proportion follow the HAPE reference:
 *   title (heavy, left) → attribution row (small, muted) → two-column stats
 *   panel → wordmark signature.
 *
 * Deliberately short on information. A share card's job is to make someone tap,
 * not to answer every question — the post itself does that. So: what it is, what
 * it costs, who's behind it, where, and the one extra fact that matters for the
 * board. Description, contact details and chips are all left off.
 */
function layoutFooter(
  ctx: CanvasRenderingContext2D, spec: ShareCardSpec, t: Theme, f: FooterCtx, draw: boolean,
): number {
  const { W, fx, avatar } = f;
  const ink = inkFor(t);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  /* Clear the bottom pill before the title starts. */
  let y = f.imBottom + 96;

  /* ── Title — the biggest thing on the card, 2 lines max ── */
  const TITLE = 74, LEAD = 82;
  ctx.font = `800 ${TITLE}px ${FONT}`;
  const titleLines = wrapText(ctx, spec.title, W - fx * 2, 2);
  if (draw) {
    ctx.fillStyle = ink.primary;
    titleLines.forEach((ln, i) => ctx.fillText(ln, fx, y + i * LEAD));
  }
  y += (titleLines.length - 1) * LEAD;

  /* ── Attribution row — reference's small mark + muted caps label ── */
  if (spec.byName) {
    y += 62;
    const ar = 34;
    if (draw) {
      drawAvatar(ctx, fx + ar, y - 6, ar, avatar, spec.byInitials, spec.byColor);
      const nx = fx + ar * 2 + 22;
      ctx.font = `700 36px ${FONT}`;
      ctx.fillStyle = ink.primary;
      ctx.textBaseline = 'middle';
      const nm = wrapText(ctx, spec.byName, W - nx - fx - 60, 1)[0];
      ctx.fillText(nm, nx, y - 22);
      if (spec.verified) {
        checkBadge(ctx, nx + ctx.measureText(nm).width + 26, y - 22, 16, t.accent, '#ffffff');
      }
      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = ink.muted;
      ctx.fillText(t.person.toUpperCase(), nx, y + 16);
      ctx.textBaseline = 'alphabetic';
    }
    y += ar + 6;
  }

  /* ── Stats panel — two equal columns, label over value (reference exactly) ── */
  const cells = panelCells(spec, t);
  if (cells.length) {
    y += 44;
    const ph = 150;
    if (draw) {
      roundRect(ctx, fx, y, W - fx * 2, ph, 34);
      ctx.fillStyle = ink.panel;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ink.panelHair;
      ctx.stroke();

      const inner = W - fx * 2 - 64;
      const colW = inner / cells.length;
      cells.forEach((c, i) => {
        const cx = fx + 32 + colW * i;
        ctx.font = `600 27px ${FONT}`;
        ctx.fillStyle = ink.muted;
        ctx.fillText(c.label.toUpperCase(), cx, y + 54);
        ctx.font = `800 42px ${FONT}`;
        ctx.fillStyle = ink.primary;
        ctx.fillText(wrapText(ctx, c.value, colW - 26, 1)[0], cx, y + 108);
        /* Hairline between columns, like the reference's 80|20 divider. */
        if (i > 0) {
          ctx.beginPath();
          ctx.moveTo(cx - 26, y + 34);
          ctx.lineTo(cx - 26, y + ph - 34);
          ctx.strokeStyle = ink.panelHair;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
    y += ph;
  }

  /* ── Signature — wordmark + the address, so the card says where to go ── */
  y += 54;
  const wmH = 50, wmW = wmH * WORDMARK_AR;
  if (draw && f.wordmark) {
    ctx.drawImage(tintImage(f.wordmark, wmW, wmH, ink.wordmark), (W - wmW) / 2, y, wmW, wmH);
  }
  y += wmH + 26;
  if (draw) {
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = ink.muted;
    ctx.textAlign = 'center';
    ctx.fillText('wecycle.page', W / 2, y);
    ctx.textAlign = 'left';
  }

  return y + 52;
}

/** The two facts worth a panel cell, per board. Keeps the card to essentials:
 *  never more than two, and never a cell with nothing in it. */
function panelCells(spec: ShareCardSpec, t: Theme): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const push = (label: string, value?: string | null) => {
    const v = (value ?? '').trim();
    if (v && out.length < 2) out.push({ label, value: v });
  };

  if (spec.kind === 'event') {
    push('When', spec.dateLine);
    push('Where', spec.location);
  } else if (spec.kind === 'lost' || spec.kind === 'found') {
    push(spec.kind === 'lost' ? 'Last seen' : 'Found at', spec.location);
    push('Reward', spec.reward);
  } else if (spec.kind === 'job') {
    /* The rate is already the bottom pill, so the panel carries direction and
       place instead of repeating it. */
    push('Type', spec.roleLabel);
    push('Where', spec.location);
  } else {
    push('Where', spec.location);
    push('Condition', spec.conditionLabel);
  }
  /* One cell alone looks like a mistake next to the reference's paired panel, so
     fall back to the board name rather than leaving a lopsided box. */
  if (out.length === 1) out.push({ label: 'On', value: 'Wecycle · MAHE' });
  return out;
}

function cardText(spec: ShareCardSpec): string {
  switch (spec.kind) {
    case 'request': return `Looking for "${spec.title}" on Wecycle`;
    case 'event':   return `${spec.title}${spec.dateLine ? ` · ${spec.dateLine}` : ''} — on Wecycle`;
    case 'lost':    return `Lost: "${spec.title}" — seen it? Help out on Wecycle`;
    case 'found':   return `Found: "${spec.title}" — is it yours? On Wecycle`;
    default:        return `"${spec.title}"${spec.price != null ? ` — ₹${spec.price}` : ''} on Wecycle`;
  }
}

export type ShareCardResult = 'shared' | 'downloaded' | 'copied' | 'unavailable';

/** Share the rendered card AS AN IMAGE, with the product link in the caption.
 *  Falls back to a PNG download + link copy where files can't be shared. */
export async function shareCardBlob(blob: Blob | null, spec: ShareCardSpec): Promise<ShareCardResult> {
  if (typeof navigator === 'undefined') return 'unavailable';
  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : 'https://wecycle.page');

  if (blob) {
    const file = new File([blob], `wecycle-${spec.kind}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
    };
    /* The link goes in `text` ONLY.
     *
     * Passing both `text` (ending in the url) and `url` made WhatsApp print the
     * link twice — it appends `url` to whatever `text` already says, so the
     * bubble carried the same 71-character link back to back. Dropping `url`
     * instead of trimming it from `text` is deliberate: many share targets
     * silently discard `url` when `files` is present, so keeping it there
     * risked sharing a card with no link at all. One copy, guaranteed. */
    const data: ShareData = {
      files: [file], title: spec.title, text: `${cardText(spec)}\n${url}`,
    } as ShareData;
    if (typeof nav.share === 'function' && nav.canShare?.(data)) {
      try {
        await nav.share(data);
        haptics.light();
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'shared';
      }
    }
  }
  return downloadCardBlob(blob, spec);
}

export async function downloadCardBlob(blob: Blob | null, spec: ShareCardSpec): Promise<ShareCardResult> {
  if (!blob || typeof document === 'undefined') return 'unavailable';
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `wecycle-${spec.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || spec.kind}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1500);

  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : '');
  try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
  haptics.success();
  return 'downloaded';
}
