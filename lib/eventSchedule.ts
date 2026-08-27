/* ── Event scheduling ──────────────────────────────────────────────────────
 *
 * The date/time behaviour a calendar app has and a naive form does not.
 *
 * The old form had one date and one optional time — an event could not end.
 * Adding three more inputs naively would make it worse, not better: four
 * independent boxes is four chances to enter something contradictory, and the
 * usual answer to that is a validation error, which is friction arriving after
 * the mistake instead of design preventing it.
 *
 * So these follow Google Calendar, whose rules exist precisely so the second
 * half of the range mostly fills itself in:
 *
 *   - moving the start date moves the end date with it, keeping the span
 *   - moving the start time moves the end time with it, keeping the duration
 *   - an end before its start is corrected, never rejected
 *   - an end time earlier in the day than the start rolls to the next day,
 *     because 11pm→1am is a normal evening and not a typo
 *
 * The last one is the tell that a form was built by someone who has run an
 * event. It is also why this is a module of pure functions rather than logic
 * scattered through onChange handlers: every rule here is directly testable,
 * and they interact.
 *
 * All arithmetic is on 'YYYY-MM-DD' and 'HH:MM' strings converted to integers.
 * Deliberately not on Date objects: a Date carries a timezone, and doing span
 * maths through one is how an event booked at 00:30 lands on the previous day
 * for anyone east of the line. Only toTimestamps touches a real Date, once, at
 * the boundary where a timestamp is actually required.
 */

export interface Schedule {
  /** YYYY-MM-DD */
  startDate: string;
  /** HH:MM, or '' when allDay */
  startTime: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** HH:MM, or '' when allDay */
  endTime: string;
  allDay: boolean;
}

export type ScheduleField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'allDay';

const MINUTES_PER_DAY = 1440;

/* ── string <-> integer ─────────────────────────────── */

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function toTime(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Whole days since the epoch. Date.UTC, so the result cannot shift with the
 *  viewer's timezone the way a local-midnight Date would. */
export function toDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / (MINUTES_PER_DAY * 60 * 1000));
}

