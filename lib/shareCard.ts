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
  /** Uploader's display name — shown as the byline. */
  byName?: string;
  /** Uploader's email — shown under the byline. */
  byEmail?: string;
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
    const restIdx = lines.join(' ').split(/\s+/).length;
    let last = [cur, ...words.slice(restIdx)].join(' ');
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
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

  const ix = 72; // left content margin

  const paint = (useImages: boolean) => {
    ctx.clearRect(0, 0, W, H);

    // ── Full-bleed hero photo (the whole card) ──
    const hero = useImages ? photos[0] : null;
    if (hero) {
      coverDraw(ctx, hero, 0, 0, W, H);
    } else {
      const pg = ctx.createLinearGradient(0, 0, W, H);
      pg.addColorStop(0, '#24262C');
      pg.addColorStop(1, '#121317');
      ctx.fillStyle = pg;
      ctx.fillRect(0, 0, W, H);
      ctx.font = `320px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(kind.glyph, W / 2, H / 2);
    }

    // Top + bottom scrims so the overlaid text always reads.
    const topScrim = ctx.createLinearGradient(0, 0, 0, 440);
    topScrim.addColorStop(0, 'rgba(0,0,0,0.62)');
    topScrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, W, 440);
    const botScrim = ctx.createLinearGradient(0, H - 460, 0, H);
    botScrim.addColorStop(0, 'rgba(0,0,0,0)');
    botScrim.addColorStop(1, 'rgba(0,0,0,0.74)');
    ctx.fillStyle = botScrim;
    ctx.fillRect(0, H - 460, W, 460);

    // ── Top-right brand "dent": soft white circular bloom + logomark ──
    const cx = W - 132, cy = 150;
    const bloom = ctx.createRadialGradient(cx, cy, 10, cx, cy, 190);
    bloom.addColorStop(0, 'rgba(255,255,255,0.9)');
    bloom.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    bloom.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(cx - 200, cy - 200, 400, 400);
    // Crisp white disc with a feathered rim for the "soft dent" look.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, 82, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    if (logo) {
      const ls = 86;
      ctx.drawImage(logo, cx - ls / 2, cy - ls / 2, ls, ls);
    }

    // ── Top-left: title · subtitle · price/status pill ──
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let y = 158;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 80px ${FONT}`;
    const titleLines = wrapText(ctx, spec.title, W - ix - 240, 2);
    for (const ln of titleLines) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 18;
      ctx.fillText(ln, ix, y);
      ctx.restore();
      y += 92;
    }

    // Subtitle (kind tagline).
    const tagline: Record<ShareCardKind, string> = {
      item: 'Up for grabs nearby', request: 'Wanted on campus',
      event: spec.dateLine || 'Happening on campus',
      lost: 'Lost — help reunite it', found: 'Found — claim it',
    };
    ctx.font = `500 38px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 14;
    ctx.fillText(wrapText(ctx, tagline[spec.kind], W - ix - 240, 1)[0], ix, y + 6);
    ctx.restore();
    y += 64;

    // Price / status pill.
    const pillText =
      spec.price != null ? `₹ ${spec.price.toLocaleString('en-IN')}` :
      spec.badge ? spec.badge :
      (spec.kind === 'lost' || spec.kind === 'found') ? kind.word : '';
    if (pillText) {
      ctx.textBaseline = 'middle';
      ctx.font = `700 40px ${FONT}`;
      const tw = ctx.measureText(pillText).width;
      const ph = 70, pw = tw + 56;
      ctx.save();
      roundRect(ctx, ix, y, pw, ph, ph / 2);
      ctx.fillStyle = 'rgba(8,9,11,0.66)';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pillText, ix + 28, y + ph / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }

    // ── Bottom-right: thumbnail strip of the OTHER photos ──
    if (useImages && photos.length > 1) {
      const extra = photos.slice(1, 5);
      const t = 96, gap = 12;
      const maxShown = Math.min(extra.length, 3);
      const stripW = maxShown * t + (maxShown - 1) * gap;
      let tx = W - 72 - stripW;
      const ty = H - 250 - t;
      for (let i = 0; i < maxShown; i++) {
        ctx.save();
        roundRect(ctx, tx, ty, t, t, 18);
        ctx.clip();
        coverDraw(ctx, extra[i], tx, ty, t, t);
        ctx.restore();
        ctx.save();
        roundRect(ctx, tx, ty, t, t, 18);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        ctx.restore();
        if (i === maxShown - 1 && photos.length - 1 > maxShown) {
          ctx.save();
          roundRect(ctx, tx, ty, t, t, 18);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#fff';
          ctx.font = `700 38px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`+${photos.length - 1 - maxShown + 1}`, tx + t / 2, ty + t / 2 + 1);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
        tx += t + gap;
      }
    }

    // ── Bottom-left: uploader byline ──
    if (spec.byName) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 42px ${FONT}`;
      ctx.fillText(wrapText(ctx, spec.byName, W - ix * 2, 1)[0], ix, H - 188);
    }
    if (spec.byEmail) {
      ctx.fillStyle = 'rgba(255,255,255,0.74)';
      ctx.font = `400 32px ${FONT}`;
      ctx.fillText(wrapText(ctx, spec.byEmail, W - ix * 2, 1)[0], ix, H - 144);
    }

    // ── Bottom: brand signature (cursive wordmark) + url ──
    let bx = ix;
    if (wordmark) {
      const wmH = 38;
      const wmW = wmH * WORDMARK_AR;
      // White wordmark reads on the dark scrim; the asset is colour-on-clear,
      // so drop a soft shadow for contrast.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 12;
      ctx.drawImage(wordmark, bx, H - 86, wmW, wmH);
      ctx.restore();
      bx += wmW + 18;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `600 30px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('· wecycle.page', bx, H - 86 + 19);
    ctx.textBaseline = 'alphabetic';
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
