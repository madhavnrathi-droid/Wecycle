'use client';

/*
 * ShareCardModal — the "your card is ready" moment (Spotify-style).
 *
 * Opens from any post's Share action. On open it renders the post into a
 * 4:5 PNG via lib/shareCard, previews it, and offers three actions:
 *   • Share  → native share sheet with the image file (Stories/WhatsApp/…)
 *   • Save   → download the PNG (and copy the link)
 *   • Copy link
 *
 * The preview is the exact generated image, so what the user sees is what
 * gets shared.
 */

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X, Share2, Download, Link2, Loader2, Check } from 'lucide-react';
import {
  renderShareCard, shareCardBlob, downloadCardBlob,
  type ShareCardSpec,
} from '../lib/shareCard';
import { haptics } from '../lib/haptics';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spec: ShareCardSpec | null;
}

export default function ShareCardModal({ open, onOpenChange, spec }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* Render whenever the modal opens with a spec. Keyed on the title so
     re-opening for a different post regenerates. */
  useEffect(() => {
    if (!open || !spec) return;
    let cancelled = false;
    setDataUrl(null);
    setBlob(null);
    setToast(null);
    (async () => {
      try {
        const r = await renderShareCard(spec);
        if (cancelled) return;
        setDataUrl(r.dataUrl);
        setBlob(r.blob);
      } catch { /* leave preview empty; buttons will no-op gracefully */ }
    })();
    return () => { cancelled = true; };
  }, [open, spec?.kind, spec?.title, spec?.imageUrls?.join('|'), spec?.price, spec?.badge, spec?.dateLine, spec?.location]); // eslint-disable-line react-hooks/exhaustive-deps

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const onShare = async () => {
    if (!spec || busy) return;
    setBusy(true);
    haptics.medium();
    const res = await shareCardBlob(blob, spec);
    setBusy(false);
    if (res === 'shared') flashToast('Shared!');
    else if (res === 'downloaded') flashToast('Saved to your device');
    else flashToast("Couldn't share — try Save");
  };

  const onSave = async () => {
    if (!spec || busy) return;
    setBusy(true);
    const res = await downloadCardBlob(blob, spec);
    setBusy(false);
    flashToast(res === 'downloaded' ? 'Saved to your device' : "Couldn't save");
  };

  const onCopy = async () => {
    if (!spec) return;
    const url = spec.url ?? (typeof window !== 'undefined' ? window.location.href : '');
    try {
      await navigator.clipboard?.writeText(url);
      haptics.success();
      flashToast('Link copied');
    } catch {
      flashToast("Couldn't copy");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          zIndex: 300,
        }} />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(420px, 94vw)',
            maxHeight: '94svh', overflowY: 'auto',
            background: 'var(--bg-card)',
            borderRadius: 24,
            padding: '18px 18px 22px',
            zIndex: 301,
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Share card
            </span>
            <Dialog.Close asChild>
              <button aria-label="Close" className="theme-toggle" style={{ width: 34, height: 34 }}>
                <X size={17} strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>
          <VisuallyHidden><Dialog.Title>Share this post as a card</Dialog.Title></VisuallyHidden>

          {/* Preview — exact generated image, 4:5. */}
          <div style={{
            position: 'relative',
            width: '100%', aspectRatio: '4 / 5',
            borderRadius: 18, overflow: 'hidden',
            background: 'var(--bg-inset)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {dataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={dataUrl} alt="Shareable card preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <Loader2 size={28} strokeWidth={2} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--text-muted)' }} />
            )}
            {toast && (
              <div role="status" style={{
                position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(12,14,18,0.86)', color: '#fff',
                padding: '8px 14px', borderRadius: 999,
                fontSize: 12.5, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}>
                <Check size={13} strokeWidth={2.5} /> {toast}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onShare}
              disabled={!dataUrl || busy}
              style={{
                flex: 1, height: 50, borderRadius: 14, border: 'none',
                background: 'var(--accent-lime, #C4F649)', color: '#0C1B0C',
                fontSize: 14.5, fontWeight: 700, cursor: dataUrl && !busy ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: !dataUrl || busy ? 0.6 : 1,
              }}
            >
              {busy
                ? <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} />
                : <Share2 size={16} strokeWidth={2.2} />}
              Share
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dataUrl || busy}
              aria-label="Save image"
              className="theme-toggle"
              style={{ width: 50, height: 50, borderRadius: 14 }}
            >
              <Download size={18} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              onClick={onCopy}
              aria-label="Copy link"
              className="theme-toggle"
              style={{ width: 50, height: 50, borderRadius: 14 }}
            >
              <Link2 size={18} strokeWidth={1.9} />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
