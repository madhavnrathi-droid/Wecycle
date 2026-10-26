import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPartnerFor, undatedStartsAt, UNDATED_DAYS, PARTNERS } from './partners';

test('Kya Scene is recognised by its account id, and nobody else is', () => {
  const kya = eventPartnerFor('6adc14f800153bd69ee6');
  assert.equal(kya?.handle, 'kyascene.mahe');
  assert.equal(kya?.ink, '#17124A');
  assert.equal(eventPartnerFor('someone-else'), null);
  assert.equal(eventPartnerFor(undefined), null);
  assert.equal(eventPartnerFor(''), null);
});

test('every partner ships a logo under public/partners and distinct card colours', () => {
  for (const p of PARTNERS) {
    assert.match(p.logo, /^\/partners\/[a-z0-9-]+\/logo\.png$/);
    assert.notEqual(p.bg.toLowerCase(), p.ink.toLowerCase());
  }
});

test('an undated post expires a week after it is posted', () => {
  const now = Date.UTC(2026, 9, 26, 9, 0, 0);
  assert.equal(new Date(undatedStartsAt(now)).getTime() - now, UNDATED_DAYS * 86_400_000);
});
