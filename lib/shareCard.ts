'use client';

/*
 * Spotify-style shareable cards.
 *
 * Generates a beautiful 4:5 (1080×1350) PNG for any Wecycle post — a
 * marketplace item, a request, an event, or a lost & found report — drawn
 * entirely on an offscreen <canvas> (no extra deps, no server round-trip).
 *
 * Layout (top → bottom):
 *   • Rich type-coloured gradient background
 *   • Wecycle logomark badge, top-right corner
 *   • Large rounded cover photo (falls back to a glyph panel when there's
 *     no image, so we never paint a broken tile)
 *   • Type label · big title · price/badge pill · location/date line
 *   • "Wecycle · wecycle.page" footer
 *
 * The card is shared as an IMAGE through the Web Share API (the way Spotify
 * shares a track card to Stories/WhatsApp). Desktop or unsupported devices
 * fall back to downloading the PNG + copying the link.
 */

import { haptics } from './haptics';

export type ShareCardKind = 'item' | 'request' | 'event' | 'lost' | 'found';

export interface ShareCardSpec {
  kind: ShareCardKind;
  title: string;
  /** Cover photo URL (Supabase / Unsplash / local). Optional. */
  imageUrl?: string;
  /** Marketplace price in INR — renders an accent pill "₹ 8,000". */
  price?: number;
  /** Non-priced label when there's no price: "Free" · "Swap" · "Wanted". */
  badge?: string;
  /** Place line (item location, event venue, last-seen spot). */
  location?: string;
  /** Event date+time line ("Sat, Jun 14 · 4:00 PM"). */
  dateLine?: string;
  /** L&F reward note. */
  reward?: string;
  /** Link to share alongside the image. Defaults to current URL. */
  url?: string;
}

interface Theme {
  label: string;
  top: string;
  bottom: string;
  accent: string;       // pill fill
  accentText: string;   // text on the pill
  glyph: string;        // fallback emoji when no photo
}

const THEME: Record<ShareCardKind, Theme> = {
  item:    { label: 'SHARED ON WECYCLE', top: '#21A557', bottom: '#0B5230', accent: '#C4F649', accentText: '#0B2415', glyph: '📦' },
  request: { label: 'WANTED ON WECYCLE', top: '#E6A417', bottom: '#8A5B00', accent: '#FFE066', accentText: '#3A2A00', glyph: '🙌' },
  event:   { label: 'EVENT ON WECYCLE',  top: '#7C3AED', bottom: '#3F1D78', accent: '#E9D5FF', accentText: '#3B1567', glyph: '🎉' },
  lost:    { label: 'LOST ON WECYCLE',   top: '#EA5A3D', bottom: '#8E2A14', accent: '#FFE0D6', accentText: '#7A2410', glyph: '🔎' },
  found:   { label: 'FOUND ON WECYCLE',  top: '#21A557', bottom: '#0B5230', accent: '#C4F649', accentText: '#0B2415', glyph: '✅' },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* ── canvas helpers ─────────────────────────────── */

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

/** Draw `img` into the rect with object-fit: cover (centre crop). */
function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > rr) { sw = img.height * rr; sx = (img.width - sw) / 2; }
  else { sh = img.width / rr; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Wrap to at most `maxLines`, ellipsising the final line if it overflows. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) break;
    }
  }
  if (lines.length < maxLines) {
    lines.push(cur);
  } else {
    // Append the rest onto the last allowed line and ellipsise.
    const restIdx = lines.join(' ').split(/\s+/).length;
    let last = [cur, ...words.slice(restIdx)].join(' ');
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      last = `${last.trimEnd()}…`;
    }
    lines[maxLines - 1] = last;
  }
  return lines;
}

/* ── renderer ───────────────────────────────────── */

export interface RenderedCard {
  blob: Blob | null;
  dataUrl: string;
}

/** Render the card to a PNG. Returns both a Blob (for the Web Share API) and
 *  a data URL (for an <img> preview). Never throws — on a tainted canvas it
 *  silently re-renders without the remote photo. */
