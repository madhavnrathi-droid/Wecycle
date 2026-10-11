'use client';

/* The order, pinned to the top of the chat between its buyer and seller.
 *
 * One line of status in the reader's words, a thin five-step line, one
 * obvious next step, and everything else one tap away under "More". Nothing
 * here blocks the chat underneath: the card is a shortcut for the steps
 * people would otherwise type out, not a gate in front of the conversation.
 *
 * The rules for what each side can do live in lib/orders/model.ts; the card
 * only asks it. */

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Package, Check, X } from 'lucide-react';
import type { DeepLinkPost } from '../../lib/liveData';
import { usePostPreview } from '../../lib/messaging/useMessaging';
import { orderStep, pickupCodeFor, roleIn, useOrders, type Order } from '../../lib/orders/store';
import {
  actionsFor, primaryAction, statusLine, isOpen, STAGES, STATUS_LABEL, ACTION_LABEL, PICKUP_MAX, REASON_MAX,
  rupees, orderTotal, type OrderAction,
} from '../../lib/orders/model';
import { markListingSold } from '../../lib/liveData';
import { haptics } from '../../lib/haptics';
import { moments } from '../../lib/moments';
import { track, EVT } from '../../lib/analytics';

type Panel = null | 'menu' | 'done' | 'cancel' | 'details';

interface OrderCardProps {
  order: Order;
  me: string;
  peerFirst: string;
  onOpenPost: (post: DeepLinkPost) => void;
}

