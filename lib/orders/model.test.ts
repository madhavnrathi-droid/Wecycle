import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionsFor, canDo, nextStatus, primaryAction, requestText, updateText, statusLine,
  parseHistory, appendHistory, updateMessageIds, cleanText, clampQuantity, isOrderable,
  HISTORY_MAX, type OrderStatus,
} from './model';

test('a seller can move an open order to any other stage, forwards or back', () => {
  assert.deepEqual(actionsFor('requested', 'seller'), ['confirm', 'making', 'ready', 'done', 'cancel', 'details']);
  assert.ok(canDo('ready', 'seller', 'making'), 'back from ready to making');
  assert.ok(canDo('making', 'seller', 'confirm'), 'back from making to confirmed');
  assert.ok(!canDo('ready', 'seller', 'ready'), 'not to the stage it is already at');
});

test('either side can finish or cancel an open order, and only the seller reopens', () => {
  for (const s of ['requested', 'confirmed', 'making', 'ready'] as OrderStatus[]) {
    assert.ok(canDo(s, 'seller', 'done'), `seller finishes from ${s}`);
    assert.ok(canDo(s, 'buyer', 'received'), `buyer finishes from ${s}`);
    assert.ok(canDo(s, 'seller', 'cancel') && canDo(s, 'buyer', 'cancel'), `both cancel from ${s}`);
  }
  assert.deepEqual(actionsFor('done', 'seller'), ['reopen']);
  assert.deepEqual(actionsFor('cancelled', 'seller'), ['reopen']);
  assert.deepEqual(actionsFor('done', 'buyer'), []);
});

test('a buyer can never move the seller’s side of an order', () => {
  for (const a of ['confirm', 'making', 'ready', 'done', 'reopen'] as const) {
    for (const s of ['requested', 'confirmed', 'making', 'ready', 'done', 'cancelled'] as OrderStatus[]) {
      assert.ok(!canDo(s, 'buyer', a), `buyer ${a} from ${s}`);
    }
  }
});

test('actions land where they say', () => {
  assert.equal(nextStatus('requested', 'confirm'), 'confirmed');
  assert.equal(nextStatus('making', 'received'), 'done');
  assert.equal(nextStatus('done', 'reopen'), 'confirmed');
  assert.equal(nextStatus('ready', 'details'), 'ready');
});

test('the card offers one obvious next step per side', () => {
  assert.equal(primaryAction('requested', 'seller'), 'confirm');
  assert.equal(primaryAction('making', 'seller'), 'ready');
  assert.equal(primaryAction('ready', 'seller'), 'done');
  assert.equal(primaryAction('ready', 'buyer'), 'received');
  assert.equal(primaryAction('confirmed', 'buyer'), null);
  assert.equal(primaryAction('done', 'seller'), null);
});

test('the order request reads like a first message a person would send', () => {
  assert.equal(
    requestText({ title: 'Snorlax crochet plushie', price: 850, quantity: 1, sellerFirst: 'Sanvi' }),
    'Hi Sanvi! I’d like to order Snorlax crochet plushie (₹850).',
  );
  assert.equal(
    requestText({ title: 'Rose keychain', price: 180, quantity: 3, sellerFirst: 'Sanvi', note: '  pink please  ' }),
    'Hi Sanvi! I’d like to order Rose keychain × 3 (₹540).\n\npink please',
  );
  assert.equal(requestText({ title: 'Lamp', price: null }), 'Hi! I’d like to order Lamp.');
});

test('step messages are plain sentences', () => {
  assert.equal(updateText('confirm', 'seller', { title: 'X', ready_by: '2026-10-23T12:00:00.000Z' }), 'Order confirmed ✓ · ready by Fri, 23 Oct');
  assert.equal(updateText('ready', 'seller', { title: 'Snorlax', pickup: 'Library steps' }), 'Your Snorlax is ready for pickup · Library steps');
  assert.equal(updateText('done', 'seller', { title: 'X', verified: true }), 'Handed over ✓ Code checked.');
  assert.equal(updateText('cancel', 'seller', { title: 'X', from: 'requested', reason: 'out of yarn' }), 'Sorry, I can’t take this order — out of yarn');
  assert.equal(updateText('cancel', 'buyer', { title: 'Lamp' }), 'I’ve cancelled my order for Lamp');
});

test('the status line speaks from the reader’s side', () => {
  assert.equal(statusLine({ status: 'requested' }, 'buyer', 'Sanvi'), 'Sent to Sanvi');
  assert.equal(statusLine({ status: 'requested' }, 'seller', 'Riya'), 'New order · reply when you can');
  assert.equal(statusLine({ status: 'cancelled' }, 'buyer', 'Sanvi', true), 'You cancelled this order');
  assert.equal(statusLine({ status: 'done', verified: true }, 'seller', 'Riya'), 'Handed over · code checked');
});

test('history survives bad input and stays bounded', () => {
  assert.deepEqual(parseHistory('not json'), []);
  assert.deepEqual(parseHistory(null), []);
  let h = parseHistory('[{"type":"requested","by":"a","at":"2026-10-11T00:00:00Z","msg":"m0"}]');
  for (let i = 0; i < HISTORY_MAX + 5; i++) h = appendHistory(h, { type: 'details', by: 'a', at: 't', msg: `m${i + 1}` });
  assert.equal(h.length, HISTORY_MAX);
  assert.ok(!updateMessageIds(h).includes('m0'));
});

test('free text is tidied and capped; quantities are sane', () => {
  assert.equal(cleanText('  Library\n steps  ', 120), 'Library steps');
  assert.equal(cleanText('a\n\n\n\nb', 50, true), 'a\n\nb');
  assert.equal(cleanText('x'.repeat(10), 4), 'xxxx');
  assert.equal(clampQuantity('3'), 3);
  assert.equal(clampQuantity(-2), 1);
  assert.equal(clampQuantity(500), 20);
});

test('only open items for sale can be ordered', () => {
  assert.ok(isOrderable({ kind: 'item', listing_type: 'sell', status: 'active' }));
  assert.ok(!isOrderable({ kind: 'item', listing_type: 'free', status: 'active' }));
  assert.ok(!isOrderable({ kind: 'opportunity', listing_type: 'sell', status: 'active' }));
  assert.ok(!isOrderable({ kind: 'item', listing_type: 'sell', status: 'completed' }));
});
