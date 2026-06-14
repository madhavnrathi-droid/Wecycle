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
 *     cursive wecycle wordmark centred as the signature. No fake buttons — the
 *     card is shared as an image alongside the real product link.
 *
 * Shared as an IMAGE via the Web Share files API; falls back to PNG download +
 * link copy. Never throws — a tainted canvas re-renders without remote photos.
 */

import { haptics } from './haptics';

export type ShareCardKind = 'item' | 'request' | 'event' | 'lost' | 'found';

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
}

interface Theme {
  message: string; // top-left nudge pill
  dot: string;     // pill status dot
  g1: string;      // gradient top-left
  g2: string;      // gradient bottom-right
  glyph: string;   // fallback when no photo
  person: string;  // person sub-label
}

type IconName = 'mail' | 'clock' | 'users' | 'pin' | 'gift' | 'calendar';

const THEME: Record<ShareCardKind, Theme> = {
  item:    { message: 'Selling on Wecycle',   dot: '#16A34A', g1: '#3BAC6E', g2: '#2E96CC', glyph: '📦', person: 'Verified user' },
  request: { message: 'Wanted on Wecycle',    dot: '#D97706', g1: '#E0A638', g2: '#9C5024', glyph: '🙌', person: 'Verified user' },
  event:   { message: 'Event on Wecycle',     dot: '#7C3AED', g1: '#CC74B4', g2: '#7B4ECB', glyph: '🎉', person: 'Organizer' },
  lost:    { message: 'Lost',                  dot: '#F0470F', g1: '#FB8B43', g2: '#E14C5C', glyph: '🔎', person: 'Verified user' },
  found:   { message: 'Found',                 dot: '#EA6A0C', g1: '#FB9E52', g2: '#E15264', glyph: '✅', person: 'Verified user' },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const WORDMARK_AR = 1719 / 607; // ≈ 2.832

const WHITE = '#ffffff';
const WHITE_2 = 'rgba(255,255,255,0.88)';
const WHITE_3 = 'rgba(255,255,255,0.76)';
const GLASS = 'rgba(255,255,255,0.15)';
const GLASS_STRONG = 'rgba(255,255,255,0.95)';
const HAIR = 'rgba(255,255,255,0.24)';

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

function icon(ctx: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, s: number, color: string) {
  const r = s / 2;
  const lw = Math.max(2, s * 0.085);
  ctx.save();
  setStroke(ctx, color, lw);
  switch (name) {
    case 'mail': {
      const w = s, h = s * 0.74, x = cx - w / 2, y = cy - h / 2;
      roundRect(ctx, x, y, w, h, h * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + lw, y + h * 0.18); ctx.lineTo(cx, y + h * 0.6); ctx.lineTo(x + w - lw, y + h * 0.18); ctx.stroke();
      break;
    }
    case 'calendar': {
      const w = s, h = s, x = cx - w / 2, y = cy - h / 2 + s * 0.04;
      roundRect(ctx, x, y + h * 0.12, w, h * 0.84, h * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * 0.26, y); ctx.lineTo(x + w * 0.26, y + h * 0.22);
      ctx.moveTo(x + w * 0.74, y); ctx.lineTo(x + w * 0.74, y + h * 0.22); ctx.stroke();
      break;
    }
    case 'clock': {
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.5); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.4, cy + r * 0.18); ctx.stroke();
      break;
    }
    case 'users': {
      ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.28, r * 0.34, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + r * 0.46, cy - r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r * 0.85, cy + r * 0.7); ctx.quadraticCurveTo(cx - r * 0.32, cy + r * 0.05, cx + r * 0.2, cy + r * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r * 0.18, cy + r * 0.66); ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.18, cx + r * 0.9, cy + r * 0.66); ctx.stroke();
      break;
    }
    case 'pin': {
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.18, r * 0.62, Math.PI * 0.85, Math.PI * 0.15);
      ctx.lineTo(cx, cy + r * 0.85); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.18, r * 0.24, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'gift': {
      const w = s * 0.92, h = s * 0.8, x = cx - w / 2, y = cy - h / 2;
      roundRect(ctx, x, y + h * 0.3, w, h * 0.7, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.5); ctx.lineTo(x + w, y + h * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y + h * 0.3); ctx.lineTo(cx, y + h); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx - w * 0.18, y + h * 0.18, w * 0.16, h * 0.16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + w * 0.18, y + h * 0.18, w * 0.16, h * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
  }
  ctx.restore();
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

