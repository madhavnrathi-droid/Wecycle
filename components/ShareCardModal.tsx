'use client';

/*
 * ShareCardModal — the "your card is ready" moment.
 *
 * The preview is the card ALIVE: a ShaderGradient moving behind the card's own
 * layers (lib/shareCard), so what someone is about to send feels made rather
 * than generated. Sharing freezes the frame on screen into a 1080 × 1080 JPEG
 * — the still is the moment they saw — and lays it over the preview while the
 * share sheet is up, so there is no doubt which picture went.
 *
 *   • Share → the image with the post's link in the caption (OS share sheet;
 *             in the apps, through Capacitor; else download + copied link).
 *   • Save  → the image alone.
 *   • Copy  → the link.
 *
 * Nothing here can leave a spinner forever: building the card is capped
 * inside lib/shareCard, a failure says so with a retry, and Share still sends
 * the link while the image is not ready.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useBackLayer } from '../lib/backStack';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { X, Share2, Download, Link2, Loader2, Check, RotateCcw } from '@/lib/icons';
import {
  buildCardLayers, composeCard, cardBlob, downloadCardBlob, shareCardBlob, CARD_GRAIN_ALPHA,
  type ShareCardSpec, type CardLayers,
} from '../lib/shareCard';
import {
  CARD_PALETTES, defaultPaletteFor, paletteById, type CardPaletteId,
} from '../lib/cardPalettes';
import { shareLink } from '../lib/share';
import { sfxOpen, sfxShare, sfxTap } from '../lib/sfx';
import { haptics } from '../lib/haptics';
import { Z_LAYER, zPanel } from '../lib/zLayers';

/* three.js is ~150 KB gzipped and only this sheet uses it. */
const CardGradient = dynamic(() => import('./CardGradient'), { ssr: false });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spec: ShareCardSpec | null;
}

