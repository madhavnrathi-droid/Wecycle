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
  STOREFRONT_STYLES,
  type ShareCardSpec, type StorefrontStyle,
} from '../lib/shareCard';
import { shareLink } from '../lib/share';
import { sfxOpen, sfxShare, sfxTap } from '../lib/sfx';
import { haptics } from '../lib/haptics';
import { Z_LAYER, zPanel } from '../lib/zLayers';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spec: ShareCardSpec | null;
}

export default function ShareCardModal({ open, onOpenChange, spec }: Props) {
  /* Style choice, for the card kinds that have one. Held here rather than in
     the spec so the caller does not have to care: a storefront card is the
     only thing with a look worth choosing, and the poster picks it at the
     moment of sharing, not while filling in a form. */
  const [style, setStyle] = useState<StorefrontStyle>(STOREFRONT_STYLES[0].id);
  const hasStyles = spec?.kind === 'storefront';
  const effectiveSpec = hasStyles && spec ? { ...spec, cardStyle: style } : spec;

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
    if (!open || !effectiveSpec) return;
    let cancelled = false;
    setDataUrl(null);
    setBlob(null);
    setToast(null);
    playedRef.current = false;
    (async () => {
      try {
        const r = await renderShareCard(effectiveSpec!);
        if (cancelled) return;
        setDataUrl(r.dataUrl);
        setBlob(r.blob);
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
    /* `style` is in the deps on purpose: picking a swatch has to re-render the
       card, and it is the only control on this sheet that changes the image. */
  }, [open, spec?.kind, spec?.title, spec?.imageUrls?.join('|'), spec?.price, spec?.priceLine, spec?.badge, spec?.dateLine, spec?.location, spec?.byName, style]); // eslint-disable-line react-hooks/exhaustive-deps

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
    /* Share the CARD IMAGE, with the link in the caption.
     *
     * The old version shared only text + URL and trusted link unfurling to
     * supply the picture. It doesn't, in exactly the places that matter:
     *   - WhatsApp builds a link preview on the SENDER's device while you type
     *     a URL. A share-sheet payload arrives pre-composed, so it never
     *     unfurls — you get a bare blue link. (Verified: /s/<id> serves correct
     *     absolute og:image for both listings and events, 200 to a WhatsApp UA,
     *     ~210KB — the tags were never the problem.)
     *   - Instagram has no link preview at all, ever. An image is the only
     *     thing it can carry.
     *   - Most email clients don't unfurl either.
     * Attaching the PNG works in all three. The OG tags still do their job when
     * someone pastes the link by hand.
     *
     * Falls back to the link when the card hasn't finished rendering, and
     * shareCardBlob itself falls back to a download + copied link on desktop
     * browsers that can't share files. */
    const res = blob
      ? await shareCardBlob(blob, effectiveSpec!)
      : await shareLink({ title: spec.title, text: shareText(spec), url: spec.url });
    setBusy(false);
    if (res === 'shared') { sfxShare(); successPop(); flashToast('Shared!'); }
    else if (res === 'downloaded') { sfxShare(); successPop(); flashToast('Card saved — attach it anywhere'); }
    else if (res === 'copied') { sfxShare(); successPop(); flashToast('Link copied'); }
    else flashToast("Couldn't share");
  };

  const onSave = async () => {
    if (!spec || busy) return;
    setBusy(true);
    sfxTap();
    const res = await downloadCardBlob(blob, effectiveSpec!);
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
          zIndex: Z_LAYER.shareCard,
        }} />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(420px, 94vw)',
            /* Must sit ABOVE its own overlay. This was a hardcoded 301 while the
               overlay above uses Z_LAYER.shareCard (500), so the card rendered
               BEHIND its own dark blur — the whole sheet appeared washed out and
               unreadable. Derive it from the same constant so the two can never
               invert again. */
            zIndex: zPanel(Z_LAYER.shareCard),
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
              <span style={{ fontSize: 'calc(17px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
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
                  fontSize: 'calc(12.5px * var(--text-scale))', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                }}>
                  <Check size={13} strokeWidth={2.5} /> {toast}
                </div>
              )}
            </div>

            {/* ── Style picker ──
                Only where a choice exists, which today is the storefront card.
                A horizontal row of swatches rather than a dropdown: the thing
                being chosen is a LOOK, so it has to be shown rather than named,
                and two options fit without scrolling at any width.

                Placed under the preview and above the actions, because it
                changes what you are about to send and therefore belongs in the
                path between seeing it and sending it. */}
            {hasStyles && (
              <div
                role="radiogroup"
                aria-label="Card style"
                style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}
              >
                {STOREFRONT_STYLES.map(st => {
                  const on = st.id === style;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { haptics.selection(); sfxTap(); setStyle(st.id); }}
                      style={{
                        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 8,
                        minHeight: 44, padding: '8px 14px 8px 8px',
                        borderRadius: 999, cursor: 'pointer',
                        background: on ? 'var(--text-primary)' : 'var(--bg-inset)',
                        color: on ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        fontSize: 'calc(13px * var(--text-scale))', fontWeight: 600,
                        transition: 'background 160ms',
                      }}
                    >
                      {/* The swatch IS the palette — two stops of the actual
                          wash, so the button previews the card rather than
                          describing it. */}
                      <span aria-hidden="true" style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: `linear-gradient(135deg, ${st.wash[1]}, ${st.wash[3]})`,
                        boxShadow: `inset 0 0 0 2px ${on ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.08)'}`,
                      }} />
                      {st.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onShare}
                disabled={busy}
                style={{
                  flex: 1, height: 50, borderRadius: 14, border: 'none',
                  background: 'var(--accent-lime, #C4F649)', color: '#0C1B0C',
                  fontSize: 'calc(14.5px * var(--text-scale))', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
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

function shareText(spec: ShareCardSpec): string {
  switch (spec.kind) {
    case 'request': return `Looking for "${spec.title}" on Wecycle`;
    case 'event':   return `${spec.title}${spec.dateLine ? ` · ${spec.dateLine}` : ''} — on Wecycle`;
    case 'lost':    return `Lost: "${spec.title}" — seen it? Help out on Wecycle`;
    case 'found':   return `Found: "${spec.title}" — is it yours? On Wecycle`;
    default:        return `"${spec.title}"${spec.price != null ? ` — ₹${spec.price}` : ''} on Wecycle`;
  }
}