export function toDateString(dayNumber: number): string {
  const d = new Date(dayNumber * MINUTES_PER_DAY * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/* ── defaults ───────────────────────────────────────── */

/** Today, in the viewer's own timezone rather than UTC — "today" is a local
 *  idea, and a student posting at 1am should not be offered yesterday. */
export function todayString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The next clean half hour. Rounding up matters: an event is always being
 *  scheduled for later, so 14:07 should offer 14:30, never 14:00. */
export function nextHalfHour(now: Date = new Date()): string {
  return toTime((Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1) * 30);
}

/** What the form opens on: today, the next half hour, running an hour.
 *
 *  Pre-filled rather than empty, because a blank required date is the single
 *  most common reason this form used to refuse to submit — and because a
 *  default that is usually right costs one tap to correct and zero when it is
 *  right, while a blank costs a tap every single time. */
export function defaultSchedule(now: Date = new Date()): Schedule {
  /* Unwrapped, so a rollover past midnight is still visible. nextHalfHour()
     returns '00:00' at 23:40, and taking that at face value would open the form
     on a start time that has already passed TODAY — the default has to move the
     date too, not just the clock. */
  const rawStart = (Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1) * 30;
  const startDate = rawStart >= MINUTES_PER_DAY
    ? toDateString(toDayNumber(todayString(now)) + 1)
    : todayString(now);
  const startTime = toTime(rawStart);

  const end = (rawStart % MINUTES_PER_DAY) + 60;
  return {
    startDate,
    startTime,
    /* An hour past 23:00 is the next day again — the default respects the same
       rollover rule the edits do, or the form can open already invalid. */
    endDate: end >= MINUTES_PER_DAY ? toDateString(toDayNumber(startDate) + 1) : startDate,
    endTime: toTime(end),
    allDay: false,
  };
}

/* ── the rules ──────────────────────────────────────── */

/** Absolute position of a point, in minutes, so a range spanning midnight
 *  compares correctly instead of comparing 23:00 against 01:00 and losing. */
function absolute(date: string, time: string): number {
  return toDayNumber(date) * MINUTES_PER_DAY + toMinutes(time);
}

/** Apply one edit and let the rest of the range follow.
 *
 *  Returns a whole new Schedule; the caller does not reconcile anything itself.
 *  Nothing here can fail or reject — every rule corrects rather than refuses,
 *  which is what keeps the form from ever showing a date validation error. */
export function applyChange(s: Schedule, field: ScheduleField, value: string | boolean): Schedule {
  if (field === 'allDay') {
    const allDay = Boolean(value);
    if (allDay) return { ...s, allDay: true, startTime: '', endTime: '' };
    /* Coming back from all-day, restore working times rather than leaving two
       empty boxes for someone to fill in from scratch. */
    const restored = defaultSchedule();
    return { ...s, allDay: false, startTime: restored.startTime, endTime: restored.endTime };
  }

  const next = { ...s, [field]: String(value) } as Schedule;

  if (field === 'startDate') {
    /* Drag the whole event, keeping its span. Someone moving an event from
       Friday to Saturday means the event, not just its opening moment. */
    const span = toDayNumber(s.endDate) - toDayNumber(s.startDate);
    next.endDate = toDateString(toDayNumber(next.startDate) + Math.max(0, span));
    return next;
  }

  if (field === 'startTime') {
    /* Keep the duration. Pushing a 2-hour event from 4pm to 5pm should make it
       5–7, not 5–6 — the organiser moved it, they did not shorten it. */
    if (s.allDay) return next;
    const duration = Math.max(0, absolute(s.endDate, s.endTime) - absolute(s.startDate, s.startTime));
    const end = absolute(next.startDate, next.startTime) + duration;
    next.endDate = toDateString(Math.floor(end / MINUTES_PER_DAY));
    next.endTime = toTime(end);
    return next;
  }

  if (field === 'endDate') {
    /* An end before its start is a slip, not an instruction. Pull it up to the
       start rather than showing an error about it. */
    if (toDayNumber(next.endDate) < toDayNumber(next.startDate)) next.endDate = next.startDate;
    return next;
  }

  /* endTime. On a single day, an end earlier than the start means the event
     runs past midnight — 11pm to 1am is an ordinary evening, not a mistake —
     so roll the end date forward instead of correcting the time the organiser
     just deliberately typed. */
  if (!s.allDay
      && toDayNumber(next.endDate) === toDayNumber(next.startDate)
      && toMinutes(next.endTime) <= toMinutes(next.startTime)) {
    next.endDate = toDateString(toDayNumber(next.startDate) + 1);
  }
  return next;
}

/* ── display ────────────────────────────────────────── */

/** "45 min", "1 hr", "1 hr 30 min", "3 days" — the running length, shown next
 *  to the end inputs the way a calendar does, so the organiser can sanity-check
 *  the range without doing the subtraction in their head. */
export function durationLabel(s: Schedule): string | null {
  if (s.allDay) {
    const days = toDayNumber(s.endDate) - toDayNumber(s.startDate) + 1;
    return days > 1 ? `${days} days` : 'All day';
  }
  const mins = absolute(s.endDate, s.endTime) - absolute(s.startDate, s.startTime);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins} min`;
  const days = Math.floor(mins / MINUTES_PER_DAY);
  if (days >= 1) return days === 1 ? '1 day' : `${days} days`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/* ── persistence ────────────────────────────────────── */

/** The two timestamps the database stores.
 *
 *  Local-time construction is deliberate and matches what the old form did:
 *  `new Date('2026-09-01T18:00:00')` is 6pm where the organiser is standing,
 *  which is what they meant. Appending a Z here would silently reschedule every
 *  event in the country by five and a half hours.
 *
 *  endsAt is null when there is nothing meaningful to store — a single all-day
 *  date, or a range that does not actually run forward — rather than writing a
 *  timestamp equal to the start, which reads downstream as a zero-length event. */
export function toTimestamps(s: Schedule): { startsAt: string; endsAt: string | null; timeUnspecified: boolean } {
  const startsAt = new Date(`${s.startDate}T${s.allDay ? '00:00' : (s.startTime || '00:00')}:00`).toISOString();

  let endsAt: string | null = null;
  if (s.allDay) {
    if (toDayNumber(s.endDate) > toDayNumber(s.startDate)) {
      endsAt = new Date(`${s.endDate}T23:59:00`).toISOString();
    }
  } else if (s.endTime && absolute(s.endDate, s.endTime) > absolute(s.startDate, s.startTime || '00:00')) {
    endsAt = new Date(`${s.endDate}T${s.endTime}:00`).toISOString();
  }

  return { startsAt, endsAt, timeUnspecified: s.allDay || !s.startTime };
}

/** Rebuild the editable schedule from stored timestamps, for the edit form.
 *  Reads the raw ISO values, never the formatted display strings — re-parsing
 *  those is what previously blanked the organiser's edit form and rescheduled
 *  events to 1970. */
export function scheduleFromTimestamps(
  startsAt?: string | null,
  endsAt?: string | null,
  timeUnspecified?: boolean | null,
): Schedule {
  if (!startsAt) return defaultSchedule();
  const start = new Date(startsAt);
  const startDate = todayString(start);
  const allDay = Boolean(timeUnspecified);
  const startTime = allDay ? '' : toTime(start.getHours() * 60 + start.getMinutes());

  if (!endsAt) {
    return allDay
      ? { startDate, startTime: '', endDate: startDate, endTime: '', allDay: true }
      : applyChange({ startDate, startTime, endDate: startDate, endTime: startTime, allDay: false },
                    'startTime', startTime);
  }
  const end = new Date(endsAt);
  return {
    startDate,
    startTime,
    endDate: todayString(end),
    endTime: allDay ? '' : toTime(end.getHours() * 60 + end.getMinutes()),
    allDay,
  };
}
