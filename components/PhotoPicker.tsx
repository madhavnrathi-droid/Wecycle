'use client';

/* Shared photo picker used by Share / Request / Lost-Found / Submit-Event /
 * Edit-Photos modals.
 *
 * UX: one LARGE preview of the active photo (whole image, never cropped) with
 * a horizontal CAROUSEL of thumbnails beneath it. Tap a thumbnail to make it
 * active. Background removal works per-image ("Remove background") or across
 * every photo at once ("Remove bg · all"), and the first photo is the cover
 * (any photo can be promoted with "Make cover").
 *
 *   - Tap "Add" → bottom sheet offering camera or gallery.
 *   - Files are auto-compressed (longest edge 1600px, JPEG q=0.82) before
 *     being added, so uploads to Supabase stay small.
 *   - Background removal proxies to /api/remove-background (remove.bg) and
 *     works on both new uploads (cached blob) and existing remote photos
 *     (fetched on demand) — the result is a transparent PNG.
 *
 * Consumers receive the current array of object/remote URLs via `onChange`
 * and pull the matching compressed bytes via the `getBlobs()/getMedia()` ref.
 */

import {
  useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef,
} from 'react';
import { Plus, X, Camera, ImagePlus, Play, Scissors, Loader2, Star } from 'lucide-react';
import {
  compressMediaBatch, MAX_VIDEO_BYTES, MediaTooLargeError,
  type CompressedMedia,
} from '../lib/mediaCompression';
import { apiBase } from '../lib/platform';

interface PhotoPickerProps {
  /** Object/remote URLs currently held (photos and videos share this list). */
  photos: string[];
  onChange: (next: string[]) => void;
  max?: number;                                  /* hard cap, default 3 */
  label?: string;
  /** When provided, the picker will skip the source-choice sheet and use this. */
  defaultSource?: 'camera' | 'library';
  /** When false, the video option is hidden — photo-only consumers (alerts,
   *  L&F report) opt out. Default true. */
  allowVideo?: boolean;
}

export interface PhotoPickerHandle {
  getBlobs: () => Blob[];
  getMedia: () => CompressedMedia[];
  clear: () => void;
}

