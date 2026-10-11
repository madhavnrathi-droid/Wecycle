'use client';

/* The order, pinned to the top of the chat between its buyer and seller.
 *
 * One line of status in the reader's words, a thin five-step line, one
 * obvious next step, and everything else one tap away under "More" — which
 * also opens the full order sheet. Nothing here blocks the chat underneath:
 * the card is a shortcut for the steps people would otherwise type out. */

import { useState } from 'react';
import { Package } from 'lucide-react';
import type { DeepLinkPost } from '../../lib/liveData';
import { usePostPreview } from '../../lib/messaging/useMessaging';
import { roleIn, type Order } from '../../lib/orders/store';
import { statusLine } from '../../lib/orders/model';
import OrderActions, { OrderSteps } from './OrderActions';
import OrderDetailSheet from './OrderDetailSheet';
import { StatusPill, SwapText } from './Pop';

interface OrderCardProps {
  order: Order;
  me: string;
  peerFirst: string;
  onOpenPost: (post: DeepLinkPost) => void;
}

export default function OrderCard({ order, me, peerFirst, onOpenPost }: OrderCardProps) {
  const role = roleIn(order, me);
  const preview = usePostPreview({ type: 'listing', id: order.listingId, title: order.title });
  const [details, setDetails] = useState(false);
  const titleLine = `${order.title}${order.quantity > 1 ? ` × ${order.quantity}` : ''}`;

  return (
    <div className="ord-card" data-status={order.status}>
      <div className="ord-card-top">
        <button
          type="button" className="ord-card-item"
          onClick={() => preview && onOpenPost(preview.post)}
          disabled={!preview}
          aria-label={`${titleLine} — open post`}
        >
          {order.photoUrl || preview?.image
            ? <img src={order.photoUrl ?? preview?.image ?? ''} alt="" draggable={false} />
            : <span className="ord-thumb-ph" aria-hidden="true"><Package size={18} strokeWidth={1.8} /></span>}
          <span className="ord-card-text">
            <span className="ord-card-title">{titleLine}</span>
            <SwapText className="ord-card-sub" text={statusLine({ status: order.status, ready_by: order.readyBy, pickup: order.pickup, verified: order.verified }, role, peerFirst, order.cancelledBy === me)} />
          </span>
        </button>
        <StatusPill status={order.status} />
      </div>

      <OrderSteps order={order} />

      <OrderActions
        order={order} me={me} peerFirst={peerFirst} variant="card"
        onOpenDetails={() => setDetails(true)}
      />

      {details && (
        <OrderDetailSheet
          order={order} me={me} peerFirst={peerFirst}
          onClose={() => setDetails(false)}
          /* Already in the chat: "Message" just closes the sheet. */
          onMessage={() => setDetails(false)}
          onOpenPost={preview ? () => { setDetails(false); onOpenPost(preview.post); } : undefined}
        />
      )}
    </div>
  );
}
