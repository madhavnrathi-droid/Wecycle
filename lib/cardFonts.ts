'use client';

/* ── Type for share cards ──────────────────────────────────────────────────
 *
 * Two faces, one job each:
 *   • Geist Pixel (Square) — the headline. A bitmap face reads as a poster
 *     at thumbnail size, which is the size a card is first seen at in a chat.
 *     Self-hosted from public/fonts/card (SIL OFL, licence beside it).
 *   • Satoshi — everything else. Loaded through Fontshare's own API rather
 *     than committed: its licence (ITF FFL) allows self-hosting for our own
 *     app but not redistribution through a repository, and this repo is
 *     public. The API is the delivery Fontshare explicitly permits.
 *
 * Neither face has a ₹ sign, and prices are half of what these cards say. So
 * both family names also get a one-glyph face cut from Geist (OFL), limited by
 * unicode-range to U+20B9 — the browser stitches it in exactly where the sign
 * falls, at the right weight, with no change to how text is drawn.
 *
 * Canvas text does not wait for fonts: drawing with a face that has not
 * loaded silently uses the fallback, and the PNG keeps it forever. So the
 * renderer awaits ensureCardFonts() first. Failure is not fatal — a card in
 * system type is still a card — so everything here resolves, never rejects.
 */

export const PIXEL = '"Geist Pixel"';
export const SANS = '"Satoshi"';
/** What a canvas `font` string should name after the face. */
export const FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

const FONTSHARE_CSS = 'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap';

let loading: Promise<boolean> | null = null;

function addFace(family: string, src: string, desc: FontFaceDescriptors): Promise<boolean> {
  try {
    const face = new FontFace(family, src, desc);
    return face.load().then(f => { document.fonts.add(f); return true; }, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

async function satoshiFaces(): Promise<boolean> {
  /* The CSS names hashed file URLs that Fontshare may rotate, so it is read
     each time rather than the URLs being pinned here. */
  const css = await fetch(FONTSHARE_CSS).then(r => (r.ok ? r.text() : ''), () => '');
  const blocks = css.split('@font-face').slice(1);
  const loads = blocks.map(b => {
    const url = b.match(/url\('([^']+\.woff2)'\)/)?.[1];
    const weight = b.match(/font-weight:\s*(\d+)/)?.[1];
    if (!url || !weight) return Promise.resolve(false);
    return addFace('Satoshi', `url(${url.startsWith('//') ? `https:${url}` : url}) format('woff2')`, { weight });
  });
  const ok = await Promise.all(loads);
  return ok.some(Boolean);
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

/** Load both card faces (once per page). Resolves true when the headline face
 *  is ready; never throws, and gives up after a few seconds so a slow font
 *  CDN can never hold a card hostage. */
export function ensureCardFonts(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve(false);
  if (loading) return loading;
  const rupee = (family: string) => [
    addFace(family, "url(/fonts/card/GeistRupee-Medium.woff2) format('woff2')", { weight: '100 600', unicodeRange: 'U+20B9' }),
    addFace(family, "url(/fonts/card/GeistRupee-Bold.woff2) format('woff2')", { weight: '601 1000', unicodeRange: 'U+20B9' }),
  ];
  loading = withTimeout(
    Promise.all([
      addFace('Geist Pixel', "url(/fonts/card/GeistPixel-Square.woff2) format('woff2')", { weight: '400' }),
      satoshiFaces(),
      ...rupee('Geist Pixel'),
      ...rupee('Satoshi'),
    ]).then(([pixel]) => pixel),
    6000,
    false,
  );
  /* A failed attempt is retried next time rather than cached as failure —
     the usual cause is a phone that was briefly offline. */
  loading.then(ok => { if (!ok) loading = null; });
  return loading;
}

/** A canvas font string: weight, size, face, then the system fallback. */
export function cardFont(face: string, weight: number, size: number): string {
  return `${weight} ${size}px ${face}, ${FALLBACK}`;
}
