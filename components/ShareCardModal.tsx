'use client';

/*
 * ShareCardModal — the "your card is ready" moment.
 *
 * Renders the post into a PNG (lib/shareCard) and previews it with a snappy
 * GSAP entrance, a diagonal light-sweep when it's ready, + synthesised sound.
 *   • Share  → shares the CARD IMAGE with the product link in the caption
 *              (native sheet); falls back to a PNG download + link copy.
 *   • Save   → downloads the card PNG.
 *   • Copy   → copies the product link.
 */

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X, Share2, Download, Link2, Loader2, Check } from 'lucide-react';
import gsap from 'gsap';
import {
  renderShareCard, downloadCardBlob, shareCardBlob,
  type ShareCardSpec,
} from '../lib/shareCard';
import { sfxOpen, sfxShare, sfxTap } from '../lib/sfx';
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

  const cardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef(false);

  /* Render whenever the modal opens with a spec. */
  useEffect(() => {
    if (!open || !spec) return;
    let cancelled = false;
    setDataUrl(null);
    setBlob(null);
    setToast(null);
    playedRef.current = false;
    (async () => {
      try {
        const r = await renderShareCard(spec);
        if (cancelled) return;
        setDataUrl(r.dataUrl);
        setBlob(r.blob);
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [open, spec?.kind, spec?.title, spec?.imageUrls?.join('|'), spec?.price, spec?.badge, spec?.dateLine, spec?.location, spec?.byName]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Snappy entrance for the whole sheet when it mounts. */
  useEffect(() => {
    if (!open || !cardRef.current) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { gsap.set(cardRef.current, { clearProps: 'all' }); return; }
    gsap.fromTo(
      cardRef.current,
      { scale: 0.9, y: 26, autoAlpha: 0 },
      { scale: 1, y: 0, autoAlpha: 1, duration: 0.55, ease: 'back.out(1.6)' },
    );
  }, [open]);

  /* When the card image lands, pop it in + play the bloom sound (once). */
  useEffect(() => {
    if (!dataUrl || !previewRef.current || playedRef.current) return;
    playedRef.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    sfxOpen();
    if (!reduce) {
      gsap.fromTo(
        previewRef.current,
        { scale: 0.96, autoAlpha: 0.4 },
        { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2)' },
      );
      /* A light sweeps diagonally across the finished card — "it's ready". */
      if (shineRef.current) {
        gsap.fromTo(
          shineRef.current,
          { xPercent: -180, skewX: -14, opacity: 0 },
          {
            xPercent: 240, skewX: -14, opacity: 1, duration: 1.0, ease: 'power2.inOut', delay: 0.34,
            onComplete: () => { if (shineRef.current) gsap.to(shineRef.current, { opacity: 0, duration: 0.2 }); },
          },
        );
      }
    }
  }, [dataUrl]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const successPop = () => {
    if (!previewRef.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(previewRef.current, { scale: 1 }, { scale: 1.045, duration: 0.13, ease: 'power2.out', yoyo: true, repeat: 1 });
  };

  const onShare = async () => {
    if (!spec || busy) return;
    setBusy(true);
    haptics.medium();
    /* Share the CARD IMAGE with the product link in the caption. */
    const res = await shareCardBlob(blob, spec);
    setBusy(false);
    if (res === 'shared') { sfxShare(); successPop(); flashToast('Shared!'); }
    else if (res === 'downloaded') { sfxShare(); successPop(); flashToast('Saved · link copied'); }
    else flashToast("Couldn't share");
  };

  const onSave = async () => {
    if (!spec || busy) return;
    setBusy(true);
    sfxTap();
    const res = await downloadCardBlob(blob, spec);
    setBusy(false);
    flashToast(res === 'downloaded' ? 'Saved to your device' : "Couldn't save");
  };

  const onCopy = async () => {
    if (!spec) return;
    sfxTap();
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
            zIndex: 301,
          }}
        >
          <div ref={cardRef} style={{
            maxHeight: '94svh', overflowY: 'auto',
            background: 'var(--bg-card)',
            borderRadius: 24,
            padding: '18px 18px 22px',
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
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
            <VisuallyHidden><Dialog.Title>Share this post</Dialog.Title></VisuallyHidden>

            {/* Preview — exact generated image (whole card, its own rounded
                corners + baked drop shadow shown via the transparent margin). */}
            <div ref={previewRef} style={{
              position: 'relative',
              width: '100%', minHeight: 320,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {dataUrl ? (
                <div style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', maxWidth: '100%', maxHeight: '62vh', lineHeight: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dataUrl} alt="Shareable card preview" style={{ maxWidth: '100%', maxHeight: '62vh', display: 'block' }} />
                  <div ref={shineRef} aria-hidden="true" style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, width: '55%',
                    transform: 'translateX(-180%) skewX(-14deg)', opacity: 0, pointerEvents: 'none',
                    background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 100%)',
                  }} />
                </div>
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
                disabled={busy}
                style={{
                  flex: 1, height: 50, borderRadius: 14, border: 'none',
                  background: 'var(--accent-lime, #C4F649)', color: '#0C1B0C',
                  fontSize: 14.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy
                  ? <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} />
                  : <Share2 size={16} strokeWidth={2.2} />}
                Share link
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