export async function renderShareCard(spec: ShareCardSpec): Promise<RenderedCard> {
  const W = 1080;
  const H = 1350;
  const theme = THEME[spec.kind];

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Preload assets (logomark same-origin; cover photo cross-origin).
  const [logo, cover] = await Promise.all([
    loadImage('/brand/logomark.png', false),
    spec.imageUrl ? loadImage(spec.imageUrl, true) : Promise.resolve(null),
  ]);

  const paint = (useCover: boolean) => {
    ctx.clearRect(0, 0, W, H);

    // Background gradient + soft top-left light.
    const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
    bg.addColorStop(0, theme.top);
    bg.addColorStop(1, theme.bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.22, H * 0.12, 40, W * 0.22, H * 0.12, W);
    glow.addColorStop(0, 'rgba(255,255,255,0.20)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const pad = 96;
    const imgX = pad, imgY = 156, imgW = W - pad * 2, imgH = 540;

    // Cover photo (rounded, with drop shadow) — or a glyph panel.
    ctx.save();
    roundRect(ctx, imgX, imgY, imgW, imgH, 44);
    ctx.shadowColor = 'rgba(0,0,0,0.30)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 26;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, imgX, imgY, imgW, imgH, 44);
    ctx.clip();
    if (useCover && cover) {
      coverDraw(ctx, cover, imgX, imgY, imgW, imgH);
    } else {
      const pg = ctx.createLinearGradient(imgX, imgY, imgX + imgW, imgY + imgH);
      pg.addColorStop(0, 'rgba(255,255,255,0.24)');
      pg.addColorStop(1, 'rgba(255,255,255,0.07)');
      ctx.fillStyle = pg;
      ctx.fillRect(imgX, imgY, imgW, imgH);
      ctx.font = `300px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(theme.glyph, imgX + imgW / 2, imgY + imgH / 2 + 10);
    }
    ctx.restore();

    // Logomark badge — top-right (white rounded card + the mark, with shadow).
    const badge = 140;
    const bx = W - pad - badge;
    const by = 40;
    ctx.save();
    roundRect(ctx, bx, by, badge, badge, 34);
    ctx.shadowColor = 'rgba(0,0,0,0.24)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    if (logo) {
      ctx.save();
      roundRect(ctx, bx, by, badge, badge, 34);
      ctx.clip();
      ctx.drawImage(logo, bx, by, badge, badge);
      ctx.restore();
    }

    // Text block.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let y = imgY + imgH + 78;

    // Type label (letter-spaced uppercase).
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    // letterSpacing is supported on modern Canvas2D; harmless if ignored.
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '3px';
    ctx.fillText(theme.label, pad, y);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
    y += 58;

    // Title (bold, up to 2 lines).
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 76px ${FONT}`;
    const titleLines = wrapText(ctx, spec.title, W - pad * 2, 2);
    for (const ln of titleLines) {
      ctx.fillText(ln, pad, y + 8);
      y += 86;
    }
    y += 16;

    // Price / badge pill.
    const pillText =
      spec.price != null ? `₹ ${spec.price.toLocaleString('en-IN')}` :
      spec.badge ? spec.badge : '';
    if (pillText) {
      ctx.font = `700 40px ${FONT}`;
      const tw = ctx.measureText(pillText).width;
      const pillH = 68;
      const pillW = tw + 60;
      roundRect(ctx, pad, y, pillW, pillH, pillH / 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.fillStyle = theme.accentText;
      ctx.textBaseline = 'middle';
      ctx.fillText(pillText, pad + 30, y + pillH / 2 + 2);
      ctx.textBaseline = 'alphabetic';
      y += pillH + 28;
    } else {
      y += 6;
    }

    // Sub line(s): date (events) and/or location. Capped so they never reach
    // the footer.
    const subs: string[] = [];
    if (spec.dateLine) subs.push(`🗓  ${spec.dateLine}`);
    if (spec.location) subs.push(`📍  ${spec.location}`);
    if (spec.reward) subs.push(`🎁  Reward: ${spec.reward}`);
    ctx.font = `400 36px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const footerTop = H - 116;
    for (const s of subs.slice(0, 2)) {
      if (y + 24 > footerTop - 10) break; // never collide with the footer
      const line = wrapText(ctx, s, W - pad * 2, 1)[0];
      ctx.fillText(line, pad, y + 24);
      y += 52;
    }

    // Footer — pinned to the bottom, always clear of the content above.
    ctx.font = `700 40px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Wecycle', pad, H - 104);
    ctx.font = `400 30px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText('Your campus circular economy · wecycle.page', pad, H - 60);
  };

  // Try with the photo; if the canvas is tainted (cross-origin without CORS),
  // re-render without it so export still succeeds.
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

/** Share the rendered card as an image file (Spotify-style). Falls back to a
 *  PNG download + link copy where the Web Share files API isn't available. */
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
        /* fall through to download */
      }
    }
  }

  return downloadCardBlob(blob, spec);
}

/** Save the PNG to the device and copy the link. */
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

  // Best-effort copy the link too.
  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : '');
  try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
  haptics.success();
  return 'downloaded';
}
