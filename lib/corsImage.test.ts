import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corsFresh } from './corsImage';

test('card photos get their own cache key, per origin; local files are left alone', () => {
  assert.equal(corsFresh('https://x.io/v1/files/a/view?project=p'), 'https://x.io/v1/files/a/view?project=p&cors=app');
  assert.equal(corsFresh('https://x.io/a.jpg'), 'https://x.io/a.jpg?cors=app');
  assert.equal(corsFresh('/brands/foku/mascot.svg'), '/brands/foku/mascot.svg');
});
