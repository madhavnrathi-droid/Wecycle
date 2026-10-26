import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packLinks, unpackLinks, cleanLinks, linkName, linkKind, MAX_LINKS } from './postLink';

test('links round-trip through the description, labels and all', () => {
  const links = [
    { url: 'https://forms.gle/abc', label: 'Register' },
    { url: 'instagram.com/kyascene.mahe' },
  ];
  const stored = packLinks('Open mic on Friday.\nBring a friend.', links);
  assert.equal(stored, 'Open mic on Friday.\nBring a friend.\n\nLinks\nRegister: https://forms.gle/abc\nhttps://instagram.com/kyascene.mahe');
  assert.deepEqual(unpackLinks(stored), {
    text: 'Open mic on Friday.\nBring a friend.',
    links: [{ url: 'https://forms.gle/abc', label: 'Register' }, { url: 'https://instagram.com/kyascene.mahe' }],
  });
});

test('a post can be links and nothing else', () => {
  const stored = packLinks('', [{ url: 'https://lu.ma/x' }]);
  assert.equal(stored, 'Links\nhttps://lu.ma/x');
  assert.deepEqual(unpackLinks(stored), { text: '', links: [{ url: 'https://lu.ma/x' }] });
});

test('no links leaves the description exactly as written', () => {
  assert.equal(packLinks('  Just text  ', []), 'Just text');
  assert.deepEqual(unpackLinks('Just text'), { text: 'Just text', links: [] });
  assert.deepEqual(unpackLinks(null), { text: '', links: [] });
});

test('prose that mentions links is never lifted out of the description', () => {
  const prose = 'Links\nare great but this line is prose https://a.com';
  /* The last line ends in a URL, but "are great..." is not a link line. */
  assert.deepEqual(unpackLinks(prose).links, []);
  const midParagraph = 'Useful stuff:\nLinks\nhttps://a.com';
  assert.deepEqual(unpackLinks(midParagraph).links, []);
  const tooMany = 'x\n\nLinks\nhttps://a.com\nhttps://b.com\nhttps://c.com\nhttps://d.com';
  assert.deepEqual(unpackLinks(tooMany).links, []);
});

test('a label with a colon in it survives', () => {
  const stored = packLinks('', [{ url: 'https://a.com/x', label: 'Day 1: talks' }]);
  assert.deepEqual(unpackLinks(stored).links, [{ url: 'https://a.com/x', label: 'Day 1: talks' }]);
});

test('cleanLinks drops junk, duplicates and anything past three', () => {
  const out = cleanLinks([
    { url: 'javascript:alert(1)' },
    { url: 'https://a.com' },
    { url: 'a.com' },
    { url: 'b.com', label: '   ' },
    { url: 'c.com', label: 'C:' },
    { url: 'd.com' },
  ]);
  assert.equal(out.length, MAX_LINKS);
  assert.deepEqual(out, [{ url: 'https://a.com/' }, { url: 'https://b.com/' }, { url: 'https://c.com/', label: 'C' }]);
});

test('well-known destinations get a name instead of a hostname', () => {
  assert.equal(linkName('https://forms.gle/abc'), 'Form');
  assert.equal(linkName('https://docs.google.com/forms/d/e/x/viewform'), 'Form');
  assert.equal(linkName('https://docs.google.com/document/d/x'), 'Google Doc');
  assert.equal(linkName('https://www.instagram.com/p/x'), 'Instagram');
  assert.equal(linkName('https://chat.whatsapp.com/abc'), 'WhatsApp');
  assert.equal(linkName('https://maps.app.goo.gl/abc'), 'Map');
  assert.equal(linkName('https://manipal.edu/events'), 'manipal.edu');
  assert.equal(linkKind('https://unstop.com/hackathon'), 'ticket');
  assert.equal(linkKind('https://manipal.edu'), 'web');
});
