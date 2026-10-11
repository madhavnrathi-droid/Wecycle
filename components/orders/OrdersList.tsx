'use client';

/* Every order a member is part of, in one list: what they're selling and what
   they've ordered. Open ones first, each row naming the person and where the
   order has got to. A row opens the chat, because that is where an order is
   handled — this list is the way back to it, not a second place to manage it. */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Package } from 'lucide-react';
import { useOrders, ordersAs, type Order } from '../../lib/orders/store';
import { useMessaging } from '../../lib/messaging/useMessaging';
import { ensurePeersFor } from '../../lib/messaging/store';
import { STATUS_LABEL, isOpen } from '../../lib/orders/model';
import { inboxTime } from '../../lib/messaging/format';
import { useGlide } from '../../lib/useGlide';

type Side = 'seller' | 'buyer';

export default function OrdersList({ onOpen }: { onOpen: (order: Order, peerId: string) => void }) {
  const os = useOrders();
  const ms = useMessaging();
  const selling = useMemo(() => ordersAs(os, 'seller'), [os]);
  const buying = useMemo(() => ordersAs(os, 'buyer'), [os]);
  const both = selling.length > 0 && buying.length > 0;
  const [side, setSide] = useState<Side>(() => (selling.length || !buying.length ? 'seller' : 'buyer'));
  const glideRef = useGlide(side);
  const list = (both ? (side === 'seller' ? selling : buying) : selling.length ? selling : buying);
  const asSeller = both ? side === 'seller' : selling.length > 0;

  /* Names for the other person on each row. */
  const peerIds = useMemo(() => [...new Set(list.map(o => (o.sellerId === os.me ? o.buyerId : o.sellerId)))], [list, os.me]);
  useEffect(() => { ensurePeersFor(peerIds); }, [peerIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (os.status === 'loading' && !list.length) {
    return (
      <div className="ord-list" aria-busy="true" aria-label="Loading orders">
        {[0, 1, 2].map(i => <span key={i} className="dm-skel" style={{ height: 60, borderRadius: 14 }} />)}
      </div>
    );
  }

  if (!list.length) {
    return (
      <div className="ord-empty">
        <Package size={22} strokeWidth={1.8} aria-hidden="true" />
        <p>No orders yet. When someone orders one of your items, or you order something, it shows up here.</p>
      </div>
    );
  }

  const open = list.filter(o => isOpen(o.status));
  const closed = list.filter(o => !isOpen(o.status));

  return (
    <div className="ord-list">
      {both && (
        <div className="segmented ord-sides" ref={glideRef}>
          <button type="button" onClick={() => setSide('seller')} aria-pressed={side === 'seller'} data-active={side === 'seller' || undefined}>
            Selling · {selling.length}
          </button>
          <button type="button" onClick={() => setSide('buyer')} aria-pressed={side === 'buyer'} data-active={side === 'buyer' || undefined}>
            Buying · {buying.length}
          </button>
        </div>
      )}
      {open.length > 0 && <Group title="Open" orders={open} asSeller={asSeller} me={os.me} peers={ms.peers} onOpen={onOpen} />}
      {closed.length > 0 && <Group title="Finished" orders={closed} asSeller={asSeller} me={os.me} peers={ms.peers} onOpen={onOpen} />}
    </div>
  );
}

function Group({ title, orders, asSeller, me, peers, onOpen }: {
  title: string; orders: Order[]; asSeller: boolean; me: string | null;
  peers: ReturnType<typeof useMessaging>['peers']; onOpen: (order: Order, peerId: string) => void;
}) {
  return (
    <section aria-label={`${title} orders`}>
      <h3 className="ord-group">{title}</h3>
      <ul className="ord-rows">
        {orders.map(o => {
          const peerId = o.sellerId === me ? o.buyerId : o.sellerId;
          const name = peers[peerId]?.name ?? 'Wecycle member';
          const waiting = (o.sellerId === me && o.status === 'requested') || (o.buyerId === me && o.status === 'ready');
          return (
            <li key={o.id}>
              <button type="button" className="ord-row" onClick={() => onOpen(o, peerId)}>
                {o.photoUrl
                  ? <img src={o.photoUrl} alt="" draggable={false} loading="lazy" />
                  : <span className="ord-thumb-ph" aria-hidden="true"><Package size={16} strokeWidth={1.8} /></span>}
                <span className="ord-row-text">
                  <span className="ord-row-title">{o.title}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</span>
                  <span className="ord-row-sub">{asSeller ? `from ${name}` : `by ${name}`} · {inboxTime(o.updatedAt)}</span>
                </span>
                <span className="ord-pill" data-status={o.status} data-waiting={waiting || undefined}>{STATUS_LABEL[o.status]}</span>
                <ChevronRight size={16} strokeWidth={2} className="ord-row-chev" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
