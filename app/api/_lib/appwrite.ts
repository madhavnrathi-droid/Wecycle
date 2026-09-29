/**
 * The four things every Wecycle API route needs, in one place.
 *
 * `_lib` is a private folder: the app router never turns it into a route, and
 * scripts/build-cap.sh moves the whole of app/api aside for the native export,
 * so nothing here can reach a phone's bundle — which is the point, because the
 * server key is read here.
 *
 * See HANDOFF.md → "Adding an API" for why each of these exists. In short:
 *   callerId  — identify the caller from a JWT, never from the request body
 *   cors      — the native apps are cross-origin, and the JWT header preflights
 *   aw        — the server key, used only after the caller is known
 *   q         — Appwrite's query-string encoding for list calls
 */

import { NextResponse } from 'next/server';

export const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? '';
export const PROJECT = process.env.NEXT_PUBLIC_APPWRITE_PROJECT ?? '';
export const DB = process.env.NEXT_PUBLIC_APPWRITE_DB ?? 'wecycle';
const API_KEY = process.env.APPWRITE_API_KEY ?? '';

export const serverConfigured = (): boolean => !!(ENDPOINT && PROJECT && API_KEY);

export type Args = Record<string, unknown>;
export type Row = Record<string, unknown>;

/* ── CORS ──────────────────────────────────────────────────────────────────
 *
 * The native builds are a static export served from the WebView's own origin —
 * https://localhost on Android, capacitor://localhost on iOS — so every call
 * from a phone is cross-origin. Without these headers the browser blocks the
 * response and the feature fails on mobile while working on the website.
 *
 * Allow-Origin is * rather than a list because the native origins are
 * localhost, which is also every developer's machine, so a list buys nothing.
 * It is safe because routes authorise on the Appwrite JWT in a header, never on
 * a cookie: a hostile page can make a browser send the request but cannot
 * obtain a JWT to put in it. Credentials are deliberately not allowed.
 *
 * X-Appwrite-JWT is not a CORS-simple header, so the preflight is required. */
export const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Appwrite-JWT',
  'Access-Control-Max-Age': '86400',
};

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...cors } });

/** A privileged call. Only ever made after the caller has been identified. */
export async function aw(method: string, path: string, body?: unknown) {
  try {
    const res = await fetch(ENDPOINT + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT,
        'X-Appwrite-Key': API_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return { ok: res.ok, status: res.status, json: (await res.json().catch(() => null)) as Row | null };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

/** Appwrite list queries, as the REST API wants them in the query string. */
export const q = (...items: unknown[]): string =>
  '?' + items.map(i => `queries[]=${encodeURIComponent(JSON.stringify(i))}`).join('&');

/** Rows from a list response, typed loosely. */
export const rowsOf = (r: { json: Row | null }): Row[] =>
  ((r.json?.rows as Row[] | undefined) ?? []);

/** Who is calling, according to Appwrite — not according to the request body. */
export async function callerId(jwt: string | null): Promise<string | null> {
  if (!jwt) return null;
  try {
    const res = await fetch(`${ENDPOINT}/account`, {
      headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-JWT': jwt },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { $id?: string };
    return u?.$id ?? null;
  } catch {
    return null;
  }
}
