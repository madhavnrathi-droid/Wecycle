'use client';

/* Shared photo picker used by Share / Request / Lost-Found / Submit-Event /
 * Edit-Item modals. Handles the full lifecycle:
 *
 *   - Tap "Add" → bottom sheet offering camera or gallery
 *   - Files are auto-compressed (longest edge 1600px, JPEG q=0.82) before
 *     being added to state, so uploads to Supabase stay small.
 *   - Drag-to-reorder on desktop; long-press-drag works on mobile via
 *     pointer events with HTML5 drag-and-drop fallback.
 *   - First photo is always the "Cover" (first in array).
 *   - Object URLs are tracked so we can revoke them on unmount.
 *
 * Consumers receive the current array of object URLs via `onChange`; they
 * stay in charge of where to send the blobs (Supabase storage etc.).
 * For now we just hold blobs in a ref keyed by URL so the caller can pull
 * them via the optional `getBlobs()` ref.
 */

import {
  useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef,
} from 'react';
import { Plus, X, Camera, ImagePlus, Play } from 'lucide-react';
import {
  compressMediaBatch, MAX_VIDEO_BYTES, MediaTooLargeError,
  type CompressedMedia,
} from '../lib/mediaCompression';

interface PhotoPickerProps {
  /** Object URLs currently held (photos and videos share this list). */
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
  /** Pull compressed blobs in current display order. */
  getBlobs: () => Blob[];
  /** Pull rich media records (kind + poster + dimensions) in display order.
   *  Mainly useful for the feed card which needs to know which entries are
   *  videos so it can render `<video>` instead of `<img>`. */
  getMedia: () => CompressedMedia[];
  /** Drop the internal blob cache (call after upload). */
  clear: () => void;
}

