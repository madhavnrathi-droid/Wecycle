'use client';

/* The store's orders, inside Inventory.
 *
 * For a student running a shop — Sanvi's crochet, Karan's T-shirts — this is
 * the counter: who ordered what, when it came in, when it's due, and the one
 * thing to do next, right on the row. A tap opens the whole order; the chat
 * is one more tap from anywhere. Buyers get the same view of what they've
 * ordered.
 *
 * Most urgent first (lib/orders/store.ts → sortForStore): new requests, then
 * ready ones waiting to be collected, then work in hand by due date. */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Package, ShoppingBag } from 'lucide-react';
import {
  useOrders, ordersAs, sortForStore, bucketCounts, bucketOf, BUCKET_LABEL,
  type Bucket, type Order,
} from '../../lib/orders/store';
import { useMessaging } from '../../lib/messaging/useMessaging';
import { ensurePeersFor } from '../../lib/messaging/store';
import { STATUS_LABEL, isOpen, orderTotal, rupees, shortDate, type OrderAction, type Role } from '../../lib/orders/model';
import { useGlide } from '../../lib/useGlide';
import { haptics } from '../../lib/haptics';
import OrderActions from './OrderActions';
import OrderDetailSheet from './OrderDetailSheet';
import { StatusPill, PopCount } from './Pop';

const FILTERS: Bucket[] = ['all', 'new', 'active', 'ready', 'done', 'cancelled'];

