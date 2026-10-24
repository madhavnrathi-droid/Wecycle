'use client';

/* A brand's share card — one 1080×1080 PNG, the size WhatsApp shows whole.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ ☁ FöKu                          [on Wecycle]  │  the brand, as its own
 *   │ If clothes were a canvas.                     │  wordmark and mascot
 *   │                                               │
 *   │    ▢ ₹799     ▢ ₹799     ▢ ₹499               │  three products as
 *   │   (stickers, tilted, white-bordered)          │  stickers — the brand's
 *   │                                               │  poster grammar
 *   │ ┌───────────────────────────────────────────┐ │
 *   │ │ 8 products · from ₹499       Order on     │ │  what, how much, where
 *   │ │ wecycle.page/b/foku          Wecycle      │ │
 *   │ └───────────────────────────────────────────┘ │
 *   └───────────────────────────────────────────────┘
 *
 * The background is the brand's lush gradient (lib/lushGradient.ts), drawn
 * fresh each time with a seed — the share sheet's Remix is a new seed.
 *
 * Nothing is drawn outside 0..1080 on either axis, and every line of text is
 * measured and fitted, so a long brand or a five-digit price cannot run off
 * the square. Product photos load cross-origin (as on every other share card);
 * one that fails is left out rather than drawn as a hole. */

import type { Brand } from './brands';
import { renderLushGradient } from './lushGradient';
import { corsFresh } from './corsImage';

export const BRAND_CARD_SIZE = 1080;

export interface BrandCardProduct {
  title: string;
  price: number | null;
  photo: string;
}

export interface BrandCardSpec {
  brand: Brand;
  products: BrandCardProduct[];
  count: number;
  from: string | null;
  /** Shown on the card without the scheme: wecycle.page/b/foku */
  url: string;
  seed: number;
}

