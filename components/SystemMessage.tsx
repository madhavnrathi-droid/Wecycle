'use client';

/* ── The remote status strip ───────────────────────────────────────────────
 *
 * Whatever /api/status is currently saying, at the top of the feed. Empty and
 * invisible the rest of the time, which is almost always.
 *
 * Distinct from <OutageNotice>, and the difference is worth keeping straight:
 * OutageNotice is the SEPTEMBER 2026 outage, hard-coded, carrying the UXINDIA
 * codes with it because that is what people came for. This is the general
 * channel — any message, set from Vercel without a deploy of the app, and the
 * only one the installed Android and iOS builds can ever receive.
 *
 * It reuses the .outage-* styles so the two read as one voice rather than two
 * different apps telling you bad news in two different shapes.
 */

import { useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useSystemMessage, dismissMessage } from '../lib/appStatus';

export default function SystemMessage() {
  const msg = useSystemMessage();
  const [hidden, setHidden] = useState(false);

  if (!msg || hidden) return null;

  const Icon = msg.severity === 'info' ? Info : AlertTriangle;
  const canDismiss = msg.dismissible !== false;

  return (
    <section style={{ padding: '0 16px 12px' }}>
      {/* role="status", not "alert": it is true from the moment the screen
          loads rather than an interruption, so it should be announced when the
          screen reader reaches it, not over whatever it is already saying. */}
      <div className={`outage-notice sysmsg sysmsg--${msg.severity}`} role="status">
        <Icon size={16} strokeWidth={2.2} aria-hidden="true" className="outage-icon" />
        <div className="outage-copy" style={{ flex: 1 }}>
          <p className="outage-title">{msg.title}</p>
          {msg.body ? <p className="outage-sub">{msg.body}</p> : null}
        </div>
        {canDismiss ? (
          <button
            type="button"
            className="sysmsg-x"
            aria-label="Dismiss"
            onClick={() => { dismissMessage(msg.id); setHidden(true); }}
          >
            <X size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
