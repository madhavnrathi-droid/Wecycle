'use client';

/*
 * Shareable cards — editorial, brand-forward (Spotify/NFT-card energy).
 *
 * A 4:5 (1080×1350) PNG for any Wecycle post — item, request, event, or
 * lost & found — drawn entirely on an offscreen <canvas> (no deps).
 *
 * Design:
 *   • White header band carrying the Wecycle brand LOCKUP (logomark + cursive
 *     wordmark, no box) on the left, and a quiet type chip on the right.
 *   • Full-bleed hero photo dominating the card. When the post has multiple
 *     photos, a thumbnail filmstrip of the rest sits on a scrim along the
 *     bottom of the hero — so the card shows everything, not just the cover.
 *   • A frosted price / status pill on the hero.
 *   • Dark info plate: big title + "TYPE · place" subline + wecycle.page.
 *
 * Neutral charcoal surface (no coloured gradient) so any photo pops and the
 * brand reads cleanly. Shared as an IMAGE via the Web Share files API; falls
 * back to a PNG download + link copy.
 */

import { haptics } from './haptics';

export type ShareCardKind = 'item' | 'request' | 'event' | 'lost' | 'found';

export interface ShareCardSpec {
  kind: ShareCardKind;
  title: string;
  /** All post photos (cover first). The card shows the cover full-bleed and
   *  the remainder as a thumbnail strip. */
  imageUrls?: string[];
  /** Marketplace price in INR — renders the hero pill "₹ 8,000". */
  price?: number;
  /** Non-priced label when there's no price: "Free" · "Swap" · "Wanted". */
  badge?: string;
  /** Place line (item location, event venue, last-seen spot). */
  location?: string;
  /** Event date+time line ("Sat, Jun 14 · 4:00 PM"). */
  dateLine?: string;
  /** L&F reward note. */
  reward?: string;
  /** Short description, shown in the footer if present. */
  description?: string;
  /** Uploader's display name — the seller byline. */
  byName?: string;
  /** Uploader's email — shown in the footer contact line. */
  byEmail?: string;
  /** Uploader's phone — shown in the footer contact line. */
  byPhone?: string;
  /** Deep link to the post. Defaults to current URL. */
  url?: string;
}

interface Kind {
  word: string;       // type chip + subline
  accent: string;     // small status dot
  glyph: string;      // fallback when no photo
}

