import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryIdOf, categoryIdsOf, matchesCategoryFilter, tagsWithCategories, cleanCategoryIds,
  categoryFilterExpr, MAX_CATEGORIES,
} from './categories';

test('a post with one category reads exactly as before', () => {
  const post = { categoryId: 'electronics', category: 'Electronics', tags: [] };
  assert.deepEqual(categoryIdsOf(post), ['electronics']);
  assert.equal(categoryIdOf(post), 'electronics');
  assert.equal(matchesCategoryFilter(post, 'electronics'), true);
  assert.equal(matchesCategoryFilter(post, 'hobbies'), false);
  assert.equal(matchesCategoryFilter(post, 'all'), true);
});

test('extra categories ride in tags and count for every filter, main first', () => {
  const camera = { categoryId: 'electronics', category: 'Electronics', tags: ['urgent', 'cat:hobbies', 'cat:art'] };
  assert.deepEqual(categoryIdsOf(camera), ['electronics', 'hobbies', 'art']);
  assert.equal(matchesCategoryFilter(camera, 'hobbies'), true);
  assert.equal(matchesCategoryFilter(camera, 'art'), true);
  assert.equal(matchesCategoryFilter(camera, 'fashion'), false);
  /* The main category is still the one the header and the ranking read. */
  assert.equal(categoryIdOf(camera), 'electronics');
});

test('label-only and retired ids still resolve, and nothing is counted twice', () => {
  /* A cached row from before the id column: only the label. */
  assert.deepEqual(categoryIdsOf({ category: 'Vehicles & Mobility', tags: ['cat:sports'] }), ['mobility', 'sports']);
  /* A retired id in a tag maps onto its live category; a duplicate of the
     main one is dropped; an unknown one is ignored. */
  assert.deepEqual(categoryIdsOf({ categoryId: 'fashion', tags: ['cat:clothing', 'cat:sports', 'cat:nonsense'] }), ['fashion', 'sports']);
});

test('never more than three, however many tags a row carries', () => {
  const row = { categoryId: 'books', tags: ['cat:art', 'cat:hobbies', 'cat:electronics', 'cat:sports'] };
  assert.equal(categoryIdsOf(row).length, MAX_CATEGORIES);
  assert.deepEqual(cleanCategoryIds(['books', 'Books & Academic', 'art', 'hobbies', 'sports']), ['books', 'art', 'hobbies']);
});

test('writing categories keeps the other tags and stores only the extras', () => {
  assert.deepEqual(tagsWithCategories(['electronics', 'hobbies'], ['urgent', 'cat:art']), ['urgent', 'cat:hobbies']);
  assert.deepEqual(tagsWithCategories(['electronics']), []);
  assert.deepEqual(tagsWithCategories([]), []);
  /* Round trip: what is written reads back as what was picked. */
  const picked = ['mobility', 'sports'];
  assert.deepEqual(categoryIdsOf({ categoryId: picked[0], tags: tagsWithCategories(picked) }), picked);
});

test('the server filter asks for the main column or the tag', () => {
  assert.equal(categoryFilterExpr('books'), 'category_id.eq.books,tags.cs.{cat:books}');
});
