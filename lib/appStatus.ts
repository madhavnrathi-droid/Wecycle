'use client';

/* ── The remote status message ─────────────────────────────────────────────
 *
 * Asks /api/status on launch whether there is something to tell people, and
 * hands it to <SystemMessage>. This is the channel the September 2026 outage
 * did not have: the website could say sign-in was down, because that notice
 * shipped with the web deploy, but the installed Android and iOS apps had no
 * way to be told anything at all.
 *
 * Three rules, each of which is the whole reason a line is written the way it
 * is:
 *
 * IT NEVER BLOCKS. The fetch is fired after mount, has a short timeout, and
 * every failure path ends in "no message". A status check that can hang is a
 * splash screen that can hang, which is a worse outage than the one it was
 * trying to describe.
 *
 * IT NEVER PERSISTS THE MESSAGE. Tempting, so a launch with no network still
 * shows the last notice — and wrong, because the most common moment for a
 * cached notice to appear is just after the incident is over. A stale "we are
 * having problems" is worse than silence. Only DISMISSALS are remembered.
 *
 * IT DOES NOT DEPEND ON THE DATABASE. /api/status reads an environment
 * variable and nothing else, so it keeps working when the thing it is
 * describing has stopped. See the note in app/api/status/route.ts.
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiBase } from './platform';

export interface SystemMessage {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  body?: string;
  dismissible?: boolean;
}

const TIMEOUT_MS = 5000;
const DISMISSED_KEY = 'wecycle.status.dismissed';

/* Set at build time so the server can target a message at particular builds.
   Absent is fine and means "did not say" — the route treats that as "send it
   anyway", because an app too old to report its build is the one most likely
   to need telling something. */
const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? '';

function dismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    /* Private windows and blocked site data both throw here. Not being able to
       remember a dismissal is a much smaller problem than not rendering. */
    return [];
  }
}

export function dismissMessage(id: string): void {
  try {
    const next = [...new Set([...dismissedIds(), id])].slice(-20);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch { /* see above */ }
}

export async function fetchSystemMessage(): Promise<SystemMessage | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  try {
    const qs = new URLSearchParams({ platform: Capacitor.getPlatform() });
    if (APP_BUILD) qs.set('build', APP_BUILD);

    const res = await fetch(`${apiBase()}/api/status?${qs}`, {
      signal: ctl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { message?: SystemMessage | null };
    const m = json?.message;
    if (!m || typeof m.title !== 'string' || !m.title) return null;
    return m;
  } catch {
    /* Offline, timed out, CORS, Vercel itself down — all the same answer. */
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Returns the live message, or null. Null while loading, so nothing flashes. */
export function useSystemMessage(): SystemMessage | null {
  const [msg, setMsg] = useState<SystemMessage | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSystemMessage().then((m) => {
      if (!alive || !m) return;
      if (m.dismissible !== false && dismissedIds().includes(m.id)) return;
      setMsg(m);
    });
    return () => { alive = false; };
  }, []);

  return msg;
}
