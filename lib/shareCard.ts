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

export type ShareCardKind = 'item' | 'request' | 'job' | 'event' | 'lost' | 'found' | 'storefront';

/* ── Storefront card styles ────────────────────────────────────────────────
 *
 * A storefront card is an advert for a PERSON, not for one object, so it gets
 * its own look and its own pair of palettes to pick between. Two, not six: a
 * carousel of six is a decision, and the poster came here to share a shop, not
 * to art-direct. Two is a glance.
 *
 * Both are dark-led, which is the one thing every profile card in the
 * references had in common and the reason they read as a brand rather than as
 * a form. Amber is the loud one; Forest is the Wecycle-green one for people who
 * want it to look like the app it came from. */
export type StorefrontStyle = 'amber' | 'forest';

interface StoreTheme {
  id: StorefrontStyle;
  label: string;
  wash: Stops;
  panel: string;
  ink: string;
  inkMuted: string;
  accent: string;
  /** Ink that sits ON the accent — checked, not guessed. */
  onAccent: string;
}

export const STOREFRONT_STYLES: StoreTheme[] = [
  {
    id: 'amber', label: 'Ember',
    /* Orange into near-black. The panel stays black so the accent has somewhere
       dark to be bright against; an orange panel would flatten the whole card. */
    wash: ['#7C2D12', '#C2410C', '#EA580C', '#F59E0B'],
    panel: '#141210', ink: '#FFFFFF', inkMuted: 'rgba(255,255,255,0.62)',
    accent: '#FB923C', onAccent: '#1A0F06',
  },
  {
    id: 'forest', label: 'Forest',
    wash: ['#04170E', '#07301C', '#0A5C36', '#0E7A47'],
    panel: '#0B0F0C', ink: '#FFFFFF', inkMuted: 'rgba(255,255,255,0.60)',
    /* The app's own lime. On #0B0F0C it clears 13:1, so it can carry the CTA
       label in black and still be the brightest thing on the card. */
    accent: '#A8DD00', onAccent: '#0A1200',
  },
];

