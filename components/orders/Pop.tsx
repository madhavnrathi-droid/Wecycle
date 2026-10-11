'use client';

/* Small pieces that move only when their value CHANGES.
 *
 * A status pill, a count, a button label: when an order moves on, the new
 * state arrives with a little weight (scale-swap — the old one is simply
 * replaced, the new one pops in on the bouncy spring). On first paint they
 * just appear, so a list of twenty orders doesn't jump twenty times when the
 * Orders tab opens. The keyframes and their tokens live in globals.css. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { STATUS_LABEL, type OrderStatus } from '../../lib/orders/model';

/** Counts how many times `value` has changed since mount — a key that remounts
 *  (and so re-animates) the element on each change, and is 0 on first paint. */
export function useChangeCount<T>(value: T): number {
  const prev = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!Object.is(prev.current, value)) { prev.current = value; setN(x => x + 1); }
  }, [value]);
  return n;
}

export function StatusPill({ status, small }: { status: OrderStatus; small?: boolean }) {
  const n = useChangeCount(status);
  return (
    <span key={n} className={`ord-pill${small ? ' ord-pill--sm' : ''}${n ? ' ord-pop' : ''}`} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PopCount({ value, hot }: { value: number; hot?: boolean }) {
  const n = useChangeCount(value);
  return <span key={n} className={`ord-count${n ? ' ord-pop' : ''}`} data-hot={hot || undefined}>{value}</span>;
}

/** Text that is replaced with a quick rise when it changes — a button's label
 *  moving from "Confirm" to "Mark ready", a status line updating. */
export function SwapText({ text, className, children }: { text: string; className?: string; children?: ReactNode }) {
  const n = useChangeCount(text);
  return <span key={n} className={`${className ?? ''}${n ? ' ord-swap' : ''}`}>{children ?? text}</span>;
}
