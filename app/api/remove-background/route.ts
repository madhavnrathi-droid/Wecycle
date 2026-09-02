/* eslint-disable @next/next/no-server-import-in-page */
/**
 * POST /api/remove-background
 *
 * Cuts the background out of a photo, trying several providers in order until
 * one succeeds.
 *
 * ── Why a chain and not one provider ─────────────────────────────────────
 *
 * This ran on remove.bg alone, and remove.bg's free tier is FIFTY CALLS A
 * MONTH for the whole app — not per member. So the feature worked for whoever
 * used it first and was simply broken for everyone after, until the calendar
 * turned over. Checking the account mid-month found `credits.total: 0` with 33
 * free calls left, which is the entire bug: nothing is misconfigured, the
 * quota is just tiny and shared, and a member who hits it sees "couldn't
 * remove background" on a feature the app is offering them.
 *
 * A single provider also means a single outage. Segmentation APIs are exactly
 * the kind of service that has a bad afternoon.
 *
 * So: providers are tried in order, and a provider that is out of quota or
 * having a bad day is skipped rather than fatal. Adding a key to the
 * environment is all it takes to bring a backup online — no code change — and
 * removing one takes it out of rotation.
 *
 * ── Keys ─────────────────────────────────────────────────────────────────
 *
 * All server-only (never NEXT_PUBLIC_). Set whichever you have; the route
 * uses the ones that are present, in the order listed in PROVIDERS:
 *
 *   REMOVE_BG_API_KEY    remove.bg      50 free calls/month  (currently set)
 *   PHOTOROOM_API_KEY    Photoroom      free dev tier
 *   CLIPDROP_API_KEY     ClipDrop       free tier
 *   SLAZZER_API_KEY      Slazzer        free tier
 *
 * With none set the route answers 503 and the picker keeps the original photo,
 * which is the same behaviour as before and never blocks posting.
 *
 * Limits enforced here, not on the client: 12 MB, images only.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
/* No caching — every call is a unique image. */
export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024; /* 12 MB — remove.bg's own cap, and the
                                       smallest among the providers, so one
                                       limit is honest for all of them. */

interface Provider {
  name: string;
  env: string;
  url: string;
  /** Auth header name — they all use a simple API-key header, just not the
   *  same one. */
  header: string;
  /** The multipart field the image goes in. Slazzer is the odd one out. */
  field: string;
  /** Provider-specific extras appended to the form. */
  extra?: Record<string, string>;
}

/* Order matters: first key present wins the first attempt. remove.bg leads
 * because it is the account that already exists and its output is the best of
 * the four; the rest are there so running out of it is not the end of the
 * feature. */
const PROVIDERS: ReadonlyArray<Provider> = [
  {
    name: 'remove.bg',
    env: 'REMOVE_BG_API_KEY',
    url: 'https://api.remove.bg/v1.0/removebg',
    header: 'X-Api-Key',
    field: 'image_file',
    /* size=auto lets them pick output dimensions; type=auto picks the
       segmentation profile, which works across products, people and pets. */
    extra: { size: 'auto', type: 'auto' },
  },
  {
    name: 'photoroom',
    env: 'PHOTOROOM_API_KEY',
    url: 'https://sdk.photoroom.com/v1/segment',
    header: 'x-api-key',
    field: 'image_file',
    extra: { format: 'png' },
  },
  {
    name: 'clipdrop',
    env: 'CLIPDROP_API_KEY',
    url: 'https://clipdrop-api.co/remove-background/v1',
    header: 'x-api-key',
    field: 'image_file',
  },
  {
    name: 'slazzer',
    env: 'SLAZZER_API_KEY',
    url: 'https://api.slazzer.com/v2.0/remove_image_background',
    header: 'API-KEY',
    field: 'source_image_file',
  },
];

/** A key that is absent, blank, or still the placeholder is not a key. */
function keyFor(p: Provider): string | null {
  const v = process.env[p.env];
  if (!v || !v.trim() || v.startsWith('PASTE_YOUR_')) return null;
  return v.trim();
}

/**
 * Should a failure from one provider stop the whole chain?
 *
 * The distinction that matters: a REJECTED IMAGE will be rejected by every
 * provider, so walking the chain just burns three more quotas to print the
 * same message. A provider that is out of credit, rate-limited, unauthorised
 * or broken tells us nothing about the image, so the next one gets a turn.
 */
function isImageFault(status: number): boolean {
  /* 400 bad request, 413 too large, 415 unsupported type, 422 unprocessable —
     all statements about the file we sent. 402/429 are about the account,
     401/403 about the key, 5xx about their servers. */
  return status === 400 || status === 413 || status === 415 || status === 422;
}

