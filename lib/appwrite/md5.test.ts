/* The browser md5 must agree with node:crypto, exactly.
 *
 *   npm test
 *
 * This is not a formality. The 141 photos already in Appwrite Storage are keyed
 * by md5 of "<bucket>/<path>", so a digest that disagrees by one bit points
 * every existing photo at a file that is not there — and the page renders, the
 * console is clean, and the images are simply missing.
 *
 * A compact hand-rolled md5 written for storageAdapter.ts matched on NONE of
 * six vectors while producing perfectly plausible hex. That is why this file
 * exists rather than a comment saying the implementation is standard.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { md5, fileIdFor } from './storageAdapter';

const node = (s: string) => createHash('md5').update(s).digest('hex');

test('matches node:crypto on the RFC 1321 vectors', () => {
  for (const v of ['', 'a', 'abc', 'message digest',
                   'abcdefghijklmnopqrstuvwxyz',
                   'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789']) {
    assert.equal(md5(v), node(v), `md5(${JSON.stringify(v)})`);
  }
});

test('matches on real storage paths, including the block boundaries', () => {
  const paths = [
    'listings/3dab74f2-347a-4c09-868f-56b5de50098d/1779271124055-0.jpg',
    'listings/efe12b60-5037-4082-97b8-07677429a8d9/1787997561906-2.webp',
    'events/16f6e6e77d10/cover.png',
    'lost-found/4939df7a-355a-4dc3-8dcf-c83d9bdd6f8f/1787650839740.jpg',
  ];
  for (const p of paths) assert.equal(md5(p), node(p), p);

  /* 55, 56, 63, 64 and 65 bytes — where the padding branch changes. */
  for (const n of [54, 55, 56, 57, 63, 64, 65, 119, 120, 128]) {
    const s = 'x'.repeat(n);
    assert.equal(md5(s), node(s), `${n} bytes`);
  }
});

test('hashes UTF-8 bytes, not UTF-16 code units', () => {
  for (const v of ['café', 'naïve', '日本語', 'emoji 🙂 here']) {
    assert.equal(md5(v), node(v), v);
  }
});

test('fileIdFor reproduces the ids the migration uploaded under', () => {
  /* upload-media.mjs used md5(`${bucket}/${path}`).slice(0, 32). */
  const bucket = 'listings';
  const path = '3dab74f2-347a-4c09-868f-56b5de50098d/1779271124055-0.jpg';
  assert.equal(fileIdFor(bucket, path), node(`${bucket}/${path}`).slice(0, 32));

  const id = fileIdFor(bucket, path);
  assert.equal(id.length, 32, 'inside Appwrite\'s 36-character limit');
  assert.match(id, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'a valid Appwrite file id');
});