interface Preview { scrim: string; grain: string; content: string }

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function ShareCardModal({ open, onOpenChange, spec }: Props) {
  useBackLayer(open, () => onOpenChange(false));

  const [paletteId, setPaletteId] = useState<CardPaletteId>(() => defaultPaletteFor(spec?.kind ?? 'item'));
  const palette = paletteById(paletteId);

  const [layers, setLayers] = useState<CardLayers | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [still, setStill] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [gl, setGl] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [size, setSize] = useState(380);

  const frameRef = useRef<HTMLDivElement>(null);
  const announced = useRef(false);

  /* A fresh post opens on its own board's colour. */
  useEffect(() => {
    if (open && spec) setPaletteId(defaultPaletteFor(spec.kind));
  }, [open, spec?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setGl(hasWebGL());
    setReduceMotion(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }, [open]);

  /* The preview's real width, so the shader's buffer can be aimed at 1080px. */
  useEffect(() => {
    if (!open || !frameRef.current) return;
    const el = frameRef.current;
    const ro = new ResizeObserver(() => setSize(el.clientWidth || 380));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  /* Build the card's layers whenever the post, the palette or a retry asks. */
  useEffect(() => {
    if (!open || !spec) return;
    let cancelled = false;
    setFailed(false);
    setStill(null);
    (async () => {
      try {
        const l = await buildCardLayers(spec, palette);
        if (cancelled) return;
        setLayers(l);
        setPreview({
          scrim: l.scrim.toDataURL('image/png'),
          grain: l.grain.toDataURL('image/png'),
          content: l.content.toDataURL('image/png'),
        });
        if (!announced.current) { announced.current = true; sfxOpen(); }
      } catch (err) {
        console.error('[share card] build failed', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, spec?.kind, spec?.title, spec?.imageUrls?.join('|'), spec?.price, spec?.priceLine, spec?.badge, spec?.dateLine, spec?.location, spec?.byName, spec?.description, paletteId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Closing forgets the card, so the next post never flashes the last one. */
  useEffect(() => {
    if (open) return;
    setLayers(null); setPreview(null); setStill(null); setToast(null);
    announced.current = false;
  }, [open]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  /** Freeze the frame on screen into the finished JPEG. */
  const makeStill = useCallback(async (): Promise<Blob | null> => {
    if (!layers) return null;
    /* Found through the preview frame, not a ref: next/dynamic's wrapper
       does not forward refs, and a ref here was silently null — every export
       fell back to the flat painted field instead of the frame on screen. */
    const field = gl ? frameRef.current?.querySelector('canvas') ?? null : null;
    const card = composeCard(layers, field, palette);
    const blob = await cardBlob(card);
    if (blob) setStill(URL.createObjectURL(blob));
    return blob;
  }, [layers, gl, palette]);

  /* Let the still go a moment after the share sheet closes. */
  useEffect(() => {
    if (!still) return;
    const t = setTimeout(() => setStill(null), 2600);
    return () => { clearTimeout(t); URL.revokeObjectURL(still); };
  }, [still]);

  const onShare = async () => {
    if (!spec || busy) return;
    setBusy(true);
    haptics.medium();
    const blob = await makeStill();
    const res = blob
      ? await shareCardBlob(blob, spec)
      : await shareLink({ title: spec.title, text: spec.title, url: spec.url });
    setBusy(false);
    if (res === 'shared') { sfxShare(); flashToast('Shared'); }
    else if (res === 'downloaded') { sfxShare(); flashToast('Card saved · link copied'); }
    else if (res === 'copied') { sfxShare(); flashToast('Link copied'); }
    else flashToast('Couldn’t share');
  };

  const onSave = async () => {
    if (!spec || busy || !layers) return;
    setBusy(true);
    sfxTap();
    const blob = await makeStill();
    const res = await downloadCardBlob(blob, spec);
    setBusy(false);
    flashToast(res === 'downloaded' ? 'Saved to your device' : res === 'shared' ? 'Saved' : 'Couldn’t save');
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
      flashToast('Couldn’t copy');
    }
  };

  const [f0, f1, f2] = palette.fallback;
  const ready = !!preview;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sc-overlay" style={{ zIndex: Z_LAYER.shareCard }} />
        <Dialog.Content
          aria-describedby={undefined}
          className="sc-sheet"
          style={{ zIndex: zPanel(Z_LAYER.shareCard) }}
        >
          <div className="sc-panel">
            <div className="sc-head">
              <Dialog.Title className="sc-title">Share card</Dialog.Title>
              <Dialog.Close asChild>
                <button aria-label="Close" className="sc-close"><X size={18} /></button>
              </Dialog.Close>
            </div>
            <VisuallyHidden><p>Preview of the image that will be shared</p></VisuallyHidden>

            {/* ── The card, alive ── */}
            <div
              ref={frameRef}
              className="sc-frame"
              data-ready={ready ? '' : undefined}
              style={{ background: `radial-gradient(120% 90% at 85% 8%, ${f2} 0%, transparent 55%), linear-gradient(160deg, ${f1}, ${f0})` }}
            >
              {gl && (
                <CardGradient palette={palette} animate={!reduceMotion} cssSize={size} />
              )}
              {preview && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="sc-layer" src={preview.scrim} alt="" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="sc-layer sc-grain" src={preview.grain} alt="" style={{ opacity: CARD_GRAIN_ALPHA }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="sc-layer sc-content" src={preview.content} alt={`Share card for ${spec?.title ?? 'this post'}`} />
                </>
              )}
              {still && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sc-layer sc-still" src={still} alt="" />
              )}
              {!ready && !failed && (
                <div className="sc-making" role="status">
                  <Loader2 size={18} className="sc-spin" /> Making your card…
                </div>
              )}
              {failed && (
                <div className="sc-making" role="alert">
                  Couldn’t build the card.
                  <button type="button" className="sc-retry" onClick={() => setAttempt(a => a + 1)}>
                    <RotateCcw size={15} /> Try again
                  </button>
                </div>
              )}
              {toast && (
                <div role="status" className="sc-toast"><Check size={14} /> {toast}</div>
              )}
            </div>

            {/* ── Colour ── shown as the colour, not named in a menu. */}
            <div role="radiogroup" aria-label="Card colour" className="sc-palettes">
              {CARD_PALETTES.map(p => {
                const on = p.id === paletteId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className="sc-swatch"
                    onClick={() => { if (!on) { haptics.selection(); sfxTap(); setPaletteId(p.id); } }}
                  >
                    <span
                      aria-hidden="true"
                      className="sc-chip"
                      style={{ background: `radial-gradient(90% 90% at 75% 20%, ${p.colors[2]} 0%, transparent 60%), linear-gradient(150deg, ${p.colors[0]}, ${p.colors[1]})` }}
                    />
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="sc-actions">
              <button type="button" onClick={onShare} disabled={busy} className="sc-primary">
                {busy ? <Loader2 size={17} className="sc-spin" /> : <Share2 size={17} />}
                Share card
              </button>
              <button type="button" onClick={onSave} disabled={!ready || busy} aria-label="Save image" className="sc-icon">
                <Download size={19} />
              </button>
              <button type="button" onClick={onCopy} aria-label="Copy link" className="sc-icon">
                <Link2 size={19} />
              </button>
            </div>
            <p className="sc-note">1080 × 1080 — the size WhatsApp sends whole.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
