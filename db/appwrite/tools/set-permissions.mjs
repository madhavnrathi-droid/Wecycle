#!/usr/bin/env node
/**
 * set-permissions.mjs — what replaced Row Level Security.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a
 *   node db/appwrite/tools/set-permissions.mjs --dry-run
 *   node db/appwrite/tools/set-permissions.mjs
 *
 * Postgres had 40 RLS policies. Appwrite has table permissions plus per-row
 * permissions, and the two do not line up one to one, so this is written out
 * deliberately rather than generated from the old policies.
 *
 * ── THE TWO LAYERS ─────────────────────────────────────────────────────────
 *
 * TABLE permissions answer "who may read this table at all" and "who may
 * create a row in it". ROW permissions answer "who may change THIS row".
 * With rowSecurity on, a reader is allowed if EITHER layer permits — so table
 * read("any") is what makes the public feed public.
 *
 * Update and delete are deliberately NOT granted at table level on anything a
 * member owns. Granting update to users there would let any signed-in student
 * edit any other student's listing, which is the single worst mistake
 * available in this file. Ownership is expressed per row instead, and
 * backfilled below for the rows that came from Supabase with no permissions of
 * their own.
 *
 * ── THE TABLES NOBODY MAY TOUCH ────────────────────────────────────────────
 *
 * sigchi_members is 57 real students' personal email addresses. It was a
 * SECURITY DEFINER function in Postgres and a DENY in the SQL Server port, and
 * here it gets no client permission at all: readable only by a server key.
 * moderation_terms is the blocked-word list — publishing it publishes the
 * evasions. content_reports would tell a reporter's target who reported them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || 'wecycle';
const DRY = process.argv.includes('--dry-run');
/* --only <table> so fixing one table does not re-PATCH the other 450 rows.
   The first full run took long enough to be cut off by a dropped connection,
   and repeating all of it to reach the last table is how that repeats. */
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();

if (!DRY && (!ENDPOINT || !PROJECT || !KEY)) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT and APPWRITE_KEY.');
  process.exit(2);
}

const ANY = 'any', USERS = 'users';
const read = r => `read("${r}")`;
const create = r => `create("${r}")`;

/* Public: anyone can read, signed-in members can post. Editing and deleting
   are per row, set at creation and backfilled below. */
const PUBLIC_POSTABLE = [read(ANY), create(USERS)];
/* Reference data: everyone reads, only a server key writes. */
const PUBLIC_READONLY = [read(ANY)];
/* Signed-in members only — a profile carries a name and a college. */
const MEMBERS_READ = [read(USERS), create(USERS)];
/* Private to one member. Readable only through the row's own permissions,
   which name that member. */
const OWNER_ONLY = [create(USERS)];
/* Server key only. No client permission of any kind. */
const SERVER_ONLY = [];
/* Members may FILE a report and may not read the table. Reporting is a write
   into a box only moderators open: a reporter reading the table would see who
   else reported what, and the person reported would learn who reported them.
   The reporter still gets per-row read on their own report via
   privateToOwner in ownership.json. */
const REPORTABLE = [create(USERS)];

const TABLES = {
  categories: PUBLIC_READONLY,
  communities: PUBLIC_READONLY,
  community_milestones: PUBLIC_READONLY,
  announcements: PUBLIC_READONLY,

  listings: PUBLIC_POSTABLE,
  requests: PUBLIC_POSTABLE,
  events: PUBLIC_POSTABLE,
  lost_found_reports: PUBLIC_POSTABLE,
  comments: PUBLIC_POSTABLE,
  reactions: PUBLIC_POSTABLE,
  event_rsvps: PUBLIC_POSTABLE,
  event_saves: PUBLIC_POSTABLE,
  event_forms: PUBLIC_POSTABLE,
  listing_responses: PUBLIC_POSTABLE,
  request_offers: PUBLIC_POSTABLE,
  community_members: PUBLIC_POSTABLE,
  impact_log: PUBLIC_POSTABLE,
  inventory_items: PUBLIC_POSTABLE,

  profiles: MEMBERS_READ,

  saves: OWNER_ONLY,
  alerts: OWNER_ONLY,
  notifications: OWNER_ONLY,
  saved_searches: OWNER_ONLY,
  push_subscriptions: OWNER_ONLY,
  conversations: OWNER_ONLY,
  messages: OWNER_ONLY,
  user_blocks: OWNER_ONLY,
  event_form_responses: OWNER_ONLY,

  sigchi_members: SERVER_ONLY,
  sigchi_offer_config: SERVER_ONLY,
  sigchi_claim_attempts: SERVER_ONLY,
  moderation_terms: SERVER_ONLY,
  content_reports: REPORTABLE,
  push_queue: SERVER_ONLY,
  app_config: PUBLIC_READONLY,
  banners: PUBLIC_READONLY,
};

