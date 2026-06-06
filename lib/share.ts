'use client';

/*
 * Device-native sharing + calendar hand-off.
 *
 * Two "use what the phone offers" integrations that work TODAY in a PWA:
 *
 *   1. shareLink() — the real OS share sheet (Web Share API). On iOS/Android
 *      this is the native AirDrop/Messages/WhatsApp/etc. sheet. Falls back to
 *      copying the link to the clipboard on desktop.
 *
 *   2. addEventToCalendar() — generates a standards-compliant .ics file and
 *      hands it to the OS, which opens Apple Calendar / Google Calendar with
 *      the event pre-filled. No API keys, no integration — the device's own
 *      calendar app takes over.
 */

import { haptics } from './haptics';

export type ShareResult = 'shared' | 'copied' | 'unavailable';

interface ShareInput {
  title: string;
  text?: string;
  url?: string;
}

/** Open the native share sheet; fall back to clipboard. Returns what happened
 *  so the caller can show the right toast ("Shared!" vs "Link copied"). */
export async function shareLink(input: ShareInput): Promise<ShareResult> {
  if (typeof window === 'undefined') return 'unavailable';
  const url = input.url ?? window.location.href;
  const data: ShareData = { title: input.title, text: input.text, url };
  /* `navigator.share` / `canShare` are in the DOM lib but optional at runtime
     (desktop Chrome lacks share). Feature-detect before calling. */
  const nav = window.navigator;

  /* Native share sheet — the real iOS/Android UI. */
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      haptics.light();
      return 'shared';
    } catch (e) {
      /* User cancelling the sheet throws AbortError — treat as a no-op, not
         a failure, and don't fall through to clipboard (they chose to bail). */
      if ((e as Error).name === 'AbortError') return 'shared';
      /* Any other error → fall through to clipboard. */
    }
  }

  /* Clipboard fallback (desktop, or share unsupported). */
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      haptics.success();
      return 'copied';
    } catch { /* swallow */ }
  }
  return 'unavailable';
}

/* ── Calendar (.ics) ──────────────────────────────── */

interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  /** Event start. */
  start: Date;
  /** Optional end; defaults to start + 2h. */
  end?: Date;
  /** Stable id so re-adding updates rather than duplicates. */
  uid?: string;
}

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ. */
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape text per RFC 5545 (commas, semicolons, newlines, backslashes). */
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Build an .ics blob and hand it to the OS. The device opens its calendar
 *  app with the event pre-filled — works on iOS, Android, and desktop. */
export function addEventToCalendar(ev: CalendarEvent): boolean {
  if (typeof window === 'undefined') return false;
  const start = ev.start;
  const end = ev.end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const uid = ev.uid ?? `${icsStamp(start)}-${Math.random().toString(36).slice(2)}@wecycle.page`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wecycle//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : '',
    ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  /* CRLF line endings are required by RFC 5545; some calendar apps reject LF. */
  const ics = lines.join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  /* Trigger the download/open. iOS recognises the text/calendar MIME and
     offers "Add to Calendar"; desktop downloads the .ics. */
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  haptics.success();
  return true;
}
