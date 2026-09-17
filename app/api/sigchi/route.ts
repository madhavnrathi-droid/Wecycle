/**
 * POST /api/sigchi   { email }  ->  { matched: true, code, name } | { matched: false }
 *
 * The SIGCHI 35% check, answered entirely by this server function — no
 * database. Written for the backend outage, when sign-in and the Supabase RPC
 * that normally does this (claim_sigchi_offer) are unavailable, and members
 * still need their code before the event.
 *
 * ── WHERE THE ROSTER LIVES ─────────────────────────────────────────────────
 *
 * In two server-only environment variables on Vercel, never NEXT_PUBLIC_:
 *
 *   SIGCHI_ROSTER   JSON array of { e: lowercased email, n: first name }
 *   SIGCHI_CODE     the 35% code
 *
 * NOT in the repository and NOT in the client bundle, for the same reason the
 * RPC was built the way it was. The repository is public, and the roster is
 * fifty-seven real students' personal email addresses: a file in the repo would
 * publish them, and anything the browser compares against, the browser has
 * already downloaded. The only thing that ever leaves this function is one
 * answer about one address.
 *
 * Only the first name is stored, because that is all the reveal card uses
 * ("Found you, Aryan") — full names were never needed to answer the question.
 *
 * To add a member during the outage: edit SIGCHI_ROSTER in the Vercel dashboard
 * (Settings -> Environment Variables) and redeploy. Adding them to the
 * sigchi_members table as well keeps the two rosters in step for when the
 * normal path is back.
 *
 * ── WHAT PROTECTS THE ROSTER WITHOUT SIGN-IN ───────────────────────────────
 *
 * The RPC throttled on auth.uid(), and during an outage nobody has one. So this
 * throttles per IP, and every answer — hit or miss — takes at least the same
 * floor of time, so a script cannot tell a slow match from a fast miss and
 * cannot run guesses quickly.
 *
 * Both are best-effort, and honestly so: serverless instances do not share
 * memory, so a determined enumerator spread across instances gets more than the
 * limit. What remains is that confirming an address requires already knowing
 * the exact address, and the answer to a correct guess is a discount code that
 * the first member to share it in a group chat has published anyway. The thing
 * genuinely worth protecting — the list itself — never leaves the server.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── Roster, parsed once per instance ── */

type Roster = Map<string, string | null>;
let cached: { raw: string; roster: Roster } | null = null;

function roster(): Roster | null {
  const raw = process.env.SIGCHI_ROSTER;
  if (!raw) return null;
  if (cached && cached.raw === raw) return cached.roster;
  try {
    const rows = JSON.parse(raw) as Array<{ e?: unknown; n?: unknown }>;
    const map: Roster = new Map();
    for (const r of rows) {
      if (typeof r?.e !== 'string') continue;
      const email = r.e.trim().toLowerCase();
      if (!email) continue;
      map.set(email, typeof r.n === 'string' && r.n.trim() ? r.n.trim() : null);
    }
    cached = { raw, roster: map };
    return map;
  } catch {
    /* A malformed variable must fail CLOSED — answer "unavailable", never
       "matched" — and must not echo the variable into a log. */
    return null;
  }
}

/* ── Best-effort throttle ──
 *
 * Counts MISSES, not requests, and allows a lot of them. Both choices are about
 * campus Wi-Fi: a hostel network puts hundreds of students behind a handful of
 * shared addresses, so a per-IP limit on every request would let the first ten
 * people on a floor check their code and lock out the eleventh — during exactly
 * the rush before an event when it matters. Enumerating the roster is made of
 * misses; a member finding their code is mostly a hit. So a hit never counts,
 * and the ceiling is set for a crowd, not for one person. */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_MISSES = 30;
const misses = new Map<string, number[]>();

function recentMisses(ip: string, now: number): number[] {
  const recent = (misses.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length) misses.set(ip, recent); else misses.delete(ip);
  return recent;
}

function recordMiss(ip: string, now: number): void {
  const recent = recentMisses(ip, now);
  recent.push(now);
  misses.set(ip, recent);
  /* Keep the map from growing without bound on a long-lived instance. */
  if (misses.size > 5000) {
    for (const [k, v] of misses) if (!v.some(t => now - t < WINDOW_MS)) misses.delete(k);
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim();
}

/* ── Every answer takes at least this long ── */

const FLOOR_MS = 450;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function looksLikeEmail(v: string): boolean {
  if (v.length < 6 || v.length > 254 || /\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

const noStore = { 'Cache-Control': 'no-store' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  const started = Date.now();
  const finish = async (body: unknown, status = 200) => {
    const wait = FLOOR_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    return NextResponse.json(body, {
      status,
      headers: { ...noStore, ...corsHeaders },
    });
  };

  const list = roster();
  const code = process.env.SIGCHI_CODE?.trim();
  if (!list || !code) return finish({ error: 'unavailable' }, 503);

  const ip = clientIp(req);
  if (recentMisses(ip, started).length >= MAX_MISSES) {
    return finish({ error: 'throttled' }, 429);
  }

  let email = '';
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return finish({ error: 'bad-request' }, 400);
  }
  /* A malformed address is not a guess at the roster, so it costs nothing. */
  if (!looksLikeEmail(email)) return finish({ matched: false });

  if (!list.has(email)) {
    recordMiss(ip, started);
    return finish({ matched: false });
  }
  return finish({ matched: true, code, name: list.get(email) ?? null });
}
