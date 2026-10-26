'use client';

/*
 * Share cards — the image that travels when someone shares a post.
 *
 * 1080 × 1080. Square because WhatsApp is where these go: it sends a square
 * image whole, at full width in the bubble, and 1080 is the size it keeps
 * without recompressing it into mush. (The old 1080 × 1350 card was cropped in
 * the chat preview, and that preview is all most people ever see of it.)
 *
 * The art direction, in one line: a deep, moving ShaderGradient field with a
 * light travelling through it — green and yellow, purple and yellow, ember —
 * and white type on top. Geist Pixel for the one headline, Satoshi for every
 * other word.
 *
 * HOW IT IS BUILT. Three transparent layers are drawn here on 2D canvases:
 *
 *   scrim   — the darkness that makes white type safe: a wash over the whole
 *             field, deeper behind each block of text;
 *   grain   — monochrome film grain (ShaderGradient's own grain is an RGB dot
 *             screen that turns purple blue, so it is off and this replaces it);
 *   content — photo, words, marks.
 *
 * The share sheet stacks them over a LIVE ShaderGradient, so the card moves
 * while someone looks at it. Sharing freezes the frame on screen and composes
 * the same layers over it (composeCard), so the still is the moment they saw.
 * Where WebGL is missing, a flat painted gradient stands in.
 *
 * Contrast is measured, not hoped for: at export the field under every text
 * zone is sampled, and if the frame happens to be bright there, that zone's
 * scrim is drawn again until white text clears 4.5:1 against its brightest
 * likely pixel.
 *
 * Never throws to the caller for a missing photo or font — a card without its
 * photo still says what it needs to; a card that never appears says nothing.
 */

import { corsFresh } from './corsImage';
import { haptics } from './haptics';
import { ensureCardFonts, cardFont, PIXEL, SANS } from './cardFonts';
import type { CardPalette } from './cardPalettes';

export type ShareCardKind = 'item' | 'request' | 'job' | 'event' | 'lost' | 'found' | 'storefront';

/* ── A partner-branded card ────────────────────────────────────────────────
 * A post that belongs to someone else's brand as well as to Wecycle: the pill
 * names the partner and the offer takes the price's place. */
export interface PartnerBrand {
  /** Pill label, e.g. "UXINDIA 2026". */
  label: string;
  /** Kept for callers; the card's colour comes from its palette now. */
  colors?: [string, string, string, string];
  accent?: string;
  logoUrl?: string;
  logoAspect?: number;
  logoCrop?: { x: number; y: number; w: number; h: number };
}

export interface ShareCardSpec {
  kind: ShareCardKind;
  title: string;
  partner?: PartnerBrand;
  /** Overrides the caption pasted alongside the image. */
  partnerMessage?: string;
  /** The offer, in the slot where a listing shows its price. */
  offer?: { headline: string; qualifier: string; ink?: string };
  imageUrls?: string[];
  price?: number;
  /** The money exactly as it should read — "₹200 / day", "Swap for a
   *  calculator", "Free". Built by lib/dealTypes. */
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
  /** Storefront: @handle under the name. */
  storeHandle?: string;
  /** Storefront: up to three "12 shared" facts. */
  storeStats?: { label: string; value: string }[];
  roleLabel?: string;       // job: 'Hiring' | 'Offering'
  conditionLabel?: string;  // item: 'Like new' | 'Good' | 'Fair'
}

/* ── Geometry ──────────────────────────────────────────────────────────── */

export const CARD_SIZE = 1080;
const S = CARD_SIZE;
const M = 64;                       // outer margin
const HEAD_Y = 64;                  // top of the brand row
const HEAD_H = 56;
const BODY_Y = 156;                 // where the photo and the column start
const FOOT_Y = 836;                 // hairline above the footer
const WHITE = '#FFFFFF';
/* Secondary inks, set against the scrim's ceiling (MAX_FIELD_LUM). Canvas
   blends in sRGB, so 78% white over that field measured only ~3.7:1; 90% is
   ~4.9:1 for body copy, and 80% clears 3:1 for the bold small-caps labels. */
const MUTED = 'rgba(255,255,255,0.90)';
const QUIET = 'rgba(255,255,255,0.80)';

type Layout = 'portrait' | 'landscape' | 'type';

