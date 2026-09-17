/* ── Outage mode ───────────────────────────────────────────────────────────
 *
 * ON while the backend is unavailable and members cannot sign in.
 *
 * What it changes, and nothing else:
 *   - The home screen leads with a short notice and the UXINDIA codes, in place
 *     of the banner (which opens an event page that needs the database).
 *   - The 25% members' code is shown outright, with no sign-in gate — there is
 *     no way to sign in to pass it.
 *   - The SIGCHI 35% check asks the Next.js server (/api/sigchi) instead of the
 *     Supabase RPC. No database is touched on that path: the roster and the code
 *     live in server-only Vercel environment variables.
 *   - The sign-in screen says why it is failing and where the codes are.
 *
 * TO TURN IT OFF when the backend is back: set this to false and deploy. The
 * normal sign-in-gated flow and the RPC come straight back; nothing was
 * removed to make room for this.
 */
export const OUTAGE_MODE = true;
