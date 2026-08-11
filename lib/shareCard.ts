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
const MARKET: Stops = ['#FFFFFF', '#F4FBF6', '#A7E4BC', '#2C9A58'];
const WORK:   Stops = ['#F6FCE2', '#CDEE93', '#55B863', '#F3C63F'];
const EVENTS: Stops = ['#4C1D95', '#6D28D9', '#B0389A', '#F5B331'];
const FINDS:  Stops = ['#FFF7F0', '#FFCAA3', '#FF7A18', '#EC3A63'];

const THEME: Record<ShareCardKind, Theme> = {
  item:    { label: 'For sale',  colors: MARKET, light: true,  glyph: '📦', person: 'Verified member', accent: '#0B7A46' },
  request: { label: 'Wanted',    colors: MARKET, light: true,  glyph: '🙌', person: 'Verified member', accent: '#0B7A46' },
  job:     { label: 'Hiring',    colors: WORK,   light: true,  glyph: '💼', person: 'Posted by',       accent: '#1F7A3D' },
  event:   { label: 'Event',     colors: EVENTS, light: false, glyph: '🎉', person: 'Organiser',       accent: '#FFD84D' },
  lost:    { label: 'Lost',      colors: FINDS,  light: true,  glyph: '🔎', person: 'Reported by',     accent: '#D62E52' },
  found:   { label: 'Found',     colors: FINDS,  light: true,  glyph: '✅', person: 'Found by',        accent: '#D62E52' },
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

/** Decorative barcode, deterministic from the post URL so a card is stable. */
function barcode(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ink: string, seed: string,
) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  ctx.fillStyle = ink;
  let cx = x;
  while (cx < x + w - 2) {
    const bw = 2 + Math.floor(rnd() * 5);
    if (rnd() > 0.34) ctx.fillRect(cx, y, bw, h);
    cx += bw + 1 + Math.floor(rnd() * 3);
  }
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
  const PAD = 48;
  const R = 56;
  const FX = 72;            // content gutter (reference is generous)

  const t = THEME[spec.kind];
  const ink = inkFor(t);

  const canvas = document.createElement('canvas');
  canvas.width = W + PAD * 2;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [wordmark, logo, hero] = await Promise.all([
    loadImage('/brand/wordmark.png', false),
    loadImage('/brand/logomark.png', false),
    urls[0] ? loadImage(urls[0], true) : Promise.resolve(null),
  ]);

  /* ── Panel A height, measured ── */
  ctx.font = `800 92px ${FONT}`;
  const titleLines = wrapText(ctx, spec.title, W - FX * 2 - 40, 2);
  const subtitle = (spec.description ?? '').trim();
  ctx.font = `400 38px ${FONT}`;
  const subLines = subtitle ? wrapText(ctx, subtitle, W - FX * 2 - 120, 2) : [];

  const TOP_ROW = 56 + 62;                       // pill row
  const TITLE_TOP = TOP_ROW + 66;
  const TITLE_H = titleLines.length * 100;
  const SUB_H = subLines.length ? 20 + subLines.length * 50 : 0;
  const META_H = 190;                            // date box / columns + arrow
  const FOOT_H = 138;                            // barcode + tagline
  const panelA = Math.round(TITLE_TOP + TITLE_H + SUB_H + 46 + META_H + 34 + FOOT_H);

  /* ── Panel B: the photo, uncropped ──
   * Height follows the image's own ratio so an in-range photo fills the panel
   * exactly. Clamped at both ends because the panels have to add up to a
   * shareable shape: a square photo left unclamped made a 1:2.2 card, which
   * WhatsApp crops and Instagram won't take. Past the clamp the image is
   * letterboxed on the white bed rather than cut — never cropped, ever. */
  const hasPhoto = !!hero;
  const STRIP = 96;                              // CTA strip over the photo
  const natural = hero ? hero.width / hero.height : 1.6;
  const photoH = Math.round(Math.min(820, Math.max(520, W / natural)));
  const panelB = hasPhoto ? photoH + STRIP : 0;

  const H = panelA + panelB;
  canvas.height = H + PAD * 2;

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

    /* ══ PANEL A — the gradient ══ */
    paintWash(ctx, W, panelA + (hasPhoto ? 0 : 0), t.colors);
    /* The wash covers the whole card when there's no photo panel. */
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
    ctx.font = `800 92px ${FONT}`;
    ctx.fillStyle = ink.primary;
    ctx.textBaseline = 'alphabetic';
    titleLines.forEach((ln, i) => ctx.fillText(ln, FX, TITLE_TOP + 74 + i * 100));

    let y = TITLE_TOP + 74 + (titleLines.length - 1) * 100;

    /* Subtitle */
    if (subLines.length) {
      ctx.font = `400 38px ${FONT}`;
      ctx.fillStyle = ink.muted;
      subLines.forEach((ln, i) => ctx.fillText(ln, FX, y + 62 + i * 50));
      y += 62 + (subLines.length - 1) * 50;
    }

    /* Hairline → meta row → hairline (reference's rhythm exactly) */
    y += 52;
    const hair = (yy: number) => {
      ctx.strokeStyle = withAlphaCss(ink.primary, 0.18);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(FX, yy); ctx.lineTo(W - FX, yy); ctx.stroke();
    };
    hair(y);

    const metaTop = y + 34;
    const arrowR = 48;
    const arrowCx = W - FX - arrowR;
    drawMeta(ctx, spec, t, ink, { fx: FX, top: metaTop, right: arrowCx - arrowR - 40 });
    arrowButton(ctx, arrowCx, metaTop + 56, arrowR,
      ink.arrowFill, ink.arrowInk);

    y = metaTop + META_H - 34;
    hair(y);

    /* Barcode + tagline — the reference's closing line. */
    const bcY = y + 36;
    barcode(ctx, FX, bcY, 300, 62, withAlphaCss(ink.primary, 0.85), spec.url ?? spec.title);
    ctx.textAlign = 'right';
    ctx.font = `600 32px ${FONT}`;
    ctx.fillStyle = ink.primary;
    const tag = taglineFor(spec.kind);
    ctx.fillText(tag[0], W - FX, bcY + 26);
    ctx.fillText(tag[1], W - FX, bcY + 66);
    ctx.textAlign = 'left';

    /* ══ PANEL B — the photo + the call to action ══ */
    if (hasPhoto) {
      const py = panelA;
      const ph = H - panelA;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, py, W, ph);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, py, W, ph);
      const photo = useHero ? hero : null;
      if (photo) containDraw(ctx, photo, 0, py, W, ph - STRIP);
      /* CTA strip: logomark + the one instruction that makes someone tap. */
      const sy = py + ph - STRIP;
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
      ctx.restore();
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
    wrapText(ctx, c.value, colW - 24, 2).forEach((ln, j) => ctx.fillText(ln, cx, top + 86 + j * 42));
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
    push(spec.kind === 'lost' ? 'Last seen' : 'Found at', spec.location);
    push('Reward', spec.reward);
    push('Posted by', spec.byName);
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
    const data: ShareData = { files: [file], title: spec.title, text: `${cardText(spec)}\n${url}`, url } as ShareData;
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
