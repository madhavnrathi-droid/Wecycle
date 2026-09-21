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
 * TO TURN IT ON again: set this to true and deploy. The normal sign-in-gated
 * flow and the RPC give way; nothing has to be rebuilt.
 *
 * OFF since 21 September 2026. The September outage was a Supabase egress
 * quota — 119 listing photos served to every visitor exhausted the free
 * tier's cached-egress allowance, and the project answered 402 on the API,
 * on storage and on sign-in alike. A Pro upgrade lifted it.
 *
 * Note what this flag can and cannot reach. It is COMPILED IN, so turning it
 * on only ever changed the website; the Android and iOS builds carry a web
 * bundle frozen at submit time and never saw it. The channel that does reach
 * an installed app is /api/status — see lib/appStatus.ts — which is why that
 * exists and why it reads one environment variable and touches nothing else.
 */
export const OUTAGE_MODE = false;
