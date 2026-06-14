'use client';

/*
 * Shareable cards — editorial, brand-forward (Spotify / NFT-card energy).
 *
 * A tall card rendered on a transparent canvas with a soft drop shadow, for any
 * Wecycle post — item, request, event, lost & found. Drawn entirely on an
 * offscreen <canvas>, no deps. The card HEIGHT adapts to the footer content so
 * there's never an empty gap nor a collision, whatever the post length.
 *
 * Design (copied from the in-house mockups):
 *   • The WHOLE card is a per-kind shader gradient — green→blue (marketplace),
 *     amber→auburn (request), pink→purple (event), orange→red (lost & found).
 *   • All copy is white. A white pill (top-left) carries the kind nudge and the
 *     logomark sits in a white circle (top-right).
 *   • The PRODUCT PHOTO is inset on a WHITE base and shown WHOLE (contain over a
 *     blurred copy of itself), so any aspect ratio fills the frame, nothing is
 *     cropped, and a background-removed cut-out always sits on white.
 *   • Footer: title + price, location, description, a translucent reward pill /
 *     event stat-chips, a person row (avatar · name · verified, chat/phone),
 *     the cursive wecycle wordmark and the mockup action buttons.
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
  cta: string;     // primary action button label
  caIcon: IconName;
  person: string;  // person sub-label
}

type IconName =
  | 'chat' | 'calendar' | 'heart' | 'share' | 'bookmark' | 'mail' | 'clock'
  | 'users' | 'pin' | 'eye' | 'phone' | 'gift' | 'flag';

const THEME: Record<ShareCardKind, Theme> = {
  item:    { message: 'Selling on Wecycle',   dot: '#16A34A', g1: '#1FA257', g2: '#0E80C4', glyph: '📦', cta: 'Chat with Seller', caIcon: 'chat',     person: 'Verified user' },
  request: { message: 'Wanted on Wecycle',    dot: '#E0960C', g1: '#E0960C', g2: '#8A3A12', glyph: '🙌', cta: 'Message',          caIcon: 'chat',     person: 'Verified user' },
  event:   { message: 'Event on Wecycle',     dot: '#B14FD8', g1: '#D957A6', g2: '#6E28D9', glyph: '🎉', cta: "I'm Interested",   caIcon: 'calendar', person: 'Organizer' },
  lost:    { message: 'Lost',                  dot: '#F0470F', g1: '#F97316', g2: '#E11D48', glyph: '🔎', cta: 'Share',            caIcon: 'share',    person: 'Verified user' },
  found:   { message: 'Found',                 dot: '#EA6A0C', g1: '#FB8F3A', g2: '#E0344E', glyph: '✅', cta: 'Share',            caIcon: 'share',    person: 'Verified user' },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const WORDMARK_AR = 1719 / 607; // ≈ 2.832

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
    case 'chat': {
      const w = s, h = s * 0.84, x = cx - w / 2, y = cy - h / 2;
      roundRect(ctx, x, y, w, h * 0.82, h * 0.26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * 0.26, y + h * 0.82); ctx.lineTo(x + w * 0.16, y + h); ctx.lineTo(x + w * 0.46, y + h * 0.82); ctx.stroke();
      break;
    }
    case 'calendar': {
      const w = s, h = s, x = cx - w / 2, y = cy - h / 2 + s * 0.04;
      roundRect(ctx, x, y + h * 0.12, w, h * 0.84, h * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w * 0.26, y); ctx.lineTo(x + w * 0.26, y + h * 0.22);
      ctx.moveTo(x + w * 0.74, y); ctx.lineTo(x + w * 0.74, y + h * 0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.02); ctx.lineTo(cx, cy + s * 0.3);
      ctx.moveTo(cx - s * 0.14, cy + s * 0.16); ctx.lineTo(cx + s * 0.14, cy + s * 0.16); ctx.stroke();
      break;
    }
    case 'heart': {
      const u = s * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy + u * 0.72);
      ctx.bezierCurveTo(cx - u * 1.3, cy - u * 0.3, cx - u * 0.5, cy - u * 1.0, cx, cy - u * 0.28);
      ctx.bezierCurveTo(cx + u * 0.5, cy - u * 1.0, cx + u * 1.3, cy - u * 0.3, cx, cy + u * 0.72);
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'share': {
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.85); ctx.lineTo(cx, cy + r * 0.25);
      ctx.moveTo(cx - r * 0.42, cy - r * 0.45); ctx.lineTo(cx, cy - r * 0.9); ctx.lineTo(cx + r * 0.42, cy - r * 0.45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r * 0.7, cy - r * 0.1); ctx.lineTo(cx - r * 0.7, cy + r * 0.85); ctx.lineTo(cx + r * 0.7, cy + r * 0.85); ctx.lineTo(cx + r * 0.7, cy - r * 0.1); ctx.stroke();
      break;
    }
    case 'bookmark': {
      const w = s * 0.66, h = s * 0.92, x = cx - w / 2, y = cy - h / 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(cx, y + h * 0.7); ctx.lineTo(x, y + h); ctx.closePath(); ctx.stroke();
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
    case 'eye': {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, cy);
      ctx.quadraticCurveTo(cx, cy - r * 0.85, cx + r * 0.95, cy);
      ctx.quadraticCurveTo(cx, cy + r * 0.85, cx - r * 0.95, cy);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'phone': {
      const w = s * 0.6, h = s * 0.92, x = cx - w / 2, y = cy - h / 2;
      roundRect(ctx, x, y, w, h, w * 0.24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - w * 0.16, y + h * 0.12); ctx.lineTo(cx + w * 0.16, y + h * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y + h - h * 0.13, lw * 0.7, 0, Math.PI * 2); ctx.fill();
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
    case 'flag': {
      ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy - r * 0.85); ctx.lineTo(cx - r * 0.5, cy + r * 0.85); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.62, cy - r * 0.52);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.18);
      ctx.lineTo(cx + r * 0.62, cy + r * 0.16);
      ctx.lineTo(cx - r * 0.5, cy); ctx.closePath(); ctx.stroke();
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
    ctx.globalAlpha = 0.9;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#14161A';
    ctx.font = `700 ${r}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((initials || '?').slice(0, 2).toUpperCase(), cx, cy + 1);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  // hairline ring
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

/** Translucent white text colours for the gradient surface. */
const WHITE = '#ffffff';
const WHITE_2 = 'rgba(255,255,255,0.86)';
const WHITE_3 = 'rgba(255,255,255,0.74)';
const GLASS = 'rgba(255,255,255,0.16)';
const GLASS_STRONG = 'rgba(255,255,255,0.94)';
const HAIR = 'rgba(255,255,255,0.22)';

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
  const imH = isEvent ? 560 : 716;
  const imBottom = imY + imH;
  const f: FooterCtx = { W, fx, imBottom, avatar, wordmark };
  const layout = isEvent ? layoutEventFooter : layoutItemFooter;

  // Measure → adaptive card height.
  const footerBottom = layout(ctx, spec, t, f, false);
  const H = Math.round(footerBottom + 50);
  canvas.height = H + PAD * 2;

  const paint = (useHero: boolean) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(PAD, PAD);

    // Drop shadow under the rounded card.
    ctx.save();
    ctx.shadowColor = 'rgba(17,24,39,0.32)';
    ctx.shadowBlur = 66;
    ctx.shadowOffsetY = 30;
    roundRect(ctx, 0, 0, W, H, R);
    ctx.fillStyle = t.g1;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, 0, 0, W, H, R);
    ctx.clip();

    // Full-card gradient (diagonal, top-left g1 → bottom-right g2).
    const g = ctx.createLinearGradient(0, 0, W * 0.65, H);
    g.addColorStop(0, t.g1);
    g.addColorStop(1, t.g2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // gentle radial lift, top-left
    const rg = ctx.createRadialGradient(W * 0.2, 80, 60, W * 0.2, 80, W * 0.9);
    rg.addColorStop(0, 'rgba(255,255,255,0.16)');
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

    // Image — white base (cut-outs always sit on white), then whole photo.
    ctx.save();
    roundRect(ctx, imX, imY, imW, imH, imR);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(imX, imY, imW, imH);
    const photo = useHero ? hero : null;
    if (photo) {
      ctx.save();
      ctx.filter = 'blur(46px) brightness(0.98)';
      coverDraw(ctx, photo, imX - 64, imY - 64, imW + 128, imH + 128);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(imX, imY, imW, imH);
      containDraw(ctx, photo, imX + 14, imY + 14, imW - 28, imH - 28);
    } else {
      ctx.font = `260px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

/** A frosted action pill (icon + label) right-anchored. Returns its left x. */
function rightPill(ctx: CanvasRenderingContext2D, rightX: number, midY: number, label: string, ic: IconName): number {
  const h = 80;
  ctx.font = `700 31px ${FONT}`;
  const lw = ctx.measureText(label).width;
  const w = 42 + 34 + 14 + lw + 32;
  const x = rightX - w;
  roundRect(ctx, x, midY - h / 2, w, h, h / 2);
  ctx.fillStyle = GLASS_STRONG; ctx.fill();
  icon(ctx, ic, x + 44, midY, 34, '#1B1D22');
  ctx.fillStyle = '#14161A'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 44 + 34, midY + 1); ctx.textBaseline = 'alphabetic';
  return x;
}

/** A frosted icon circle right-anchored. Returns its left x. */
function rightCircle(ctx: CanvasRenderingContext2D, rightX: number, midY: number, ic: IconName): number {
  const d = 80, x = rightX - d;
  roundRect(ctx, x, midY - d / 2, d, d, d / 2);
  ctx.fillStyle = GLASS; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = HAIR; ctx.stroke();
  icon(ctx, ic, x + d / 2, midY, 36, WHITE);
  return x;
}

function wordmarkWhite(ctx: CanvasRenderingContext2D, wm: HTMLImageElement | null, x: number, midY: number, h = 52) {
  if (!wm) return;
  const w = h * WORDMARK_AR;
  ctx.drawImage(tintImage(wm, w, h, '#ffffff'), x, midY - h / 2, w, h);
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

  // Location · time.
  if (spec.location) {
    y += 34;
    if (draw) {
      icon(ctx, 'pin', fx + 14, y - 11, 30, WHITE_2);
      ctx.font = `500 32px ${FONT}`; ctx.fillStyle = WHITE_2;
      ctx.fillText(wrapText(ctx, spec.location, W - fx * 2 - 46, 1)[0], fx + 40, y);
    }
  }

  // Description.
  if (spec.description?.trim()) {
    ctx.font = `400 35px ${FONT}`;
    const lines = wrapText(ctx, spec.description.trim(), W - fx * 2, 3);
    if (draw) { ctx.fillStyle = WHITE_2; lines.forEach(ln => { y += 47; ctx.fillText(ln, fx, y); }); }
    else { y += lines.length * 47; }
    y += 4;
  }

  // Reward pill (request / lost / found).
  if (spec.reward?.trim()) {
    y += 36;
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
  y += 36;
  if (draw) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(W - fx, y); ctx.stroke(); }
  y += 6;

  // Person row: avatar + name + sub-label (left) · chat/phone circles (right).
  y += 40;
  const ar = 32;
  if (draw && spec.byName) {
    drawAvatar(ctx, fx + ar, y, ar, avatar, spec.byInitials, spec.byColor);
    const nameX = fx + ar * 2 + 22;
    ctx.font = `700 37px ${FONT}`; ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
    const nm = wrapText(ctx, spec.byName, W - nameX - fx - 200, 1)[0];
    ctx.fillText(nm, nameX, y - 14);
    if (spec.verified) checkBadge(ctx, nameX + ctx.measureText(nm).width + 26, y - 14, 16, '#ffffff', t.g2);
    ctx.font = `500 28px ${FONT}`; ctx.fillStyle = WHITE_3;
    ctx.fillText(t.person, nameX, y + 24);
    ctx.textBaseline = 'alphabetic';
    // contact circles
    let rx = W - fx;
    if (spec.byPhone) rx = rightCircle(ctx, rx, y, 'phone') - 14;
    rightCircle(ctx, rx, y, 'chat');
  }
  y += ar + 24;

  // Wordmark + actions.
  if (kind === 'lost' || kind === 'found') {
    // wecycle wordmark on its own line, then a row of three frosted pills.
    y += 46;
    if (draw) wordmarkWhite(ctx, f.wordmark, fx, y, 50);
    y += 58;
    const rowY = y + 42, gap = 14, n = 3;
    if (draw) {
      const pw = (W - fx * 2 - gap * (n - 1)) / n;
      const defs: [string, IconName][] = [['Share', 'share'], ['Save', 'heart'], ['Report', 'flag']];
      defs.forEach(([lbl, ic], i) => {
        const x = fx + (pw + gap) * i, h = 84;
        roundRect(ctx, x, rowY - h / 2, pw, h, h / 2); ctx.fillStyle = GLASS; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = HAIR; ctx.stroke();
        ctx.font = `700 30px ${FONT}`;
        const lw = ctx.measureText(lbl).width, gw = 32 + 12 + lw, sx = x + (pw - gw) / 2;
        icon(ctx, ic, sx + 16, rowY, 32, WHITE);
        ctx.fillStyle = WHITE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, sx + 32 + 12, rowY + 1); ctx.textBaseline = 'alphabetic';
      });
    }
    return rowY + 42;
  }
  y += 36;
  const midY = y + 42;
  if (draw) {
    wordmarkWhite(ctx, f.wordmark, fx, midY);
    let rx = W - fx;
    if (kind === 'item') {
      rx = rightCircle(ctx, rx, midY, 'share') - 14;
      rx = rightCircle(ctx, rx, midY, 'heart') - 14;
      rightPill(ctx, rx, midY, t.cta, t.caIcon);
    } else {
      rx = rightCircle(ctx, rx, midY, 'share') - 14;
      const lbl = `${t.cta}${spec.byName ? ` ${spec.byName.split(/\s+/)[0]}` : ''}`;
      rightPill(ctx, rx, midY, lbl, t.caIcon);
    }
  }
  return midY + 42;
}

/** Event footer (date badge handled separately). Returns content bottom Y. */
function layoutEventFooter(ctx: CanvasRenderingContext2D, spec: ShareCardSpec, t: Theme, f: FooterCtx, draw: boolean): number {
  const { W, fx, avatar } = f;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let y = f.imBottom + 74;

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
    y += 36;
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

  // Organizer row.
  if (spec.byName) {
    y += 38;
    const ar = 32;
    if (draw) {
      drawAvatar(ctx, fx + ar, y, ar, avatar, spec.byInitials, spec.byColor);
      const nameX = fx + ar * 2 + 22;
      ctx.font = `700 36px ${FONT}`; ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
      const nm = wrapText(ctx, spec.byName, W - nameX - fx - 130, 1)[0];
      ctx.fillText(nm, nameX, y - 14);
      if (spec.verified) checkBadge(ctx, nameX + ctx.measureText(nm).width + 24, y - 14, 15, '#ffffff', t.g2);
      ctx.font = `500 27px ${FONT}`; ctx.fillStyle = WHITE_3;
      ctx.fillText(t.person, nameX, y + 22); ctx.textBaseline = 'alphabetic';
      rightCircle(ctx, W - fx, y, 'chat');
    }
    y += ar + 14;
  }

  // Divider + actions.
  y += 32;
  if (draw) { ctx.strokeStyle = HAIR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(W - fx, y); ctx.stroke(); }
  y += 6;
  y += 36;
  const midY = y + 42;
  if (draw) {
    wordmarkWhite(ctx, f.wordmark, fx, midY);
    let rx = W - fx;
    rx = rightCircle(ctx, rx, midY, 'bookmark') - 14;
    rx = rightCircle(ctx, rx, midY, 'share') - 14;
    rightPill(ctx, rx, midY, t.cta, t.caIcon);
  }
  return midY + 42;
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

export async function shareCardBlob(blob: Blob | null, spec: ShareCardSpec): Promise<ShareCardResult> {
  if (typeof navigator === 'undefined') return 'unavailable';
  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : 'https://wecycle.page');

  if (blob) {
    const file = new File([blob], `wecycle-${spec.kind}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
    };
    const data: ShareData = { files: [file], title: spec.title, text: cardText(spec), url } as ShareData;
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
