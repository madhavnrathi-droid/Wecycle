/* ── How long an event stays up ────────────────────────────────────────────
 *
 * One rule, used by every reader (lib/liveData) and by the server purge
 * (app/api/_lib/deletion.ts), so the two can never disagree about whether an
 * event is over.
 *
 * AN EVENT IS UP UNTIL IT ENDS, not until it starts. The old rule hid an event
 * the moment its starts_at passed and then deleted it on the next app open:
 *
 *   • a 10am–6pm fest vanished at 10am, as it opened;
 *   • a date-only event is stored at 00:00 of its day, so it vanished at the
 *     midnight BEFORE it — never visible on the day itself;
 *   • a post made from the app with the form's default time (today, the next
 *     half hour) vanished within the hour. That is how Kya Scene's reposts,
 *     whose real dates were on the posters, were taken down early.
 *
 * The end is ends_at when there is a real one. Without it, an event runs to the
 * end of the day it starts on — a talk at 4pm with no end time is still on at
 * 6pm, and "today" is the honest answer to "until when?".
 *
 * Days are India days (IST, UTC+5:30, no DST), not the device's or the
 * server's: Wecycle's campuses are all in India, the server runs in UTC, and
 * the client and the purge must agree to the millisecond.
 */

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;
export const IST_OFFSET_MS = 330 * MINUTE;

/** How long an ended event stays in the database, hidden, before the purge
 *  deletes it. Long enough that a wrong date can be put right — or a post
 *  taken down by mistake restored — instead of being gone the next morning. */
export const PURGE_GRACE_MS = 7 * DAY_MS;

/** Rows dated further back than this are not "expired", they are a bad write
 *  (a 1970 timestamp) — left for someone to look at, never purged. */
export const PURGE_FLOOR_MS = 365 * DAY_MS;

/** The last millisecond of the IST calendar day containing `ms`. */
export function endOfIstDay(ms: number): number {
  const day = Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
  return (day + 1) * DAY_MS - IST_OFFSET_MS - 1;
}

/** When the event is over, in ms — or null when its start is not a date. */
export function eventEndMs(startsAt: string | null | undefined, endsAt?: string | null): number | null {
  const start = startsAt ? Date.parse(startsAt) : NaN;
  if (!Number.isFinite(start)) return null;
  const end = endsAt ? Date.parse(endsAt) : NaN;
  /* An end at or before the start is not an end — treat it as missing. */
  if (Number.isFinite(end) && end > start) return end;
  return endOfIstDay(start);
}

/** Whether the event should be off every list. An unreadable start counts as
 *  over: there is nothing true to show about it. */
export function eventIsOver(startsAt: string | null | undefined, endsAt?: string | null, now = Date.now()): boolean {
  const end = eventEndMs(startsAt, endsAt);
  return end === null || end <= now;
}

/** Started and not yet over — "Happening now". */
export function eventIsLive(startsAt: string | null | undefined, endsAt?: string | null, now = Date.now()): boolean {
  const start = startsAt ? Date.parse(startsAt) : NaN;
  return Number.isFinite(start) && start <= now && !eventIsOver(startsAt, endsAt, now);
}

/** Whether the purge may delete the row: over for longer than the grace, and
 *  not so old that it must be a corrupted timestamp. */
export function eventIsPurgeable(startsAt: string | null | undefined, endsAt?: string | null, now = Date.now()): boolean {
  const start = startsAt ? Date.parse(startsAt) : NaN;
  if (!Number.isFinite(start) || start < now - PURGE_FLOOR_MS) return false;
  const end = eventEndMs(startsAt, endsAt);
  return end !== null && end + PURGE_GRACE_MS < now;
}