export async function renderShareCard(spec: ShareCardSpec): Promise<RenderedCard> {
  const PAD = 44;
  const W = 1080;
  const R = 52;
  const t = THEME[spec.kind];
  const isEvent = spec.kind === 'event';

  const canvas = document.createElement('canvas');
  canvas.width = W + PAD * 2;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [logo, wordmark, avatar, hero] = await Promise.all([
    loadImage('/brand/logomark.png', false),
    loadImage('/brand/wordmark.png', false),
    spec.byAvatar ? loadImage(spec.byAvatar, true) : Promise.resolve(null),
    urls[0] ? loadImage(urls[0], true) : Promise.resolve(null),
  ]);

  const fx = 56;
  const imX = 40, imW = W - 80, imR = 28;
  const imY = 120;                       // below the header band (pill + logo)
  // The card is built around the photo: the image area takes the photo's exact
  // aspect ratio (clamped to a sane range so extreme panoramas stay usable).
  const heroAR = hero ? hero.width / hero.height : (isEvent ? 16 / 9 : 4 / 3);
  const imH = Math.round(Math.min(1520, Math.max(380, imW / heroAR)));
  const imBottom = imY + imH;
  const f: FooterCtx = { W, fx, imBottom, avatar, wordmark };
  const layout = isEvent ? layoutEventFooter : layoutItemFooter;

  // Measure → adaptive card height.
  const footerBottom = layout(ctx, spec, t, f, false);
  const H = Math.round(footerBottom + 46);
  canvas.height = H + PAD * 2;

  const paint = (useHero: boolean) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(PAD, PAD);

    // Drop shadow under the rounded card.
    ctx.save();
    ctx.shadowColor = 'rgba(17,24,39,0.30)';
    ctx.shadowBlur = 66;
    ctx.shadowOffsetY = 30;
    roundRect(ctx, 0, 0, W, H, R);
    ctx.fillStyle = t.g1;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, 0, 0, W, H, R);
    ctx.clip();

    // Soft full-card gradient (diagonal, top-left g1 → bottom-right g2).
    const g = ctx.createLinearGradient(0, 0, W * 0.7, H);
    g.addColorStop(0, t.g1);
    g.addColorStop(1, t.g2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W * 0.22, 70, 40, W * 0.22, 70, W);
    rg.addColorStop(0, 'rgba(255,255,255,0.12)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // Header band — kind pill (left) + logomark circle (right).
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `700 30px ${FONT}`;
    const mw = ctx.measureText(t.message).width;
    const phH = 60, dotR = 8, padL = 28, gapD = 15;
    const phW = padL + dotR * 2 + gapD + mw + 30;
    const headMid = 44 + phH / 2;
    roundRect(ctx, fx, 44, phW, phH, phH / 2);
    ctx.fillStyle = GLASS_STRONG; ctx.fill();
    ctx.beginPath(); ctx.arc(fx + padL + dotR, headMid, dotR, 0, Math.PI * 2);
    ctx.fillStyle = t.dot; ctx.fill();
    ctx.fillStyle = '#14161A';
    ctx.fillText(t.message, fx + padL + dotR * 2 + gapD, headMid + 1);

    const cr = 50;
    const ccx = W - fx - cr, ccy = 44 + cr;
    ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    if (logo) { const ls = cr * 1.55; ctx.drawImage(logo, ccx - ls / 2, ccy - ls / 2, ls, ls); }

    // Photo — white base (cut-outs always on white), whole image at its own AR.
    ctx.save();
    roundRect(ctx, imX, imY, imW, imH, imR);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(imX, imY, imW, imH);
    const photo = useHero ? hero : null;
    if (photo) {
      containDraw(ctx, photo, imX, imY, imW, imH);
    } else {
      ctx.font = `260px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#9AA0A8';
      ctx.fillText(t.glyph, imX + imW / 2, imY + imH / 2); ctx.textAlign = 'left';
    }
    ctx.restore();

    // Event date badge (over the photo, bottom-left).
    if (isEvent && spec.dateBadge) {
      const bw = 144, bh = 158, bx = imX + 24, by = imBottom - bh - 24;
      roundRect(ctx, bx, by, bw, bh, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = t.g2; ctx.font = `700 29px ${FONT}`;
      ctx.fillText(spec.dateBadge.mon.toUpperCase(), bx + bw / 2, by + 46);
      ctx.fillStyle = '#14161A'; ctx.font = `800 66px ${FONT}`;
      ctx.fillText(spec.dateBadge.day, bx + bw / 2, by + 110);
      ctx.fillStyle = '#6A6F77'; ctx.font = `600 24px ${FONT}`;
      ctx.fillText(spec.dateBadge.dow.toUpperCase(), bx + bw / 2, by + 140);
      ctx.textAlign = 'left';
    }

    layout(ctx, spec, t, f, true);

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

/* ── footers (single source of truth: measure when draw=false) ──── */

/** Centred cursive wecycle wordmark — the signature that anchors the card. */
function wordmarkSignature(ctx: CanvasRenderingContext2D, f: FooterCtx, y: number, draw: boolean): number {
  const wmH = 56, wmW = wmH * WORDMARK_AR;
  if (draw && f.wordmark) ctx.drawImage(tintImage(f.wordmark, wmW, wmH, '#ffffff'), (f.W - wmW) / 2, y, wmW, wmH);
  return y + wmH;
}

/** Marketplace / request / lost / found footer. Returns content bottom Y. */
function layoutItemFooter(ctx: CanvasRenderingContext2D, spec: ShareCardSpec, t: Theme, f: FooterCtx, draw: boolean): number {
  const { W, fx, avatar } = f;
  const kind = spec.kind;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let y = f.imBottom + 78;

  // Title + price (price inline, right).
  const priceText = spec.price != null ? `₹${spec.price.toLocaleString('en-IN')}` : '';
  ctx.font = `800 54px ${FONT}`;
  const priceW = priceText ? ctx.measureText(priceText).width : 0;
  ctx.font = `800 60px ${FONT}`;
  const titleLines = wrapText(ctx, spec.title, W - fx * 2 - (priceText ? priceW + 32 : 0), 2);
  if (draw) {
    ctx.fillStyle = WHITE;
    titleLines.forEach((ln, i) => ctx.fillText(ln, fx, y + i * 68));
    if (priceText) {
      ctx.font = `800 54px ${FONT}`; ctx.fillStyle = WHITE;
      ctx.textAlign = 'right'; ctx.fillText(priceText, W - fx, y); ctx.textAlign = 'left';
    }
  }
  y += (titleLines.length - 1) * 68 + 16;

  if (spec.location) {
    y += 36;
    if (draw) {
      icon(ctx, 'pin', fx + 14, y - 11, 30, WHITE_2);
      ctx.font = `500 32px ${FONT}`; ctx.fillStyle = WHITE_2;
      ctx.fillText(wrapText(ctx, spec.location, W - fx * 2 - 46, 1)[0], fx + 40, y);
    }
  }

  if (spec.description?.trim()) {
    ctx.font = `400 35px ${FONT}`;
    const lines = wrapText(ctx, spec.description.trim(), W - fx * 2, 3);
    if (draw) { ctx.fillStyle = WHITE_2; lines.forEach(ln => { y += 47; ctx.fillText(ln, fx, y); }); }
    else { y += lines.length * 47; }
    y += 4;
  }

  // Reward pill (request / lost / found).
  if (spec.reward?.trim()) {
    y += 38;
    const ph = 84, label = kind === 'request' ? 'Offering Reward' : 'Reward';
    if (draw) {
      roundRect(ctx, fx, y, W - fx * 2, ph, 22); ctx.fillStyle = GLASS; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = HAIR; ctx.stroke();
      icon(ctx, 'gift', fx + 42, y + ph / 2, 36, WHITE);
      ctx.font = `600 34px ${FONT}`; ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
      ctx.fillText(label, fx + 78, y + ph / 2 + 1);
      ctx.font = `800 38px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillText(spec.reward.trim(), W - fx - 30, y + ph / 2 + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    y += ph;
  }

  // Divider.
  y += 40;
  if (draw) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(W - fx, y); ctx.stroke(); }

  // Person row (avatar + name + verified · sub-label). No fake icons.
  if (spec.byName) {
    y += 44;
    const ar = 32;
    if (draw) {
      drawAvatar(ctx, fx + ar, y, ar, avatar, spec.byInitials, spec.byColor);
      const nameX = fx + ar * 2 + 22;
      ctx.font = `700 37px ${FONT}`; ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
      const nm = wrapText(ctx, spec.byName, W - nameX - fx - 50, 1)[0];
      ctx.fillText(nm, nameX, y - 14);
      if (spec.verified) checkBadge(ctx, nameX + ctx.measureText(nm).width + 26, y - 14, 16, '#ffffff', t.g2);
      ctx.font = `500 28px ${FONT}`; ctx.fillStyle = WHITE_3;
      ctx.fillText(t.person, nameX, y + 24);
      ctx.textBaseline = 'alphabetic';
    }
    y += ar + 24;
  }

  // Centred wordmark signature.
  y += 48;
  return wordmarkSignature(ctx, f, y, draw);
}

