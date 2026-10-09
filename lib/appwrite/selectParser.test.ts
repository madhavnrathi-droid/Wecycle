import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSelect, embedColumn } from './selectParser';

const shape = (sel: string, source: string) => {
  const walk = (es: ReturnType<typeof parseSelect>['embeds']): unknown =>
    es.map(e => ({ key: e.key, table: e.table, fk: e.fk, ...(e.children.length ? { children: walk(e.children) } : {}) }));
  return walk(parseSelect(sel, source).embeds);
};

test('a constraint hint names the column, not the table — the poster on every post', () => {
  /* The feed's own select. Before the fix the user embed parsed as a table
     called listings_user_id_fkey and every poster came back empty. */
  assert.deepEqual(shape(`
    *,
    user:profiles!listings_user_id_fkey(
      id, username, full_name, initials, avatar_url, avatar_color, role,
      is_online, contact_email_enabled, contact_whatsapp_enabled, college
    ),
    category:categories(id, label, icon)
  `, 'listings'), [
    { key: 'user', table: 'profiles', fk: 'user_id' },
    { key: 'category', table: 'categories', fk: 'category_id' },
  ]);
});

test('hints whose column is not <table>_id: organiser, actor, borrower, comment author', () => {
  assert.equal(embedColumn('events', 'profiles', 'events_organizer_id_fkey'), 'organizer_id');
  assert.equal(embedColumn('notifications', 'profiles', 'notifications_actor_id_fkey'), 'actor_id');
  assert.equal(embedColumn('inventory_items', 'profiles', 'inventory_items_borrowed_by_fkey'), 'borrowed_by');
  assert.equal(embedColumn('inventory_items', 'profiles', 'inventory_items_owner_id_fkey'), 'owner_id');
  assert.deepEqual(shape('*, author:profiles!comments_user_id_fkey(id, full_name)', 'comments'),
    [{ key: 'author', table: 'profiles', fk: 'user_id' }]);
});

test('nested embeds: Saved is saves → listing → poster and category', () => {
  assert.deepEqual(shape(`
    saved_at,
    listing:listings!saves_listing_id_fkey(
      *,
      user:profiles!listings_user_id_fkey(id, username, full_name),
      category:categories(id, label, icon)
    )
  `, 'saves'), [{
    key: 'listing', table: 'listings', fk: 'listing_id',
    children: [
      { key: 'user', table: 'profiles', fk: 'user_id' },
      { key: 'category', table: 'categories', fk: 'category_id' },
    ],
  }]);
});

test('the plain form still singularises, and a select with no embeds has none', () => {
  assert.deepEqual(shape('saved_at, listing:listings(*)', 'saves'), [{ key: 'listing', table: 'listings', fk: 'listing_id' }]);
  assert.deepEqual(shape('*, category:categories(*)', 'listings'), [{ key: 'category', table: 'categories', fk: 'category_id' }]);
  assert.deepEqual(shape('id, title, price', 'listings'), []);
});