/* Ownership comes from db/appwrite/ownership.json — the SAME file the schema
   generator copies into lib/appwrite/generatedOwnership.ts for the app. Two
   copies of this map is how you get migrated posts that are editable and new
   posts that are not. */
const OWN = JSON.parse(readFileSync(join(HERE, '..', 'ownership.json'), 'utf8'));
const OWNER_COLUMN = OWN.ownerColumn;
const PRIVATE = new Set(OWN.privateToOwner);

async function api(method, path, body) {
  if (DRY) return { ok: true, status: 200, json: { rows: [], total: 0 } };
  for (let i = 0; ; i++) {
    const res = await fetch(ENDPOINT + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && i < 5) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  }
}

async function main() {
  console.log(`\n${DRY ? '[dry run] ' : ''}setting permissions on ${Object.keys(TABLES).length} tables\n`);
  const problems = [];
  let done = 0;

  for (const [table, perms] of Object.entries(TABLES)) {
    if (ONLY && table !== ONLY) continue;
    const res = await api('PUT', `/tablesdb/${DB}/tables/${table}`, {
      name: table, permissions: perms, rowSecurity: true, enabled: true,
    });
    if (!res.ok) { problems.push(`${table}: ${res.status} ${res.json?.message ?? ''}`); continue; }
    done++;
    const label = perms.length ? perms.join(' ') : 'server key only';
    console.log(`  ${table.padEnd(24)} ${label}`);
  }

  /* ── Backfill ownership on the rows that came from Supabase ── */
  console.log('\n  backfilling per-row ownership…');
  let rows = 0, skipped = 0;
  for (const [table, ownerCol] of Object.entries(OWNER_COLUMN)) {
    if (!(table in TABLES)) continue;
    if (ONLY && table !== ONLY) continue;
    let cursor = null;
    for (;;) {
      const q = [`{"method":"limit","values":[100]}`];
      if (cursor) q.push(`{"method":"cursorAfter","values":["${cursor}"]}`);
      const qs = q.map(x => `queries[]=${encodeURIComponent(x)}`).join('&');
      const page = await api('GET', `/tablesdb/${DB}/tables/${table}/rows?${qs}`);
      if (!page.ok) break;
      const list = page.json?.rows ?? [];
      if (!list.length) break;
      for (const row of list) {
        /* profiles is keyed BY the member — its owner is the row's own id, and
           in a raw Appwrite row that is $id, not id. Reading row.id here
           returned undefined and skipped all 99 profiles silently, which is
           exactly the shape of bug that only shows up as "why can nobody edit
           their own profile". */
        const owner = ownerCol === '$id' ? row.$id : row[ownerCol];
        if (typeof owner !== 'string' || !owner) continue;
        const perms = PRIVATE.has(table)
          ? [`read("user:${owner}")`, `update("user:${owner}")`, `delete("user:${owner}")`]
          : [`read("any")`, `update("user:${owner}")`, `delete("user:${owner}")`];
        /* Already correct — skip it. Makes a re-run after a dropped connection
           cost only the rows that were missed. */
        const have = row.$permissions ?? [];
        if (have.length === perms.length && perms.every(x => have.includes(x))) { skipped++; continue; }
        const r = await api('PATCH', `/tablesdb/${DB}/tables/${table}/rows/${row.$id}`, { permissions: perms });
        if (r.ok) rows++;
        else if (problems.length < 15) problems.push(`${table}/${row.$id}: ${r.status} ${r.json?.message ?? ''}`);
      }
      cursor = list[list.length - 1].$id;
      if (list.length < 100) break;
    }
  }
  console.log(`  ${rows} rows given an owner, ${skipped} already correct`);

  console.log(`\n  ${done} tables set, ${rows} rows`);
  if (problems.length) {
    console.log('\n  problems:');
    for (const p of problems.slice(0, 20)) console.log('    ! ' + p);
    process.exitCode = 1;
  }
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
