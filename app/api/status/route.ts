/**
 * GET /api/status  ->  { message: SystemMessage | null }
 *
 * A message the installed apps can be told about without a store release.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT IN THE DATABASE ──────────────────────
 *
 * September 2026: the Supabase project hit its egress quota and started
 * answering 402. Sign-in stopped working. The website could say so, because
 * the notice was deployed with the web build — but the Android and iOS apps
 * had no way to be told anything at all. They bundle a web build frozen at
 * submit time and they get everything else from Supabase, which was the thing
 * that was down. There was no channel. That is the gap this closes.
 *
 * So the one rule that shapes this file:
 *
 *     THE STATUS MESSAGE MUST NOT LIVE IN ANYTHING THAT CAN BREAK WITH IT.
 *
 * A "we are having problems" banner served from the database that is having
 * the problems is not a status page, it is a second thing to explain. So this
 * route reads an environment variable, touches no database, calls nothing, and
 * is a few lines of string handling. It should be the last thing to fail.
 *
 * ── PUBLISHING A MESSAGE ────────────────────────────────────────────────────
 *
 * Set APP_STATUS in Vercel (Settings -> Environment Variables) and redeploy —
 * about a minute, versus days for an app release:
 *
 *   {"id":"2026-09-egress","severity":"warn",
 *    "title":"We're having some technical difficulties",
 *    "body":"Signing in is unavailable right now. Your UXINDIA code is below.",
 *    "platforms":["ios","android"],"dismissible":true}
 *
 * Clear it by removing the variable, or setting it to {} — anything without a
 * title is treated as no message.
 *
 * `id` matters: it is what a dismissal is remembered against. Reuse an id and
 * everyone who dismissed the old message never sees the new one. New incident,
 * new id.
 *
 * ── TARGETING ───────────────────────────────────────────────────────────────
 *
 * `platforms` and `minBuild`/`maxBuild` are filtered HERE rather than in the
 * app, because an app doing its own filtering is an app that has to already
 * understand the rule. Filtering server-side means a targeting rule invented
 * next year still works on a build shipped today: it either gets the message
 * or it does not, and either way it renders something it understands.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Platform = 'web' | 'ios' | 'android';

interface SystemMessage {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  body?: string;
  dismissible?: boolean;
  platforms?: Platform[];
  minBuild?: number;
  maxBuild?: number;
}

const cors: Record<string, string> = {
  /* The native app is a different origin (capacitor://localhost), so this has
     to be open. It returns nothing private — it is the same message shown to
     everyone, and on the website it is already on the home screen. */
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

function parse(raw: string | undefined): SystemMessage | null {
  if (!raw || !raw.trim()) return null;
  try {
    const m = JSON.parse(raw) as Partial<SystemMessage>;
    if (typeof m?.title !== 'string' || !m.title.trim()) return null;
    return {
      id: typeof m.id === 'string' && m.id.trim() ? m.id.trim() : 'status',
      severity: m.severity === 'critical' || m.severity === 'info' ? m.severity : 'warn',
      title: m.title.trim(),
      body: typeof m.body === 'string' ? m.body.trim() : undefined,
      dismissible: m.dismissible !== false,
      platforms: Array.isArray(m.platforms) ? m.platforms : undefined,
      minBuild: typeof m.minBuild === 'number' ? m.minBuild : undefined,
      maxBuild: typeof m.maxBuild === 'number' ? m.maxBuild : undefined,
    };
  } catch {
    /* Malformed JSON must read as "no message", never as a crash. During an
       incident is the worst possible time for this route to be the thing that
       throws. */
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platform = (url.searchParams.get('platform') ?? 'web') as Platform;
  const build = Number(url.searchParams.get('build') ?? '0') || 0;

  const msg = parse(process.env.APP_STATUS);

  const targeted =
    msg
    && (!msg.platforms || msg.platforms.includes(platform))
    /* build 0 means "the app did not say", which must not be silently excluded
       by a minBuild rule — an app too old to report its build is exactly the
       one most likely to need telling something. */
    && (build === 0 || msg.minBuild === undefined || build >= msg.minBuild)
    && (build === 0 || msg.maxBuild === undefined || build <= msg.maxBuild)
      ? msg
      : null;

  return NextResponse.json(
    { message: targeted },
    {
      headers: {
        ...cors,
        /* Cached at the edge for half a minute. Long enough that a launch
           spike costs almost nothing, short enough that clearing a notice
           reaches people while they are still looking at it. */
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    },
  );
}