const dateInputValue = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function OrderCard({ order, me, peerFirst, onOpenPost }: OrderCardProps) {
  const os = useOrders();
  const role = roleIn(order, me);
  const open = isOpen(order.status);
  const preview = usePostPreview({ type: 'listing', id: order.listingId, title: order.title });
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  /* The buyer's pickup code, from the moment the seller has said yes. */
  const showCode = role === 'buyer' && open && order.status !== 'requested';
  const code = os.codes[order.id] ?? null;
  useEffect(() => { if (showCode && !code) void pickupCodeFor(order.id); }, [showCode, code, order.id]);

  /* A step taken elsewhere closes whatever panel was open for the old state. */
  useEffect(() => { setPanel(null); setError(null); }, [order.status]);

  const run = async (action: OrderAction, extras: Parameters<typeof orderStep>[2] = {}): Promise<boolean> => {
    setBusy(action); setError(null);
    const res = await orderStep(order.id, action, extras);
    setBusy(null);
    if (!res.ok) {
      moments.failed(cardRef.current);
      setError(res.message);
      track(EVT.order_step_failed, { action, role, code: res.code ?? 'unknown' });
      return false;
    }
    if (action === 'done' || action === 'received') moments.sold();
    else haptics.success();
    track(EVT.order_step, { action, role, verified: !!extras.code });
    setPanel(null);
    return true;
  };

  const primary = primaryAction(order.status, role);
  const others = actionsFor(order.status, role).filter(a => a !== primary);
  const pick = (a: OrderAction) => {
    haptics.selection();
    if (a === 'done' || a === 'cancel' || a === 'details') { setPanel(a); setError(null); return; }
    void run(a);
  };

  const stage = STAGES.indexOf(order.status);
  const total = orderTotal(order.price, order.quantity);
  const cancelledByMe = order.cancelledBy === me;
  const titleLine = `${order.title}${order.quantity > 1 ? ` × ${order.quantity}` : ''}`;

  return (
    <div className="ord-card" ref={cardRef} data-status={order.status}>
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
            <span className="ord-card-sub">
              {statusLine({ status: order.status, ready_by: order.readyBy, pickup: order.pickup, verified: order.verified }, role, peerFirst, cancelledByMe)}
            </span>
          </span>
        </button>
        <span className="ord-pill" data-status={order.status}>{STATUS_LABEL[order.status]}</span>
      </div>

      {order.status !== 'cancelled' && (
        <ol className="ord-steps" aria-label={`Order progress: ${STATUS_LABEL[order.status]}`}>
          {STAGES.map((s, i) => (
            <li key={s} data-on={i <= stage || undefined} aria-current={i === stage ? 'step' : undefined}>
              <span className="ord-sr">{STATUS_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      )}

      {(primary || others.length > 0 || showCode) && panel !== 'done' && panel !== 'cancel' && panel !== 'details' && (
        <div className="ord-actions">
          {primary && (
            <button type="button" className="dm-btn ord-btn" onClick={() => pick(primary)} disabled={!!busy} aria-busy={busy === primary}>
              {busy === primary ? '…' : ACTION_LABEL[primary]}
            </button>
          )}
          {showCode && (
            <span className="ord-code" aria-label={code ? `Pickup code ${code.split('').join(' ')}` : 'Pickup code loading'}>
              Pickup code <b>{code ?? '····'}</b>
            </span>
          )}
          {total != null && total > 0 && !primary && !showCode && <span className="ord-amount">{rupees(total)}</span>}
          {others.length > 0 && (
            <div className="ord-more-wrap">
              <button
                type="button" className="ord-icon-btn"
                aria-label="More order options" aria-haspopup="menu" aria-expanded={panel === 'menu'}
                onClick={() => { haptics.selection(); setPanel(p => (p === 'menu' ? null : 'menu')); }}
              >
                <MoreHorizontal size={18} strokeWidth={2} />
              </button>
              {panel === 'menu' && (
                <OrderMenu actions={others} role={role} onPick={pick} onClose={() => setPanel(null)} />
              )}
            </div>
          )}
        </div>
      )}

      {panel === 'done' && (
        <DonePanel
          peerFirst={peerFirst} busy={busy === 'done'} error={error}
          onCancel={() => { setPanel(null); setError(null); }}
          onDone={async (typed, alsoSold) => {
            const ok = await run('done', typed ? { code: typed } : {});
            if (ok && alsoSold) void markListingSold(order.listingId).catch(() => { /* the order is done either way */ });
          }}
        />
      )}
      {panel === 'cancel' && (
        <CancelPanel
          role={role} fresh={order.status === 'requested'} busy={busy === 'cancel'} error={error}
          onKeep={() => { setPanel(null); setError(null); }}
          onCancel={reason => { void run('cancel', reason ? { reason } : {}); }}
        />
      )}
      {panel === 'details' && (
        <DetailsPanel
          role={role} order={order} busy={busy === 'details'} error={error}
          onClose={() => { setPanel(null); setError(null); }}
          onSave={(readyBy, pickup) => { void run('details', { ...(role === 'seller' ? { ready_by: readyBy } : {}), pickup }); }}
        />
      )}
      {error && !panel && <p className="ord-error" role="alert">{error}</p>}
    </div>
  );
}

/* ── "More" ─────────────────────────────────────────────────────────────── */

function OrderMenu({ actions, role, onPick, onClose }: { actions: OrderAction[]; role: 'buyer' | 'seller'; onPick: (a: OrderAction) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } return; }
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close, true);
    requestAnimationFrame(() => ref.current?.querySelector('button')?.focus());
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close, true); };
  }, [onClose]);
  return (
    <div className="dm-menu ord-menu" role="menu" ref={ref}>
      {actions.map(a => (
        <button key={a} type="button" role="menuitem" data-danger={a === 'cancel' || undefined} onClick={() => onPick(a)}>
          {a === 'details' && role === 'seller' ? 'Ready date & pickup' : ACTION_LABEL[a]}
        </button>
      ))}
    </div>
  );
}

/* ── Handed over: the code is proof, never a gate ───────────────────────── */

