'use client';

/* PhotoEditDialog — a Radix Dialog wrapper around <PhotoPicker> that lets an
 * owner replace / add / remove photos on an existing post.
 *
 * Usage:
 *   <PhotoEditDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     initialUrls={item.photoUrls ?? []}
 *     onSave={async (photoUrls) => { await updateListingMedia(id, photoUrls, []); }}
 *     bucket="listings"
 *   />
 *
 * The component:
 *   1. Seeds the picker with the post's current remote URLs (they render as
 *      <img> without a matching blob in the internal map — that's fine, the
 *      user only uploads NEW additions; existing URLs pass through as-is).
 *   2. On Save: uploads only the blobs that are new (those that exist in the
 *      picker's internal mediaRef map); keeps existing https:// URLs untouched.
 *   3. Calls onSave(finalUrls) then closes.
 */

import { useRef, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X, Loader2 } from 'lucide-react';
import PhotoPicker, { type PhotoPickerHandle } from './PhotoPicker';
import { uploadMedia } from '../lib/liveData';
import type { CompressedMedia } from '../lib/mediaCompression';
import { Z_LAYER, zPanel } from '../lib/zLayers';

interface PhotoEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Current photo URLs already stored on the post (https:// links). */
  initialUrls: string[];
  /** Called with the final ordered URL list after any uploads. */
  onSave: (photoUrls: string[]) => Promise<void>;
  /** Supabase storage bucket to upload new blobs into. */
  bucket: string;
  /** Whether the picker should allow video as well as photos. */
  allowVideo?: boolean;
  /** Max photos the picker allows (default 6). */
  max?: number;
}

export default function PhotoEditDialog({
  open, onOpenChange, initialUrls, onSave, bucket,
  allowVideo = false, max = 6,
}: PhotoEditDialogProps) {
  const pickerRef = useRef<PhotoPickerHandle>(null);
  /* The picker keeps state internally; we mirror the URL list here so we can
     re-seed it when the dialog opens. */
  const [photos, setPhotos] = useState<string[]>(initialUrls);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Re-seed whenever initialUrls changes or dialog opens. */
  useEffect(() => {
    if (open) { setPhotos(initialUrls); setError(null); }
  }, [open, initialUrls.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      /* Split the current photos list into:
         - existing remote URLs (already uploaded) → pass through
         - new local object URLs (blob URLs from the picker) → upload now */
      const mediaEntries: CompressedMedia[] = pickerRef.current?.getMedia() ?? [];
      /* Build a map of objectURL → CompressedMedia for new blobs. */
      const newBlobMap = new Map<string, CompressedMedia>();
      for (const m of mediaEntries) {
        if (m.url.startsWith('blob:')) newBlobMap.set(m.url, m);
      }

      /* Collect only the blobs that are new. */
      const newBlobs = photos
        .filter(u => u.startsWith('blob:'))
        .map(u => newBlobMap.get(u))
        .filter((m): m is CompressedMedia => !!m);

      /* Upload new blobs, then reassemble the final URL list in display order. */
      let uploadedUrls: string[] = [];
      if (newBlobs.length > 0) {
        const result = await uploadMedia(bucket, newBlobs);
        uploadedUrls = result.photoUrls;
      }

      /* Re-map photos: existing remote URLs stay, blob URLs get replaced by
         their newly-uploaded equivalents (in display order). */
      let uploadIdx = 0;
      const finalUrls = photos.map(u => {
        if (!u.startsWith('blob:')) return u;
        return uploadedUrls[uploadIdx++] ?? u;
      });

      await onSave(finalUrls);
      pickerRef.current?.clear();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message ?? 'Upload failed — please try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!saving) onOpenChange(v); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: Z_LAYER.dialogNested,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(480px, 94vw)',
            maxHeight: '90svh',
            overflowY: 'auto',
            background: 'var(--bg-card)',
            borderRadius: 20,
            padding: '20px 20px 24px',
            zIndex: zPanel(Z_LAYER.dialogNested),
            boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
          aria-describedby="ped-desc"
        >
          <VisuallyHidden>
            <Dialog.Title>Edit photos</Dialog.Title>
          </VisuallyHidden>
          <VisuallyHidden>
            <span id="ped-desc">Add, remove, or reorder photos for this post.</span>
          </VisuallyHidden>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Edit photos
            </span>
            <button
              type="button"
              onClick={() => { if (!saving) onOpenChange(false); }}
              aria-label="Close"
              className="theme-toggle"
              style={{ width: 34, height: 34 }}
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>

          {/* Picker */}
          <PhotoPicker
            ref={pickerRef}
            photos={photos}
            onChange={setPhotos}
            max={max}
            label="first is cover"
            allowVideo={allowVideo}
          />

          {/* Error toast */}
          {error && (
            <div role="alert" style={{
              padding: '8px 12px',
              background: 'rgba(237,46,80,0.10)',
              border: '1px solid rgba(237,46,80,0.25)',
              borderRadius: 10,
              color: 'var(--accent-rose)',
              fontSize: 12, fontWeight: 500,
            }}>{error}</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => { if (!saving) onOpenChange(false); }}
              disabled={saving}
              style={{
                flex: '0 0 auto', height: 48, padding: '0 18px', borderRadius: 14,
                background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, height: 48, borderRadius: 14,
                background: 'var(--text-primary)', color: 'var(--bg-base)',
                border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {saving
                ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--bg-base)' }} />Saving…</>
                : 'Save photos'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
