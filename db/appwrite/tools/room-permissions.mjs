#!/usr/bin/env node
/**
 * room-permissions.mjs — make private rooms private in the database.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a     # needs a key with tables.write:
 *                                                      # add APPWRITE_ADMIN_KEY=… to that file
 *   node db/appwrite/tools/room-permissions.mjs          # dry run: report only
 *   node db/appwrite/tools/room-permissions.mjs --apply  # change the tables
 *   node db/appwrite/tools/room-permissions.mjs --apply --dm   # also lock DM tables
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 *
 * Rooms (lib/rooms.ts) give everything a private-room member writes the read
 * permission `label:<room>` instead of `any`. But Appwrite admits a reader if
 * EITHER the table OR the row allows it, and set-permissions.mjs gave the
 * content tables table-level read("any") so the public feed would be public.
 * While that stands, a row's own permissions cannot narrow anything: an NMIMS
 * listing is readable by everyone who asks the API (verified on production).
 * The app still filters by room, so nobody SEES another room's posts — but the
 * wall is only real once the table-level read is gone.
 *
 * Removing it is safe exactly when every row in the table already carries a
 * read permission of its own — the public ones read("any") (set-permissions
 * stamped every migrated row; the app stamps every new one), private-room ones
 * read("label:…"). This script checks that, row by row, BEFORE touching a
 * table, and skips any table where even one row depends on the table-level
 * grant — event_rsvps, for instance, whose rows are owner-readable and which
 * organisers read through the table.
 *
 * The runtime key cannot run this (no tables.write, deliberately). Use a
 * short-lived console key and delete it afterwards.
 *
 * --dm also removes create("users") from conversations and messages: only the
 * server writes those (app/api/_lib/messaging.ts), and the client already
 * ignores anything else, but there is no reason to let a client make rows the
 * app will only ever discard.
 */

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;
/* A separate line for the short-lived console key, so the runtime key in the
   same file is never overwritten and nothing has to be restored afterwards. */
const KEY = process.env.APPWRITE_ADMIN_KEY || process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || 'wecycle';
const APPLY = process.argv.includes('--apply');
const DM = process.argv.includes('--dm');

if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT and APPWRITE_KEY (source db/appwrite/appwrite.env).');
  process.exit(1);
}

/* Tables holding content a private room writes. Profiles included: an NMIMS
   member's name and campus are part of the room.

   The row check below protects the rows that EXIST. It cannot see rows the app
   will write later, so a table is only listed here if every way the app writes
   to it stamps a read permission on the row: ownerPermissions() in
   lib/appwrite/client.ts for client writes (the tables in OWNER_COLUMN), or the
   server routes for theirs. reactions and event_saves are written by the
   server readable by their owner only — fine, because only their owner ever
   reads them. event_forms is NOT listed: its rows are written with no
   permissions of their own, so attendees read registration forms through the
   table, and removing it would hide every form. */
const CANDIDATES = [
  'listings', 'requests', 'events', 'lost_found_reports', 'comments', 'profiles',
  'community_members', 'inventory_items', 'listing_responses', 'request_offers',
  'reactions', 'impact_log', 'event_saves', 'event_rsvps',
];

async function call(method, path, body) {
  const res = await fetch(ENDPOINT + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json?.message ?? ''}`);
  return json;
}

const q = (...items) => '?' + items.map(i => `queries[]=${encodeURIComponent(JSON.stringify(i))}`).join('&');

/** A row readable on its own — by everyone, or by a room. */
const ownsItsRead = perms => (perms ?? []).some(p => p === 'read("any")' || /^read\("label:[a-z0-9]+"\)$/i.test(p));

async function rowsMissingOwnRead(table) {
  let missing = 0, total = 0, cursor = null;
  for (;;) {
    const page = await call('GET', `/tablesdb/${DB}/tables/${table}/rows` + q(
      { method: 'limit', values: [100] },
      ...(cursor ? [{ method: 'cursorAfter', values: [cursor] }] : []),
    ));
    for (const r of page.rows) { total++; if (!ownsItsRead(r.$permissions)) missing++; }
    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }
  return { missing, total };
}

async function setTablePermissions(table, permissions) {
  const t = await call('GET', `/tablesdb/${DB}/tables/${table}`);
  if (!APPLY) return;
  await call('PUT', `/tablesdb/${DB}/tables/${table}`, {
    name: t.name, permissions, rowSecurity: true, enabled: t.enabled ?? true,
  });
}

let changed = 0, skipped = 0;
for (const table of CANDIDATES) {
  const t = await call('GET', `/tablesdb/${DB}/tables/${table}`);
  const perms = t.$permissions ?? [];
  const tableReads = perms.filter(p => p === 'read("any")' || p === 'read("users")');
  if (!tableReads.length) { console.log(`  ok      ${table.padEnd(20)} no table-level read`); continue; }
  const { missing, total } = await rowsMissingOwnRead(table);
  if (missing) {
    skipped++;
    console.log(`  SKIP    ${table.padEnd(20)} ${missing}/${total} rows readable only through the table — leaving ${tableReads.join(', ')}`);
    continue;
  }
  const next = perms.filter(p => !tableReads.includes(p));
  await setTablePermissions(table, next);
  changed++;
  console.log(`  ${APPLY ? 'CHANGED' : 'would  '} ${table.padEnd(20)} ${total} rows all carry their own read → table ${JSON.stringify(next)}`);
}

if (DM) {
  for (const table of ['conversations', 'messages']) {
    const t = await call('GET', `/tablesdb/${DB}/tables/${table}`);
    const next = (t.$permissions ?? []).filter(p => p !== 'create("users")');
    await setTablePermissions(table, next);
    console.log(`  ${APPLY ? 'CHANGED' : 'would  '} ${table.padEnd(20)} → table ${JSON.stringify(next)}`);
  }
}

console.log(`\n${APPLY ? 'Applied' : 'Dry run'}: ${changed} table(s) ${APPLY ? 'changed' : 'to change'}, ${skipped} skipped.`);
if (!APPLY) console.log('Re-run with --apply to make the change.');
