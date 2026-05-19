/* Client-side image compression.
 *
 *  We always compress before upload — saves Supabase storage, keeps the feed
 *  snappy on cellular, and prevents users from accidentally posting 12 MP
 *  phone-camera shots that the carousel can't render smoothly.
 *
 *  Strategy: draw the source image to a canvas at a capped longest edge,
 *  then export to JPEG at quality 0.82. Falls back to the original file if
 *  anything goes wrong (corrupt EXIF, OOM, unsupported MIME). */

export interface CompressOptions {
  /** Cap the longest edge in pixels. Default 1600 — plenty for retina cards. */
  maxEdge?: number;
  /** JPEG quality 0–1. Default 0.82. */
  quality?: number;
  /** Skip compression if the file is already under this many bytes. Default 350 KB. */
  skipUnderBytes?: number;
}

export interface CompressedPhoto {
  /** Object URL for inline preview. Caller must revoke when done. */
  url: string;
  /** Compressed Blob — pass straight into supabase.storage.upload(). */
  blob: Blob;
  /** Pixel dimensions of the output. */
  width: number;
  height: number;
  /** Original size in bytes (for telemetry). */
  originalBytes: number;
  /** Output size in bytes. */
  bytes: number;
}

const DEFAULTS = { maxEdge: 1600, quality: 0.82, skipUnderBytes: 350 * 1024 };

/** Compress a single image. Returns the compressed result, or a passthrough
 *  if the file is already small or compression fails. */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressedPhoto> {
  const { maxEdge, quality, skipUnderBytes } = { ...DEFAULTS, ...opts };
  const originalBytes = file.size;

  if (!file.type.startsWith('image/') || originalBytes < skipUnderBytes) {
    return passthrough(file);
  }

  try {
    const img = await loadImageBitmap(file);
    const { width: srcW, height: srcH } = img;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return passthrough(file);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return passthrough(file);

    /* If compression actually made it bigger (rare — happens with tiny images),
       prefer the original. */
    if (blob.size >= originalBytes) {
      return passthrough(file, { width: w, height: h });
    }
    return {
      url: URL.createObjectURL(blob),
      blob,
      width: w,
      height: h,
      originalBytes,
      bytes: blob.size,
    };
  } catch {
    return passthrough(file);
  }
}

/** Compress a list of files in parallel, capped at N at a time so phones
 *  don't run out of memory while doing 20 photos at once. */
export async function compressImages(files: File[], opts?: CompressOptions): Promise<CompressedPhoto[]> {
  const CONCURRENCY = 3;
  const out: CompressedPhoto[] = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const slice = files.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(slice.map(f => compressImage(f, opts)));
    out.push(...batch);
  }
  return out;
}

/* ── helpers ───────────────────────────────────── */

async function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  /* createImageBitmap is faster and works in workers when available */
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to HTMLImageElement */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

function passthrough(file: File, dims?: { width: number; height: number }): CompressedPhoto {
  return {
    url: URL.createObjectURL(file),
    blob: file,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
    originalBytes: file.size,
    bytes: file.size,
  };
}
