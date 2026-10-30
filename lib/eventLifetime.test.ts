import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventEndMs, eventIsOver, eventIsLive, eventIsPurgeable, endOfIstDay, PURGE_GRACE_MS } from './eventLifetime';

const ist = (s: string) => Date.parse(`${s}+05:30`);

test('a date-only event is up for the whole of its day, in India', () => {
  /* Stored at 00:00 IST on 31 Oct — the old rule hid it at that midnight. */
  const starts = new Date(ist('2026-10-31T00:00:00')).toISOString();
  assert.equal(eventEndMs(starts, null), ist('2026-10-31T23:59:59.999'));
  assert.equal(eventIsOver(starts, null, ist('2026-10-31T09:00:00')), false);
  assert.equal(eventIsOver(starts, null, ist('2026-10-31T23:30:00')), false);
  assert.equal(eventIsOver(starts, null, ist('2026-11-01T00:00:01')), true);
});

test('a timed event with no end stays up for the rest of its day, not just until it starts', () => {
  const starts = new Date(ist('2026-11-02T16:00:00')).toISOString();
  assert.equal(eventIsOver(starts, null, ist('2026-11-02T18:00:00')), false);
  assert.equal(eventIsLive(starts, null, ist('2026-11-02T18:00:00')), true);
  assert.equal(eventIsLive(starts, null, ist('2026-11-02T15:00:00')), false);
});

test('a real end time wins, across days', () => {
  const starts = new Date(ist('2026-11-05T10:00:00')).toISOString();
  const ends = new Date(ist('2026-11-07T18:00:00')).toISOString();
  assert.equal(eventIsOver(starts, ends, ist('2026-11-06T12:00:00')), false);
  assert.equal(eventIsOver(starts, ends, ist('2026-11-07T18:00:01')), true);
});

test('an end before the start is ignored, not trusted', () => {
  const starts = new Date(ist('2026-11-05T10:00:00')).toISOString();
  const ends = new Date(ist('2026-11-05T09:00:00')).toISOString();
  assert.equal(eventEndMs(starts, ends), endOfIstDay(Date.parse(starts)));
});

test('an unreadable start is never shown and never purged', () => {
  assert.equal(eventIsOver('not a date', null), true);
  assert.equal(eventIsPurgeable('not a date', null), false);
  assert.equal(eventIsPurgeable(null, null), false);
});

test('the purge waits a week after the end, and never touches a 1970 row', () => {
  const starts = new Date(ist('2026-10-20T10:00:00')).toISOString();
  const end = eventEndMs(starts, null)!;
  assert.equal(eventIsPurgeable(starts, null, end + 1), false);
  assert.equal(eventIsPurgeable(starts, null, end + PURGE_GRACE_MS - 1), false);
  assert.equal(eventIsPurgeable(starts, null, end + PURGE_GRACE_MS + 1), true);
  assert.equal(eventIsPurgeable('1970-01-01T00:00:00.000Z', null, Date.parse('2026-10-30T00:00:00Z')), false);
});

test('an undated partner post (starts now + 7 days) stays up for the whole week', () => {
  const now = ist('2026-10-30T12:00:00');
  const starts = new Date(now + 7 * 86_400_000).toISOString();
  assert.equal(eventIsOver(starts, null, now + 6 * 86_400_000), false);
  assert.equal(eventIsOver(starts, null, now + 7 * 86_400_000), false);
  assert.equal(eventIsOver(starts, null, now + 8 * 86_400_000), true);
});
