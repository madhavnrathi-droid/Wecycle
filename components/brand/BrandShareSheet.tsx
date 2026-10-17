'use client';

/* Sharing a brand: a card made for it, and the words that go with it.
 *
 * The card (lib/brandCard.ts) is a 1080×1080 PNG — the brand's wordmark and
 * mascot on its lush gradient, three products as stickers, what it costs and
 * where to order. The message (brandShareMessage) is written from what the
 * store has right now and is editable here, because the person sharing knows
 * their audience better than a template does.
 *
 *   Share card  the image AND the message together, through the phone's share
 *               sheet — into WhatsApp that is a picture with the message as
 *               its caption, link included.
 *   WhatsApp    just the message, straight into WhatsApp; the link unfurls
 *               into the brand's preview (/b/<handle>'s Open Graph tags).
 *               The route for desktops, which cannot share files.
 *   Save        the PNG, for Instagram and anywhere a file is posted by hand.
 *   Copy        the message, for the same.
 *
 * Remix draws the gradient again with a new seed. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Download, Copy, Loader2, Shuffle, Check, RotateCcw } from '@/lib/icons';
import Modal from '../Modal';
import { WhatsAppMark } from '../ContactChannels';
import { openExternal } from '../PostLink';
import type { MarketplaceItem } from '../../lib/mockData';
import { resolveItemMedia } from '../../lib/photos';
import { picksFor, fromPrice, brandUrl, brandShareMessage, type Brand } from '../../lib/brands';
import { renderBrandCard } from '../../lib/brandCard';
import { haptics } from '../../lib/haptics';
import { track, EVT } from '../../lib/analytics';
import { WA_FILL, WA_INK } from '../../lib/whatsapp';

interface BrandShareSheetProps {
  open: boolean;
  onClose: () => void;
  brand: Brand;
  items: MarketplaceItem[];
  ownerName: string;
}

const photoOf = (it: MarketplaceItem): string | null => {
  const first = resolveItemMedia(it)[0];
  if (!first) return null;
  return typeof first === 'string' ? first : (first.poster ?? null);
};

export default function BrandShareSheet({ open, onClose, brand, items, ownerName }: BrandShareSheetProps) {
  const defaultMessage = useMemo(() => brandShareMessage(brand, items, ownerName), [brand, items, ownerName]);
  const [message, setMessage] = useState(defaultMessage);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100));
  const [card, setCard] = useState<{ blob: Blob | null; dataUrl: string } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number>(0);

  /* A fresh message each time the sheet opens — it reflects the store now. */
  useEffect(() => { if (open) setMessage(defaultMessage); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const open_ = items.filter(i => !i.isClosed && !i.isRequest);
  const products = useMemo(() => picksFor(brand, open_, 3)
    .map(it => ({ title: it.title, price: it.listingType === 'sell' ? it.price ?? null : null, photo: photoOf(it) }))
    .filter((p): p is { title: string; price: number | null; photo: string } => !!p.photo),
  [brand, items]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRendering(true);
    renderBrandCard({
      brand, products, count: open_.length, from: fromPrice(items),
      url: brandUrl(brand).replace(/^https?:\/\//, ''), seed,
    })
      .then(r => { if (live) setCard(r); })
      .catch(() => { if (live) setCard(null); })
      .finally(() => { if (live) setRendering(false); });
    return () => { live = false; };
  }, [open, seed, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (text: string) => {
    setNote(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  };

  const fileName = `${brand.handle}-on-wecycle.png`;

  const copyMessage = async (quiet = false): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(message);
      if (!quiet) { haptics.success(); flash('Message copied'); }
      return true;
    } catch {
      if (!quiet) flash('Couldn’t copy — select the text and copy it');
      return false;
    }
  };

  const saveImage = (): boolean => {
    if (!card?.blob) return false;
    const href = URL.createObjectURL(card.blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1500);
    return true;
  };

  const shareCard = async () => {
    if (busy) return;
    setBusy(true);
    haptics.medium();
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    let result: 'shared' | 'cancelled' | 'saved' | 'failed' = 'failed';
    try {
      if (card?.blob) {
        const file = new File([card.blob], fileName, { type: 'image/png' });
        /* The link lives in the text only — WhatsApp prints `url` again after
           the text, and many targets drop `url` when files are attached. */
        const data = { files: [file], text: message } as ShareData;
        if (typeof nav.share === 'function' && nav.canShare?.(data)) {
          try { await nav.share(data); result = 'shared'; }
          catch (e) { result = (e as Error).name === 'AbortError' ? 'cancelled' : 'failed'; }
        }
      }
      /* No file sharing here (most desktops): save the card and put the
         message on the clipboard — both halves of the post, one paste away. */
      if (result === 'failed') {
        const saved = saveImage();
        const copied = await copyMessage(true);
        result = saved || copied ? 'saved' : 'failed';
        flash(saved && copied ? 'Card saved and message copied — paste it with the image'
          : saved ? 'Card saved' : copied ? 'Message copied' : 'Couldn’t share');
      } else if (result === 'shared') {
        haptics.success();
        flash('Shared');
      }
    } finally {
      setBusy(false);
      track(EVT.brand_shared, { brand: brand.handle, via: 'card', result, edited: message !== defaultMessage, seed });
    }
  };

  const shareWhatsApp = () => {
    haptics.light();
    track(EVT.brand_shared, { brand: brand.handle, via: 'whatsapp', result: 'opened', edited: message !== defaultMessage });
    openExternal(`https://wa.me/?text=${encodeURIComponent(message)}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share ${brand.name}`}
      maxWidth={460}
      footer={
        <div className="bsh-actions">
          <button type="button" className="bsh-primary ord-press" onClick={() => { void shareCard(); }} disabled={busy || rendering} aria-busy={busy}>
            {busy ? <Loader2 size={17} className="bsh-spin" /> : <Share2 size={17} strokeWidth={2.2} />}
            Share card
          </button>
          <button type="button" className="bsh-icon bsh-wa ord-press" onClick={shareWhatsApp} aria-label="Send the message on WhatsApp"
            style={{ background: WA_FILL, color: WA_INK }}>
            <WhatsAppMark size={20} />
          </button>
          <button type="button" className="bsh-icon ord-press" onClick={() => { haptics.selection(); if (saveImage()) flash('Card saved'); }}
            disabled={!card?.blob} aria-label="Save the card image">
            <Download size={18} strokeWidth={2} />
          </button>
          <button type="button" className="bsh-icon ord-press" onClick={() => { void copyMessage(); }} aria-label="Copy the message">
            <Copy size={18} strokeWidth={2} />
          </button>
        </div>
      }
    >
      <div className="bsh">
        <div className="bsh-preview" aria-busy={rendering}>
          {card?.dataUrl
            ? <img key={card.dataUrl.length + seed} src={card.dataUrl} alt={`${brand.name} share card: the brand's wordmark on its colours, with ${products.length} of its products and how to order`} className="bsh-img" />
            : <span className="dm-skel bsh-skel" aria-label="Making the card" />}
          {rendering && card && <span className="bsh-busy" aria-hidden="true"><Loader2 size={22} className="bsh-spin" /></span>}
          <button type="button" className="bsh-remix ord-press" onClick={() => { haptics.selection(); setSeed(s => (s + 1 + Math.floor(Math.random() * 37)) % 100); }}
            disabled={rendering} aria-label="Remix the background">
            <Shuffle size={15} strokeWidth={2.2} /> Remix
          </button>
          {note && <span className="bsh-note" role="status"><Check size={13} strokeWidth={2.6} /> {note}</span>}
        </div>

        <label className="bsh-field" htmlFor="bsh-message">
          <span className="bsh-label">
            Message
            {message !== defaultMessage && (
              <button type="button" className="bsh-reset" onClick={() => setMessage(defaultMessage)}>
                <RotateCcw size={12} strokeWidth={2.2} /> Reset
              </button>
            )}
          </span>
          <textarea
            id="bsh-message"
            rows={5}
            value={message}
            maxLength={600}
            onChange={e => setMessage(e.target.value)}
          />
          <span className="bsh-hint">
            Goes out with the card, link included. Instagram drops captions from shares — copy it and paste it there.
          </span>
        </label>
      </div>
    </Modal>
  );
}
