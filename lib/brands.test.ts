import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRANDS, brandByHandle, brandForUser, sectionsFor, picksFor, priceLine, rangeLine, fromPrice, brandShareMessage, type Brand } from './brands';
import { isBusinessRole, cleanShopName, shopNameOf, shopFields, BUSINESS_ROLE, SHOP_NAME_MAX } from './shops';
import type { MarketplaceItem } from './mockData';

const foku = BRANDS.find(b => b.handle === 'foku') as Brand;
/* A made-up brand, so these tests check the rules rather than one brand's
   current range. */
const maker: Brand = {
  ...foku,
  handle: 'maker', name: 'Maker', ownerId: 'maker-owner',
  collections: [
    { id: 'marbled', label: 'Marbled bangles', match: /marbled/i },
    { id: 'swirl', label: 'Swirl bangles', match: /swirl/i },
    { id: 'floral', label: 'Floral-print bangles', match: /floral.*bangle|bangle.*floral/i },
    { id: 'journals', label: 'Keychain journals', match: /journal/i },
    { id: 'frames', label: 'Photo frames', match: /frame/i },
  ],
  picks: [],
};

const item = (id: string, title: string, price = 100, extra: Partial<MarketplaceItem> = {}): MarketplaceItem => ({
  id, title, price, listingType: 'sell', isClosed: false, isRequest: false,
  ...extra,
} as MarketplaceItem);

const stock = [
  item('a', 'Rainbow marbled bangle'),
  item('b', 'Black marbled bangle — pink & gold swirls'),
  item('c', 'Red & black swirl bangle'),
  item('d', 'Floral-print bangle — silver rim'),
  item('e', 'Keychain journal — olive floral fabric', 70),
  item('f', 'Photo frame — lilac block-print fabric', 150),
  item('g', 'Hand-painted mug', 250),
  item('h', 'Yellow & cream swirl bangle', 100, { isClosed: true }),
];

test('a brand is found by its owner and by its handle, in any case', () => {
  assert.equal(brandForUser(foku.ownerId)?.handle, 'foku');
  assert.equal(brandForUser('someone-else'), null);
  assert.equal(brandForUser(null), null);
  assert.equal(brandByHandle('FOKU ')?.name, 'Foku');
  assert.equal(brandByHandle(''), null);
});

test('every brand handle is URL-safe and unique, and every owner has one brand', () => {
  const handles = BRANDS.map(b => b.handle);
  assert.equal(new Set(handles).size, handles.length);
  for (const h of handles) assert.match(h, /^[a-z0-9]+$/);
  const owners = BRANDS.map(b => b.ownerId);
  assert.equal(new Set(owners).size, owners.length);
});

test('sections follow the collections, first match wins, sold goes last', () => {
  const s = sectionsFor(maker, stock);
  assert.deepEqual(s.map(x => x.id), ['marbled', 'swirl', 'floral', 'journals', 'frames', 'more', 'sold']);
  /* "Black marbled … swirls" is marbled, not swirl — the more specific
     collection is listed first. */
  assert.deepEqual(s[0].items.map(i => i.id), ['a', 'b']);
  assert.deepEqual(s.find(x => x.id === 'more')?.items.map(i => i.id), ['g']);
  assert.equal(s.find(x => x.id === 'more')?.label, 'More from Maker');
  assert.deepEqual(s.at(-1)?.items.map(i => i.id), ['h']);
});

test('Foku belongs to Karan and groups his range: tees, then crop tops', () => {
  assert.equal(brandForUser('20266094-ea7c-4023-b452-d03371722045')?.handle, 'foku');
  assert.equal(brandForUser('6b4e2316-692c-4857-aa7e-0b1238913413'), null);
  const s = sectionsFor(foku, [
    item('t1', 'Oversized T-shirt — Deja Boo', 799),
    item('c1', 'Crop top', 499),
    item('t2', 'Oversized tee', 799),
  ]);
  assert.deepEqual(s.map(x => [x.id, x.items.map(i => i.id)]), [['tees', ['t1', 't2']], ['tops', ['c1']]]);
  /* Two collections still make four picks, from both. */
  const range = [item('t1', 'Oversized T-shirt'), item('c1', 'Crop top'), item('t2', 'Oversized T-shirt #2'), item('t3', 'Oversized T-shirt #3'), item('t4', 'Oversized T-shirt #4')];
  assert.deepEqual(picksFor({ ...foku, picks: [] }, range).map(i => i.id), ['t1', 'c1', 't2', 't3']);
});

