/* Unified media compression for photos + short videos.
 *
 * Photos are squeezed to a sane longest-edge JPEG at q=0.82 (same as before).
 *
 * Videos: we can't truly re-encode in the browser cheaply (MediaRecorder works
 * but is slow and unreliable across phones), so the strategy is:
 *   1. Hard-reject anything over MAX_VIDEO_BYTES (5 MB).
 *   2. Generate a poster frame (1 sec in) so the feed can show a still while
 *      the video loads.
 *   3. Pass the source bytes through, leaving deeper compression to a future
 *      server-side step (FFmpeg edge function) once we ship Supabase upload.
 *
 * The Photo-vs-Video distinction is exposed through a `kind` discriminator so
 * downstream components (carousels, picker UI, feed card autoplay) can render
 * the right element.
 */

export const MAX_VIDEO_BYTES = 5 * 1024 * 1024;  /* 5 MB hard cap */
export const VIDEO_MIME_PREFIX = 'video/';

export type MediaKind = 'photo' | 'video';

export interface CompressedMedia {
  kind: MediaKind;
  /** Object URL for the *uploadable* asset — preview-safe. */
  url: string;
  /** Original / compressed blob to upload. */
  blob: Blob;
  /** Pixel dimensions (videos: poster frame size; 0/0 if unknown). */
  width: number;
  height: number;
  /** Bytes before / after compression so we can show savings. */
  originalBytes: number;
  bytes: number;
  /** Video-only: a still poster frame to show while paused / loading. */
  posterUrl?: string;
  /** Video-only: duration in seconds (best-effort). */
  durationSec?: number;
}

