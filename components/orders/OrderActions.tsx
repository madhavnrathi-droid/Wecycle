'use client';

/* What can be done with an order, wherever the order is shown — the card in a
 * chat, a row in the store's list, the full order sheet. One component, so a
 * seller marking an order ready from the list and from the chat get the same
 * button, the same panel and the same feedback.
 *
 * The rules come from lib/orders/model.ts; this only asks them. */

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Check, X, MessageCircle, FileText } from '@/lib/icons';
import { orderStep, pickupCodeFor, roleIn, useOrders, type Order, type StepExtras } from '../../lib/orders/store';
import {
  actionsFor, primaryAction, isOpen, STAGES, STATUS_LABEL, ACTION_LABEL, PICKUP_MAX, REASON_MAX,
  type OrderAction,
} from '../../lib/orders/model';
import { markListingSold } from '../../lib/liveData';
import { SwapText } from './Pop';
import { haptics } from '../../lib/haptics';
import { moments } from '../../lib/moments';
import { track, EVT } from '../../lib/analytics';

type Panel = null | 'menu' | 'done' | 'cancel' | 'details';

export interface OrderActionsProps {
  order: Order;
  me: string;
  peerFirst: string;
  /** card: inside the chat card · row: one compact button in a list · sheet: the full order sheet */
  variant: 'card' | 'row' | 'sheet';
  /** Open the chat with the other person (rows and the sheet). */
  onMessage?: () => void;
  /** Open the full order sheet (the chat card's "Order details"). */
  onOpenDetails?: () => void;
  /** A step that needs a panel (handover code, cancel reason) was asked for
   *  from a compact row — the row hands it to the sheet. */
  onNeedsPanel?: (action: OrderAction) => void;
  /** Open this panel straight away (the sheet, opened from a row's button). */
  initialPanel?: OrderAction | null;
}

const PANEL_ACTIONS = new Set<OrderAction>(['done', 'cancel', 'details']);

const dateInputValue = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The five-step line. In the sheet it carries labels; elsewhere it is a
 *  thin bar whose filled segments slide in from the left. */
