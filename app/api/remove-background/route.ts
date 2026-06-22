/* eslint-disable @next/next/no-server-import-in-page */
/**
 * POST /api/remove-background
 *
 * Server-side proxy to remove.bg's API. The API key lives in
 * `REMOVE_BG_API_KEY` (server-only — NEVER `NEXT_PUBLIC_`) so the
 * browser never sees it.
 *
 * Request:  multipart/form-data with a single `image` field (the
 *           original photo Blob from the photo picker).
 * Response: image/png bytes (the transparent cutout) on success,
 *           JSON { error } on failure.
 *
 * Limits enforced here, not on the client:
 *   - 12 MB upload cap (remove.bg's own limit is 12 MB).
 *   - Only image/* content types accepted.
 *
 * Costs: remove.bg charges credits per call. Free tier is 50/month.
 * We keep this behind the explicit "Remove background" toggle so users
 * who never enable it don't consume credits.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
/* No caching — every call is a unique image. */
export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024; /* 12 MB */

export async function POST(req: Request) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey || apiKey.startsWith('PASTE_YOUR_')) {
    return NextResponse.json(
      { error: 'Background removal is not configured on this server.' },
      { status: 503 },
    );
  }

  /* Same-origin guard. This endpoint spends paid remove.bg credits, so we
     refuse callers that aren't our own app — other sites hotlinking it, or
     drive-by scripts with no Origin/Referer. The in-app photo picker always
     runs same-origin, so legitimate use is unaffected. (Auth + per-user rate
     limiting is the stronger follow-up; this is the zero-regression guard.) */
  const host = req.headers.get('host');
  const srcRef = req.headers.get('origin') || req.headers.get('referer');
  let srcHost: string | null = null;
  if (srcRef) { try { srcHost = new URL(srcRef).host; } catch { /* malformed */ } }
  if (!host || srcHost !== host) {
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

  /* Forward to remove.bg. They accept multipart, so we just rebuild the
     form data with the same Blob and add the size hint. `size=auto` lets
     them choose the right output dimensions; bump to `full` for higher
     quality at the cost of more credits. */
  const upstreamForm = new FormData();
  upstreamForm.append('image_file', file, 'image');
  upstreamForm.append('size', 'auto');
  /* `type=auto` — remove.bg picks the best segmentation profile. Could
     specialize per category (e.g. `product` for marketplace listings)
     but auto works well across photos / items / people. */
  upstreamForm.append('type', 'auto');

  let upstream: Response;
  try {
    upstream = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Accept': 'image/png,application/json' },
      body: upstreamForm,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Network error contacting remove.bg: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    /* Pass through a sanitised version of remove.bg's error so debugging
       is possible without leaking internals. They return JSON like
       { errors: [{ title, code }] }. */
    let detail: string | undefined;
    try {
      const json = (await upstream.clone().json()) as { errors?: Array<{ title?: string }> };
      detail = json.errors?.[0]?.title;
    } catch {
      /* not json — ignore */
    }
    return NextResponse.json(
      { error: detail ?? `remove.bg returned ${upstream.status}.` },
      { status: upstream.status },
    );
  }

  /* Stream PNG bytes back to the client. */
  const pngBytes = await upstream.arrayBuffer();
  return new NextResponse(pngBytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      /* remove.bg sends credit-balance headers — surface them so the
         client can warn when the quota's nearly out. */
      'X-Credits-Charged':   upstream.headers.get('X-Credits-Charged')   ?? '',
      'X-Credits-Total':     upstream.headers.get('X-Credits-Total')     ?? '',
      'X-Type':              upstream.headers.get('X-Type')              ?? '',
    },
  });
}