export class MediaTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Video exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)} MB limit`);
    this.name = 'MediaTooLargeError';
  }
}

interface CompressOptions {
  maxEdge?: number;
  quality?: number;
  skipUnderBytes?: number;
}

const PHOTO_DEFAULTS = { maxEdge: 1600, quality: 0.82, skipUnderBytes: 350 * 1024 };

/* ── Public entrypoints ────────────────────────────── */

/** Compress a single file (photo or video). Throws MediaTooLargeError when
 *  a video exceeds the 5 MB cap so the picker can surface the right toast. */
export async function compressMedia(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressedMedia> {
  if (file.type.startsWith(VIDEO_MIME_PREFIX)) {
    return processVideo(file);
  }
  /* iPhone-default HEIC / HEIF needs a one-off decode pass before the
   * canvas pipeline because browsers can't paint these formats natively.
   * Convert to JPEG first, then run through the normal compress flow. */
  if (isHeicLike(file)) {
    const converted = await convertHeicToJpeg(file);
    return compressPhoto(converted, opts);
  }
  return compressPhoto(file, opts);
}

/** Detects HEIC / HEIF inputs by MIME type, and by file extension when the
 *  browser drops the MIME (Chromium-on-Windows often hands us "" for HEIC). */
function isHeicLike(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif'
      || t === 'image/heic-sequence' || t === 'image/heif-sequence') return true;
  const n = (file.name || '').toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif');
}

/** Decode a HEIC/HEIF file into a JPEG File. Dynamically imports the
 *  ~150KB heic2any decoder so it only ships to users who actually need it. */
async function convertHeicToJpeg(file: File): Promise<File> {
  /* heic2any is browser-only (uses Web APIs) — guard against any
   * accidental server-side call so the dynamic import doesn't blow up. */
  if (typeof window === 'undefined') return file;
  const mod = await import('heic2any');
  const heic2any = (mod as { default: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> }).default
    ?? (mod as unknown as (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>);
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  const out = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([out], newName, { type: 'image/jpeg', lastModified: Date.now() });
}

/** Batch-compress, with bounded concurrency. Errors propagate per-item so
 *  callers can `Promise.allSettled` and report which files were rejected. */
export async function compressMediaBatch(
  files: File[],
  opts?: CompressOptions,
): Promise<PromiseSettledResult<CompressedMedia>[]> {
  const CONCURRENCY = 3;
  const out: PromiseSettledResult<CompressedMedia>[] = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const slice = files.slice(i, i + CONCURRENCY);
    const batch = await Promise.allSettled(slice.map(f => compressMedia(f, opts)));
    out.push(...batch);
  }
  return out;
}

/* ── Photos ────────────────────────────────────────── */

/* Can this browser ENCODE WebP from a canvas? Decoding is near-universal;
   encoding is what matters here and is the thing older Safari lacked. Probed
   once and cached — the check allocates a canvas, so doing it per photo would
   be silly. */
let webpEncodable: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpEncodable !== null) return webpEncodable;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    webpEncodable = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpEncodable = false;
  }
  return webpEncodable;
}

async function compressPhoto(file: File, opts: CompressOptions): Promise<CompressedMedia> {
  const { maxEdge, quality, skipUnderBytes } = { ...PHOTO_DEFAULTS, ...opts };
  const originalBytes = file.size;

  if (!file.type.startsWith('image/') || originalBytes < skipUnderBytes) {
    return passthroughPhoto(file);
  }

  /* Transparent PNGs (e.g. from background-removal) must stay as PNG so the
   * alpha channel is preserved — JPEG discards transparency entirely. */
  const hasAlpha = file.type === 'image/png';

  try {
    const img = await loadBitmap(file);
    const { width: srcW, height: srcH } = img;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    /* Keep alpha context for transparent images; disable for everything else
     * (saves memory and avoids accidental premult blending artefacts). */
    const ctx = canvas.getContext('2d', { alpha: hasAlpha });
    if (!ctx) return passthroughPhoto(file);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    /* WebP where the browser can encode it — typically 25-35% smaller than
       JPEG at the same visible quality, and unlike JPEG it keeps an alpha
       channel, so background-removed cutouts stop having to ship as PNG. Those
       were by far the heaviest uploads: a transparent PNG of a photograph is
       often several times the size of the JPEG it came from, which on a slow
       campus connection is the difference between a post landing and timing
       out.

       Nothing downstream reads the file extension, so the format is free to
       change: the only place a .png name is constructed is the local cutout
       filename in PhotoPicker, which never reaches storage. */
    const useWebp = canEncodeWebp();
    const [outMime, outQuality] = useWebp
      ? (['image/webp', quality] as const)
      : hasAlpha
        ? (['image/png', undefined] as const)
        : (['image/jpeg', quality] as const);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, outMime, outQuality),
    );
    if (!blob || blob.size >= originalBytes) return passthroughPhoto(file, { width: w, height: h });

    return {
      kind: 'photo',
      url: URL.createObjectURL(blob),
      blob,
      width: w, height: h,
      originalBytes, bytes: blob.size,
    };
  } catch {
    return passthroughPhoto(file);
  }
}

function passthroughPhoto(file: File, dims?: { width: number; height: number }): CompressedMedia {
  return {
    kind: 'photo',
    url: URL.createObjectURL(file),
    blob: file,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
    originalBytes: file.size,
    bytes: file.size,
  };
}

/* ── Videos ────────────────────────────────────────── */

async function processVideo(file: File): Promise<CompressedMedia> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new MediaTooLargeError(MAX_VIDEO_BYTES);
  }

  const url = URL.createObjectURL(file);
  const meta = await probeVideoMeta(url).catch(() => null);
  let posterUrl: string | undefined;
  let width  = meta?.width  ?? 0;
  let height = meta?.height ?? 0;
  let durationSec = meta?.duration;

  if (meta) {
    /* Try to grab a poster frame 1 second in (or 10% in, whichever comes first
       — many tiny clips are shorter than 1 second). */
    const seekTo = Math.min(1, (meta.duration || 0) * 0.1);
    posterUrl = await captureFrame(url, seekTo, meta.width, meta.height).catch(() => undefined);
  }

  return {
    kind: 'video',
    url,
    blob: file,
    width, height,
    originalBytes: file.size,
    bytes: file.size,
    posterUrl,
    durationSec,
  };
}

interface VideoMeta { width: number; height: number; duration: number }

function probeVideoMeta(src: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      resolve({
        width:    v.videoWidth || 0,
        height:   v.videoHeight || 0,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
      });
    };
    v.onerror = () => reject(new Error('video metadata load failed'));
    v.src = src;
  });
}

function captureFrame(src: string, atSec: number, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.max(0, atSec);
      } catch (e) { reject(e); }
    };
    v.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w || v.videoWidth;
      canvas.height = h || v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no 2d ctx')); return; }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        resolve(URL.createObjectURL(blob));
      }, 'image/jpeg', 0.78);
    };
    v.onerror = () => reject(new Error('frame capture failed'));
    v.src = src;
  });
}

/* ── Image bitmap loader (shared) ──────────────────── */

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}
