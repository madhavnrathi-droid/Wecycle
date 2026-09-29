import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBody, previewOf, encodeSubject, decodeSubject, isGenuine, readPerm,
  orderedPair, isValidRowId, inboxTime, dayLabel, buildTimeline, starterPrompts,
  PREVIEW_MAX, type TimelineMessage,
} from './format';

test('normalizeBody keeps line breaks, drops blank runs and invisible characters', () => {
  assert.equal(normalizeBody('  hi\r\n\r\n\r\n\r\nthere  '), 'hi\n\nthere');
  assert.equal(normalizeBody('a​b\u0007c'), 'abc');
  assert.equal(normalizeBody('line one   \nline two'), 'line one\nline two');
  assert.equal(normalizeBody('   \n\n  '), '');
});

test('previewOf folds whitespace and fits the column', () => {
  assert.equal(previewOf('hello\n\nworld'), 'hello world');
  const long = 'x'.repeat(500);
  const p = previewOf(long);
  assert.equal(Array.from(p).length, PREVIEW_MAX);
  assert.ok(p.endsWith('…'));
  /* never splits an emoji into a lone surrogate */
  const emoji = '😀'.repeat(300);
  assert.ok(!/[\uD800-\uDBFF]$/.test(previewOf(emoji).slice(0, -1)));
});

test('subject round-trips the context type and title', () => {
  const s = encodeSubject('lost_found', '  Black   wallet ');
  assert.equal(s, 'lost_found:Black wallet');
  assert.deepEqual(decodeSubject(s), { type: 'lost_found', title: 'Black wallet' });
  assert.deepEqual(decodeSubject('listing:Kettle: 1.5L'), { type: 'listing', title: 'Kettle: 1.5L' });
  assert.equal(decodeSubject('Kettle'), null);
  assert.equal(decodeSubject('bogus:Kettle'), null);
  assert.equal(decodeSubject(null), null);
});

test('isGenuine accepts only the exact two-member permission set', () => {
  const a = 'aaa', b = 'bbb';
  assert.ok(isGenuine([readPerm(a), readPerm(b)], a, b));
  assert.ok(isGenuine([readPerm(b), readPerm(a)], a, b));
  /* what a client can make: itself plus a public role */
  assert.ok(!isGenuine([readPerm(a), 'read("any")'], a, b));
  assert.ok(!isGenuine([readPerm(a), readPerm(b), `update("user:${a}")`], a, b));
  assert.ok(!isGenuine([readPerm(a)], a, b));
  assert.ok(!isGenuine(undefined, a, b));
  assert.ok(!isGenuine([readPerm(a), readPerm(a)], a, a));
});

test('orderedPair is order-independent', () => {
  assert.deepEqual(orderedPair('b', 'a'), ['a', 'b']);
  assert.deepEqual(orderedPair('a', 'b'), ['a', 'b']);
});

test('isValidRowId matches Appwrite id rules', () => {
  assert.ok(isValidRowId('m_1a2b3c'));
  assert.ok(isValidRowId('a'.repeat(36)));
  assert.ok(!isValidRowId('a'.repeat(37)));
  assert.ok(!isValidRowId('_leading'));
  assert.ok(!isValidRowId('has space'));
  assert.ok(!isValidRowId(42));
});

test('inboxTime reads like a messenger', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(inboxTime(ago(20_000), now), 'now');
  assert.equal(inboxTime(ago(5 * 60_000), now), '5m');
  assert.equal(inboxTime(ago(3 * 3_600_000), now), '3h');
  assert.equal(inboxTime(ago(2 * 86_400_000), now), '2d');
  assert.equal(inboxTime(ago(15 * 86_400_000), now), '2w');
  assert.match(inboxTime(ago(60 * 86_400_000), now), /Jul/);
  assert.equal(inboxTime(null, now), '');
  /* a clock slightly ahead of the server must not say "-1m" */
  assert.equal(inboxTime(new Date(now + 30_000).toISOString(), now), 'now');
});

