'use client';

/* ── Edit a post's photos after it is live ──────────────────────────────────
 *
 * Replaces PhotoEditDialog, which was the creation picker dropped into a small
 * centred dialog. What that meant after posting:
 *
 *   • No way to put photos in a different order. "Make cover" could move one
 *     photo to the front and that was all; the second and third stayed where
 *     the upload put them.
 *   • Deleting was a 22px ✕ on a thumbnail, with no undo.
 *   • Videos broke. The dialog was handed video URLs as if they were photos,
 *     drew them as broken images, and on Save wrote them into photo_urls and
 *     wiped video_urls — editing the photos on a post with a video destroyed
 *     the video. A video added in the dialog was uploaded and then dropped.
 *   • Nothing uploaded until Save, so Save was where you waited.
 *
 * What it is now, after the editors people already know (Etsy's listing
 * photos, Facebook Marketplace, Airbnb's photo tour):
 *
 *   A full-page grid (a centred panel on desktop). The cover is the big tile,
 *   because it is the one that matters — it is what the feed shows. Drag a
 *   photo anywhere: long-press on a phone, plain drag with a mouse. Tap a photo
 *   for the same moves without dragging — Make cover, Move earlier, Move later
 *   — plus Remove background and Remove. Dragging is never the only way to do
 *   something (WCAG 2.5.7), and on a keyboard Alt+← / Alt+→ moves the focused
 *   photo.
 *
 *   New photos upload the moment they are added, each with its own progress,
 *   so Done is quick. Removing says "Removed · Undo" instead of asking first.
 *   Cancel with changes asks once whether to throw them away.
 *
 *   Photos and videos are stored in separate arrays, so a video cannot sit
 *   between two photos and cannot be the cover. The grid shows them that way —
 *   videos after the photos, under their own label — rather than letting
 *   someone drag a video somewhere it will not stay.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Star, ArrowLeft, ArrowRight, Scissors, Trash2, Loader2, Play, RotateCcw, Camera, ImagePlus,
} from '@/lib/icons';
import { compressMediaBatch, MAX_VIDEO_BYTES, MediaTooLargeError, type CompressedMedia } from '../lib/mediaCompression';
import { uploadMedia } from '../lib/liveData';
import { isDemoMode } from '../lib/demoMode';
import { corsFresh } from '../lib/corsImage';
import { apiBase } from '../lib/platform';
import { lockBodyScroll } from '../lib/bodyLock';
import { Z_LAYER } from '../lib/zLayers';
import { haptics } from '../lib/haptics';
import { toast, dismissToast } from '../lib/toast';
import { DUR, EASE, reducedMotion } from '../lib/motion';
import { useDragReorder } from '../lib/useDragReorder';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useBackLayer } from '../lib/backStack';
import { track, EVT } from '../lib/analytics';

export interface MediaEditorProps {
  open: boolean;
  onClose: () => void;
  /** The post's title, under the heading — which post am I editing. */
  subtitle?: string;
  initialPhotos: string[];
  initialVideos?: string[];
  /** Writes both arrays. Throws to keep the editor open with the reason. */
  onSave: (photoUrls: string[], videoUrls: string[]) => Promise<void>;
  /** Storage bucket new files go into. */
  bucket: string;
  allowVideo?: boolean;
  /** Photos and videos together. */
  max?: number;
  layer?: number;
}

type Status = 'ready' | 'uploading' | 'failed' | 'cutting';

interface Tile {
  key: string;
  kind: 'photo' | 'video';
  /** What is shown: a remote URL, or a local blob while it uploads. */
  preview: string;
  /** What is saved: the remote URL, once there is one. */
  url: string | null;
  poster?: string;
  status: Status;
  /** Bytes to (re)upload — kept so a failed upload can be retried. */
  media?: CompressedMedia;
}

let seq = 0;
const newKey = () => `n${++seq}`;