/** Event footer (date badge handled separately). Returns content bottom Y. */
function layoutEventFooter(ctx: CanvasRenderingContext2D, spec: ShareCardSpec, t: Theme, f: FooterCtx, draw: boolean): number {
  const { W, fx, avatar } = f;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let y = f.imBottom + 76;

  ctx.font = `800 58px ${FONT}`;
  const titleLines = wrapText(ctx, spec.title, W - fx * 2, 2);
  if (draw) { ctx.fillStyle = WHITE; titleLines.forEach((ln, i) => ctx.fillText(ln, fx, y + i * 66)); }
  y += (titleLines.length - 1) * 66 + 14;

  if (spec.location) {
    y += 34;
    if (draw) {
      icon(ctx, 'pin', fx + 14, y - 11, 30, WHITE_2);
      ctx.font = `500 32px ${FONT}`; ctx.fillStyle = WHITE_2;
      ctx.fillText(wrapText(ctx, spec.location, W - fx * 2 - 46, 1)[0], fx + 40, y);
    }
  }

  if (spec.description?.trim()) {
    ctx.font = `400 34px ${FONT}`;
    const lines = wrapText(ctx, spec.description.trim(), W - fx * 2, 3);
    if (draw) { ctx.fillStyle = WHITE_2; lines.forEach(ln => { y += 45; ctx.fillText(ln, fx, y); }); }
    else { y += lines.length * 45; }
  }

  const chips = (spec.eventChips ?? []).filter(Boolean).slice(0, 3);
  if (chips.length) {
    y += 38;
    const boxH = 96;
    if (draw) {
      roundRect(ctx, fx, y, W - fx * 2, boxH, 22); ctx.fillStyle = GLASS; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = HAIR; ctx.stroke();
      const colW = (W - fx * 2) / chips.length;
      const ci: IconName[] = ['clock', 'users', 'gift'];
      chips.forEach((c, i) => {
        const cx0 = fx + colW * i;
        icon(ctx, ci[i] || 'clock', cx0 + 38, y + boxH / 2, 32, WHITE);
        ctx.font = `600 27px ${FONT}`; ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
        ctx.fillText(wrapText(ctx, c, colW - 86, 1)[0], cx0 + 66, y + boxH / 2 + 1); ctx.textBaseline = 'alphabetic';
        if (i > 0) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx0, y + 22); ctx.lineTo(cx0, y + boxH - 22); ctx.stroke(); }
      });
    }
    y += boxH;
  }

  // Divider.
  y += 40;
  if (draw) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(W - fx, y); ctx.stroke(); }

  // Organizer row (no fake icons).
  if (spec.byName) {
    y += 44;
    const ar = 32;
    if (draw) {
      drawAvatar(ctx, fx + ar, y, ar, avatar, spec.byInitials, spec.byColor);
      const nameX = fx + ar * 2 + 22;
      ctx.font = `700 36px ${FONT}`; ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
      const nm = wrapText(ctx, spec.byName, W - nameX - fx - 50, 1)[0];
      ctx.fillText(nm, nameX, y - 14);
      if (spec.verified) checkBadge(ctx, nameX + ctx.measureText(nm).width + 24, y - 14, 15, '#ffffff', t.g2);
      ctx.font = `500 27px ${FONT}`; ctx.fillStyle = WHITE_3;
      ctx.fillText(t.person, nameX, y + 22); ctx.textBaseline = 'alphabetic';
    }
    y += ar + 22;
  }

  y += 46;
  return wordmarkSignature(ctx, f, y, draw);
}

/* ── share / download / copy ────────────────────── */

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