export function OrderSteps({ order, labelled }: { order: Order; labelled?: boolean }) {
  if (order.status === 'cancelled') return null;
  const stage = STAGES.indexOf(order.status);
  return (
    <ol className={`ord-steps${labelled ? ' ord-steps--labelled' : ''}`} aria-label={`Order progress: ${STATUS_LABEL[order.status]}`}>
      {STAGES.map((s, i) => (
        <li key={s} data-on={i <= stage || undefined} aria-current={i === stage ? 'step' : undefined} style={{ ['--i' as string]: i }}>
          <i aria-hidden="true" />
          {labelled ? <span>{STATUS_LABEL[s]}</span> : <span className="ord-sr">{STATUS_LABEL[s]}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function OrderActions({ order, me, peerFirst, variant, onMessage, onOpenDetails, onNeedsPanel, initialPanel }: OrderActionsProps) {
  const os = useOrders();
  const role = roleIn(order, me);
  const open = isOpen(order.status);
  const [panel, setPanel] = useState<Panel>(initialPanel && PANEL_ACTIONS.has(initialPanel) ? initialPanel as Panel : null);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const showCode = role === 'buyer' && open && order.status !== 'requested' && variant !== 'row';
  const code = os.codes[order.id] ?? null;
  useEffect(() => { if (showCode && !code) void pickupCodeFor(order.id); }, [showCode, code, order.id]);

  /* A step taken elsewhere — by the other person, or from another screen —
     closes whatever panel was open for the old state. */
  const lastStatus = useRef(order.status);
  useEffect(() => {
    if (lastStatus.current !== order.status) { setPanel(null); setError(null); }
    lastStatus.current = order.status;
  }, [order.status]);

  const run = async (action: OrderAction, extras: StepExtras = {}): Promise<boolean> => {
    setBusy(action); setError(null);
    const res = await orderStep(order.id, action, extras);
    setBusy(null);
    if (!res.ok) {
      moments.failed(rootRef.current);
      setError(res.message);
      track(EVT.order_step_failed, { action, role, code: res.code ?? 'unknown' });
      return false;
    }
    if (action === 'done' || action === 'received') {
      moments.sold();
      setStamp(true);
      window.setTimeout(() => setStamp(false), 1400);
    } else haptics.success();
    track(EVT.order_step, { action, role, verified: !!extras.code, from: variant });
    setPanel(null);
    return true;
  };

  const primary = primaryAction(order.status, role);
  const others = actionsFor(order.status, role).filter(a => a !== primary);

  const pick = (a: OrderAction) => {
    haptics.selection();
    if (PANEL_ACTIONS.has(a)) {
      if (variant === 'row' && onNeedsPanel) { onNeedsPanel(a); return; }
      setPanel(a as Panel); setError(null); return;
    }
    void run(a);
  };

  /* ── A row: one button and a chat shortcut, nothing that grows ── */
  if (variant === 'row') {
    return (
      <div className="ord-row-actions" ref={rootRef} onClick={e => e.stopPropagation()}>
        {stamp && <div className="ord-stamp ord-stamp--sm" aria-hidden="true"><Check size={18} strokeWidth={3} /></div>}
        {primary && (
          <button type="button" className="ord-press ord-btn ord-btn--sm" onClick={() => pick(primary)} disabled={!!busy} aria-busy={busy === primary}>
            <SwapText text={ACTION_LABEL[primary]} />
          </button>
        )}
        {onMessage && (
          <button type="button" className="ord-press ord-icon-btn ord-icon-btn--sm" onClick={() => { haptics.selection(); onMessage(); }} aria-label={`Message ${peerFirst}`}>
            <MessageCircle size={16} strokeWidth={2} />
          </button>
        )}
        {error && <span className="ord-error ord-error--row" role="alert">{error}</span>}
      </div>
    );
  }

  const inPanel = panel === 'done' || panel === 'cancel' || panel === 'details';
  const menuActions: Array<OrderAction | 'details-sheet'> = [
    ...others,
    ...(variant === 'card' && onOpenDetails ? ['details-sheet' as const] : []),
  ];

  return (
    <div className={`ord-actions-wrap${variant === 'sheet' ? ' ord-actions-wrap--sheet' : ''}`} ref={rootRef}>
      {stamp && (
        <div className="ord-stamp" aria-hidden="true"><Check size={22} strokeWidth={3} /></div>
      )}
      {!inPanel && (primary || menuActions.length > 0 || showCode || (variant === 'sheet' && onMessage)) && (
        <div className="ord-actions">
          {primary && (
            <button type="button" className="ord-press dm-btn ord-btn" onClick={() => pick(primary)} disabled={!!busy} aria-busy={busy === primary}>
              <SwapText text={ACTION_LABEL[primary]}>{busy === primary ? '…' : ACTION_LABEL[primary]}</SwapText>
            </button>
          )}
          {showCode && (
            <span className="ord-code" aria-label={code ? `Pickup code ${code.split('').join(' ')}` : 'Pickup code loading'}>
              Pickup code <b>{code ?? '····'}</b>
            </span>
          )}
          {variant === 'sheet' && onMessage && (
            <button type="button" className="ord-press dm-btn dm-btn--soft ord-btn" onClick={() => { haptics.selection(); onMessage(); }}>
              <MessageCircle size={16} strokeWidth={2} /> Message {peerFirst}
            </button>
          )}
          {menuActions.length > 0 && (
            <div className="ord-more-wrap">
              <button
                type="button" className="ord-press ord-icon-btn"
                aria-label="More order options" aria-haspopup="menu" aria-expanded={panel === 'menu'}
                onClick={() => { haptics.selection(); setPanel(p => (p === 'menu' ? null : 'menu')); }}
              >
                <MoreHorizontal size={18} strokeWidth={2} />
              </button>
              {panel === 'menu' && (
                <OrderMenu
                  actions={menuActions} role={role}
                  onPick={a => { if (a === 'details-sheet') { setPanel(null); onOpenDetails?.(); } else pick(a); }}
                  onClose={() => setPanel(null)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {panel === 'done' && (
        <DonePanel
          peerFirst={peerFirst} busy={busy === 'done'} error={error} role={role}
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
      {error && !inPanel && <p className="ord-error" role="alert">{error}</p>}
    </div>
  );
}

/* ── "More" ─────────────────────────────────────────────────────────────── */

function OrderMenu({ actions, role, onPick, onClose }: {
  actions: Array<OrderAction | 'details-sheet'>; role: 'buyer' | 'seller';
  onPick: (a: OrderAction | 'details-sheet') => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } return; }
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement)?.closest?.('.ord-more-wrap')) onClose();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close, true);
    requestAnimationFrame(() => ref.current?.querySelector('button')?.focus());
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close, true); };
  }, [onClose]);
  const label = (a: OrderAction | 'details-sheet') =>
    a === 'details-sheet' ? 'Order details'
      : a === 'details' && role === 'seller' ? 'Ready date & pickup'
      : ACTION_LABEL[a];
  return (
    <div className="dm-menu ord-menu" role="menu" ref={ref}>
      {actions.map(a => (
        <button key={a} type="button" role="menuitem" data-danger={a === 'cancel' || undefined} onClick={() => onPick(a)}>
          {a === 'details-sheet' && <FileText size={16} strokeWidth={1.9} />}
          {label(a)}
        </button>
      ))}
    </div>
  );
}

/* ── Handed over: the code is proof, never a gate ───────────────────────── */

function DonePanel({ peerFirst, role, busy, error, onCancel, onDone }: {
  peerFirst: string; role: 'buyer' | 'seller'; busy: boolean; error: string | null;
  onCancel: () => void; onDone: (code: string, alsoSold: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [sold, setSold] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const typed = code.replace(/\D/g, '');
  return (
    <form className="ord-panel" onSubmit={e => { e.preventDefault(); onDone(typed.length === 4 ? typed : '', sold); }}>
      {role === 'seller' && (
        <>
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
        </>
      )}
      {error && <p className="ord-error" role="alert">{error}</p>}
      <div className="ord-panel-row">
        <button type="submit" className="ord-press dm-btn ord-btn" disabled={busy || (typed.length > 0 && typed.length < 4)}>
          <Check size={16} strokeWidth={2.4} /> {typed.length === 4 ? 'Check code and finish' : 'Finish'}
        </button>
        <button type="button" className="ord-press dm-btn dm-btn--soft ord-btn" onClick={onCancel}>Back</button>
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
        <button type="submit" className="ord-press dm-btn dm-btn--soft ord-btn ord-btn--danger" disabled={busy}>
          <X size={16} strokeWidth={2.4} /> {verb}
        </button>
        <button type="button" className="ord-press dm-btn ord-btn" onClick={onKeep}>Keep it</button>
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
        <button type="submit" className="ord-press dm-btn ord-btn" disabled={busy}>Save</button>
        <button type="button" className="ord-press dm-btn dm-btn--soft ord-btn" onClick={onClose}>Back</button>
      </div>
    </form>
  );
}