function tilesFrom(photos: string[], videos: string[]): Tile[] {
  return [
    ...photos.map((u, i) => ({ key: `p${i}:${u}`, kind: 'photo' as const, preview: u, url: u, status: 'ready' as Status })),
    ...videos.map((u, i) => ({ key: `v${i}:${u}`, kind: 'video' as const, preview: u, url: u, status: 'ready' as Status })),
  ];
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export default function MediaEditor({
  open, onClose, subtitle, initialPhotos, initialVideos = [], onSave, bucket,
  allowVideo = false, max = 6, layer = Z_LAYER.dialogNested,
}: MediaEditorProps) {
  const { isDesktop } = useBreakpoint();
  const [tiles, setTiles] = useState<Tile[]>(() => tilesFrom(initialPhotos, initialVideos));
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  /* Seed from the post every time the editor opens — never from a previous
     session's leftovers. */
  useEffect(() => {
    if (!open) return;
    setTiles(tilesFrom(initialPhotos, initialVideos));
    setSheetKey(null); setAddOpen(false); setConfirmDiscard(false); setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Local blobs are ours to free. */
  useEffect(() => () => {
    tilesRef.current.forEach(t => {
      if (t.media) { URL.revokeObjectURL(t.media.url); if (t.media.posterUrl) URL.revokeObjectURL(t.media.posterUrl); }
    });
  }, []);

  const photos = tiles.filter(t => t.kind === 'photo');
  const videos = tiles.filter(t => t.kind === 'video');
  const busy = tiles.some(t => t.status === 'uploading' || t.status === 'cutting');
  const failed = tiles.filter(t => t.status === 'failed').length;
  const finalPhotos = photos.map(t => t.url).filter((u): u is string => !!u);
  const finalVideos = videos.map(t => t.url).filter((u): u is string => !!u);
  const dirty = !same(finalPhotos, initialPhotos) || !same(finalVideos, initialVideos) || tiles.some(t => !t.url);
  const remaining = Math.max(0, max - tiles.length);
  const coverPoster = photos[0]?.preview;

  const announce = (text: string) => { setSaid(''); window.setTimeout(() => setSaid(text), 30); };

  /* ── FLIP: everything that moves, moves from where it was ── */
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const next = new Map<string, DOMRect>();
    const still = reducedMotion();
    grid.querySelectorAll<HTMLElement>('[data-drag-key]').forEach(el => {
      const k = el.dataset.dragKey!;
      /* Measure where the tile really is, not where a still-running move has
         it: a rect taken mid-animation includes that animation's transform,
         and the next move would then start from a place the tile never was —
         during a fast drag the errors compound until tiles fly off. */
      el.getAnimations().forEach(a => a.cancel());
      const r = el.getBoundingClientRect();
      next.set(k, r);
      const prev = rects.current.get(k);
      if (!prev || still) return;
      const dx = prev.left - r.left, dy = prev.top - r.top;
      const sx = prev.width / (r.width || 1), sy = prev.height / (r.height || 1);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return;
      el.animate(
        [{ transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
         { transformOrigin: 'top left', transform: 'none' }],
        { duration: DUR[3], easing: EASE.standard },
      );
    });
    rects.current = next;
  }, [tiles]);

  /* ── Order rules ── */
  const canMove = useCallback((from: number, to: number) => {
    const t = tilesRef.current;
    return !!t[from] && !!t[to] && t[from].kind === t[to].kind;
  }, []);
  const moveTile = useCallback((from: number, to: number) => {
    setTiles(prev => {
      if (!prev[from] || !prev[to] || prev[from].kind !== prev[to].kind) return prev;
      const next = prev.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  const positionLabel = (t: Tile, list = tilesRef.current) => {
    const group = list.filter(x => x.kind === t.kind);
    const i = group.findIndex(x => x.key === t.key);
    if (t.kind === 'photo' && i === 0) return 'the cover';
    return `${t.kind} ${i + 1} of ${group.length}`;
  };

  const drag = useDragReorder({
    keys: tiles.map(t => t.key),
    move: moveTile,
    canMove,
    container: gridRef,
    scroller: scrollRef,
    onLift: () => { haptics.light(); setSheetKey(null); },
    onStep: () => haptics.selection(),
    onDrop: (key, from, to) => {
      if (from === to) return;
      haptics.light();
      const t = tilesRef.current.find(x => x.key === key);
      if (t) announce(`Moved — now ${positionLabel(t)}.`);
    },
  });

  /* ── Moves without dragging ── */
  const moveBy = (key: string, delta: -1 | 1) => {
    const list = tilesRef.current;
    const from = list.findIndex(t => t.key === key);
    const to = from + delta;
    if (from < 0 || !canMove(from, to)) return;
    haptics.selection();
    moveTile(from, to);
    const t = list[from];
    window.setTimeout(() => announce(`Moved — now ${positionLabel(t, tilesRef.current)}.`), 0);
  };
  const makeCover = (key: string) => {
    const from = tilesRef.current.findIndex(t => t.key === key);
    if (from <= 0) return;
    haptics.selection();
    moveTile(from, 0);
    announce('That photo is the cover now.');
  };

  const remove = (key: string) => {
    const list = tilesRef.current;
    const at = list.findIndex(t => t.key === key);
    if (at < 0) return;
    const gone = list[at];
    haptics.heavy();
    setSheetKey(null);
    setTiles(prev => prev.filter(t => t.key !== key));
    announce(`${gone.kind === 'video' ? 'Video' : 'Photo'} removed.`);
    toast(`${gone.kind === 'video' ? 'Video' : 'Photo'} removed`, {
      action: {
        label: 'Undo',
        onClick: () => {
          if (!openRef.current) return;
          setTiles(prev => {
            if (prev.some(t => t.key === gone.key)) return prev;
            const next = prev.slice();
            /* Back where it was, inside its own group. */
            const firstVideo = next.findIndex(t => t.kind === 'video');
            const lo = gone.kind === 'video' ? (firstVideo < 0 ? next.length : firstVideo) : 0;
            const hi = gone.kind === 'video' ? next.length : (firstVideo < 0 ? next.length : firstVideo);
            next.splice(Math.min(Math.max(at, lo), hi), 0, gone);
            return next;
          });
          haptics.selection();
        },
      },
    });
  };

  /* ── Adding: compress, show at once, upload straight away ── */
  const upload = useCallback(async (key: string, media: CompressedMedia) => {
    setTiles(prev => prev.map(t => (t.key === key ? { ...t, status: 'uploading' } : t)));
    try {
      let url: string;
      if (isDemoMode()) {
        url = media.url;
      } else {
        const res = await uploadMedia(bucket, [media]);
        url = (media.kind === 'video' ? res.videoUrls[0] : res.photoUrls[0]) ?? '';
        if (!url) throw new Error('no url');
      }
      setTiles(prev => prev.map(t => (t.key === key ? { ...t, url, status: 'ready' } : t)));
    } catch {
      setTiles(prev => prev.map(t => (t.key === key ? { ...t, status: 'failed' } : t)));
    }
  }, [bucket]);

  const addFiles = async (files: FileList | null) => {
    setAddOpen(false);
    if (!files?.length) return;
    const take = Array.from(files).slice(0, remaining);
    if (take.length < files.length) toast(`Only ${remaining} more fit — up to ${max} in all`);
    if (!take.length) return;
    const settled = await compressMediaBatch(take);
    const added: Tile[] = [];
    const problems: string[] = [];
    settled.forEach((res, i) => {
      if (res.status !== 'fulfilled') {
        problems.push(res.reason instanceof MediaTooLargeError
          ? `${take[i].name} is over ${(MAX_VIDEO_BYTES / 1048576).toFixed(0)} MB`
          : `Couldn’t read ${take[i].name}`);
        return;
      }
      const m = res.value;
      if (m.kind === 'video' && !allowVideo) { problems.push('Videos can’t be added here'); return; }
      added.push({ key: newKey(), kind: m.kind, preview: m.kind === 'video' ? (m.posterUrl ?? m.url) : m.url,
        url: null, poster: m.posterUrl, status: 'uploading', media: m });
    });
    if (problems.length) toast(problems.join(' · '), { tone: 'error' });
    if (!added.length) return;
    setTiles(prev => {
      const firstVideo = prev.findIndex(t => t.kind === 'video');
      const newPhotos = added.filter(t => t.kind === 'photo');
      const newVideos = added.filter(t => t.kind === 'video');
      const head = firstVideo < 0 ? prev : prev.slice(0, firstVideo);
      const tail = firstVideo < 0 ? [] : prev.slice(firstVideo);
      return [...head, ...newPhotos, ...tail, ...newVideos];
    });
    haptics.light();
    announce(`${added.length} added — uploading.`);
    added.forEach(t => { void upload(t.key, t.media!); });
  };

  /* ── Remove background (photos) ── */
  const cutBackground = async (key: string) => {
    const t = tilesRef.current.find(x => x.key === key);
    if (!t || t.kind !== 'photo' || t.status !== 'ready') return;
    setSheetKey(null);
    setTiles(prev => prev.map(x => (x.key === key ? { ...x, status: 'cutting' } : x)));
    try {
      const source = t.media?.blob ?? await (await fetch(corsFresh(t.preview), { mode: 'cors' })).blob();
      const form = new FormData();
      form.append('image', new File([source], 'photo.jpg', { type: source.type || 'image/jpeg' }));
      const res = await fetch(`${apiBase()}/api/remove-background`, { method: 'POST', body: form });
      if (!res.ok) {
        let msg = 'Couldn’t remove the background';
        try { const j = await res.json() as { error?: string }; if (j?.error) msg = j.error; } catch { /* not json */ }
        throw new Error(msg);
      }
      const cut = new File([await res.blob()], 'photo-cutout.png', { type: 'image/png' });
      const [settled] = await compressMediaBatch([cut]);
      if (settled.status !== 'fulfilled') throw new Error('Couldn’t finish the cutout');
      const m = settled.value;
      setTiles(prev => prev.map(x => (x.key === key ? { ...x, preview: m.url, url: null, media: m, status: 'uploading' } : x)));
      await upload(key, m);
      announce('Background removed.');
    } catch (e) {
      setTiles(prev => prev.map(x => (x.key === key ? { ...x, status: 'ready' } : x)));
      toast(`${(e as Error).message || 'Couldn’t remove the background'} — kept the original`, { tone: 'error' });
    }
  };

  /* ── Leaving ── */
  const done = async () => {
    if (saving || busy) return;
    if (failed) { setError(`${failed} didn’t upload — retry or remove ${failed === 1 ? 'it' : 'them'} first.`); return; }
    if (!dirty) { onClose(); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(finalPhotos, finalVideos);
      const kept = finalPhotos.filter(u => initialPhotos.includes(u));
      track(EVT.post_photos_edited, {
        bucket,
        photos_before: initialPhotos.length,
        photos_after: finalPhotos.length,
        added: finalPhotos.length - kept.length,
        removed: initialPhotos.filter(u => !finalPhotos.includes(u)).length
          + initialVideos.filter(u => !finalVideos.includes(u)).length,
        cover_changed: (finalPhotos[0] ?? null) !== (initialPhotos[0] ?? null),
        /* Same photos, different order — the thing the old dialog could not do. */
        reordered: !same(kept, initialPhotos.filter(u => finalPhotos.includes(u))),
      });
      haptics.success();
      toast('Photos updated', { tone: 'success' });
      onClose();
    } catch (e) {
      haptics.error();
      setError(`Couldn’t save — ${(e as Error).message || 'try again'}`);
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    if (saving) return;
    if (sheetKey) { setSheetKey(null); return; }
    if (addOpen) { setAddOpen(false); return; }
    if (confirmDiscard) { setConfirmDiscard(false); return; }
    if (dirty) { haptics.warning(); setConfirmDiscard(true); return; }
    onClose();
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  /* System back = Cancel: closes a sheet first, asks before discarding. */
  useBackLayer(open, () => cancelRef.current());

  /* ── Own the viewport while open: body lock, focus in, Escape, Tab trap ── */
  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    const prevFocus = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRef.current(); return; }
      if (e.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      e.stopPropagation();
      const f = Array.from(root.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null && el.tagName !== 'INPUT');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const a = document.activeElement as HTMLElement | null;
      if (!a || !root.contains(a)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      unlock();
      prevFocus?.focus?.();
    };
  }, [open]);

  const sheetTile = useMemo(() => tiles.find(t => t.key === sheetKey) ?? null, [tiles, sheetKey]);

  /* A sheet's buttons sit where the toast does. When one opens, the toast
     (an Undo offer, usually) goes — otherwise it covers "Discard changes". */
  const anySheet = !!sheetKey || addOpen || confirmDiscard;
  useEffect(() => { if (anySheet) dismissToast(); }, [anySheet]);

  if (!open) return null;

  const uploading = tiles.filter(t => t.status === 'uploading').length;
  const status = uploading ? `Uploading ${uploading}…` : `${tiles.length} of ${max}`;
  const ghostTile = drag.ghost ? tiles.find(t => t.key === drag.ghost!.key) : null;

  const renderTile = (t: Tile, indexInGroup: number) => {
    const isCover = t.kind === 'photo' && indexInGroup === 0;
    const lifted = drag.dragging === t.key;
    return (
      <button
        key={t.key}
        type="button"
        data-drag-key={t.key}
        className="me-tile"
        data-cover={isCover || undefined}
        data-lifted={lifted || undefined}
        data-status={t.status}
        aria-label={`${t.kind === 'video' ? 'Video' : 'Photo'} ${indexInGroup + 1}${isCover ? ', cover' : ''}${t.status === 'uploading' ? ', uploading' : t.status === 'failed' ? ', upload failed' : ''}. Opens options; long-press or drag to move.`}
        aria-haspopup="dialog"
        onClick={() => { haptics.light(); setSheetKey(t.key); }}
        onKeyDown={e => {
          if (!e.altKey) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveBy(t.key, -1); }
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveBy(t.key, 1); }
        }}
        {...drag.bind(t.key)}
      >
        {t.kind === 'video' && t.url && !t.media ? (
          <video src={`${t.preview}#t=0.1`} poster={coverPoster} muted playsInline preload="metadata" aria-hidden="true" />
        ) : (
          <img src={t.preview} alt="" draggable={false} />
        )}
        {isCover && <span className="me-badge"><Star size={11} strokeWidth={2.4} fill="currentColor" /> Cover</span>}
        {t.kind === 'video' && <span className="me-badge me-badge--video"><Play size={11} strokeWidth={2.2} fill="currentColor" /> Video</span>}
        {t.status === 'uploading' && (
          <span className="me-veil"><Loader2 size={20} strokeWidth={2} className="me-spin" /><span>Uploading</span></span>
        )}
        {t.status === 'cutting' && (
          <span className="me-veil"><Loader2 size={20} strokeWidth={2} className="me-spin" /><span>Removing background</span></span>
        )}
        {t.status === 'failed' && (
          <span className="me-veil me-veil--failed"><RotateCcw size={18} strokeWidth={2} /><span>Didn’t upload</span></span>
        )}
      </button>
    );
  };

  const addTile = remaining > 0 && (
    <button type="button" className="me-tile me-add" onClick={() => setAddOpen(true)} aria-label={`Add ${allowVideo ? 'photos or a video' : 'photos'}`}>
      <Plus size={22} strokeWidth={1.8} />
      <span>Add</span>
    </button>
  );

  const groupOfSheet = sheetTile ? tiles.filter(t => t.kind === sheetTile.kind) : [];
  const idxInGroup = sheetTile ? groupOfSheet.findIndex(t => t.key === sheetTile.key) : -1;

  /* Rendered at the page root: inside a desktop post window (which centres
     itself with a transform) a fixed-position editor would be trapped in, and
     clipped to, that window. */
  return createPortal(
    <div
      ref={rootRef}
      className="me-root"
      data-desktop={isDesktop || undefined}
      style={{ zIndex: layer }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="me-title"
    >
      <div className="me-backdrop" onClick={cancel} aria-hidden="true" />
      <div className="me-panel">
        <header className="me-head">
          <button type="button" className="me-textbtn" onClick={cancel} disabled={saving}>Cancel</button>
          <div className="me-titles">
            <h1 id="me-title">Edit photos</h1>
            <p>{subtitle ? `${subtitle} · ` : ''}{status}</p>
          </div>
          <button
            type="button"
            className="me-done"
            onClick={done}
            disabled={saving || busy}
            data-autofocus
          >
            {saving ? <><Loader2 size={15} className="me-spin" /> Saving</> : busy ? 'Uploading…' : 'Done'}
          </button>
        </header>

        <div ref={scrollRef} className="me-scroll">
          {tiles.length === 0 ? (
            <button type="button" className="me-empty" onClick={() => setAddOpen(true)}>
              <ImagePlus size={30} strokeWidth={1.5} />
              <span className="me-empty-t">Add photos</span>
              <span className="me-empty-s">Up to {max}. The first one is the cover — it’s what people see in the feed.</span>
            </button>
          ) : (
            <>
              <p className="me-hint">
                {isDesktop ? 'Drag to reorder. Click a photo for more.' : 'Hold and drag to reorder. Tap a photo for more.'}
              </p>
              <div ref={gridRef} style={{ position: 'relative' }}>
                <div className="me-grid" role="group" aria-label="Photos, in order">
                  {photos.map((t, i) => renderTile(t, i))}
                  {addTile}
                </div>
                {videos.length > 0 && (
                  <>
                    <p className="me-section">Videos play after the photos</p>
                    <div className="me-grid me-grid--videos" role="group" aria-label="Videos, in order">
                      {videos.map((t, i) => renderTile(t, i))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          {error && <p className="me-error" role="alert">{error}</p>}
        </div>
      </div>

      {/* The lifted photo follows the finger; its place in the grid stays as a
          hole showing where it will land. */}
      {drag.ghost && ghostTile && (
        <div
          className="me-ghost"
          aria-hidden="true"
          style={{ left: drag.ghost.x, top: drag.ghost.y, width: drag.ghost.w, height: drag.ghost.h }}
        >
          <img src={ghostTile.kind === 'video' ? (ghostTile.poster ?? coverPoster ?? ghostTile.preview) : ghostTile.preview} alt="" draggable={false} />
        </div>
      )}

      {/* Options for one photo */}
      {sheetTile && (
        <>
          <div className="me-sheet-backdrop" onClick={() => setSheetKey(null)} aria-hidden="true" />
          <div className="me-sheet" role="dialog" aria-label={`Options for ${positionLabel(sheetTile)}`}>
            <div className="me-grabber" aria-hidden="true" />
            <div className="me-sheet-head">
              <img src={sheetTile.kind === 'video' ? (sheetTile.poster ?? coverPoster ?? sheetTile.preview) : sheetTile.preview} alt="" />
              <div>
                <strong>{sheetTile.kind === 'photo' && idxInGroup === 0 ? 'Cover photo' : `${sheetTile.kind === 'video' ? 'Video' : 'Photo'} ${idxInGroup + 1} of ${groupOfSheet.length}`}</strong>
                <span>{sheetTile.kind === 'photo' && idxInGroup === 0 ? 'Shown first, and in the feed' : sheetTile.kind === 'video' ? 'Plays after the photos' : 'Shown after the cover'}</span>
              </div>
            </div>
            {sheetTile.status === 'failed' && (
              <button type="button" className="me-row" onClick={() => { setSheetKey(null); if (sheetTile.media) void upload(sheetTile.key, sheetTile.media); }}>
                <RotateCcw size={19} strokeWidth={1.8} /> Try uploading again
              </button>
            )}
            {sheetTile.kind === 'photo' && idxInGroup > 0 && (
              <button type="button" className="me-row" onClick={() => { makeCover(sheetTile.key); setSheetKey(null); }}>
                <Star size={19} strokeWidth={1.8} /> Make cover
              </button>
            )}
            <button type="button" className="me-row" disabled={idxInGroup <= 0} onClick={() => moveBy(sheetTile.key, -1)}>
              <ArrowLeft size={19} strokeWidth={1.8} /> Move earlier
            </button>
            <button type="button" className="me-row" disabled={idxInGroup < 0 || idxInGroup >= groupOfSheet.length - 1} onClick={() => moveBy(sheetTile.key, 1)}>
              <ArrowRight size={19} strokeWidth={1.8} /> Move later
            </button>
            {sheetTile.kind === 'photo' && (
              <button type="button" className="me-row" disabled={sheetTile.status !== 'ready'} onClick={() => void cutBackground(sheetTile.key)}>
                <Scissors size={19} strokeWidth={1.8} /> Remove background
              </button>
            )}
            <button type="button" className="me-row me-row--danger" onClick={() => remove(sheetTile.key)}>
              <Trash2 size={19} strokeWidth={1.8} /> Remove {sheetTile.kind === 'video' ? 'video' : 'photo'}
            </button>
            <button type="button" className="me-sheet-cancel" onClick={() => setSheetKey(null)}>Close</button>
          </div>
        </>
      )}

      {/* Where new photos come from */}
      {addOpen && (
        <>
          <div className="me-sheet-backdrop" onClick={() => setAddOpen(false)} aria-hidden="true" />
          <div className="me-sheet" role="dialog" aria-label="Add photos">
            <div className="me-grabber" aria-hidden="true" />
            <button type="button" className="me-row" onClick={() => cameraRef.current?.click()}>
              <Camera size={19} strokeWidth={1.8} /> Take a photo{allowVideo ? ' or video' : ''}
            </button>
            <button type="button" className="me-row" onClick={() => libraryRef.current?.click()}>
              <ImagePlus size={19} strokeWidth={1.8} /> Choose from library
            </button>
            <p className="me-sheet-note">{remaining} more fit. {allowVideo ? 'Videos up to 5 MB. ' : ''}We compress on upload to save your data.</p>
            <button type="button" className="me-sheet-cancel" onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        </>
      )}

      {confirmDiscard && (
        <>
          <div className="me-sheet-backdrop" onClick={() => setConfirmDiscard(false)} aria-hidden="true" />
          <div className="me-sheet" role="alertdialog" aria-labelledby="me-discard-t" aria-describedby="me-discard-s">
            <div className="me-grabber" aria-hidden="true" />
            <p id="me-discard-t" className="me-confirm-t">Discard your photo changes?</p>
            <p id="me-discard-s" className="me-confirm-s">The post keeps the photos it had before you opened this.</p>
            <button type="button" className="me-row me-row--danger me-row--center" onClick={() => { setConfirmDiscard(false); onClose(); }}>
              Discard changes
            </button>
            <button type="button" className="me-sheet-cancel" onClick={() => setConfirmDiscard(false)} autoFocus>Keep editing</button>
          </div>
        </>
      )}

      <input ref={libraryRef} type="file" hidden multiple
        accept={allowVideo ? 'image/*,.heic,.heif,video/*' : 'image/*,.heic,.heif'}
        onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" hidden capture="environment"
        accept={allowVideo ? 'image/*,.heic,.heif,video/*' : 'image/*,.heic,.heif'}
        onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />

      <p className="sr-only" aria-live="polite">{said}</p>
    </div>,
    document.body,
  );
}

/** The way into the editor from a post's hero photo, in edit mode. A labelled
 *  pill, not a bare camera glyph: the glyph read as "take a photo", sat 36px
 *  wide beside the logo stamp, and was the only door to the photos. */
export function EditPhotosButton({ count, onClick, place = 'top-left' }: {
  count: number;
  onClick: () => void;
  /** Where on the hero, so it never sits on top of a badge already there. */
  place?: 'top-left' | 'bottom-right';
}) {
  return (
    <button
      type="button"
      className="me-entry"
      data-place={place}
      onClick={() => { haptics.light(); onClick(); }}
      aria-label={`Edit photos — ${count} on this post. Reorder, add or remove.`}
    >
      <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>Edit photos</span>
    </button>
  );
}