export interface ShareCardSpec {
  kind: ShareCardKind;
  title: string;
  imageUrls?: string[];
  price?: number;
  /** The money exactly as it should read — "₹200 / day", "Swap for a
   *  calculator", "Free". Built by lib/dealTypes so the card, the feed and the
   *  detail page cannot render the same listing three different ways. Falls
   *  back to `price` when absent. */
  priceLine?: string;
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
  /* ── Storefront cards ── */
  /** @handle under the name. */
  storeHandle?: string;
  /** Up to three "12 shared" style facts. More than three stops being a glance
   *  and starts being a table. */
  storeStats?: { label: string; value: string }[];
  /** Which of STOREFRONT_STYLES to paint. Defaults to the first. */
  cardStyle?: StorefrontStyle;
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
  /* Present so the map stays exhaustive, but never actually painted: a
     storefront card takes its palette from STOREFRONT_STYLES and renders on
     a separate path entirely. Values mirror `item` so any code reading THEME
     generically gets something sane rather than undefined. */
  storefront: { label: 'Storefront', colors: MARKET, light: false, glyph: '\u{1F6CD}', person: 'Shop by', accent: '#A8DD00' },
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

/** Load an image, or give up.
 *
 *  The timeout is the point. onload and onerror between them cover a request
 *  that succeeds and one that fails, but not one that STALLS — and a stalled
 *  image leaves this promise pending forever, which hangs the whole card behind
 *  a Promise.all that never settles. The user then sees a spinner that never
 *  becomes a card, with no error anywhere, because nothing actually threw.
 *
 *  Eight seconds, then resolve null and draw the card without the photo. A
 *  card missing its photo still says what is for sale; a card that never
 *  appears says nothing at all. */
function loadImage(src: string, cors = true, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    let settled = false;
    const done = (v: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => done(img);
    img.onerror = () => done(null);
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
/** A blurred, scaled-up copy of the image behind a contained one.
 *
 * Used only where the image must not be cropped (see the event case in the
 * renderer). Nothing is cut, and the space beside a poster reads as deliberate
 * rather than as bars.
 *
 * The blur comes from downscaling to a few dozen pixels and letting the canvas
 * smooth it back up, NOT from ctx.filter: filter support in older iOS WebViews
 * is patchy, and a bed that silently fails to blur looks like the image has
 * been printed twice — a worse failure than the space it replaces. */
function blurredBed(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const TINY = 28;
  const th = Math.max(2, Math.round(TINY * (img.height / img.width)));
  let tiny: HTMLCanvasElement;
  try { tiny = document.createElement('canvas'); } catch { return; }
  tiny.width = TINY; tiny.height = th;
  const tctx = tiny.getContext('2d');
  if (!tctx) return;
  tctx.drawImage(img, 0, 0, TINY, th);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const ir = TINY / th, rr = w / h;
  const dw = ir > rr ? h * ir : w;
  const dh = ir > rr ? h : w / ir;
  ctx.drawImage(tiny, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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

/* ── Card geometry ─────────────────────────────────────────────────────────
 *
 * 1080 x 1350 — 4:5 — and fixed, where the old card computed its height from
 * its content and came out somewhere near square.
 *
 * 4:5 is the one aspect ratio that is right in both places these get sent.
 * Instagram's feed crops anything taller and letterboxes anything wider, so 4:5
 * is the largest a post can be without losing pixels: the most screen a card
 * can occupy while someone scrolls past it. WhatsApp shows a 4:5 image whole in
 * the bubble, where a 9:16 story-shaped card gets clipped to a thumbnail and
 * the price stops being readable before anyone taps.
 *
 * The structure inverts the old one. That card gave the top panel to a gradient
 * carrying every word and put the photo second; these cards put the PHOTO
 * first and largest, because a share card competes in a feed of other people's
 * photos and loses on text. The photo is 700 of the card's 1350 — a clear
 * majority of the visual field — and the words sit under it on a white panel
 * where they are read rather than decoded.
 *
 * The brand wash survives as the surround. It is what makes a Wecycle card
 * recognisable at thumbnail size, when the title is far too small to read. */
const CARD_W = 1080;
const CARD_H = 1350;

/* ── Storefront card ───────────────────────────────────────────────────────
 *
 * An advert for a PERSON rather than for one object, so the composition is the
 * one every profile card converges on and not the product layout above: a cover
 * band, an avatar breaking the line between cover and panel, the name, a line
 * about them, and a row of numbers that says this shop is real.
 *
 * The avatar overlapping the boundary is the load-bearing detail. It is what
 * makes the card read as one object instead of two stacked rectangles, and it
 * puts the face — the thing a person recognises fastest — exactly on the seam
 * the eye already stops at.
 *
 * The stats row is doing trust work, not decoration. A storefront with "23
 * shared · 41 saved" is a person who has done this before, which is the single
 * fact that decides whether a stranger messages them. */
async function renderStorefrontCard(spec: ShareCardSpec): Promise<RenderedCard> {
  const st = STOREFRONT_STYLES.find(x => x.id === spec.cardStyle) ?? STOREFRONT_STYLES[0];

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [wordmark, avatar, cover] = await Promise.all([
    loadImage('/brand/wordmark.png', false),
    spec.byAvatar ? loadImage(spec.byAvatar, true) : Promise.resolve(null),
    urls[0] ? loadImage(urls[0], true) : Promise.resolve(null),
  ]);

  const M = 56;
  const HEAD = 96;
  const PANEL_X = M, PANEL_Y = HEAD;
  const PANEL_W = CARD_W - M * 2;
  const PANEL_H = CARD_H - HEAD - 84;
  const PANEL_R = 44;
  const COVER_H = 470;
  const AV_R = 92;
  const FX = PANEL_X + 52;
  const TEXT_W = PANEL_W - 104;

  const name = (spec.byName || spec.title || 'Storefront').trim();
  const handle = spec.storeHandle?.trim();
  const bio = (spec.description ?? '').replace(/\s+/g, ' ').trim();
  const stats = (spec.storeStats ?? []).slice(0, 3);

  /* Name auto-fit — a shop called "Nayonika Gottimukkula" and one called "Pri"
     cannot share a font size. */
  let nameSize = 68;
  for (const size of [68, 60, 52, 46]) {
    ctx.font = `800 ${size}px ${FONT}`;
    nameSize = size;
    if (ctx.measureText(name).width <= TEXT_W) break;
  }
  ctx.font = `400 31px ${FONT}`;
  const bioLines = bio ? wrapText(ctx, bio, TEXT_W, 3) : [];

  const paint = (withPhotos: boolean) => {
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    paintWash(ctx, CARD_W, CARD_H, st.wash);
    paintGrain(ctx, CARD_W, CARD_H, 0.12, 1);

    /* Brand strip */
    if (wordmark) {
      const wmH = 38;
      const wmW = wmH * (wordmark.width / wordmark.height);
      ctx.drawImage(tintImage(wordmark, Math.round(wmW), wmH, '#FFFFFF'), M, (HEAD - wmH) / 2 - 2, wmW, wmH);
    }
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOREFRONT', CARD_W - M, HEAD / 2 - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* Panel */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = st.panel;
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, PANEL_R); ctx.fill();
    ctx.restore();

    /* Cover band, clipped to the panel's top corners only. */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(PANEL_X, PANEL_Y + COVER_H);
    ctx.lineTo(PANEL_X, PANEL_Y + PANEL_R);
    ctx.arcTo(PANEL_X, PANEL_Y, PANEL_X + PANEL_R, PANEL_Y, PANEL_R);
    ctx.lineTo(PANEL_X + PANEL_W - PANEL_R, PANEL_Y);
    ctx.arcTo(PANEL_X + PANEL_W, PANEL_Y, PANEL_X + PANEL_W, PANEL_Y + PANEL_R, PANEL_R);
    ctx.lineTo(PANEL_X + PANEL_W, PANEL_Y + COVER_H);
    ctx.closePath();
    ctx.clip();
    if (withPhotos && cover) {
      coverDraw(ctx, cover, PANEL_X, PANEL_Y, PANEL_W, COVER_H);
      /* A scrim under the avatar side so a bright photo cannot swallow it. */
      const g = ctx.createLinearGradient(0, PANEL_Y + COVER_H - 220, 0, PANEL_Y + COVER_H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(PANEL_X, PANEL_Y + COVER_H - 220, PANEL_W, 220);
    } else {
      paintWash(ctx, PANEL_W, COVER_H, st.wash);
      ctx.save();
      ctx.translate(PANEL_X, PANEL_Y);
      paintGrain(ctx, PANEL_W, COVER_H, 0.1, 1);
      ctx.restore();
    }
    ctx.restore();

    /* Avatar, straddling the seam. */
    const avCx = FX + AV_R;
    const avCy = PANEL_Y + COVER_H;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx, avCy, AV_R + 10, 0, Math.PI * 2);
    ctx.fillStyle = st.panel;
    ctx.fill();
    ctx.restore();
    drawAvatar(ctx, avCx, avCy, AV_R, withPhotos ? avatar : null, spec.byInitials, spec.byColor ?? st.accent);

    /* Words */
    ctx.textBaseline = 'top';
    let y = avCy + AV_R + 34;

    ctx.fillStyle = st.ink;
    ctx.font = `800 ${nameSize}px ${FONT}`;
    ctx.fillText(name, FX, y);
    y += Math.round(nameSize * 1.12);

    if (handle) {
      ctx.fillStyle = st.accent;
      ctx.font = `600 32px ${FONT}`;
      ctx.fillText(handle.startsWith('@') ? handle : `@${handle}`, FX, y);
      y += 46;
    }

    if (bioLines.length) {
      y += 10;
      ctx.fillStyle = st.inkMuted;
      ctx.font = `400 31px ${FONT}`;
      for (const line of bioLines) { ctx.fillText(line, FX, y); y += 41; }
    }
    ctx.textBaseline = 'alphabetic';

    /* Stats row + CTA, pinned to the bottom of the panel. */
    const CTA_H = 78;
    const ctaY = PANEL_Y + PANEL_H - 46 - CTA_H;

    if (stats.length) {
      /* Clearance for the LABEL, not just the number. The row was placed 44px
         above the button, but the label sits 36px below the row's own top and
         is itself ~30px tall, so it ran straight into the CTA and read as
         "23 / shar…". Measured from the bottom of the label instead. */
      const STAT_VALUE_H = 44;
      const STAT_LABEL_H = 30;
      const rowY = ctaY - 26 - STAT_LABEL_H - STAT_VALUE_H;
      const cellW = (PANEL_W - 104) / stats.length;
      ctx.textAlign = 'left';
      stats.forEach((cell, i) => {
        const cx = FX + cellW * i;
        if (i > 0) {
          /* Hairline divider, exactly as the reference profile cards do — it is
             what turns three numbers into one row rather than three orphans. */
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(Math.round(cx - 18), rowY - 6, 1.5, 62);
        }
        ctx.fillStyle = st.ink;
        ctx.font = `800 40px ${FONT}`;
        ctx.textBaseline = 'top';
        ctx.fillText(cell.value, cx, rowY - 8);
        ctx.fillStyle = st.inkMuted;
        ctx.font = `500 25px ${FONT}`;
        ctx.fillText(cell.label, cx, rowY + 36);
        ctx.textBaseline = 'alphabetic';
      });
    }

    /* Full-width CTA — this card has one job and it is the tap. */
    ctx.fillStyle = st.accent;
    roundRect(ctx, FX, ctaY, PANEL_W - 104, CTA_H, CTA_H / 2); ctx.fill();
    ctx.fillStyle = st.onAccent;
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Visit the storefront', PANEL_X + PANEL_W / 2 - 16, ctaY + CTA_H / 2 + 1);
    const aw = ctx.measureText('Visit the storefront').width;
    const ax = PANEL_X + PANEL_W / 2 - 16 + aw / 2 + 26;
    const ay = ctaY + CTA_H / 2;
    setStroke(ctx, st.onAccent, 3.2);
    ctx.beginPath();
    ctx.moveTo(ax - 13, ay + 7); ctx.lineTo(ax + 3, ay - 9);
    ctx.moveTo(ax - 6, ay - 9); ctx.lineTo(ax + 3, ay - 9); ctx.lineTo(ax + 3, ay);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* Footer */
    ctx.font = `600 27px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('wecycle.page', CARD_W / 2, PANEL_Y + PANEL_H + (CARD_H - PANEL_Y - PANEL_H) / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  paint(true);
  let dataUrl: string;
  try { dataUrl = canvas.toDataURL('image/png'); }
  catch { paint(false); dataUrl = canvas.toDataURL('image/png'); }
  const blob = await new Promise<Blob | null>(res => {
    try { canvas.toBlob(res, 'image/png', 0.95); } catch { res(null); }
  });
  return { blob, dataUrl };
}

/* ── The card ──────────────────────────────────────────────────────────────
 *
 * Photo on top, everything else on the gradient below. The structure the owner
 * chose; what changed is which facts get the room.
 *
 * The version this replaces buried the two things a reader actually decides on
 * — what it costs and where it is — in a three-column micro-row of 28px labels,
 * making them the SMALLEST legible text on a card whose entire job is to
 * communicate them. The title was 92px and the price was 28px, which is a
 * hierarchy exactly upside down: the headline says what the thing is, and the
 * price says whether you care.
 *
 * So price and location are now anchored at fixed positions near the bottom and
 * sized to be read at a glance — the price is the largest text on the card
 * after the title, and the location sits directly beneath it, because "how much"
 * and "where" are one question asked twice.
 *
 * White, not the accent colour, for both. The per-board accents were tuned to
 * clear 2.58:1 against their own lightest stop, which is under the 3:1 WCAG
 * asks even for large text; white clears it on all four washes with room to
 * spare. Size and weight carry the hierarchy instead of hue, which is also what
 * makes the card survive being resized into a WhatsApp thumbnail.
 *
 * No call to action. This is a flat PNG that will sit in a chat — a button
 * drawn on it is a button that cannot be pressed, and a card asking to be
 * tapped when it cannot be is the fastest way to make it feel fake. The action
 * travels as the message pasted alongside it.
 *
 * No description either. It is not one of the five things this card is for, and
 * every line it takes is a line off the price. It rides in the caption instead.
 */
async function renderClassicCard(spec: ShareCardSpec): Promise<RenderedCard> {
  const t = THEME[spec.kind];

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [wordmark, avatar, hero] = await Promise.all([
    loadImage('/brand/wordmark.png', false),
    spec.byAvatar ? loadImage(spec.byAvatar, true) : Promise.resolve(null),
    urls[0] ? loadImage(urls[0], true) : Promise.resolve(null),
  ]);

  const PHOTO_H = 660;
  const FX = 72;                       // text gutter
  const TEXT_W = CARD_W - FX * 2;

  /* Bottom-anchored blocks. Price and location keep the same position on every
     card no matter how long the title runs, so someone who has seen one Wecycle
     card knows where to look on the next one. A layout that flows top-down puts
     them somewhere different each time. */
  const NAME_CY   = CARD_H - 92;       // poster row, vertical centre
  const RULE_Y    = NAME_CY - 62;
  const LOC_TOP   = RULE_Y - 34 - 46;
  const PRICE_TOP = LOC_TOP - 14 - 98;

  /* Title auto-fit into whatever is left between the photo and the price. */
  const TITLE_TOP = PHOTO_H + 46;
  const TITLE_ROOM = PRICE_TOP - 26 - TITLE_TOP;
  let titleSize = 44;
  let titleLines: string[] = [spec.title];
  for (const [size, maxLines] of [[70, 2], [62, 2], [56, 3], [50, 3], [44, 3]] as [number, number][]) {
    ctx.font = `800 ${size}px ${FONT}`;
    const lines = wrapText(ctx, spec.title, TEXT_W, maxLines);
    const lh = Math.round(size * 1.12);
    if (lines.length * lh <= TITLE_ROOM) {
      titleSize = size; titleLines = lines;
      if (!lines[lines.length - 1].endsWith('…')) break;
    }
  }
  const TITLE_LH = Math.round(titleSize * 1.12);

  const money = (spec.priceLine || (spec.price != null && Number.isFinite(spec.price)
    ? `₹${Number(spec.price).toLocaleString('en-IN')}` : '')).trim();
  const where = (spec.location ?? '').trim();
  const when  = (spec.dateLine ?? '').trim();

  const paint = (withPhoto: boolean) => {
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    paintWash(ctx, CARD_W, CARD_H, t.colors);
    paintGrain(ctx, CARD_W, CARD_H, 0.12, 1);

    /* ── Photo ── */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CARD_W, PHOTO_H);
    ctx.clip();
    if (withPhoto && hero) {
      const ir = hero.width / hero.height;
      if (Math.abs(ir - CARD_W / PHOTO_H) > 0.32) {
        blurredBed(ctx, hero, 0, 0, CARD_W, PHOTO_H);
        containDraw(ctx, hero, 0, 0, CARD_W, PHOTO_H);
      } else {
        coverDraw(ctx, hero, 0, 0, CARD_W, PHOTO_H);
      }
    } else {
      paintWash(ctx, CARD_W, PHOTO_H, t.colors);
      paintGrain(ctx, CARD_W, PHOTO_H, 0.1, 1);
      ctx.font = `400 170px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.92;
      ctx.fillText(t.glyph, CARD_W / 2, PHOTO_H / 2);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    /* A short scrim at the photo's foot so the join to the gradient reads as
       one surface rather than two stacked rectangles. */
    const seam = ctx.createLinearGradient(0, PHOTO_H - 90, 0, PHOTO_H);
    seam.addColorStop(0, 'rgba(0,0,0,0)');
    seam.addColorStop(1, withAlpha(t.colors[0], 0.5));
    ctx.fillStyle = seam;
    ctx.fillRect(0, PHOTO_H - 90, CARD_W, 90);

    /* ── Badge + wordmark ── */
    const badgeText = (spec.badge || t.label).toUpperCase();
    ctx.font = `700 27px ${FONT}`;
    const bw = ctx.measureText(badgeText).width + 62;
    const bh = 54;
    const by = PHOTO_H - bh - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, FX, by, bw, bh, bh / 2); ctx.fill();
    setStroke(ctx, 'rgba(255,255,255,0.42)', 1.6);
    roundRect(ctx, FX, by, bw, bh, bh / 2); ctx.stroke();
    ctx.fillStyle = t.accent;
    ctx.beginPath(); ctx.arc(FX + 28, by + bh / 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, FX + 46, by + bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    /* The wordmark, on the photo's bottom-right and twice the size it was.
       "Wecycle should read better" — it was 28px in a corner of the gradient,
       competing with body text; here it sits on the scrim at the card's optical
       centre-right, which is where a maker's mark belongs. */
    if (wordmark) {
      const wmH = 46;
      const wmW = wmH * (wordmark.width / wordmark.height);
      const white = tintImage(wordmark, Math.round(wmW), wmH, '#FFFFFF');
      ctx.drawImage(white, CARD_W - FX - wmW, by + (bh - wmH) / 2, wmW, wmH);
    } else {
      ctx.font = `800 40px ${FONT}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('Wecycle', CARD_W - FX, by + bh / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    /* ── Title ── */
    /* Bottom-anchored, growing upward from just above the price. Anchoring it
       to the top of the panel instead left a floating band of empty gradient
       between a two-line title and the price below — the words read as two
       unrelated groups with a hole between them. Title, price and location are
       one block making one statement, so they sit together and the slack goes
       above them where it reads as breathing room against the photo. */
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${titleSize}px ${FONT}`;
    let ty = Math.max(TITLE_TOP, PRICE_TOP - 30 - titleLines.length * TITLE_LH);
    for (const line of titleLines) { ctx.fillText(line, FX, ty); ty += TITLE_LH; }

    /* ── Price — the largest thing on the card after the headline ── */
    if (money) {
      let ps = 98;
      for (const size of [98, 84, 70, 58, 48, 40]) {
        ctx.font = `800 ${size}px ${FONT}`;
        ps = size;
        if (ctx.measureText(money).width <= TEXT_W) break;
      }
      ctx.font = `800 ${ps}px ${FONT}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(money, FX, PRICE_TOP + (98 - ps));
    }

    /* ── Location — directly beneath the price, same gutter, one question ── */
    const place = where || when;
    if (place) {
      ctx.textBaseline = 'middle';
      const cy = LOC_TOP + 23;
      /* Filled pin: a stroked one dissolves when the card is scaled into a
         chat bubble. */
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(FX + 13, cy - 4, 13, Math.PI * 0.82, Math.PI * 0.18, false);
      ctx.lineTo(FX + 13, cy + 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha(t.colors[1], 1);
      ctx.beginPath(); ctx.arc(FX + 13, cy - 5, 5, 0, Math.PI * 2); ctx.fill();

      ctx.font = `600 44px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      const line = wrapText(ctx, where && when ? `${where}  ·  ${when}` : place, TEXT_W - 46, 1)[0];
      ctx.fillText(line, FX + 40, cy + 1);
      ctx.textBaseline = 'alphabetic';
    }

    /* ── Rule ── */
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(FX, RULE_Y, TEXT_W, 1.5);

    /* ── Who posted it — the credibility line ── */
    const r = 34;
    drawAvatar(ctx, FX + r, NAME_CY, r, avatar, spec.byInitials, spec.byColor);
    ctx.textBaseline = 'middle';
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    const nameX = FX + r * 2 + 22;
    const name = spec.byName || 'A Wecycle member';
    ctx.fillText(name, nameX, NAME_CY - 1);
    if (spec.verified) {
      const nw = ctx.measureText(name).width;
      checkBadge(ctx, nameX + nw + 24, NAME_CY - 1, 15, t.accent, '#0B1F14');
    }

    /* The domain, right-aligned on the same line. Not a button: it is where the
       card came from, which is what makes it checkable. */
    ctx.font = `600 32px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.74)';
    ctx.textAlign = 'right';
    ctx.fillText('wecycle.page', CARD_W - FX, NAME_CY - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  paint(true);
  let dataUrl: string;
  try { dataUrl = canvas.toDataURL('image/png'); }
  catch { paint(false); dataUrl = canvas.toDataURL('image/png'); }
  const blob = await new Promise<Blob | null>(res => {
    try { canvas.toBlob(res, 'image/png', 0.95); } catch { res(null); }
  });
  return { blob, dataUrl };
}

/** Which listing layout ships. Both are maintained; this is the switch.
 *
 * 'spotlight' — hero photo on top, words on a white panel below.
 * 'classic'   — photo on top, words on the gradient, price and location large.
 *
 * Back on spotlight at the owner's call after seeing both side by side. The
 * classic renderer stays whole and reachable by flipping this one word; neither
 * layout is a branch to be reconstructed. */
const CARD_LAYOUT: 'classic' | 'spotlight' = 'spotlight';

export async function renderShareCard(spec: ShareCardSpec): Promise<RenderedCard> {
  /* A storefront advertises a person and takes a different composition
     entirely — cover, avatar on the seam, bio, stats — so it renders on its
     own path rather than through a pile of conditionals. */
  if (spec.kind === 'storefront') return renderStorefrontCard(spec);
  return CARD_LAYOUT === 'classic' ? renderClassicCard(spec) : renderSpotlightCard(spec);
}

/* KEPT, NOT DEFAULT.
 *
 * The photo-first layout: hero photo on top, words on a white panel below.
 * Superseded by renderClassicCard, which the owner preferred, but retained
 * whole rather than deleted — it is a working second opinion and the two
 * differ in structure rather than in polish, so a future call between them is
 * a one-line change to CARD_LAYOUT and not a rebuild. */
async function renderSpotlightCard(spec: ShareCardSpec): Promise<RenderedCard> {
  const t = THEME[spec.kind];

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [wordmark, logo, avatar, hero] = await Promise.all([
    loadImage('/brand/wordmark.png', false),
    loadImage('/brand/logomark.png', false),
    spec.byAvatar ? loadImage(spec.byAvatar, true) : Promise.resolve(null),
    urls[0] ? loadImage(urls[0], true) : Promise.resolve(null),
  ]);

  /* Panel geometry. The white card floats on the wash with an even margin, and
     the photo insets again inside it — the double inset is what the reference
     cards all do and what stops the photo reading as a banner welded to the
     top edge. */
  const M = 56;                         // wash margin around the white card
  const HEAD = 96;                      // brand strip above the card
  const PANEL_X = M;
  const PANEL_Y = HEAD;
  const PANEL_W = CARD_W - M * 2;
  const PANEL_H = CARD_H - HEAD - 84;   // leaves the footer line on the wash
  const PANEL_R = 44;

  const PP = 22;                        // photo inset inside the panel
  const PHOTO_X = PANEL_X + PP;
  const PHOTO_Y = PANEL_Y + PP;
  const PHOTO_W = PANEL_W - PP * 2;
  const PHOTO_H = 700;
  const PHOTO_R = 30;

  const FX = PANEL_X + 46;              // text gutter inside the panel
  const TEXT_W = PANEL_W - 92;

  /* ── Measure the text before drawing any of it ── */
  const INK = '#12120E';
  const INK_MUTED = '#5C5C52';

  /* Title auto-fit. The title is the one thing on the card that must never be
     cut — a card reading "Lost black Casio watch near the libr…" has failed at
     its only job. Step down through size/line pairs and take the first that
     fits whole, holding the big size and spending a line before shrinking. */
  const TITLE_STEPS: [number, number][] = [[64, 2], [58, 2], [52, 3], [46, 3], [40, 3]];
  let titleSize = 40;
  let titleLines: string[] = [spec.title];
  for (const [size, maxLines] of TITLE_STEPS) {
    ctx.font = `800 ${size}px ${FONT}`;
    const lines = wrapText(ctx, spec.title, TEXT_W, maxLines);
    titleSize = size; titleLines = lines;
    if (!lines[lines.length - 1].endsWith('…')) break;
  }
  const TITLE_LH = Math.round(titleSize * 1.14);

  /* Description — asked for on every kind of card, capped at two lines. Two is
     the honest cap: it is enough for the sentence that makes someone tap, and
     more would push the price off the panel, which is the one number the card
     exists to communicate. */
  const desc = (spec.description ?? '').replace(/\s+/g, ' ').trim();
  ctx.font = `400 32px ${FONT}`;
  const descLines = desc ? wrapText(ctx, desc, TEXT_W, 2) : [];

  const paint = (withPhoto: boolean) => {
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    /* ── Brand wash ── */
    paintWash(ctx, CARD_W, CARD_H, t.colors);
    paintGrain(ctx, CARD_W, CARD_H, 0.12, 1);

    /* ── Brand strip ──
       Wecycle is named at the TOP, before the photo, not tucked in a corner at
       the bottom. On a card that will be seen mid-scroll among other people's
       photos, the mark has to be where the eye already is. */
    if (wordmark) {
      const wmH = 38;
      const wmW = wmH * (wordmark.width / wordmark.height);
      ctx.save();
      /* The wordmark art is dark; on a dark wash it needs to be white. */
      const white = tintImage(wordmark, Math.round(wmW), wmH, '#FFFFFF');
      ctx.drawImage(white, M, (HEAD - wmH) / 2 - 2, wmW, wmH);
      ctx.restore();
    } else {
      ctx.font = `800 36px ${FONT}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText('Wecycle', M, HEAD / 2 - 2);
      ctx.textBaseline = 'alphabetic';
    }

    /* Kind badge, top right — "FOR RENT", "LOST", "EVENT". */
    const badgeText = (spec.badge || t.label).toUpperCase();
    ctx.font = `700 24px ${FONT}`;
    const bw = ctx.measureText(badgeText).width + 56;
    const bh = 46;
    const bx = CARD_W - M - bw;
    const by = (HEAD - bh) / 2 - 2;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
    setStroke(ctx, 'rgba(255,255,255,0.34)', 1.5);
    roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.stroke();
    ctx.fillStyle = t.accent;
    ctx.beginPath(); ctx.arc(bx + 26, by + bh / 2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bx + 42, by + bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    /* ── White panel ── */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, PANEL_R); ctx.fill();
    ctx.restore();

    /* ── The photo, dominant ── */
    ctx.save();
    roundRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, PHOTO_R);
    ctx.clip();
    if (withPhoto && hero) {
      /* A blurred bed behind a contained draw keeps a portrait photo from
         sitting on dead grey bars — the bed IS the photo, so the fill always
         relates to the subject. */
      const ir = hero.width / hero.height;
      const rr = PHOTO_W / PHOTO_H;
      if (Math.abs(ir - rr) > 0.32) {
        blurredBed(ctx, hero, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
        containDraw(ctx, hero, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
      } else {
        coverDraw(ctx, hero, PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);
      }
    } else {
      /* No photo: the wash again, one shade up, with the kind's glyph. Never a
         grey box — an empty card still has to look deliberate. */
      paintWash(ctx, PHOTO_W, PHOTO_H, t.colors);
      ctx.save();
      ctx.translate(PHOTO_X, PHOTO_Y);
      paintGrain(ctx, PHOTO_W, PHOTO_H, 0.10, 1);
      ctx.restore();
      ctx.font = `400 160px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.9;
      ctx.fillText(t.glyph, PHOTO_X + PHOTO_W / 2, PHOTO_Y + PHOTO_H / 2);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    /* ── Words ──
       textBaseline 'top' rather than the default 'alphabetic', so the gap below
       the photo is the gap you actually SEE. On the alphabetic baseline the
       measurement runs to the foot of the letters, and a 64px title puts its
       cap height 46px back up into that space — a nominal 54px gap rendered as
       about eight, and the title read as welded to the photo. */
    ctx.textBaseline = 'top';
    let y = PHOTO_Y + PHOTO_H + 44;

    ctx.fillStyle = INK;
    ctx.font = `800 ${titleSize}px ${FONT}`;
    for (const line of titleLines) {
      ctx.fillText(line, FX, y);
      y += TITLE_LH;
    }

    if (descLines.length) {
      y += 14;
      ctx.fillStyle = INK_MUTED;
      ctx.font = `400 32px ${FONT}`;
      for (const line of descLines) {
        ctx.fillText(line, FX, y);
        y += 42;
      }
    }
    ctx.textBaseline = 'alphabetic';

    /* ── Price + call to action, on one line ──
       The reference cards all pair them: the number on the left, the action on
       the right, at the bottom of the panel. It works because those are the two
       things a reader wants in that order — what does it cost, and how do I get
       it — and putting them on one line means the eye never has to hunt for the
       second after finding the first. */
    const priceText = (spec.price != null && Number.isFinite(spec.price))
      ? `₹${Number(spec.price).toLocaleString('en-IN')}`
      : (spec.badge || '');
    const money = spec.priceLine || priceText;

    /* ── Price ──
       No call to action beside it any more. This is a flat PNG that will sit in
       a chat: a button drawn on it is a button that cannot be pressed, and a
       card asking to be tapped when it cannot be is the fastest way to make it
       look fake. The action travels as the message pasted alongside, which is
       where it actually works — so the money gets the full width instead of
       sharing the row with a decoration. */
    const PRICE_H = 84;
    const rowY = PANEL_Y + PANEL_H - 44 - PRICE_H;

    if (money) {
      /* Auto-fit: "Swap for any scientific calculator" and "₹450" are the same
         field and cannot share one size. Bigger than before now that nothing
         competes for the row. */
      let moneySize = 76;
      const moneyMax = PANEL_W - 92;
      for (const size of [76, 64, 54, 44, 36, 30]) {
        ctx.font = `800 ${size}px ${FONT}`;
        moneySize = size;
        if (ctx.measureText(money).width <= moneyMax) break;
      }
      ctx.font = `800 ${moneySize}px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(money, FX, rowY + PRICE_H / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }

    /* ── Meta line: location and date, above the price row ── */
    const metaBits = [spec.location, spec.dateLine].filter(Boolean) as string[];
    if (metaBits.length) {
      const metaY = rowY - 34;
      /* 34px, not 27. Location was the smallest text on a card that exists in
         part to say where the thing is — and it is half of the question the
         price asks. */
      ctx.font = `600 34px ${FONT}`;
      ctx.fillStyle = INK_MUTED;
      ctx.textBaseline = 'middle';
      let mx = FX;
      /* A FILLED pin, not a stroked one. At this size a 2.4px outline is a
         couple of device pixels once the card is scaled into a chat bubble,
         and it dissolves into a grey smudge; a solid shape with a knocked-out
         centre survives the downscale and still reads as a map pin. */
      ctx.save();
      const px = mx + 8, py = metaY - 2;
      ctx.fillStyle = INK_MUTED;
      ctx.beginPath();
      ctx.arc(px, py, 8, Math.PI * 0.82, Math.PI * 0.18, false);
      ctx.lineTo(px, py + 14);
      ctx.closePath();
      ctx.fill();
      /* The hole. Drawn in the panel's own white rather than punched out with
         a composite operation, which would also erase the panel beneath it. */
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py - 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      mx += 30;
      const metaText = metaBits.join('  ·  ');
      const metaLines = wrapText(ctx, metaText, TEXT_W - 34, 1);
      ctx.fillText(metaLines[0], mx, metaY + 1);
      ctx.textBaseline = 'alphabetic';
    }

    /* ── Footer, on the wash ── */
    ctx.font = `600 27px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const by2 = PANEL_Y + PANEL_H + (CARD_H - PANEL_Y - PANEL_H) / 2;
    const who = spec.byName ? `${spec.byName}  ·  wecycle.page` : 'wecycle.page';
    ctx.fillText(who, CARD_W / 2, by2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* Avatar tucked left of the footer line when we have one. */
    if (avatar || spec.byInitials) {
      const r = 24;
      ctx.save();
      drawAvatar(ctx, M + r, by2, r, avatar, spec.byInitials, spec.byColor);
      ctx.restore();
    }
    void logo;
  };

  paint(true);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    /* A cross-origin photo taints the canvas and toDataURL throws. Repaint
       without it rather than returning nothing — a card with the wash and the
       words still says what is for sale. */
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

/* ── The message that travels with the card ────────────────────────────────
 *
 * The caption is doing more work than the card is. On WhatsApp the image
 * arrives collapsed in a bubble and the TEXT is what someone reads first; in a
 * group of ninety students, that one line decides whether anyone opens it.
 *
 * So it is written per context, in the voice of the person sharing rather than
 * the platform announcing. "Lost: watch — seen it?" is what a person types.
 * "Check out this listing on Wecycle" is what an app types, and it is ignored
 * for the same reason every forwarded marketing line is ignored.
 *
 * Three rules held throughout: say the THING first, because that is what
 * someone is deciding on; keep it to one line, because two lines get truncated
 * in the preview anyway; and never manufacture urgency, since a swap drive that
 * claims to be nearly over and is not costs the poster their credibility the
 * first time someone checks.
 */
function cardText(spec: ShareCardSpec): string {
  const title = spec.title.trim();
  const money = spec.priceLine?.trim();
  const where = spec.location?.trim();

  switch (spec.kind) {
    case 'request':
      /* An ask, phrased as one. The person sharing is admitting they need
         something, so the line does the admitting for them. */
      /* Phrased to dodge the article. "Anyone got scientific calculator" needs
         an "a" that cannot be derived reliably — "a calculator" but "an easel",
         and neither for "AirPods" — so the sentence is built to not need one. */
      return `Looking for: ${lowerFirst(title)} — anyone got one going spare? 👀`;

    case 'event':
      return spec.dateLine
        ? `${title} — ${spec.dateLine}${where ? `, ${where}` : ''}. Details on Wecycle 🎪`
        : `${title}${where ? ` at ${where}` : ''} — details on Wecycle 🎪`;

    case 'lost':
      /* The only card where the reader can help rather than benefit, so it
         asks rather than offers. */
      return `Lost: ${lowerFirst(title)}${where ? ` around ${where}` : ''}. Seen it anywhere? 🙏`;

    case 'found':
      return `Found: ${lowerFirst(title)}${where ? ` near ${where}` : ''} — is this yours? Claim it on Wecycle`;

    case 'job':
      return `${title}${money ? ` — ${money}` : ''}. On the Wecycle jobs board 💼`;

    default: {
      /* Items. The deal changes the sentence, because "free" and "₹200 a day"
         are different offers and a single template flattens both into neither.
         The badge is the reliable signal here — priceLine can be an ask, a
         rate, or a swap request. */
      const badge = (spec.badge ?? '').toLowerCase();
      if (badge.includes('swap')) {
        /* priceLine already reads "Swap for a calculator", so pasting it after
           "Swapping X" says swap twice. Take just the ask. */
        const ask = money && money !== 'Open to swaps'
          ? money.replace(/^swap for\s*/i, '').trim()
          : '';
        return ask
          ? `Swapping ${lowerFirst(title)} for ${lowerFirst(ask)} — fancy a trade? 🔄`
          : `Swapping ${lowerFirst(title)} — open to offers. Fancy a trade? 🔄`;
      }
      if (badge.includes('rent')) {
        return `${title} up for rent${money ? ` — ${money}` : ''} on Wecycle. Borrow it, don't buy it 🔁`;
      }
      if (badge.includes('free') || money === 'Free') {
        return `Giving away ${lowerFirst(title)}${where ? `, ${where}` : ''} — free to whoever wants it 🎁`;
      }
      return `${title}${money ? ` — ${money}` : ''}${where ? `, ${where}` : ''}. Grab it on Wecycle 📦`;
    }
  }
}

/** Lowercase a leading word unless it looks like a name or an initialism —
 *  "Casio" and "FX-991EX" must survive being dropped mid-sentence, while
 *  "Drawing tablet" should not read as "Giving away Drawing tablet". */
function lowerFirst(s: string): string {
  const first = s.split(' ')[0] ?? '';
  if (!first) return s;
  /* Two or more capitals, or any digit, means a model number or an acronym. */
  if (/[A-Z].*[A-Z]|\d/.test(first)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export type ShareCardResult = 'shared' | 'downloaded' | 'copied' | 'unavailable';

/** Share the rendered card AS AN IMAGE, with the product link in the caption.
 *  Falls back to a PNG download + link copy where files can't be shared. */
/** The full message that goes out with the card: the hook, the poster's own
 *  description, then the link.
 *
 *  The description used to be drawn ON the card and is now not — it is not one
 *  of the five things the card exists to show, and every line it took came off
 *  the price. It travels here instead, which is the better home for it anyway:
 *  in a chat bubble it is selectable, searchable and translatable, none of
 *  which is true of words baked into a PNG.
 *
 *  Trimmed to ~220 characters. WhatsApp collapses a long message behind "Read
 *  more", and a hook that has to be expanded to be read has stopped being a
 *  hook. */
function shareMessage(spec: ShareCardSpec, url: string): string {
  const hook = cardText(spec);
  /* Only when the card itself does not already show it. The spotlight layout
     and the storefront card both draw the description; repeating it underneath
     makes the message read as a copy-paste error rather than as a caption. The
     classic layout leaves it off the card, so there the message carries it. */
  const onCard = spec.kind === 'storefront' || CARD_LAYOUT === 'spotlight';
  const desc = onCard ? '' : (spec.description ?? '').replace(/\s+/g, ' ').trim();
  const blurb = desc.length > 220 ? `${desc.slice(0, 219).trimEnd()}…` : desc;
  return [hook, blurb, url].filter(Boolean).join('\n\n');
}

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
      files: [file], title: spec.title, text: shareMessage(spec, url),
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
