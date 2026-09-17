'use client';

/* ── The outage notice, with the UXINDIA codes under it ────────────────────
 *
 * Shown at the top of the home screen while OUTAGE_MODE is on (lib/outage.ts).
 *
 * Two jobs, in this order. First, say plainly that something is wrong — people
 * are trying to sign in and failing, and a screen that does not acknowledge it
 * leaves them to conclude their account is gone. Second, give them the thing
 * they most likely came for, which does not need an account: the UXINDIA codes.
 *
 * The codes are the same PartnerOfferPanel the event page uses, switched into
 * outage behaviour — the 25% shown outright, the SIGCHI 35% checked by the
 * server rather than the database — so the flow is the one people already
 * know, not a second version of it.
 *
 * Nothing here reads from Supabase. The panel's copy and the 25% code come from
 * the bundle, and the SIGCHI check goes to /api/sigchi.
 */

import { AlertTriangle } from 'lucide-react';
import PartnerOfferPanel from './PartnerOfferPanel';

export interface OutageNoticeProps {
  isSignedIn: boolean;
  memberName?: string | null;
  memberEmail?: string | null;
  /** The panel asks for this, but during an outage there is nowhere useful to
   *  send someone, so callers normally pass a no-op. */
  onRequireAuth: () => void;
}

export default function OutageNotice({
  isSignedIn, memberName, memberEmail, onRequireAuth,
}: OutageNoticeProps) {
  return (
    <section className="outage" aria-labelledby="outage-title">
      {/* role="status", not "alert". It is important but it is not an
          interruption — it is true from the moment the page loads, and an
          alert would be read over whatever the screen reader was saying. */}
      <div className="outage-notice" role="status">
        <AlertTriangle size={16} strokeWidth={2.2} aria-hidden="true" className="outage-icon" />
        <div className="outage-copy">
          <p id="outage-title" className="outage-title">
            We&rsquo;re facing some temporary technical difficulties
          </p>
          <p className="outage-sub">
            Look for your discount code below. Signing in is currently unavailable.
          </p>
        </div>
      </div>

      <PartnerOfferPanel
        isSignedIn={isSignedIn}
        memberName={memberName}
        memberEmail={memberEmail}
        onRequireAuth={onRequireAuth}
      />
    </section>
  );
}
