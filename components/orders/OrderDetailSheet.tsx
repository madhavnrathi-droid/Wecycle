'use client';

/* One order, all of it: who it's from, when it came in, what was asked for,
 * when it's due and where it's handed over, every step so far — and the
 * actions, the same ones the chat card and the store list offer.
 *
 * Opened from a row in the store's Orders list, or from "Order details" on
 * the card in a chat. */

import { Package, ExternalLink } from 'lucide-react';
import Modal from '../Modal';
import PeerAvatar from '../messages/PeerAvatar';
import { useMessaging } from '../../lib/messaging/useMessaging';
import { roleIn, type Order } from '../../lib/orders/store';
import {
  orderTotal, rupees, shortDate, isOpen, type OrderAction, type OrderEvent,
} from '../../lib/orders/model';
import OrderActions, { OrderSteps } from './OrderActions';
import { StatusPill } from './Pop';

interface OrderDetailSheetProps {
  order: Order;
  me: string;
  peerFirst: string;
  onClose: () => void;
  onMessage: () => void;
  onOpenPost?: () => void;
  /** Open straight into a panel — a row's "Handed over" lands on the code. */
  initialPanel?: OrderAction | null;
}

const EVENT_LABEL: Record<OrderEvent['type'], string> = {
  requested: 'Ordered',
  confirm: 'Confirmed',
  making: 'Started making',
  ready: 'Marked ready',
  done: 'Handed over',
  received: 'Received',
  cancel: 'Cancelled',
  reopen: 'Reopened',
  details: 'Updated date or pickup',
};

export const whenFull = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export default function OrderDetailSheet({ order, me, peerFirst, onClose, onMessage, onOpenPost, initialPanel }: OrderDetailSheetProps) {
  const ms = useMessaging();
  const role = roleIn(order, me);
  const peerId = role === 'seller' ? order.buyerId : order.sellerId;
  const peer = ms.peers[peerId] ?? null;
  const name = peer?.name ?? (peerFirst || 'Wecycle member');
  const total = orderTotal(order.price, order.quantity);
  const overdue = isOpen(order.status) && !!order.readyBy && Date.parse(order.readyBy) < Date.now() - 12 * 3_600_000;

  return (
    <Modal
      open
      onClose={onClose}
      title={role === 'seller' ? 'Order for you' : 'Your order'}
      maxWidth={480}
      footer={
        <div className="ord-sheet-foot">
          <OrderActions
            order={order} me={me} peerFirst={peerFirst} variant="sheet"
            onMessage={onMessage} initialPanel={initialPanel}
          />
        </div>
      }
    >
      <div className="ord-detail">
        <div className="ord-detail-head">
          <button type="button" className="ord-detail-item" onClick={onOpenPost} disabled={!onOpenPost} aria-label={onOpenPost ? `${order.title} — open post` : order.title}>
            {order.photoUrl
              ? <img src={order.photoUrl} alt="" draggable={false} />
              : <span className="ord-thumb-ph" aria-hidden="true"><Package size={20} strokeWidth={1.8} /></span>}
            <span className="ord-card-text">
              <span className="ord-sheet-title">{order.title}{order.quantity > 1 ? ` × ${order.quantity}` : ''}</span>
              <span className="ord-sheet-sub">
                {total != null && total > 0 ? rupees(total) : 'No price set'}
                {order.quantity > 1 && order.price ? ` · ${rupees(order.price)} each` : ''}
              </span>
            </span>
            {onOpenPost && <ExternalLink size={15} strokeWidth={2} className="ord-row-chev" aria-hidden="true" />}
          </button>
          <StatusPill status={order.status} />
        </div>

        <OrderSteps order={order} labelled />

        <div className="ord-person">
          <PeerAvatar id={peerId} peer={peer} size={40} />
          <div className="ord-card-text">
            <span className="ord-person-role">{role === 'seller' ? 'Ordered by' : 'Sold by'}</span>
            <span className="ord-person-name">{name}</span>
          </div>
        </div>

        <dl className="ord-facts">
          <div><dt>Placed</dt><dd>{whenFull(order.createdAt)}</dd></div>
          <div><dt>Quantity</dt><dd>{order.quantity}</dd></div>
          {total != null && total > 0 && <div><dt>Total</dt><dd>{rupees(total)}</dd></div>}
          <div>
            <dt>Ready by</dt>
            <dd data-overdue={overdue || undefined}>{order.readyBy ? `${shortDate(order.readyBy)}${overdue ? ' · overdue' : ''}` : <span className="ord-muted">Not set</span>}</dd>
          </div>
          <div><dt>Pickup</dt><dd>{order.pickup ?? <span className="ord-muted">Not agreed yet</span>}</dd></div>
          {order.note && <div className="ord-facts-note"><dt>Note</dt><dd>{order.note}</dd></div>}
          {order.status === 'done' && (
            <div><dt>Handover</dt><dd>{order.verified ? 'Pickup code checked ✓' : 'Finished without the code'}</dd></div>
          )}
        </dl>

        {order.history.length > 0 && (
          <section aria-label="Order history">
            <h3 className="ord-group">History</h3>
            <ol className="ord-timeline">
              {[...order.history].reverse().map((e, i) => (
                <li key={`${e.at}-${i}`} data-latest={i === 0 || undefined}>
                  <span className="ord-timeline-what">
                    {EVENT_LABEL[e.type] ?? 'Updated'} <em>· {e.by === me ? 'you' : peerFirst || 'them'}</em>
                  </span>
                  <span className="ord-timeline-when">{whenFull(e.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}