/** Pull the human-readable reason out of whichever error shape came back. */
async function upstreamError(res: Response): Promise<string | undefined> {
  try {
    const json = (await res.clone().json()) as {
      errors?: Array<{ title?: string; detail?: string }>;
      error?: string | { message?: string };
      message?: string;
      detail?: string;
    };
    if (json.errors?.[0]) return json.errors[0].title ?? json.errors[0].detail;
    if (typeof json.error === 'string') return json.error;
    if (json.error?.message) return json.error.message;
    return json.message ?? json.detail;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const available = PROVIDERS.filter(p => keyFor(p) !== null);
  if (available.length === 0) {
    return NextResponse.json(
      { error: 'Background removal is not configured on this server.' },
      { status: 503 },
    );
  }

  /* Same-origin guard. This endpoint spends paid credits, so we refuse callers
     that aren't our own app — other sites hotlinking it, or drive-by scripts
     with no Origin/Referer. The in-app photo picker always runs same-origin,
     so legitimate use is unaffected. */
  const host = req.headers.get('host');
  const srcRef = req.headers.get('origin') || req.headers.get('referer');
  let srcHost: string | null = null;
  if (srcRef) { try { srcHost = new URL(srcRef).host; } catch { /* malformed */ } }
  /* The Capacitor app is NOT same-origin: its WebView serves the bundled
     export from `https://localhost` (Android) / `capacitor://localhost` (iOS)
     and calls this route on the deployed origin, so a strict host match would
     403 our own app. Bare `localhost` (no port) is exactly those two schemes —
     a local dev server is `localhost:3000` and still won't match. */
  const isNativeShell = srcHost === 'localhost';
  if (!host || (srcHost !== host && !isNativeShell)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing `image` field.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 12 MB).' }, { status: 413 });
  }
  if (file.type && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only images are supported.' }, { status: 415 });
  }

  /* Walk the chain. `attempts` is for the response header — when this misfires
     in the wild, knowing which providers were tried and why each declined is
     the difference between a five-minute fix and a guess. */
  const attempts: string[] = [];
  let lastStatus = 502;
  let lastError = 'Background removal is unavailable right now.';

  for (const provider of available) {
    const apiKey = keyFor(provider)!;
    const upstreamForm = new FormData();
    upstreamForm.append(provider.field, file, 'image');
    for (const [k, v] of Object.entries(provider.extra ?? {})) upstreamForm.append(k, v);

    let upstream: Response;
    try {
      upstream = await fetch(provider.url, {
        method: 'POST',
        headers: { [provider.header]: apiKey, Accept: 'image/png,application/json' },
        body: upstreamForm,
        /* A segmentation call that hasn't answered in 30s is not going to.
           Without this a hung provider holds the request until the platform
           kills it, and the member watches a spinner instead of falling
           through to a provider that works. */
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      attempts.push(`${provider.name}:network`);
      lastStatus = 502;
      lastError = `Network error contacting ${provider.name}.`;
      console.warn('[remove-background]', provider.name, 'network', (err as Error).message);
      continue;
    }

    if (upstream.ok) {
      const pngBytes = await upstream.arrayBuffer();
      attempts.push(`${provider.name}:ok`);
      return new NextResponse(pngBytes, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
          /* Which provider actually served this, and what was tried first. */
          'X-Provider': provider.name,
          'X-Provider-Attempts': attempts.join(','),
          /* remove.bg sends credit-balance headers — surface them so the
             client can warn when the quota's nearly out. */
          'X-Credits-Charged': upstream.headers.get('X-Credits-Charged') ?? '',
          'X-Credits-Total': upstream.headers.get('X-Credits-Total') ?? '',
        },
      });
    }

    const detail = await upstreamError(upstream);
    attempts.push(`${provider.name}:${upstream.status}`);
    lastStatus = upstream.status;
    lastError = detail ?? `${provider.name} returned ${upstream.status}.`;
    console.warn('[remove-background]', provider.name, upstream.status, detail ?? '');

    /* The file itself is the problem — every other provider will say the same
       thing, so stop rather than spend three more quotas proving it. */
    if (isImageFault(upstream.status)) {
      return NextResponse.json(
        { error: detail ?? 'That image could not be processed.', attempts },
        { status: upstream.status, headers: { 'X-Provider-Attempts': attempts.join(',') } },
      );
    }
  }

  /* Everyone declined. Say so in a way a member can act on: the common case by
     far is the shared monthly quota running out, and "try again later" is a
     truthful answer that "error 402" is not. */
  const quotaExhausted = attempts.some(a => /:(402|429)$/.test(a));
  return NextResponse.json(
    {
      error: quotaExhausted
        ? 'Background removal has hit its limit for now — your photo was kept as-is.'
        : lastError,
      attempts,
    },
    { status: lastStatus, headers: { 'X-Provider-Attempts': attempts.join(',') } },
  );
}
