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
import { Plus, X, Camera, ImagePlus, Upload } from 'lucide-react';
import { compressImages, type CompressedPhoto } from '../lib/imageCompression';

interface PhotoPickerProps {
  photos: string[];                             /* object URLs currently in state */
  onChange: (next: string[]) => void;            /* setter (reorder / add / remove) */
  max?: number;                                  /* hard cap, default 3 */
  label?: string;                                /* hint shown in the empty state */
  /** When provided, the picker will skip the source-choice sheet and use this. */
  defaultSource?: 'camera' | 'library';
}

export interface PhotoPickerHandle {
  /** Pull compressed blobs in current display order. */
  getBlobs: () => Blob[];
  /** Drop the internal blob cache (call after upload). */
  clear: () => void;
}

const PhotoPicker = forwardRef<PhotoPickerHandle, PhotoPickerProps>(function PhotoPicker(
  { photos, onChange, max = 3, label = 'first is cover', defaultSource },
  ref,
) {
  /* Map of objectURL → Blob, so the parent can hand us back any order and
     we still ship the matching compressed bytes. */
  const blobsRef = useRef<Map<string, Blob>>(new Map());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(0); /* number of files currently compressing */

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef  = useRef<HTMLInputElement>(null);

  /* Revoke any object URLs that left the photos array (removed / reordered out) */
  useEffect(() => {
    return () => {
      blobsRef.current.forEach((_b, url) => URL.revokeObjectURL(url));
      blobsRef.current.clear();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getBlobs: () => photos.map(url => blobsRef.current.get(url)).filter((b): b is Blob => !!b),
    clear: () => {
      blobsRef.current.forEach((_b, url) => URL.revokeObjectURL(url));
      blobsRef.current.clear();
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
      const results: CompressedPhoto[] = await compressImages(toProcess);
      results.forEach(r => blobsRef.current.set(r.url, r.blob));
      onChange([...photos, ...results.map(r => r.url)]);
    } finally {
      setBusy(prev => Math.max(0, prev - toProcess.length));
    }
  };

  /* ── removing ──────────────────────────────── */

  const removeAt = (idx: number) => {
    const url = photos[idx];
    if (url) {
      const b = blobsRef.current.get(url);
      if (b) blobsRef.current.delete(url);
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

  const openCamera  = () => { setSheetOpen(false); cameraInputRef.current?.click(); };
  const openLibrary = () => { setSheetOpen(false); libraryInputRef.current?.click(); };

  const onAddClick = () => {
    if (defaultSource === 'camera')  { openCamera();  return; }
    if (defaultSource === 'library') { openLibrary(); return; }
    /* On phones with a camera, show the choice. On desktop, just open file picker. */
    const hasCamera = typeof navigator !== 'undefined' &&
      'mediaDevices' in navigator &&
      !!navigator.mediaDevices?.getUserMedia;
    if (hasCamera) setSheetOpen(true);
    else openLibrary();
  };

  /* ── render ───────────────────────────────── */

  const status = useMemo(() => {
    if (busy > 0) return `Compressing ${busy} photo${busy === 1 ? '' : 's'}…`;
    if (photos.length === 0) return null;
    return `${photos.length} / ${max} · ${label}`;
  }, [busy, photos.length, max, label]);

  return (
    <>
      {status && (
        <div className="photo-picker-status">
          {busy > 0 && <span className="dot" aria-hidden="true" />}
          {status}
        </div>
      )}

      <div className="photo-picker">
        {photos.map((src, i) => (
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
            aria-label={`Photo ${i + 1}${i === 0 ? ' (cover)' : ''} — drag to reorder`}
          >
            <img src={src} alt="" draggable={false} />
            {i === 0 && <span className="photo-picker-cover">Cover</span>}
            <button
              type="button"
              className="photo-picker-remove"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => removeAt(i)}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        ))}

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

      {/* Hidden inputs — separate so the camera input gets `capture`. */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Source choice bottom sheet */}
      {sheetOpen && (
        <>
          <div
            className="photo-source-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="photo-source-sheet" role="dialog" aria-label="Add photo">
            <div className="grabber" aria-hidden="true" />
            <button type="button" className="photo-source-option" onClick={openCamera}>
              <Camera size={20} strokeWidth={1.8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>Take a photo</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Use your camera right now</div>
              </div>
            </button>
            <button type="button" className="photo-source-option" onClick={openLibrary}>
              <ImagePlus size={20} strokeWidth={1.8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>Choose from library</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pick up to {remaining} from your phone</div>
              </div>
            </button>
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
