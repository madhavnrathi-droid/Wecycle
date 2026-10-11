'use client';

/* Placing an order. One sheet, three things: the item, how many (only when it
   has a price, so a quantity means something), and a note. Everything else —
   colour, size, when and where — is easier to settle in the chat this opens
   into than in a form, so the form doesn't try. */

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Package } from 'lucide-react';
import Modal from '../Modal';
import type { MarketplaceItem } from '../../lib/mockData';
import { resolveItemMedia } from '../../lib/photos';
import { peerFromUser } from '../../lib/messaging/store';
import { placeOrder } from '../../lib/orders/store';
import { NOTE_MAX, QTY_MAX, orderTotal, rupees } from '../../lib/orders/model';
import { haptics } from '../../lib/haptics';
import { track, EVT } from '../../lib/analytics';

interface OrderSheetProps {
  item: MarketplaceItem | null;
  onClose: () => void;
  /** The order exists and the seller has its message — go to the chat. */
  onPlaced: (conversationId: string, item: MarketplaceItem) => void;
}

export default function OrderSheet({ item, onClose, onPlaced }: OrderSheetProps) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!item) return;
    setQty(1); setNote(''); setError(null); setBusy(false);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const first = item.user.name.split(/\s+/)[0];
  const media = resolveItemMedia(item);
  const photo = media.find((m): m is string => typeof m === 'string') ?? null;
  const priced = typeof item.price === 'number' && item.price > 0;
  const total = orderTotal(item.price ?? null, qty);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    haptics.medium();
    const res = await placeOrder({
      listingId: item.id, title: item.title, price: priced ? item.price! : null, photoUrl: photo,
      seller: peerFromUser(item.user),
    }, qty, note);
    setBusy(false);
    if (!res.ok) {
      haptics.error();
      setError(res.message);
      track(EVT.order_failed, { code: res.code ?? 'unknown' });
      return;
    }
    haptics.success();
    track(EVT.order_placed, { quantity: qty, has_note: !!note.trim(), priced });
    onPlaced(res.conversationId, item);
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Order"
      maxWidth={440}
      footer={
        <div className="ord-sheet-foot">
          {error && <p className="ord-error" role="alert">{error}</p>}
          <button type="button" className="dm-btn ord-sheet-send" onClick={() => { void submit(); }} disabled={busy} aria-busy={busy}>
            {busy ? 'Sending…' : `Send order to ${first}`}
          </button>
          <p className="ord-fine">
            {first} gets this as a message. You’ll agree payment and pickup together in the chat.
          </p>
        </div>
      }
    >
      <div className="ord-sheet">
        <div className="ord-sheet-item">
          {photo
            ? <img src={photo} alt="" draggable={false} />
            : <span className="ord-thumb-ph" aria-hidden="true"><Package size={18} strokeWidth={1.8} /></span>}
          <div className="ord-sheet-item-text">
            <span className="ord-sheet-title">{item.title}</span>
            <span className="ord-sheet-sub">{priced ? `${rupees(item.price!)} · ` : ''}from {item.user.name}</span>
          </div>
        </div>

        {priced && (
          <div className="ord-qty">
            <span id="ord-qty-label">Quantity</span>
            <div className="ord-stepper" role="group" aria-labelledby="ord-qty-label">
              <button type="button" onClick={() => { haptics.selection(); setQty(q => Math.max(1, q - 1)); }} disabled={qty <= 1} aria-label="One fewer">
                <Minus size={16} strokeWidth={2.2} />
              </button>
              <output aria-live="polite">{qty}</output>
              <button type="button" onClick={() => { haptics.selection(); setQty(q => Math.min(QTY_MAX, q + 1)); }} disabled={qty >= QTY_MAX} aria-label="One more">
                <Plus size={16} strokeWidth={2.2} />
              </button>
            </div>
            {qty > 1 && total != null && <span className="ord-total">{rupees(total)}</span>}
          </div>
        )}

        <label className="ord-field" htmlFor="ord-note">
          <span>Note for {first} <em>optional</em></span>
          <textarea
            id="ord-note"
            ref={noteRef}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Colour, size, when you’re free to pick it up…"
          />
        </label>
      </div>
    </Modal>
  );
}