const KIND: Record<ShareCardKind, Kind> = {
  item:    { word: 'SHARED',  accent: '#22C55E', glyph: '📦' },
  request: { word: 'WANTED',  accent: '#F59E0B', glyph: '🙌' },
  event:   { word: 'EVENT',   accent: '#8B5CF6', glyph: '🎉' },
  lost:    { word: 'LOST',    accent: '#EF4444', glyph: '🔎' },
  found:   { word: 'FOUND',   accent: '#22C55E', glyph: '✅' },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const WORDMARK_AR = 1719 / 607; // ≈ 2.832

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

/** Draw `img` with object-fit: contain (whole image, never cropped). */
function containDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const rr = w / h;
  let dw: number, dh: number;
  if (ir > rr) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Wrap to at most `maxLines`, ellipsising the final line if it overflows. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test;
    } else if (lines.length === maxLines - 1) {
      // On the last allowed line — keep ALL remaining words here (the trailing
      // ellipsis pass below trims it to fit), so no words are silently dropped.
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

/* ── renderer ───────────────────────────────────── */

export interface RenderedCard {
  blob: Blob | null;
  dataUrl: string;
}

/** Render the card to a PNG. Returns a Blob (for the Web Share API) and a data
 *  URL (for an <img> preview). Never throws — on a tainted canvas it silently
 *  re-renders without the remote photos. */
export async function renderShareCard(spec: ShareCardSpec): Promise<RenderedCard> {
  const W = 1080;
  const H = 1350;
  const kind = KIND[spec.kind];

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const urls = (spec.imageUrls ?? []).filter(u => !!u && /^https?:|^\//.test(u));
  const [logo, wordmark, ...photoImgs] = await Promise.all([
    loadImage('/brand/logomark.png', false),
    loadImage('/brand/wordmark.png', false),
    ...urls.slice(0, 6).map(u => loadImage(u, true)),
  ]);
  const photos = photoImgs.filter((p): p is HTMLImageElement => !!p);

  const ix = 64; // footer left/right margin

  const paint = (useImages: boolean) => {
    ctx.clearRect(0, 0, W, H);

    // ── White card surface ──
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ── Product image (top), inset + rounded like the references ──
    const imX = 64, imY = 84, imW = W - 128, imH = 600;
    const imR = 34;
    ctx.save();
    roundRect(ctx, imX, imY, imW, imH, imR);
    ctx.clip();
    const hero = useImages ? photos[0] : null;
    if (hero) {
      // Blurred cover backdrop fills the panel (no empty bars)…
      ctx.save();
      ctx.filter = 'blur(36px) brightness(0.94)';
      coverDraw(ctx, hero, imX - 48, imY - 48, imW + 96, imH + 96);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(imX, imY, imW, imH);
      // …and the WHOLE product sits sharp on top — never cropped.
      containDraw(ctx, hero, imX + 18, imY + 18, imW - 36, imH - 36);
    } else {
      const pg = ctx.createLinearGradient(imX, imY, imX + imW, imY + imH);
      pg.addColorStop(0, '#EEF0F3');
      pg.addColorStop(1, '#DDE1E6');
      ctx.fillStyle = pg;
      ctx.fillRect(imX, imY, imW, imH);
      ctx.font = `300px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(kind.glyph, imX + imW / 2, imY + imH / 2);
    }
    // Faint top scrim so the kind pill always reads on bright photos.
    const topScrim = ctx.createLinearGradient(imX, imY, imX, imY + 200);
    topScrim.addColorStop(0, 'rgba(0,0,0,0.30)');
    topScrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(imX, imY, imW, 200);
    ctx.restore();

    // Kind pill, top-left of image (like "Best Seller").
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 28px ${FONT}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '1.5px';
    const kw = ctx.measureText(kind.word).width;
    const kpH = 56, kpW = kw + 48, kpX = imX + 28, kpY = imY + 28;
    roundRect(ctx, kpX, kpY, kpW, kpH, kpH / 2);
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(kind.word, kpX + 24, kpY + kpH / 2 + 1);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';

    // Logomark in a clean white circle straddling the image's TOP-RIGHT
    // corner — half over the photo, half in the white margin. Flat: no drop
    // shadow, just a hairline ring so the margin-half keeps a crisp edge.
    const cr = 66, cx = imX + imW, cy = imY;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(17,19,24,0.08)';
    ctx.stroke();
    if (logo) {
      const ls = 104;
      ctx.drawImage(logo, cx - ls / 2, cy - ls / 2, ls, ls);
    }

    // ── Footer (white, no photo). Flat text, bigger proportions. ──
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const wmH = 84;
    const wordmarkY = H - 56 - wmH; // top of the bottom-pinned wordmark
    const fy = imY + imH + 84;      // first title baseline

    // Product title (1–2 lines). Advance tracks the real last baseline so the
    // seller row sits snug under it (no dead gap).
    ctx.fillStyle = '#14161A';
    ctx.font = `800 72px ${FONT}`;
    const titleLines = wrapText(ctx, spec.title, W - ix * 2, 2);
    titleLines.forEach((ln, i) => ctx.fillText(ln, ix, fy + i * 80));
    let y = fy + (titleLines.length - 1) * 80 + 56;

    // Seller name (left) + price / status pill (right).
    const rowMid = y + 22;
    if (spec.byName) {
      ctx.fillStyle = '#6A6F77';
      ctx.font = `500 40px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(wrapText(ctx, spec.byName, W - ix * 2 - 360, 1)[0], ix, rowMid);
      ctx.textBaseline = 'alphabetic';
    }
    const priceText =
      spec.price != null ? `₹${spec.price.toLocaleString('en-IN')}` :
      spec.badge ? spec.badge :
      (spec.kind === 'lost' || spec.kind === 'found') ? kind.word : '';
    if (priceText) {
      ctx.font = `800 50px ${FONT}`;
      const pw = ctx.measureText(priceText).width;
      const ph = 82, pillW = pw + 58;
      const px = W - ix - pillW;
      roundRect(ctx, px, rowMid - ph / 2, pillW, ph, ph / 2);
      ctx.fillStyle = '#14161A';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceText, px + 29, rowMid + 1);
      ctx.textBaseline = 'alphabetic';
    }
    y = rowMid + 54;

    // Description fills the space between the row and the contact line, with
    // only as many lines as fit — wrapText ellipsises the last one cleanly.
    const contact = [spec.byEmail, spec.byPhone].filter(Boolean).join('   ·   ');
    const descLineH = 50;
    const lastDescBaseline = wordmarkY - (contact ? 46 : 0) - 16;
    const maxDescLines = Math.max(0, Math.min(2, Math.floor((lastDescBaseline - y) / descLineH)));
    if (spec.description?.trim() && maxDescLines > 0) {
      ctx.fillStyle = '#6A6F77';
      ctx.font = `400 38px ${FONT}`;
      for (const ln of wrapText(ctx, spec.description.trim(), W - ix * 2, maxDescLines)) {
        y += descLineH;
        ctx.fillText(ln, ix, y);
      }
      y += 12;
    }

    // Email + phone contact line (flows under the description, above wordmark).
    if (contact && y + 44 <= wordmarkY - 6) {
      y += 44;
      ctx.fillStyle = '#9AA0A8';
      ctx.font = `500 34px ${FONT}`;
      ctx.fillText(wrapText(ctx, contact, W - ix * 2, 1)[0], ix, y);
    }

    // ── Wecycle wordmark — bigger, pinned bottom-left (no url) ──
    if (wordmark) {
      ctx.drawImage(wordmark, ix, wordmarkY, wmH * WORDMARK_AR, wmH);
    }
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

/** Share the rendered card as an image file. Falls back to a PNG download +
 *  link copy where the Web Share files API isn't available. */
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

  const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : '');
  try { await navigator.clipboard?.writeText(url); } catch { /* ignore */ }
  haptics.success();
  return 'downloaded';
}