interface Box { x: number; y: number; w: number; h: number }

/** A region of the card whose scrim can be drawn again, stronger, if the
 *  gradient under it turns out to be bright. */
interface Zone {
  /** The text it protects — what gets measured. */
  box: Box;
  paint: (ctx: CanvasRenderingContext2D, alpha: number) => void;
}

export interface CardLayers {
  scrim: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  content: HTMLCanvasElement;
  zones: Zone[];
}

/* ── Small drawing helpers ─────────────────────────────────────────────── */

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  return c;
}

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

function coverDraw(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > rr) { sw = img.height * rr; sx = (img.width - sw) / 2; }
  else { sh = img.width / rr; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function containDraw(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  const dw = ir > rr ? w : h * ir;
  const dh = ir > rr ? w / ir : h;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Lines that fit `maxWidth`, at most `maxLines`, the last one ellipsised. */
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

/** Letter-spaced text, for the small caps labels. Drawn glyph by glyph
 *  because ctx.letterSpacing is missing from the WebViews still in use. */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, track: number, align: 'left' | 'right' = 'left'): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  w -= track;
  let cx = align === 'right' ? x - w : x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
  return w;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ── Images ────────────────────────────────────────────────────────────── */

type Bitmap = CanvasImageSource & { width: number; height: number };

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

function imgFrom(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A photo, ready to draw without tainting the canvas — or null.
 *
 *  Fetched as bytes first and drawn from a local blob URL: a blob is
 *  same-origin by construction, so the canvas can always be exported, and the
 *  request never collides with the non-CORS copy of the same photo that the
 *  page itself has cached (the old cause of photo-less cards). If the fetch is
 *  refused, an <img> with crossOrigin is the second try. Each try is capped,
 *  so a stalled request can never hold the card — the cause of the spinner
 *  that never became a card. */
const photoCache = new Map<string, Promise<Bitmap | null>>();

/** Cached per URL for the page's life, so switching palettes redraws the card
 *  without fetching its photo again. A failed load is not cached. */
function loadPhoto(src: string): Promise<Bitmap | null> {
  const hit = photoCache.get(src);
  if (hit) return hit;
  const p = fetchPhoto(src);
  photoCache.set(src, p);
  p.then(v => { if (!v) photoCache.delete(src); });
  return p;
}

async function fetchPhoto(src: string): Promise<Bitmap | null> {
  if (!/^https?:/i.test(src)) return withTimeout(imgFrom(src, false), 8000, null);
  const viaFetch = async (): Promise<Bitmap | null> => {
    const r = await fetch(corsFresh(src), { mode: 'cors', credentials: 'omit' });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob.type.startsWith('image/') && blob.size < 100) return null;
    const url = URL.createObjectURL(blob);
    const img = await imgFrom(url, false);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return img;
  };
  return (await withTimeout(viaFetch(), 9000, null))
    ?? withTimeout(imgFrom(corsFresh(src), true), 7000, null);
}

/* ── The fallback field ────────────────────────────────────────────────── */

/** A painted stand-in for the shader, for devices without WebGL: the palette's
 *  deep colour, its field colour pooled across the middle, and its light
 *  crossing on the same diagonal the shader's light travels. */
export function paintFallbackField(ctx: CanvasRenderingContext2D, p: CardPalette) {
  const [deep, field, light] = p.fallback;
  ctx.fillStyle = deep;
  ctx.fillRect(0, 0, S, S);
  const pool = (cx: number, cy: number, r: number, color: string, a: number) => {
    const [r0, g0, b0] = hexRgb(color);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${r0},${g0},${b0},${a})`);
    g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  };
  pool(S * 0.15, S * 0.1, S * 0.9, field, 0.9);
  pool(S * 0.95, S * 0.05, S * 0.55, light, 0.75);
  pool(S * 0.55, S * 0.45, S * 0.45, light, 0.35);
}

/* ── Layers ────────────────────────────────────────────────────────────── */

let grainTile: HTMLCanvasElement | null = null;
function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const T = 256;
  const c = document.createElement('canvas');
  c.width = T; c.height = T;
  const g = c.getContext('2d')!;
  const img = g.createImageData(T, T);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Neutral-grey film grain, meant to be laid on with an overlay blend: it
 *  roughens luminance and leaves hue alone. */
function paintGrainLayer(ctx: CanvasRenderingContext2D) {
  const pat = ctx.createPattern(getGrainTile(), 'repeat');
  if (!pat) return;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, S, S);
}

function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, number][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(4,4,10,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/* ── What each kind of card says ───────────────────────────────────────── */

interface CardCopy {
  /** Top-right pill — what this is, in a word or two. */
  pill: string;
  /** The small line above the headline. */
  eyebrow?: string;
  title: string;
  body?: string;
  /** The one number (or date) the card exists to carry. */
  figure?: { label: string; value: string };
  /** Storefront only, in the figure's place. */
  stats?: { label: string; value: string }[];
  place?: string;
  /** Footer, bottom-left: what to do next. */
  cta: string;
}

/** The description as one clean run of text: URLs out (the links trailer
 *  among them — they travel in the caption), paragraphs joined with a dash. */
function descriptionFor(spec: ShareCardSpec): string {
  return (spec.description ?? '')
    .replace(/(^|\n)Links\n[\s\S]*$/, '')
    .replace(/https?:\/\/\S+/gi, '')
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' — ');
}

function money(spec: ShareCardSpec): string | undefined {
  if (spec.priceLine?.trim()) return spec.priceLine.trim();
  if (spec.price != null) return `₹${spec.price.toLocaleString('en-IN')}`;
  return spec.badge?.trim() || undefined;
}

function copyFor(spec: ShareCardSpec): CardCopy {
  const title = (spec.title || '').trim();
  const body = descriptionFor(spec) || undefined;
  const place = spec.location?.trim() || undefined;
  switch (spec.kind) {
    case 'request':
      return { pill: 'Wanted', eyebrow: 'Looking for', title, body, place, cta: 'Help out on Wecycle' };
    case 'job':
      return {
        pill: spec.roleLabel || 'Gig', eyebrow: spec.roleLabel === 'Hiring' ? 'Hiring on campus' : 'Offering a service',
        title, body, place, cta: 'Get in touch on Wecycle',
        figure: spec.badge ? { label: 'Rate', value: spec.badge } : undefined,
      };
    case 'event': {
      const offer = spec.offer ? { label: spec.offer.qualifier, value: spec.offer.headline } : undefined;
      const when = spec.dateBadge
        ? { label: whenLabel(spec), value: `${spec.dateBadge.dow} ${spec.dateBadge.day} ${spec.dateBadge.mon}` }
        : spec.dateLine ? { label: 'When', value: spec.dateLine } : undefined;
      return {
        pill: spec.partner?.label || 'Event', eyebrow: 'On campus',
        title: title || 'Campus event', body, place, cta: 'RSVP on Wecycle',
        figure: offer ?? when,
      };
    }
    case 'lost':
      return {
        pill: 'Lost', eyebrow: 'Have you seen this?', title, body, place, cta: 'Seen it? Say so on Wecycle',
        figure: spec.reward ? { label: 'Reward', value: spec.reward } : undefined,
      };
    case 'found':
      return { pill: 'Found', eyebrow: 'Is this yours?', title, body, place, cta: 'Claim it on Wecycle' };
    case 'storefront':
      return {
        pill: 'Storefront', eyebrow: spec.storeHandle ? `@${spec.storeHandle}` : 'Student seller',
        title: (spec.byName || title || 'Storefront').trim(), body, cta: 'Visit the store on Wecycle',
        stats: (spec.storeStats ?? []).slice(0, 3),
      };
    default: {
      const badge = (spec.badge ?? '').toLowerCase();
      const value = money(spec);
      const label = badge.includes('rent') ? 'Rent' : badge.includes('swap') ? 'Swap' : 'Price';
      return {
        pill: spec.badge || 'For sale',
        eyebrow: spec.conditionLabel ? `${spec.conditionLabel} condition` : 'Pre-loved',
        title, body, place, cta: 'Get it on Wecycle',
        figure: value ? { label, value } : undefined,
      };
    }
  }
}

/** "When · 3:00 pm" — the time rides in the label so the value stays a date. */
function whenLabel(spec: ShareCardSpec): string {
  const time = spec.dateLine?.split('·').map(s => s.trim()).filter(Boolean)[1];
  return time ? `When · ${time}` : 'When';
}

/* ── Building the layers ───────────────────────────────────────────────── */

/** Everything except the moving field. Awaits fonts and images (each capped),
 *  so it resolves in a few seconds at worst and never rejects for a missing
 *  asset. */
export async function buildCardLayers(spec: ShareCardSpec, palette: CardPalette): Promise<CardLayers> {
  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [, wordmark, photo, avatar] = await Promise.all([
    ensureCardFonts(),
    withTimeout(imgFrom('/brand/wordmark.png', false), 6000, null),
    urls[0] ? loadPhoto(urls[0]) : Promise.resolve(null),
    spec.byAvatar ? loadPhoto(spec.byAvatar) : Promise.resolve(null),
  ]);

  const copy = copyFor(spec);
  const ar = photo ? photo.width / photo.height : 0;
  const layout: Layout = !photo ? 'type' : ar > 1.05 ? 'landscape' : 'portrait';

  const scrim = canvas();
  const grain = canvas();
  const content = canvas();
  const sctx = scrim.getContext('2d')!;
  const cctx = content.getContext('2d')!;
  paintGrainLayer(grain.getContext('2d')!);

  /* ── Scrim zones ── */
  const zones: Zone[] = [];
  const zone = (box: Box, paint: Zone['paint']) => { zones.push({ box, paint }); paint(sctx, 1); };
  /* A light veil over the whole field first: the shader is lit, and even its
     deep colours land a little brighter than a white-type card wants. */
  sctx.fillStyle = 'rgba(4,4,10,0.10)';
  sctx.fillRect(0, 0, S, S);
  zone({ x: M, y: HEAD_Y, w: S - 2 * M, h: HEAD_H }, (c, a) =>
    linear(c, 0, 0, 0, 240, [[0, 0.40 * a], [1, 0]]));

  /* ── Content ── */
  const ctx = cctx;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 14;

  drawBrandRow(ctx, wordmark, copy.pill, palette.accent);

  let colX = M, colY = BODY_Y + 18, colW = S - 2 * M, colBottom = FOOT_Y - 64;
  if (photo && layout === 'portrait') {
    const frame = fitFrame(ar, { x: 560, y: BODY_Y, w: S - M - 560, h: FOOT_Y - 72 - BODY_Y }, spec.kind === 'event');
    drawPhoto(ctx, photo, frame);
    colW = 560 - 40 - M;
    zone({ x: M, y: BODY_Y, w: colW, h: colBottom - BODY_Y }, (c, a) =>
      linear(c, 0, 0, 700, 0, [[0, 0.55 * a], [0.6, 0.30 * a], [1, 0]]));
  } else if (photo && layout === 'landscape') {
    const frame = fitFrame(ar, { x: M, y: BODY_Y, w: S - 2 * M, h: 430 }, spec.kind === 'event');
    drawPhoto(ctx, photo, frame);
    colY = BODY_Y + 430 + 44;
    zone({ x: M, y: colY, w: S - 2 * M, h: colBottom - colY }, (c, a) =>
      linear(c, 0, colY - 120, 0, FOOT_Y, [[0, 0], [0.35, 0.45 * a], [1, 0.6 * a]]));
  } else {
    zone({ x: M, y: BODY_Y, w: S - 2 * M, h: colBottom - BODY_Y }, (c, a) => {
      c.fillStyle = `rgba(4,4,10,${0.18 * a})`;
      c.fillRect(0, 0, S, S);
      linear(c, 0, 0, S, 0, [[0, 0.45 * a], [1, 0.05 * a]]);
    });
  }

  if (layout === 'landscape') {
    drawLandscapeText(ctx, copy, { x: colX, y: colY, w: colW, bottom: colBottom });
  } else {
    drawColumnText(ctx, copy, { x: colX, y: colY, w: colW, bottom: colBottom }, layout === 'type');
  }

  zone({ x: M, y: FOOT_Y, w: S - 2 * M, h: S - FOOT_Y - 40 }, (c, a) =>
    linear(c, 0, FOOT_Y - 120, 0, S, [[0, 0], [0.3, 0.50 * a], [1, 0.78 * a]]));
  drawFooter(ctx, spec, copy, avatar);

  return { scrim, grain, content, zones };
}

/* ── Content pieces ────────────────────────────────────────────────────── */

function drawBrandRow(ctx: CanvasRenderingContext2D, wordmark: HTMLImageElement | null, pill: string, accent: string) {
  const midY = HEAD_Y + HEAD_H / 2;
  if (wordmark) {
    const h = 44;
    const w = h * (wordmark.width / wordmark.height);
    /* The wordmark art is dark; white it, keeping its alpha. */
    const off = document.createElement('canvas');
    off.width = Math.ceil(w); off.height = h;
    const o = off.getContext('2d')!;
    o.drawImage(wordmark, 0, 0, w, h);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = WHITE;
    o.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(off, M, midY - h / 2 - 2, w, h);
  } else {
    ctx.font = cardFont(SANS, 900, 40);
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle';
    ctx.fillText('Wecycle', M, midY);
    ctx.textBaseline = 'alphabetic';
  }

  /* The pill: frosted, a dot of the palette's light, the kind in small caps. */
  const label = pill.toUpperCase();
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.font = cardFont(SANS, 700, 23);
  const track = 2.6;
  let tw = 0;
  for (const ch of label) tw += ctx.measureText(ch).width + track;
  tw -= track;
  const h = HEAD_H, padL = 26, dot = 10, gap = 14, padR = 28;
  const w = padL + dot + gap + tw + padR;
  const x = S - M - w;
  roundRect(ctx, x, HEAD_Y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + padL + dot / 2, midY, dot / 2, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.textBaseline = 'middle';
  tracked(ctx, label, x + padL + dot + gap, midY + 1, track);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/** The photo's frame inside `box`, shaped by the photo itself.
 *  A poster (events) is never cropped — the frame takes its exact shape. Any
 *  other photo may lose a little to fill the box better, but never more than
 *  a quarter: past that the crop starts cutting off the thing being sold. */
function fitFrame(ar: number, box: Box, exact: boolean): Box {
  const boxAr = box.w / box.h;
  let fr = ar;
  if (!exact) fr = Math.min(Math.max(ar, boxAr * 0.8), boxAr * 1.25);
  const w = fr > boxAr ? box.w : box.h * fr;
  const h = fr > boxAr ? box.w / fr : box.h;
  return { x: box.x + (box.w - w), y: box.y + (box.h - h) / 2, w, h };
}

function drawPhoto(ctx: CanvasRenderingContext2D, img: Bitmap, f: Box) {
  const r = 34;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, f.x, f.y, f.w, f.h, r);
  ctx.fillStyle = '#101014';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, f.x, f.y, f.w, f.h, r);
  ctx.clip();
  ctx.shadowColor = 'transparent';
  const ir = img.width / img.height;
  if (Math.abs(ir - f.w / f.h) < 0.01) ctx.drawImage(img, f.x, f.y, f.w, f.h);
  else coverDraw(ctx, img, f.x, f.y, f.w, f.h);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'transparent';
  roundRect(ctx, f.x + 1, f.y + 1, f.w - 2, f.h - 2, r - 1);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
  ctx.restore();
}

function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = cardFont(SANS, 700, 22);
  ctx.fillStyle = QUIET;
  tracked(ctx, text.toUpperCase(), x, y, 2.4);
}

/** Headline sizes to try, biggest first, each with the lines it may use. */
type Steps = [number, number][];

function fitTitle(ctx: CanvasRenderingContext2D, title: string, width: number, steps: Steps): { size: number; lines: string[] } {
  let best = { size: steps[steps.length - 1][0], lines: [title] };
  for (const [size, maxLines] of steps) {
    ctx.font = cardFont(PIXEL, 400, size);
    const lines = wrapText(ctx, title, width, maxLines);
    best = { size, lines };
    /* Take the biggest size that fits whole, without breaking a word. */
    const broke = lines.some(l => ctx.measureText(l).width > width);
    if (!lines[lines.length - 1].endsWith('…') && !broke) break;
  }
  return best;
}

function drawFigure(ctx: CanvasRenderingContext2D, fig: { label: string; value: string }, x: number, baseline: number, maxW: number, align: 'left' | 'right' = 'left') {
  let size = 66;
  ctx.font = cardFont(SANS, 900, size);
  while (size > 38 && ctx.measureText(fig.value).width > maxW) { size -= 4; ctx.font = cardFont(SANS, 900, size); }
  const value = wrapText(ctx, fig.value, maxW, 1)[0];
  ctx.fillStyle = WHITE;
  ctx.textAlign = align;
  ctx.fillText(value, x, baseline);
  ctx.textAlign = 'left';
  ctx.font = cardFont(SANS, 700, 21);
  ctx.fillStyle = QUIET;
  tracked(ctx, fig.label.toUpperCase(), x, baseline - size - 14, 2.2, align);
}

function drawStats(ctx: CanvasRenderingContext2D, stats: { label: string; value: string }[], x: number, baseline: number, w: number) {
  const colW = w / Math.max(1, stats.length);
  stats.forEach((st, i) => {
    const cx = x + colW * i;
    ctx.font = cardFont(SANS, 900, 56);
    ctx.fillStyle = WHITE;
    ctx.fillText(st.value, cx, baseline);
    ctx.font = cardFont(SANS, 700, 19);
    ctx.fillStyle = QUIET;
    tracked(ctx, st.label.toUpperCase(), cx, baseline - 70, 1.6);
  });
}

/** Portrait photo or no photo: everything in one column. */
function drawColumnText(ctx: CanvasRenderingContext2D, copy: CardCopy, col: { x: number; y: number; w: number; bottom: number }, big: boolean) {
  let y = col.y + 22;
  if (copy.eyebrow) { eyebrow(ctx, copy.eyebrow, col.x, y); y += 26; }

  const steps: Steps = big
    ? [[112, 3], [96, 3], [84, 4], [72, 4], [62, 5]]
    : [[76, 3], [68, 3], [60, 4], [54, 4], [48, 5], [42, 5]];
  const t = fitTitle(ctx, copy.title, col.w, steps);
  const lh = Math.round(t.size * 1.06);
  ctx.font = cardFont(PIXEL, 400, t.size);
  ctx.fillStyle = WHITE;
  y += 14;
  for (const line of t.lines) { y += lh; ctx.fillText(line, col.x, y); }

  /* The figure (or stats) sits on the column's floor; the body takes what is
     left between it and the headline, and stops a clear gap above the
     figure's label — measured from the label's real top, not guessed. */
  const figTop = copy.stats?.length ? col.bottom - 56 - 70 - 20
    : copy.figure ? col.bottom - 66 - 14 - 21
    : col.bottom;
  if (copy.body) {
    const size = big ? 32 : 30;
    const blh = Math.round(size * 1.42);
    const first = y + 24 + size;
    const room = Math.floor((figTop - 34 - first) / blh) + 1;
    ctx.font = cardFont(SANS, 500, size);
    const lines = room > 0 ? wrapText(ctx, copy.body, col.w, Math.min(4, room)) : [];
    ctx.fillStyle = MUTED;
    lines.forEach((line, i) => ctx.fillText(line, col.x, first + i * blh));
  }

  if (copy.stats?.length) drawStats(ctx, copy.stats, col.x, col.bottom, col.w);
  else if (copy.figure) drawFigure(ctx, copy.figure, col.x, col.bottom, col.w);
}

/** Landscape photo: headline left, figure right, body under both. */
function drawLandscapeText(ctx: CanvasRenderingContext2D, copy: CardCopy, col: { x: number; y: number; w: number; bottom: number }) {
  const figW = copy.stats?.length ? 420 : copy.figure ? 330 : 0;
  const textW = col.w - (figW ? figW + 40 : 0);
  let y = col.y;
  if (copy.eyebrow) { eyebrow(ctx, copy.eyebrow, col.x, y); y += 18; }
  const t = fitTitle(ctx, copy.title, textW, [[64, 2], [56, 2], [50, 2], [44, 2], [40, 2]]);
  const lh = Math.round(t.size * 1.06);
  ctx.font = cardFont(PIXEL, 400, t.size);
  ctx.fillStyle = WHITE;
  for (const line of t.lines) { y += lh; ctx.fillText(line, col.x, y); }

  if (copy.body) {
    ctx.font = cardFont(SANS, 500, 28);
    const room = Math.floor((col.bottom - (y + 18)) / 38);
    const lines = room > 0 ? wrapText(ctx, copy.body, textW, Math.min(2, room)) : [];
    ctx.fillStyle = MUTED;
    y += 18;
    for (const line of lines) { y += 38; ctx.fillText(line, col.x, y); }
  }
  if (copy.stats?.length) drawStats(ctx, copy.stats, S - M - figW, col.y + 104, figW);
  else if (copy.figure) drawFigure(ctx, copy.figure, S - M, col.y + 104, figW, 'right');
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.15, s * 0.36, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(x, y + s * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - s * 0.15, s * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFooter(ctx: CanvasRenderingContext2D, spec: ShareCardSpec, copy: CardCopy, avatar: Bitmap | null) {
  /* Hairline, then the person and the place, then the instruction. */
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(M, FOOT_Y, S - 2 * M, 2);
  ctx.restore();

  const rowY = FOOT_Y + 62;
  const r = 30;
  let tx = M;
  if (spec.byName) {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(M + r, rowY, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    if (avatar) coverDraw(ctx, avatar, M, rowY - r, r * 2, r * 2);
    else {
      ctx.fillStyle = spec.byColor || '#E9E4FF';
      ctx.fillRect(M, rowY - r, r * 2, r * 2);
      ctx.fillStyle = '#14161A';
      ctx.font = cardFont(SANS, 700, 24);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((spec.byInitials || spec.byName.slice(0, 1)).slice(0, 2).toUpperCase(), M + r, rowY + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
    ctx.restore();

    tx = M + r * 2 + 18;
    ctx.font = cardFont(SANS, 700, 30);
    ctx.fillStyle = WHITE;
    ctx.fillText(wrapText(ctx, spec.byName, 380, 1)[0], tx, rowY - 4);
    ctx.font = cardFont(SANS, 500, 23);
    ctx.fillStyle = QUIET;
    ctx.fillText(spec.verified ? 'Verified student' : 'On Wecycle', tx, rowY + 26);
  }

  if (copy.place) {
    const maxW = 420;
    ctx.font = cardFont(SANS, 600, 27);
    const lines = wrapText(ctx, copy.place, maxW, 2);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    const top = lines.length === 1 ? rowY + 9 : rowY - 8;
    lines.forEach((ln, i) => ctx.fillText(ln, S - M, top + i * 34));
    ctx.textAlign = 'left';
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    drawPin(ctx, S - M - widest - 22, top - 9, 26);
  }

  const baseY = S - M + 4;
  ctx.font = cardFont(SANS, 700, 26);
  ctx.fillStyle = WHITE;
  ctx.fillText(copy.cta, M, baseY);
  ctx.font = cardFont(SANS, 600, 26);
  ctx.fillStyle = QUIET;
  ctx.textAlign = 'right';
  ctx.fillText('wecycle.page', S - M, baseY);
  ctx.textAlign = 'left';
}

/* ── Composition ───────────────────────────────────────────────────────── */

const GRAIN_ALPHA = 0.16;
export const CARD_GRAIN_ALPHA = GRAIN_ALPHA;

function relLum(r: number, g: number, b: number): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** The 95th-percentile luminance under a box — the bright pixels a reader's
 *  eye actually fights, without one stray highlight deciding everything. */
function brightUnder(ctx: CanvasRenderingContext2D, b: Box): number {
  const data = ctx.getImageData(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)).data;
  const lum: number[] = [];
  for (let i = 0; i < data.length; i += 4 * 7) lum.push(relLum(data[i], data[i + 1], data[i + 2]));
  lum.sort((a, z) => a - z);
  return lum[Math.floor(lum.length * 0.95)] ?? 0;
}

/** White on this luminance must clear 4.5:1 for body copy; aim for 6:1 so
 *  the muted lines (white at ~70%) clear it too. */
const MAX_FIELD_LUM = 0.125;

/** Whether the shader has painted anything yet. A WebGL canvas reads back
 *  as transparent until its first frame (and after a lost context), and a
 *  card composed over that is a black square with words on it — so a Share
 *  in the first moment after opening gets the painted field instead. */
function fieldHasDrawn(field: CanvasImageSource): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 8; probe.height = 8;
    const p = probe.getContext('2d', { willReadFrequently: true })!;
    p.drawImage(field, 0, 0, 8, 8);
    const d = p.getImageData(0, 0, 8, 8).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 12) lit++;
    return lit >= 8;
  } catch {
    return false;
  }
}

/** The finished card: the field (a frozen shader frame, or the painted
 *  fallback), the scrim — strengthened wherever the frame is bright under
 *  text — the grain, and the content. */
export function composeCard(layers: CardLayers, field: CanvasImageSource | null, palette: CardPalette): HTMLCanvasElement {
  const out = canvas();
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  if (field && fieldHasDrawn(field)) {
    try { ctx.drawImage(field, 0, 0, S, S); } catch { paintFallbackField(ctx, palette); }
  } else {
    paintFallbackField(ctx, palette);
  }
  ctx.drawImage(layers.scrim, 0, 0);

  for (const z of layers.zones) {
    for (let pass = 0; pass < 3; pass++) {
      let L: number;
      try { L = brightUnder(ctx, z.box); } catch { break; }
      if (L <= MAX_FIELD_LUM) break;
      /* Darkening by alpha a scales luminance by (1 - a); ask for what is
         missing, then measure again — the zone's gradient is uneven. */
      z.paint(ctx, Math.min(1.4, (1 - MAX_FIELD_LUM / L) * 1.6));
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = GRAIN_ALPHA;
  ctx.drawImage(layers.grain, 0, 0);
  ctx.restore();
  ctx.drawImage(layers.content, 0, 0);
  return out;
}

/** JPEG at 0.92: WhatsApp re-encodes everything as JPEG anyway, and handing it
 *  one already at this quality and size means it barely touches it — where a
 *  2–3 MB PNG of film grain gets crushed. */
export function cardBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    try { c.toBlob(b => resolve(b), 'image/jpeg', 0.92); } catch { resolve(null); }
  });
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

/** The message that goes out with the card: the hook, then the link. The
 *  description is on the card itself now, so it is not repeated here. */
function shareMessage(spec: ShareCardSpec, url: string): string {
  return [spec.partnerMessage || cardText(spec), url].filter(Boolean).join('\n\n');
}

function fileName(spec: ShareCardSpec): string {
  return `wecycle-${spec.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || spec.kind}.jpg`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Inside the installed apps the browser's share and download don't exist
 *  (Android's WebView has no Web Share at all, and an <a download> there goes
 *  nowhere), which is how a card could render and then never leave the phone.
 *  So the app writes the image to its cache and hands the file to the OS
 *  share sheet through Capacitor. Returns null where that path is not
 *  available — the web, or an app build from before these plugins. */
async function shareNative(blob: Blob, spec: ShareCardSpec, url: string): Promise<ShareCardResult | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()
        || !Capacitor.isPluginAvailable('Filesystem')
        || !Capacitor.isPluginAvailable('Share')) return null;
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const written = await Filesystem.writeFile({
      path: fileName(spec),
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: spec.title, text: shareMessage(spec, url), files: [written.uri] });
    } catch (e) {
      /* Dismissing the sheet rejects; that is a choice, not a failure. */
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
    }
    haptics.light();
    return 'shared';
  } catch {
    return null;
  }
}

/** Share the card AS AN IMAGE, with the link in the caption. Falls back to a
 *  download plus a copied link where files can't be shared. */
export async function shareCardBlob(blob: Blob | null, spec: ShareCardSpec): Promise<ShareCardResult> {
  if (typeof navigator === 'undefined') return 'unavailable';
  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : 'https://wecycle.page');

  if (blob) {
    const native = await shareNative(blob, spec, url);
    if (native) return native;

    const file = new File([blob], fileName(spec), { type: blob.type || 'image/jpeg' });
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
    };
    /* The link goes in `text` ONLY: WhatsApp appends `url` to `text`, so
       passing both printed the link twice, and many targets drop `url`
       when files are attached. */
    const data: ShareData = { files: [file], title: spec.title, text: shareMessage(spec, url) } as ShareData;
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
  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : '');
  /* In the app, "save" is the share sheet too — it is where Save Image lives. */
  const native = await shareNative(blob, spec, url);
  if (native) return native;

  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName(spec);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1500);

  try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
  haptics.success();
  return 'downloaded';
}