export interface RenderedBrandCard {
  blob: Blob | null;
  dataUrl: string;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function loadImage(src: string, cors: boolean, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    let settled = false;
    const done = (v: HTMLImageElement | null) => { if (!settled) { settled = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => done(null), timeoutMs);
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
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

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > rr) { sw = img.height * rr; sx = (img.width - sw) / 2; }
  else { sh = img.width / rr; sy = (img.height - sh) * 0.35; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Largest size ≤ max at which `text` fits in `width`. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family = FONT): number {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

/** Trim with an ellipsis until it fits at the current font. */
function clip(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/* Where the stickers go, by how many there are. Centre x, centre y, width,
   rotation in degrees. Kept well inside the square: the widest rotated
   sticker's corners stay ≥ 40px from every edge. */
function layoutFor(n: number): { cx: number; cy: number; w: number; rot: number }[] {
  if (n >= 3) {
    return [
      { cx: 236, cy: 560, w: 296, rot: -6 },
      { cx: 540, cy: 590, w: 296, rot: 2.5 },
      { cx: 844, cy: 552, w: 296, rot: 7 },
    ];
  }
  if (n === 2) {
    return [
      { cx: 360, cy: 568, w: 330, rot: -5 },
      { cx: 720, cy: 580, w: 330, rot: 5 },
    ];
  }
  return [{ cx: 540, cy: 572, w: 360, rot: -3 }];
}

export async function renderBrandCard(spec: BrandCardSpec): Promise<RenderedBrandCard> {
  const S = BRAND_CARD_SIZE;
  const { brand } = spec;
  /* Colour roles: type straight on the gradient, the brand's dark for type on
     the white footer, and its action colours for price tags and the button. */
  const onBg = brand.palette.lush.text ?? brand.palette.ink;
  const dark = brand.palette.dark;
  const act = brand.palette.action;
  const serif = brand.canvas.kind === 'stall';

  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  /* Assets first, in parallel. Brand marks are same-origin; product photos
     are cross-origin and need CORS for the canvas to stay exportable. */
  const [wordmark, mascot, wecycle, ...photos] = await Promise.all([
    loadImage(brand.assets.wordmark, false),
    brand.assets.mascot ? loadImage(brand.assets.mascot, false) : Promise.resolve(null),
    loadImage('/brand/wordmark.png', false),
    ...spec.products.slice(0, 3).map(p => loadImage(corsFresh(p.photo), true)),
  ]);
  const products = spec.products.slice(0, 3)
    .map((p, i) => ({ ...p, img: photos[i] }))
    .filter((p): p is BrandCardProduct & { img: HTMLImageElement } => !!p.img);

  /* ── Background: the lush gradient ── */
  const { colors, stops, ...look } = brand.palette.lush;
  const bg = renderLushGradient({ width: S, height: S, colors, stops, ...look, seed: spec.seed });
  if (bg) ctx.drawImage(bg, 0, 0, S, S);
  else { ctx.fillStyle = brand.palette.fields[0]; ctx.fillRect(0, 0, S, S); }

  const M = 72;

  /* Kinnu's discs, from the corners, as on its page — under everything. */
  if (brand.canvas.kind === 'stall') {
    for (const d of brand.canvas.discs) {
      const cx = d.corner === 'tl' || d.corner === 'bl' ? 0 : S;
      const cy = d.corner === 'tl' || d.corner === 'tr' ? 0 : S;
      ctx.beginPath();
      ctx.arc(cx, cy, d.corner === 'tl' ? 300 : 330, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
    }
  }

  /* ── The brand ── mascot, wordmark, tagline */
  let headX = M;
  if (mascot) {
    const mw = 128, mh = mw * (mascot.height / mascot.width || 1255 / 1997);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.14)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(mascot, M - 6, M + 6, mw, mh);
    ctx.restore();
    headX = M + mw + 18;
  }
  if (wordmark) {
    /* The wordmark file is drawn in currentColor, which an <img> renders
       black; tint it to the brand's ink on an offscreen canvas. */
    const ratio = brand.assets.wordmarkRatio || wordmark.width / wordmark.height;
    const wh = serif ? 96 : 112, ww = Math.min(wh * ratio, S - M * 2 - 260);
    const h2 = ww / ratio;
    const off = document.createElement('canvas');
    off.width = Math.ceil(ww * 2); off.height = Math.ceil(h2 * 2);
    const o = off.getContext('2d');
    if (o) {
      o.drawImage(wordmark, 0, 0, off.width, off.height);
      o.globalCompositeOperation = 'source-in';
      o.fillStyle = onBg;
      o.fillRect(0, 0, off.width, off.height);
      ctx.drawImage(off, headX, M - 14 + (wh - h2) / 2, ww, h2);
    }
  } else {
    ctx.fillStyle = onBg;
    ctx.font = `900 96px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(brand.name, headX, M - 6);
  }
  ctx.fillStyle = onBg;
  ctx.textBaseline = 'alphabetic';
  if (serif) {
    let size = 40;
    for (; size > 24; size -= 2) {
      ctx.font = `italic 500 ${size}px Georgia, 'Times New Roman', serif`;
      if (ctx.measureText(brand.tagline).width <= S - M * 2) break;
    }
  } else {
    fit(ctx, brand.tagline, 650, 36, 24, S - M * 2);
  }
  ctx.fillText(brand.tagline, M, M + 146);

  /* "on Wecycle" pill, top right: whose platform this is, quietly. */
  {
    const label = 'on';
    ctx.font = `600 24px ${FONT}`;
    const lw = ctx.measureText(label).width;
    const logoH = 38, logoW = wecycle ? logoH * (wecycle.width / wecycle.height) : 0;
    const pw = 24 + lw + 10 + (wecycle ? logoW : ctx.measureText('Wecycle').width) + 24;
    const ph = 64;
    const px = S - M - pw, py = M - 4;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#3C3B35';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + 24, py + ph / 2 + 1);
    if (wecycle) ctx.drawImage(wecycle, px + 24 + lw + 10, py + (ph - logoH) / 2, logoW, logoH);
    else { ctx.font = `800 26px ${FONT}`; ctx.fillStyle = '#16A34A'; ctx.fillText('Wecycle', px + 24 + lw + 10, py + ph / 2 + 1); }
    ctx.textBaseline = 'alphabetic';
  }

  /* ── The products, as stickers ── */
  const slots = layoutFor(products.length);
  products.forEach((p, i) => {
    const sl = slots[i];
    if (!sl) return;
    const border = 12;
    const w = sl.w, h = w * 1.25;
    ctx.save();
    ctx.translate(sl.cx, sl.cy);
    ctx.rotate((sl.rot * Math.PI) / 180);
    /* White sticker with a soft drop shadow. */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, -w / 2 - border, -h / 2 - border, w + border * 2, h + border * 2, 30);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, -w / 2, -h / 2, w, h, 20);
    ctx.clip();
    cover(ctx, p.img, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.restore();
  });

  /* Price tags in a second pass, over every sticker: drawn with their own
     sticker, a neighbour laid down after it could cover the price. */
  products.forEach((p, i) => {
    const sl = slots[i];
    if (!sl || typeof p.price !== 'number' || p.price <= 0) return;
    const w = sl.w, h = w * 1.25;
    ctx.save();
    ctx.translate(sl.cx, sl.cy);
    ctx.rotate((sl.rot * Math.PI) / 180);
    const label = rupee(p.price);
    ctx.font = `800 34px ${FONT}`;
    const tw = ctx.measureText(label).width;
    const tagW = tw + 36, tagH = 58;
    const tx = w / 2 - tagW + 18, ty = h / 2 - tagH / 2 + 8;
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = act.bg;
    roundRect(ctx, tx, ty, tagW, tagH, tagH / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = act.fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx + 18, ty + tagH / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  });

  /* ── What, how much, where ── on a frosted panel so it reads on any colour */
  {
    const ph = 148, px = M, py = S - M - ph, pw = S - M * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, px, py, pw, ph, 36);
    ctx.fill();
    ctx.restore();

    const rightW = 230;
    const textW = pw - 44 - rightW - 24;
    const headline = [
      `${spec.count} ${spec.count === 1 ? 'product' : 'products'}`,
      spec.from ? `from ${spec.from}` : null,
    ].filter(Boolean).join(' · ');
    ctx.fillStyle = dark;
    fit(ctx, headline, 800, 42, 28, textW);
    ctx.fillText(headline, px + 36, py + 66);
    ctx.fillStyle = '#4A4942';
    fit(ctx, spec.url, 600, 28, 20, textW, MONO);
    ctx.fillText(clip(ctx, spec.url, textW), px + 36, py + 112);

    /* Right: the action, as a dark pill — it is what the card asks for. */
    const bw = rightW, bh = 84, bx = px + pw - 32 - bw, by = py + (ph - bh) / 2;
    ctx.fillStyle = act.bg;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = act.fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    fit(ctx, 'Order now →', 800, 32, 22, bw - 40);
    ctx.fillText('Order now →', bx + bw / 2, by + bh / 2 + 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  const blob = await new Promise<Blob | null>(res => {
    try { canvas.toBlob(res, 'image/png'); } catch { res(null); }
  });
  let dataUrl = '';
  try { dataUrl = canvas.toDataURL('image/png'); } catch { /* tainted — no preview, still try the blob */ }
  return { blob, dataUrl };
}