function DonePanel({ peerFirst, busy, error, onCancel, onDone }: {
  peerFirst: string; busy: boolean; error: string | null;
  onCancel: () => void; onDone: (code: string, alsoSold: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [sold, setSold] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const typed = code.replace(/\D/g, '');
  return (
    <form className="ord-panel" onSubmit={e => { e.preventDefault(); onDone(typed.length === 4 ? typed : '', sold); }}>
      <label className="ord-field" htmlFor="ord-code-in">
        <span>{peerFirst}’s pickup code <em>optional</em></span>
        <input
          id="ord-code-in" ref={ref} inputMode="numeric" autoComplete="one-time-code" maxLength={4}
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4 digits" className="ord-code-input"
        />
      </label>
      <label className="ord-check">
        <input type="checkbox" checked={sold} onChange={e => setSold(e.target.checked)} />
        <span>Also mark the post as sold</span>
      </label>
      {error && <p className="ord-error" role="alert">{error}</p>}
      <div className="ord-panel-row">
        <button type="submit" className="dm-btn ord-btn" disabled={busy || (typed.length > 0 && typed.length < 4)}>
          <Check size={16} strokeWidth={2.4} /> {typed.length === 4 ? 'Check code and finish' : 'Finish'}
        </button>
        <button type="button" className="dm-btn dm-btn--soft ord-btn" onClick={onCancel}>Back</button>
      </div>
    </form>
  );
}

function CancelPanel({ role, fresh, busy, error, onKeep, onCancel }: {
  role: 'buyer' | 'seller'; fresh: boolean; busy: boolean; error: string | null;
  onKeep: () => void; onCancel: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const verb = role === 'seller' && fresh ? 'Decline' : 'Cancel order';
  return (
    <form className="ord-panel" onSubmit={e => { e.preventDefault(); onCancel(reason.trim()); }}>
      <label className="ord-field" htmlFor="ord-reason">
        <span>Reason <em>optional</em></span>
        <input id="ord-reason" maxLength={REASON_MAX} value={reason} onChange={e => setReason(e.target.value)}
          placeholder={role === 'seller' ? 'Out of stock, too busy this week…' : 'Changed my mind, found one…'} autoFocus />
      </label>
      {error && <p className="ord-error" role="alert">{error}</p>}
      <div className="ord-panel-row">
        <button type="submit" className="dm-btn dm-btn--soft ord-btn ord-btn--danger" disabled={busy}>
          <X size={16} strokeWidth={2.4} /> {verb}
        </button>
        <button type="button" className="dm-btn ord-btn" onClick={onKeep}>Keep it</button>
      </div>
    </form>
  );
}

function DetailsPanel({ role, order, busy, error, onClose, onSave }: {
  role: 'buyer' | 'seller'; order: Order; busy: boolean; error: string | null;
  onClose: () => void; onSave: (readyBy: string | null, pickup: string) => void;
}) {
  const [date, setDate] = useState(dateInputValue(order.readyBy));
  const [pickup, setPickup] = useState(order.pickup ?? '');
  return (
    <form className="ord-panel" onSubmit={e => {
      e.preventDefault();
      /* Noon local, so the date is the same day in every timezone it is read in. */
      onSave(date ? new Date(`${date}T12:00:00`).toISOString() : null, pickup.trim());
    }}>
      {role === 'seller' && (
        <label className="ord-field" htmlFor="ord-ready">
          <span>Ready by <em>optional</em></span>
          <input id="ord-ready" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      )}
      <label className="ord-field" htmlFor="ord-pickup">
        <span>Pickup <em>optional</em></span>
        <input id="ord-pickup" maxLength={PICKUP_MAX} value={pickup} onChange={e => setPickup(e.target.value)}
          placeholder="Library steps, after 5" autoFocus={role === 'buyer'} />
      </label>
      {error && <p className="ord-error" role="alert">{error}</p>}
      <div className="ord-panel-row">
        <button type="submit" className="dm-btn ord-btn" disabled={busy}>Save</button>
        <button type="button" className="dm-btn dm-btn--soft ord-btn" onClick={onClose}>Back</button>
      </div>
    </form>
  );
}