const PhotoPicker = forwardRef<PhotoPickerHandle, PhotoPickerProps>(function PhotoPicker(
  { photos, onChange, max = 3, label = 'first is cover', defaultSource, allowVideo = true },
  ref,
) {
  /* Map of objectURL → CompressedMedia, so the parent can hand us back any
     order and we still ship the matching compressed bytes + know which
     entries are videos. */
  const mediaRef = useRef<Map<string, CompressedMedia>>(new Map());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(0); /* number of files currently compressing */

  /* Two inputs — one per source. Both accept image + video; the OS picker
     then surfaces the right capture/library UI. Less cognitive load than
     forcing the user to pre-decide photo vs video before opening the picker. */
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  /* Clear the error after a few seconds — it's a soft toast, not a permanent state. */
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(t);
  }, [error]);

  /* Revoke any object URLs that left the photos array (removed / reordered out) */
  useEffect(() => {
    return () => {
      mediaRef.current.forEach((m, url) => {
        URL.revokeObjectURL(url);
        if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
      });
      mediaRef.current.clear();
    };
  }, []);

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

  /* ── adding ────────────────────────────────── */

  const remaining = Math.max(0, max - photos.length);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const toProcess = Array.from(files).slice(0, remaining);
    if (toProcess.length === 0) return;

    setBusy(prev => prev + toProcess.length);
    try {
      const settled = await compressMediaBatch(toProcess);
      const accepted: CompressedMedia[] = [];
      const errs: string[] = [];
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          accepted.push(res.value);
          mediaRef.current.set(res.value.url, res.value);
        } else {
          const reason = res.reason;
          if (reason instanceof MediaTooLargeError) {
            errs.push(`${toProcess[idx].name} is over ${(MAX_VIDEO_BYTES / (1024 * 1024)).toFixed(0)} MB`);
          } else {
            errs.push(`Couldn't read ${toProcess[idx].name}`);
          }
        }
      });
      if (accepted.length) onChange([...photos, ...accepted.map(m => m.url)]);
      if (errs.length) setError(errs.join(' · '));
    } finally {
      setBusy(prev => Math.max(0, prev - toProcess.length));
    }
  };

  /* ── removing ──────────────────────────────── */

  const removeAt = (idx: number) => {
    const url = photos[idx];
    if (url) {
      const m = mediaRef.current.get(url);
      if (m) {
        if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
        mediaRef.current.delete(url);
      }
      URL.revokeObjectURL(url);
    }
    onChange(photos.filter((_, i) => i !== idx));
  };

  /* ── reordering via HTML5 drag ─────────────── */

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const onDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    /* Firefox needs this set for drag to fire */
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    if (dragIdx === null || dragIdx === idx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(idx);
  };
  const onDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDropTarget(null);
      return;
    }
    const next = [...photos];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDropTarget(null);
  };
  const onDragEnd = () => { setDragIdx(null); setDropTarget(null); };

  /* ── source choice ────────────────────────── */

  const openCamera  = () => { setSheetOpen(false); cameraRef.current?.click(); };
  const openLibrary = () => { setSheetOpen(false); libraryRef.current?.click(); };

  const onAddClick = () => {
    if (defaultSource === 'camera')  { openCamera();  return; }
    if (defaultSource === 'library') { openLibrary(); return; }
    /* On phones with a camera, show the choice. On desktop, just open file picker. */
    const hasCamera = typeof navigator !== 'undefined' &&
      'mediaDevices' in navigator &&
      !!navigator.mediaDevices?.getUserMedia;
    /* On a touch device with a camera, show both choices. Desktop browsers
       almost always lack a real camera — just open the file picker. */
    if (hasCamera) setSheetOpen(true);
    else openLibrary();
  };

  /* ── render ───────────────────────────────── */

  const status = useMemo(() => {
    if (busy > 0) return `Compressing ${busy} item${busy === 1 ? '' : 's'}…`;
    if (photos.length === 0) return null;
    const types = photos.map(u => mediaRef.current.get(u)?.kind ?? 'photo');
    const videoCount = types.filter(k => k === 'video').length;
    const photoCount = types.length - videoCount;
    const summary =
      videoCount > 0 && photoCount > 0
        ? `${photoCount} photo${photoCount === 1 ? '' : 's'} + ${videoCount} video${videoCount === 1 ? '' : 's'}`
        : videoCount > 0
          ? `${videoCount} video${videoCount === 1 ? '' : 's'}`
          : `${photoCount} photo${photoCount === 1 ? '' : 's'}`;
    return `${summary} of ${max} · ${label}`;
  }, [busy, photos, max, label]);

  return (
    <>
      {status && (
        <div className="photo-picker-status">
          {busy > 0 && <span className="dot" aria-hidden="true" />}
          {status}
        </div>
      )}

      <div className="photo-picker">
        {photos.map((src, i) => {
          const m = mediaRef.current.get(src);
          const isVideo = m?.kind === 'video';
          return (
            <div
              key={src + i}
              className={
                'photo-picker-tile photo-picker-tile--filled' +
                (dragIdx === i ? ' is-dragging' : '') +
                (dropTarget === i ? ' is-drop-target' : '')
              }
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDrop={onDrop(i)}
              onDragEnd={onDragEnd}
              aria-grabbed={dragIdx === i || undefined}
              aria-label={`${isVideo ? 'Video' : 'Photo'} ${i + 1}${i === 0 ? ' (cover)' : ''} — drag to reorder`}
            >
              {isVideo
                ? <img src={m?.posterUrl ?? src} alt="" draggable={false} />
                : <img src={src} alt="" draggable={false} />}
              {isVideo && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(6px)',
                  }}>
                    <Play size={14} strokeWidth={2} fill="currentColor" />
                  </span>
                </span>
              )}
              {i === 0 && <span className="photo-picker-cover">Cover</span>}
              <button
                type="button"
                className="photo-picker-remove"
                aria-label={`Remove ${isVideo ? 'video' : 'photo'} ${i + 1}`}
                onClick={() => removeAt(i)}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}

        {photos.length < max && (
          <button
            type="button"
            className="photo-picker-tile"
            onClick={onAddClick}
            aria-label="Add photo"
            disabled={busy > 0 && remaining === 0}
          >
            <Plus size={20} strokeWidth={1.8} />
            <span style={{ fontSize: 11, fontWeight: 500 }}>
              {photos.length === 0 ? 'Add' : 'More'}
            </span>
          </button>
        )}
      </div>

      {/* Two hidden inputs — library and camera. Both accept image + video
          (when allowVideo), so the user only has to pick *where* the media
          comes from. The OS picker handles photo vs video selection within
          each. */}
      <input
        ref={libraryRef}
        type="file"
        accept={allowVideo ? 'image/*,video/*' : 'image/*'}
        multiple
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={allowVideo ? 'image/*,video/*' : 'image/*'}
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Soft error toast — invalid file (e.g. video over 5 MB) */}
      {error && (
        <div role="alert" style={{
          marginTop: 8, padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(237,46,80,0.10)',
          color: 'var(--accent-rose)',
          fontSize: 12, fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Source choice bottom sheet */}
      {sheetOpen && (
        <>
          <div
            className="photo-source-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="photo-source-sheet" role="dialog" aria-label="Add media">
            <div className="grabber" aria-hidden="true" />
            <button type="button" className="photo-source-option" onClick={openCamera}>
              <Camera size={20} strokeWidth={1.8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>Camera</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Take a photo or record a video right now
                </div>
              </div>
            </button>
            <button type="button" className="photo-source-option" onClick={openLibrary}>
              <ImagePlus size={20} strokeWidth={1.8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>Upload from library</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Pick {allowVideo ? 'photos or a video' : 'photos'} you've already saved
                </div>
              </div>
            </button>

            {/* Size hint — universal, sits below both options. */}
            <p style={{
              margin: '6px 12px 0',
              fontSize: 11,
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {allowVideo
                ? 'Photo or video must be under 5 MB. We compress on upload to save your data.'
                : 'Photos must be under 5 MB each. We compress on upload to save your data.'}
            </p>

            <button type="button" className="photo-source-cancel" onClick={() => setSheetOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
});

export default PhotoPicker;