test('dayLabel: Today, Yesterday, weekday, date', () => {
  const now = new Date(2026, 8, 29, 15, 0).getTime(); // Tue 29 Sep 2026, local
  assert.equal(dayLabel(new Date(2026, 8, 29, 1, 0).toISOString(), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 8, 28, 23, 0).toISOString(), now), 'Yesterday');
  assert.equal(dayLabel(new Date(2026, 8, 25, 12, 0).toISOString(), now), 'Friday');
  assert.match(dayLabel(new Date(2026, 7, 1, 12, 0).toISOString(), now), /Aug/);
  assert.match(dayLabel(new Date(2025, 7, 1, 12, 0).toISOString(), now), /2025/);
});

const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m).toISOString();
const msg = (id: string, senderId: string, createdAt: string, extra: Partial<TimelineMessage> = {}): TimelineMessage =>
  ({ id, senderId, body: id, createdAt, readAt: null, ...extra });

test('buildTimeline groups runs and places day headings', () => {
  const now = new Date(2026, 8, 29, 18, 0).getTime();
  const items = buildTimeline([
    msg('a1', 'A', at(10, 0, 28)),
    msg('b1', 'B', at(10, 1)),
    msg('b2', 'B', at(10, 2)),
    msg('b3', 'B', at(10, 3)),
    msg('a2', 'A', at(10, 4)),
  ], 'A', now);
  const shape = items.map(i => (i.kind === 'msg' ? `${i.msg.id}:${i.pos}` : `${i.kind}:${i.label}`));
  assert.deepEqual(shape, [
    'day:Yesterday', 'a1:single',
    'day:Today', 'b1:first', 'b2:middle', 'b3:last', 'a2:single',
  ]);
});

test('buildTimeline breaks a run after a long pause and marks the time', () => {
  const now = new Date(2026, 8, 29, 18, 0).getTime();
  const items = buildTimeline([
    msg('b1', 'B', at(9, 0)),
    msg('b2', 'B', at(11, 0)),
  ], 'A', now);
  assert.deepEqual(items.map(i => i.kind), ['day', 'msg', 'time', 'msg']);
  const msgs = items.filter(i => i.kind === 'msg');
  assert.deepEqual(msgs.map(i => (i.kind === 'msg' ? i.pos : '')), ['single', 'single']);
});

test('receipts: Seen/Sent only on the newest message, pending states always', () => {
  const now = new Date(2026, 8, 29, 18, 0).getTime();
  const receipts = (list: TimelineMessage[]) => buildTimeline(list, 'A', now)
    .filter(i => i.kind === 'msg').map(i => (i.kind === 'msg' ? i.receipt : null));

  assert.deepEqual(receipts([msg('a1', 'A', at(10, 0)), msg('a2', 'A', at(10, 1))]), [null, 'sent']);
  assert.deepEqual(receipts([msg('a1', 'A', at(10, 0), { readAt: at(10, 5) })]), ['seen']);
  /* once they reply, no receipt under the member's older message */
  assert.deepEqual(receipts([msg('a1', 'A', at(10, 0)), msg('b1', 'B', at(10, 1))]), [null, null]);
  assert.deepEqual(receipts([
    msg('a1', 'A', at(10, 0), { state: 'failed' }),
    msg('a2', 'A', at(10, 1), { state: 'sending' }),
  ]), ['failed', 'sending']);
});

test('starterPrompts fit the post', () => {
  assert.equal(starterPrompts(null).length, 0);
  assert.ok(starterPrompts({ type: 'listing', listingType: 'sell' }).includes('Is the price negotiable?'));
  assert.ok(starterPrompts({ type: 'listing', listingType: 'free' }).includes('Could I have it?'));
  assert.ok(starterPrompts({ type: 'lost_found', lostFoundStatus: 'found' }).includes('I think this is mine'));
  assert.ok(starterPrompts({ type: 'lost_found', lostFoundStatus: 'lost' }).includes('I think I found this'));
  assert.ok(starterPrompts({ type: 'listing', kind: 'opportunity' })[0].includes('open'));
  for (const p of starterPrompts({ type: 'event' })) assert.ok(p.length < 40);
});

test('client conversation id matches the server derivation', async () => {
  const { conversationIdFor } = await import('./conversationId');
  const { createHash } = await import('node:crypto');
  const a = '6a1b2c3d4e5f', b = 'probe9x';
  const server = createHash('md5').update(`dm|${[a, b].sort()[0]}|${[a, b].sort()[1]}`).digest('hex');
  assert.equal(conversationIdFor(a, b), server);
  assert.equal(conversationIdFor(b, a), server);
});