test('requests never show up on a brand page', () => {
  const s = sectionsFor(maker, [item('r', 'Looking for a bangle', 0, { isRequest: true })]);
  assert.deepEqual(s, []);
});

test('picks keep the brand order, skip sold ones, and top up from the range', () => {
  const withPick: Brand = { ...maker, picks: ['f', 'h', 'e'] };
  assert.deepEqual(picksFor(withPick, stock).map(i => i.id), ['f', 'e', 'a', 'c']);
  const none: Brand = { ...maker, picks: [] };
  assert.deepEqual(picksFor(none, stock, 3).map(i => i.id), ['a', 'c', 'd']);
});

test('the price line is honest about what is for sale', () => {
  assert.equal(priceLine(stock), '₹70–₹250');
  assert.equal(priceLine([item('x', 'Swirl bangle'), item('y', 'Swirl bangle')]), '₹100 each');
  assert.equal(priceLine([item('x', 'Swirl bangle', 1500)]), '₹1,500');
  assert.equal(priceLine([item('x', 'Free bangle', 0, { listingType: 'free' })]), null);
  assert.equal(priceLine([item('x', 'Sold bangle', 100, { isClosed: true })]), null);
});

test('the range line names what is in the shop and nothing else', () => {
  const s = sectionsFor(maker, stock);
  assert.equal(rangeLine(s), 'Marbled bangles, swirl bangles, floral-print bangles, keychain journals and photo frames');
  assert.equal(rangeLine(sectionsFor(maker, [item('f', 'Photo frame')])), 'Photo frames');
  assert.equal(rangeLine([]), '');
});

test('a shop is role + name; anything else is not a shop', () => {
  assert.equal(isBusinessRole(BUSINESS_ROLE), true);
  assert.equal(isBusinessRole('student business '), true);
  assert.equal(isBusinessRole('Member'), false);
  assert.equal(isBusinessRole(null), false);
  assert.equal(shopNameOf({ role: BUSINESS_ROLE, bio: '  Foku  ' }), 'Foku');
  /* An onboarded collective's description is not a shop name. */
  assert.equal(shopNameOf({ role: null, bio: 'A collective of makers' }), null);
});

test('shop names are cleaned and capped, and turning a shop off clears it', () => {
  assert.equal(cleanShopName('  Sanvi’s\n  crochet  '), 'Sanvi’s crochet');
  assert.equal(cleanShopName('x'.repeat(80))?.length, SHOP_NAME_MAX);
  assert.equal(cleanShopName('   '), null);
  assert.equal(cleanShopName(42), null);
  assert.deepEqual(shopFields('business', ' Foku '), { role: BUSINESS_ROLE, bio: 'Foku' });
  assert.deepEqual(shopFields('member', 'Foku'), { role: null, bio: null });
});

test('the share message says what is in the store now, and ends on the link', () => {
  const range = [item('t1', 'Oversized T-shirt', 799), item('c1', 'Crop top', 499), item('s', 'Sold tee', 299, { isClosed: true })];
  assert.equal(fromPrice(range), '₹499');
  const msg = brandShareMessage(foku, range, 'Karan Seth');
  assert.equal(msg, [
    'Foku is on Wecycle 👕',
    'If clothes were a canvas — oversized T-shirts and crop tops by Karan, from ₹499. Order straight from the store:',
    'https://wecycle.page/b/foku',
  ].join('\n'));
  /* Short enough that WhatsApp shows it whole. */
  assert.ok(msg.length < 220);
  /* With nothing for sale it still reads, and still links. */
  assert.equal(brandShareMessage(foku, []), 'Foku is on Wecycle 👕\nIf clothes were a canvas. Order straight from the store:\nhttps://wecycle.page/b/foku');
});

test('every brand has a share-card gradient with a stop per colour', () => {
  for (const b of BRANDS) {
    assert.equal(b.palette.lush.colors.length, b.palette.lush.stops.length);
    assert.ok(b.palette.lush.colors.length >= 2 && b.palette.lush.colors.length <= 4);
  }
});
