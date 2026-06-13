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
  /** Link to share alongside the image. Defaults to current URL. */
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

  const paint = (useImages: boolean) => {
    ctx.clearRect(0, 0, W, H);

    // ── Charcoal surface ──
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16171A');
    bg.addColorStop(1, '#0B0B0D');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const HEADER = 150;
    const heroY = HEADER;
    const heroH = 800;
    const heroBottom = heroY + heroH; // 950

    // ── Hero photo (full-bleed) ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, heroY, W, heroH);
    ctx.clip();
    const hero = useImages ? photos[0] : null;
    if (hero) {
      coverDraw(ctx, hero, 0, heroY, W, heroH);
    } else {
      const pg = ctx.createLinearGradient(0, heroY, W, heroBottom);
      pg.addColorStop(0, '#23252B');
      pg.addColorStop(1, '#15161A');
      ctx.fillStyle = pg;
      ctx.fillRect(0, heroY, W, heroH);
      ctx.font = `300px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(kind.glyph, W / 2, heroY + heroH / 2);
    }
    // Top scrim (for the price pill) + bottom scrim (for thumbs).
    const topScrim = ctx.createLinearGradient(0, heroY, 0, heroY + 200);
    topScrim.addColorStop(0, 'rgba(0,0,0,0.42)');
    topScrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, heroY, W, 200);
    if (useImages && photos.length > 1) {
      const botScrim = ctx.createLinearGradient(0, heroBottom - 240, 0, heroBottom);
      botScrim.addColorStop(0, 'rgba(0,0,0,0)');
      botScrim.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = botScrim;
      ctx.fillRect(0, heroBottom - 240, W, 240);
    }
    ctx.restore();

    // ── Price / status pill, top-left of hero ──
    const pillText =
      spec.price != null ? `₹ ${spec.price.toLocaleString('en-IN')}` :
      spec.badge ? spec.badge :
      (spec.kind === 'lost' || spec.kind === 'found') ? kind.word :
      spec.dateLine ? spec.dateLine : '';
    if (pillText) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 38px ${FONT}`;
      const tw = ctx.measureText(pillText).width;
      const ph = 64;
      const pw = tw + 52;
      const px = 40, py = heroY + 28;
      ctx.save();
      roundRect(ctx, px, py, pw, ph, ph / 2);
      ctx.fillStyle = 'rgba(8,9,11,0.62)';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pillText, px + 26, py + ph / 2 + 1);
    }

    // ── Thumbnail filmstrip (the OTHER photos), bottom of hero ──
    if (useImages && photos.length > 1) {
      const extra = photos.slice(1, 6);
      const t = 104, gap = 14, ty = heroBottom - 28 - t;
      let tx = 40;
      const maxShown = Math.min(extra.length, 4);
      for (let i = 0; i < maxShown; i++) {
        ctx.save();
        roundRect(ctx, tx, ty, t, t, 20);
        ctx.clip();
        coverDraw(ctx, extra[i], tx, ty, t, t);
        ctx.restore();
        ctx.save();
        roundRect(ctx, tx, ty, t, t, 20);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
        ctx.restore();
        // "+N" badge on the last tile when there are more.
        if (i === maxShown - 1 && photos.length - 1 > maxShown) {
          ctx.save();
          roundRect(ctx, tx, ty, t, t, 20);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#fff';
          ctx.font = `700 40px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`+${photos.length - 1 - maxShown + 1}`, tx + t / 2, ty + t / 2 + 1);
          ctx.textAlign = 'left';
        }
        tx += t + gap;
      }
    }

    // ── White header band (drawn last so it sits cleanly above the hero) ──
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, HEADER);
    // Brand lockup — logomark + cursive wordmark, no box.
    const lx = 52;
    if (logo) {
      const ls = 60;
      ctx.drawImage(logo, lx, (HEADER - ls) / 2, ls, ls);
      if (wordmark) {
        const wmH = 42;
        const wmW = wmH * WORDMARK_AR;
        ctx.drawImage(wordmark, lx + ls + 14, (HEADER - wmH) / 2, wmW, wmH);
      }
    } else if (wordmark) {
      const wmH = 48;
      ctx.drawImage(wordmark, lx, (HEADER - wmH) / 2, wmH * WORDMARK_AR, wmH);
    }
    // Type chip, right side of header.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 26px ${FONT}`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2px';
    const chipTw = ctx.measureText(kind.word).width;
    const dot = 14, dotGap = 12, chipPadX = 24;
    const chipW = dot + dotGap + chipTw + chipPadX * 2;
    const chipH = 56;
    const chipX = W - 52 - chipW;
    const chipY = (HEADER - chipH) / 2;
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = 'rgba(15,17,20,0.06)';
    ctx.fill();
    ctx.fillStyle = kind.accent;
    ctx.beginPath();
    ctx.arc(chipX + chipPadX + dot / 2, HEADER / 2, dot / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15171A';
    ctx.fillText(kind.word, chipX + chipPadX + dot + dotGap, HEADER / 2 + 1);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';

    // ── Info plate ──
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const ix = 56;
    let y = heroBottom + 96;

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 78px ${FONT}`;
    const titleLines = wrapText(ctx, spec.title, W - ix * 2 - 120, 2);
    for (const ln of titleLines) {
      ctx.fillText(ln, ix, y);
      y += 88;
    }

    // Subline: TYPE · place / date.
    const subParts = [kind.word];
    if (spec.location) subParts.push(spec.location);
    else if (spec.dateLine && spec.price == null && !spec.badge) subParts.push(spec.dateLine);
    ctx.font = `500 36px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    const sub = wrapText(ctx, subParts.join('   ·   '), W - ix * 2 - 120, 1)[0];
    ctx.fillText(sub, ix, y + 20);

    // wecycle.page, pinned bottom-left.
    ctx.font = `600 32px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('wecycle.page', ix, H - 60);

    // Decorative ↗ link circle, bottom-right.
    const cr = 46, cx = W - 56 - cr, cy = H - 60 - cr / 2 - 10;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy + 13);
    ctx.lineTo(cx + 13, cy - 13);
    ctx.moveTo(cx - 6, cy - 13);
    ctx.lineTo(cx + 13, cy - 13);
    ctx.lineTo(cx + 13, cy + 6);
    ctx.stroke();
    ctx.lineCap = 'butt';
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