const PhotoPicker = forwardRef<PhotoPickerHandle, PhotoPickerProps>(function PhotoPicker(
  { photos, onChange, max = 3, label = 'first is cover', defaultSource, allowVideo = true },
  ref,
) {
  /* Map of objectURL → CompressedMedia. */
  const mediaRef = useRef<Map<string, CompressedMedia>>(new Map());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(0);            /* files compressing */
  const [processingCount, setProcessingCount] = useState(0); /* bg-removals left */
  const [cuttingIdx, setCuttingIdx] = useState<number | null>(null); /* single cut */
  const [bulkBusy, setBulkBusy] = useState(false);
  /* Which photo fills the big preview. */
  const [activeIdx, setActiveIdx] = useState(0);

  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(t);
  }, [error]);

  /* Revoke object URLs on unmount. */
  useEffect(() => {
    const map = mediaRef.current;
    return () => {
      map.forEach((m, url) => {
        URL.revokeObjectURL(url);
        if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
      });
      map.clear();
    };
  }, []);

  /* Keep the active index inside bounds as photos are added/removed. */
  useEffect(() => {
    setActiveIdx(a => (photos.length === 0 ? 0 : Math.min(a, photos.length - 1)));
  }, [photos.length]);

  useImperativeHandle(ref, () => ({
    getBlobs: () => photos.map(url => mediaRef.current.get(url)?.blob).filter((b): b is Blob => !!b),
    getMedia: () => photos.map(url => mediaRef.current.get(url)).filter((m): m is CompressedMedia => !!m),
    clear: () => {
      mediaRef.current.forEach((m, url) => {
        URL.revokeObjectURL(url);
        if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
      });
      mediaRef.current.clear();
    },
  }), [photos]);

  /* ── background removal ────────────────────── */

  /** Strip the background from a single File via /api/remove-background.
   *  Returns the original file unchanged on any failure (with a soft toast). */
  const stripBackground = async (file: File): Promise<File> => {
    try {
      const form = new FormData();
      form.append('image', file, file.name);
      const res = await fetch(`${apiBase()}/api/remove-background`, { method: 'POST', body: form });
      if (!res.ok) {
        let msg = `Couldn't remove background (${res.status})`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json?.error) msg = json.error;
        } catch { /* not json */ }
        setError(`${msg} — keeping the original.`);
        return file;
      }
      const blob = await res.blob();
      const cutoutName = file.name.replace(/\.[^.]+$/, '') + '-cutout.png';
      return new File([blob], cutoutName, { type: 'image/png', lastModified: Date.now() });
    } catch (err) {
      setError(`Couldn't remove background — keeping the original.`);
      console.warn('[PhotoPicker] stripBackground failed', err);
      return file;
    }
  };

  /** Resolve the source bytes for photo `url` — cached blob (new upload) or a
   *  freshly fetched copy (existing remote photo). */
  const sourceFileFor = async (url: string, idx: number): Promise<File | null> => {
    const existing = mediaRef.current.get(url);
    if (existing?.kind === 'video') return null;
    if (existing?.blob) {
      const ext = existing.blob.type.split('/')[1]?.split(';')[0] || 'jpg';
      return new File([existing.blob], `tile-${idx}.${ext}`, { type: existing.blob.type || 'image/jpeg' });
    }
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error(`fetch ${resp.status}`);
    const blob = await resp.blob();
    const ext = blob.type.split('/')[1]?.split(';')[0] || 'jpg';
    return new File([blob], `tile-${idx}.${ext}`, { type: blob.type || 'image/jpeg' });
  };

  /** Remove the background from ONE photo (the active one) in place. */
  const cutTileBg = async (idx: number) => {
    if (cuttingIdx !== null || bulkBusy) return;
    const url = photos[idx];
    if (!url) return;
    const existing = mediaRef.current.get(url);
    if (existing?.kind === 'video') { setError("Can't remove background from a video."); return; }
    setCuttingIdx(idx);
    try {
      const sourceFile = await sourceFileFor(url, idx);
      if (!sourceFile) return;
      const cutout = await stripBackground(sourceFile);
      if (cutout === sourceFile) return; // failure → toast already shown
      const [settled] = await compressMediaBatch([cutout]);
      if (settled.status !== 'fulfilled') {
        setError("Couldn't finish the cutout — keeping the original.");
        return;
      }
      mediaRef.current.set(settled.value.url, settled.value);
      const next = [...photos];
      next[idx] = settled.value.url;
      onChange(next);
      if (existing) {
        if (existing.posterUrl) URL.revokeObjectURL(existing.posterUrl);
        mediaRef.current.delete(url);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError("Couldn't remove background — keeping the original.");
      console.warn('[PhotoPicker] cutTileBg failed', err);
    } finally {
      setCuttingIdx(null);
    }
  };

  /** Remove the background from EVERY photo. Builds the final array once at the
   *  end so per-image replacements never clobber each other. */
  const bulkRemoveBg = async () => {
    if (cuttingIdx !== null || bulkBusy) return;
    const targets = photos
      .map((u, i) => ({ u, i }))
      .filter(({ u }) => mediaRef.current.get(u)?.kind !== 'video');
    if (targets.length === 0) return;
    setBulkBusy(true);
    setProcessingCount(targets.length);
    const replacements = new Map<number, string>();
    const freed: { url: string; poster?: string }[] = [];
    try {
      for (const { u, i } of targets) {
        try {
          const sourceFile = await sourceFileFor(u, i);
          if (!sourceFile) { setProcessingCount(c => Math.max(0, c - 1)); continue; }
          const cutout = await stripBackground(sourceFile);
          if (cutout === sourceFile) { setProcessingCount(c => Math.max(0, c - 1)); continue; }
          const [settled] = await compressMediaBatch([cutout]);
          if (settled.status === 'fulfilled') {
            mediaRef.current.set(settled.value.url, settled.value);
            replacements.set(i, settled.value.url);
            const existing = mediaRef.current.get(u);
            if (existing?.blob) freed.push({ url: u, poster: existing.posterUrl });
          }
        } catch (err) {
          console.warn('[PhotoPicker] bulkRemoveBg item failed', err);
        }
        setProcessingCount(c => Math.max(0, c - 1));
      }
      if (replacements.size) {
        onChange(photos.map((u, i) => replacements.get(i) ?? u));
        freed.forEach(f => {
          if (f.poster) URL.revokeObjectURL(f.poster);
          mediaRef.current.delete(f.url);
          URL.revokeObjectURL(f.url);
        });
      }
    } finally {
      setBulkBusy(false);
      setProcessingCount(0);
    }
  };

  /* ── adding ────────────────────────────────── */

  const remaining = Math.max(0, max - photos.length);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const toProcess = Array.from(files).slice(0, remaining);
    if (toProcess.length === 0) return;
    const startLen = photos.length;
    setBusy(prev => prev + toProcess.length);
    try {
      const settled = await compressMediaBatch(toProcess);
      const accepted: CompressedMedia[] = [];
      const errs: string[] = [];
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          accepted.push(res.value);
          mediaRef.current.set(res.value.url, res.value);
        } else if (res.reason instanceof MediaTooLargeError) {
          errs.push(`${toProcess[idx].name} is over ${(MAX_VIDEO_BYTES / (1024 * 1024)).toFixed(0)} MB`);
        } else {
          errs.push(`Couldn't read ${toProcess[idx].name}`);
        }
      });
      if (accepted.length) {
        onChange([...photos, ...accepted.map(m => m.url)]);
        setActiveIdx(startLen); /* jump preview to the first newly added photo */
      }
      if (errs.length) setError(errs.join(' · '));
    } finally {
      setBusy(prev => Math.max(0, prev - toProcess.length));
    }
  };

  /* ── removing / cover ──────────────────────── */

  const removeAt = (idx: number) => {
    const url = photos[idx];
    if (url) {
      const m = mediaRef.current.get(url);
      if (m?.posterUrl) URL.revokeObjectURL(m.posterUrl);
      if (m) mediaRef.current.delete(url);
      URL.revokeObjectURL(url);
    }
    onChange(photos.filter((_, i) => i !== idx));
    setActiveIdx(a => Math.max(0, a >= idx ? a - 1 : a));
  };

  /** Promote a photo to the cover slot (index 0). */
  const makeCover = (idx: number) => {
    if (idx <= 0) return;
    const next = [...photos];
    const [m] = next.splice(idx, 1);
    next.unshift(m);
    onChange(next);
    setActiveIdx(0);
  };

  /* ── source choice ────────────────────────── */

  const openCamera = () => { setSheetOpen(false); cameraRef.current?.click(); };
  const openLibrary = () => { setSheetOpen(false); libraryRef.current?.click(); };
  const onAddClick = () => {
    if (defaultSource === 'camera') { openCamera(); return; }
    if (defaultSource === 'library') { openLibrary(); return; }
    const hasCamera = typeof navigator !== 'undefined' && 'mediaDevices' in navigator && !!navigator.mediaDevices?.getUserMedia;
    if (hasCamera) setSheetOpen(true);
    else openLibrary();
  };

  /* ── derived ──────────────────────────────── */

  const busyAny = cuttingIdx !== null || bulkBusy || busy > 0;
  const isProcessing = processingCount > 0 || busy > 0 || bulkBusy;
  const safeActive = photos.length ? Math.min(activeIdx, photos.length - 1) : -1;
  const activeUrl = safeActive >= 0 ? photos[safeActive] : undefined;
  const activeMedia = activeUrl ? mediaRef.current.get(activeUrl) : undefined;
  const activeIsVideo = activeMedia?.kind === 'video';
  const photoCount = photos.filter(u => mediaRef.current.get(u)?.kind !== 'video').length;

  const status = useMemo(() => {
    if (bulkBusy || processingCount > 0) return `Removing background… ${processingCount} left`;
    if (busy > 0) return `Compressing ${busy} item${busy === 1 ? '' : 's'}…`;
    if (photos.length === 0) return null;
    const types = photos.map(u => mediaRef.current.get(u)?.kind ?? 'photo');
    const v = types.filter(k => k === 'video').length;
    const p = types.length - v;
    const summary = v > 0 && p > 0 ? `${p} photo${p === 1 ? '' : 's'} + ${v} video${v === 1 ? '' : 's'}`
      : v > 0 ? `${v} video${v === 1 ? '' : 's'}` : `${p} photo${p === 1 ? '' : 's'}`;
    return `${summary} of ${max} · ${label}`;
  }, [bulkBusy, processingCount, busy, photos, max, label]);

  /* ── render ───────────────────────────────── */

  return (
    <>
      {status && (
        <div className="photo-picker-status">
          {isProcessing && <span className="dot" aria-hidden="true" />}
          {status}
        </div>
      )}

      {/* Big preview of the active photo (whole image, not cropped). */}
      {photos.length > 0 ? (
        <div className="photo-preview">
          <img src={activeIsVideo ? (activeMedia?.posterUrl ?? activeUrl) : activeUrl} alt="" />
          {activeIsVideo && (
            <span className="photo-preview-play" aria-hidden="true">
              <Play size={18} strokeWidth={2} fill="currentColor" />
            </span>
          )}
          {safeActive === 0 ? (
            <span className="photo-preview-cover"><Star size={11} strokeWidth={2.4} fill="currentColor" /> Cover</span>
          ) : (
            <button type="button" className="photo-preview-makecover" onClick={() => makeCover(safeActive)}>
              <Star size={12} strokeWidth={2.2} /> Make cover
            </button>
          )}
          <button
            type="button"
            className="photo-preview-remove"
            aria-label="Remove this photo"
            onClick={() => removeAt(safeActive)}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
          {cuttingIdx === safeActive && (
            <span className="photo-preview-busy" aria-hidden="true">
              <Loader2 size={28} strokeWidth={2} style={{ animation: 'spin-loader 0.9s linear infinite', color: '#fff' }} />
            </span>
          )}
        </div>
      ) : (
        <button type="button" className="photo-empty" onClick={onAddClick} disabled={busy > 0}>
          <ImagePlus size={32} strokeWidth={1.5} />
          <span className="photo-empty-title">Add photos</span>
          <span className="photo-empty-hint">Up to {max} · the first one is your cover</span>
        </button>
      )}

      {/* Background-removal actions for the active / all photos. */}
      {photos.length > 0 && (
        <div className="photo-actions">
          <button
            type="button"
            onClick={() => cutTileBg(safeActive)}
            disabled={busyAny || activeIsVideo}
          >
            <Scissors size={15} strokeWidth={2} /> Remove background
          </button>
          {photoCount > 1 && (
            <button type="button" onClick={bulkRemoveBg} disabled={busyAny}>
              <Scissors size={15} strokeWidth={2} /> Remove bg · all
            </button>
          )}
        </div>
      )}

      {/* Thumbnail carousel. */}
      {photos.length > 0 && (
        <div className="photo-carousel" role="listbox" aria-label="Photos">
          {photos.map((src, i) => {
            const m = mediaRef.current.get(src);
            const isVideo = m?.kind === 'video';
            return (
              <div
                key={src + i}
                role="option"
                aria-selected={i === safeActive}
                tabIndex={0}
                className={`photo-thumb${i === safeActive ? ' is-active' : ''}`}
                onClick={() => setActiveIdx(i)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveIdx(i); } }}
                aria-label={`${isVideo ? 'Video' : 'Photo'} ${i + 1}${i === 0 ? ' (cover)' : ''}`}
              >
                <img src={isVideo ? (m?.posterUrl ?? src) : src} alt="" draggable={false} />
                {isVideo && <span className="photo-thumb-play" aria-hidden="true"><Play size={11} strokeWidth={2} fill="currentColor" /></span>}
                {i === 0 && <span className="photo-thumb-cover" aria-hidden="true"><Star size={9} strokeWidth={2.6} fill="currentColor" /></span>}
                <button
                  type="button"
                  className="photo-thumb-remove"
                  aria-label={`Remove ${isVideo ? 'video' : 'photo'} ${i + 1}`}
                  onClick={e => { e.stopPropagation(); removeAt(i); }}
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </div>
            );
          })}
          {photos.length < max && (
            <button type="button" className="photo-thumb photo-thumb-add" onClick={onAddClick} aria-label="Add photo" disabled={busy > 0}>
              <Plus size={20} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}

      {/* Hidden inputs. */}
      <input
        ref={libraryRef}
        type="file"
        accept={allowVideo ? 'image/*,.heic,.heif,video/*' : 'image/*,.heic,.heif'}
        multiple
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={allowVideo ? 'image/*,.heic,.heif,video/*' : 'image/*,.heic,.heif'}
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />

      {error && (
        <div role="alert" style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 10,
          background: 'rgba(237,46,80,0.10)', color: 'var(--accent-rose)',
          fontSize: 12, fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Source choice bottom sheet */}
      {sheetOpen && (
        <>
          <div className="photo-source-sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="photo-source-sheet" role="dialog" aria-label="Add media">
            <div className="grabber" aria-hidden="true" />
            <button type="button" className="photo-source-option" onClick={openCamera}>
              <Camera size={20} strokeWidth={1.8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>Camera</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Take a photo or record a video right now</div>
              </div>
            </button>
            <button type="button" className="photo-source-option" onClick={openLibrary}>
              <ImagePlus size={20} strokeWidth={1.8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>Upload from library</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pick {allowVideo ? 'photos or a video' : 'photos'} you've already saved</div>
              </div>
            </button>
            <p style={{ margin: '6px 12px 0', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              {allowVideo
                ? 'Photo or video must be under 5 MB. We compress on upload to save your data.'
                : 'Photos must be under 5 MB each. We compress on upload to save your data.'}
            </p>
            <button type="button" className="photo-source-cancel" onClick={() => setSheetOpen(false)}>Cancel</button>
          </div>
        </>
      )}
    </>
  );
});

export default PhotoPicker;