/** A due date said the way people say it: "today", "tomorrow", else "Thu, 16 Oct". */
function dueLabel(iso: string, now = Date.now()): string {
  const start = (t: number) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const days = Math.round((start(Date.parse(iso)) - start(now)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return shortDate(iso);
}

/** "Today, 4:32 pm" · "Yesterday, 6:10 pm" · "Sat 11 Oct" — when an order came in. */
function placedLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const start = (t: number) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const days = Math.round((start(now) - start(d.getTime())) / 86_400_000);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function OrdersManager({ onOpenChat }: { onOpenChat: (peerId: string) => void }) {
  const os = useOrders();
  const ms = useMessaging();
  const me = os.me ?? '';
  const selling = useMemo(() => ordersAs(os, 'seller'), [os]);
  const buying = useMemo(() => ordersAs(os, 'buyer'), [os]);
  const both = selling.length > 0 && buying.length > 0;
  const [side, setSide] = useState<Role>(() => (selling.length || !buying.length ? 'seller' : 'buyer'));
  const role: Role = both ? side : selling.length ? 'seller' : buying.length ? 'buyer' : 'seller';
  const base = role === 'seller' ? selling : buying;
  const counts = useMemo(() => bucketCounts(base), [base]);
  const [filter, setFilter] = useState<Bucket>('all');
  const list = useMemo(() => sortForStore(filter === 'all' ? base : base.filter(o => bucketOf(o) === filter)), [base, filter]);
  const sideGlide = useGlide(side);
  const filterGlide = useGlide(filter);
  const [open, setOpen] = useState<{ id: string; panel: OrderAction | null } | null>(null);
  const openOrder = open ? os.orders[open.id] ?? null : null;

  /* A filter that empties (the last new order was confirmed) falls back to All. */
  useEffect(() => { if (filter !== 'all' && counts[filter] === 0) setFilter('all'); }, [filter, counts]);

  const peerIds = useMemo(() => [...new Set(base.map(o => (o.sellerId === me ? o.buyerId : o.sellerId)))], [base, me]);
  useEffect(() => { ensurePeersFor(peerIds); }, [peerIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const peerOf = (o: Order) => (o.sellerId === me ? o.buyerId : o.sellerId);
  const nameOf = (o: Order) => ms.peers[peerOf(o)]?.name ?? 'Wecycle member';
  const firstOf = (o: Order) => nameOf(o).split(/\s+/)[0];

  if (os.status === 'loading' && !base.length) {
    return (
      <div className="ord-list" aria-busy="true" aria-label="Loading orders">
        {[0, 1, 2].map(i => <span key={i} className="dm-skel" style={{ height: 76, borderRadius: 16 }} />)}
      </div>
    );
  }

  return (
    <div className="ord-list">
      {both && (
        <div className="segmented ord-sides" ref={sideGlide}>
          <button type="button" onClick={() => { haptics.selection(); setSide('seller'); setFilter('all'); }} aria-pressed={side === 'seller'} data-active={side === 'seller' || undefined}>
            Selling
          </button>
          <button type="button" onClick={() => { haptics.selection(); setSide('buyer'); setFilter('all'); }} aria-pressed={side === 'buyer'} data-active={side === 'buyer' || undefined}>
            Buying
          </button>
        </div>
      )}

      {base.length > 0 && (
        <div className="segmented segmented--scroll ord-filters" ref={filterGlide} role="group" aria-label="Show orders">
          {FILTERS.filter(f => f === 'all' || counts[f] > 0).map(f => (
            <button
              key={f} type="button"
              onClick={() => { haptics.selection(); setFilter(f); }}
              aria-pressed={filter === f} data-active={filter === f || undefined}
              aria-label={`${BUCKET_LABEL[f]}, ${counts[f]}`}
            >
              {BUCKET_LABEL[f]}
              <PopCount value={counts[f]} hot={(f === 'new' || f === 'ready') && counts[f] > 0} />
            </button>
          ))}
        </div>
      )}

      {!base.length ? (
        <div className="ord-empty">
          <ShoppingBag size={22} strokeWidth={1.8} aria-hidden="true" />
          <p>
            No orders yet. When someone orders from your store you’ll see who it’s from, when it came in and what they
            asked for — right here, with the next step one tap away.
          </p>
        </div>
      ) : (
        <ul className="ord-mlist" key={`${role}-${filter}`}>
          {list.map((o, i) => {
            const total = orderTotal(o.price, o.quantity);
            const overdue = isOpen(o.status) && !!o.readyBy && Date.parse(o.readyBy) < Date.now() - 12 * 3_600_000;
            const waiting = (role === 'seller' && o.status === 'requested') || (role === 'buyer' && o.status === 'ready');
            return (
              <li key={o.id} className="ord-mrow" data-waiting={waiting || undefined} style={{ ['--i' as string]: Math.min(i, 8) }}>
                <button type="button" className="ord-mrow-main" onClick={() => { haptics.selection(); setOpen({ id: o.id, panel: null }); }}
                  aria-label={`${o.title}, ${STATUS_LABEL[o.status]}, ${role === 'seller' ? 'from' : 'by'} ${nameOf(o)}, placed ${placedLabel(o.createdAt)} — open order`}>
                  {o.photoUrl
                    ? <img src={o.photoUrl} alt="" draggable={false} loading="lazy" />
                    : <span className="ord-thumb-ph" aria-hidden="true"><Package size={16} strokeWidth={1.8} /></span>}
                  <span className="ord-mrow-text">
                    <span className="ord-mrow-top">
                      <span className="ord-row-title">{o.title}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</span>
                      {total != null && total > 0 && <span className="ord-mrow-amt">{rupees(total)}</span>}
                    </span>
                    <span className="ord-row-sub">
                      <b>{nameOf(o)}</b> · {placedLabel(o.createdAt)}
                    </span>
                    <span className="ord-mrow-meta">
                      <StatusPill status={o.status} small />
                      {o.status === 'ready' && o.pickup ? (
                        <span className="ord-due">Pickup · {o.pickup}</span>
                      ) : o.readyBy && isOpen(o.status) && o.status !== 'ready' && (
                        <span className="ord-due" data-overdue={overdue || undefined}>{overdue ? `Overdue · was due ${dueLabel(o.readyBy)}` : `Ready by ${dueLabel(o.readyBy)}`}</span>
                      )}
                      {o.status === 'done' && o.verified && <span className="ord-due">Code checked</span>}
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="ord-row-chev" aria-hidden="true" />
                </button>
                <OrderActions
                  order={o} me={me} peerFirst={firstOf(o)} variant="row"
                  onMessage={() => onOpenChat(peerOf(o))}
                  onNeedsPanel={a => setOpen({ id: o.id, panel: a })}
                />
              </li>
            );
          })}
          {!list.length && <li className="ord-empty ord-empty--inline"><p>Nothing here right now.</p></li>}
        </ul>
      )}

      {openOrder && (
        <OrderDetailSheet
          order={openOrder} me={me} peerFirst={firstOf(openOrder)}
          initialPanel={open?.panel ?? null}
          onClose={() => setOpen(null)}
          onMessage={() => { const p = peerOf(openOrder); setOpen(null); onOpenChat(p); }}
        />
      )}
    </div>
  );
}
