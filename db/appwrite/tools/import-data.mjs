#!/usr/bin/env node
/**
 * import-data.mjs — move Wecycle from the Postgres dump into Appwrite.
 *
 *   export APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
 *   export APPWRITE_PROJECT="<project id>"
 *   export APPWRITE_KEY="<a server API key>"        # never ships to a client
 *
 *   node import-data.mjs ~/wecycle_backup.sql              # everything
 *   node import-data.mjs ~/wecycle_backup.sql --users-only
 *   node import-data.mjs ~/wecycle_backup.sql --dry-run    # prints, sends nothing
 *
 * Run db/appwrite/appwrite.json through `appwrite push` FIRST — this writes
 * rows, it does not create tables.
 *
 * ── THE PART THAT MATTERS MOST ──────────────────────────────────────────────
 *
 * Appwrite has POST /v1/users/bcrypt, an endpoint whose whole purpose is
 * importing accounts from another system with their password hashes intact.
 * Supabase stored bcrypt. So all 99 members keep the password they already
 * have, and nobody is asked to reset anything because the backend moved —
 * which, for a campus app where people signed up once at a stall, would have
 * quietly lost a large share of them.
 *
 * The Postgres UUID is reused as the Appwrite user id, so profiles.id still
 * points at the right person and every user_id in every other table still
 * resolves without a single rewrite.
 *
 * ── IT IS SAFE TO RUN TWICE ─────────────────────────────────────────────────
 *
 * Every row is written with a deterministic id, and a 409 (already exists) is
 * counted as success rather than an error. So a run that dies halfway can be
 * repeated and only does what it missed. This matters more than it sounds:
 * the alternative is discovering at row 400 that you cannot tell what landed.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * The 141 images. They are not in the dump and cannot be fetched while the
 * Supabase project is restricted — see db/sqlserver/tools/fetch-storage.mjs.
 * Once they are on disk, upload-media.mjs puts them in Appwrite Storage and
 * rewrites the URLs. Until then photo_urls still points at Supabase.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || 'wecycle';

const DRY = process.argv.includes('--dry-run');
const USERS_ONLY = process.argv.includes('--users-only');

/* Parents first. Appwrite does not enforce these as foreign keys, but the app
   reads them as if they were, and importing a listing before its author makes
   a feed row that renders as a blank card. */
const ORDER = [
  'communities', 'categories', 'moderation_terms', 'sigchi_members', 'sigchi_offer_config',
  'profiles', 'community_members',
  'listings', 'requests', 'events', 'lost_found_reports',
  'event_forms', 'event_form_responses', 'event_rsvps', 'event_saves',
  'saves', 'listing_responses', 'request_offers',
  'comments', 'reactions', 'notifications', 'alerts',
  'push_subscriptions', 'push_queue', 'saved_searches',
  'conversations', 'messages', 'user_blocks', 'content_reports',
  'inventory_items', 'impact_log', 'announcements', 'community_milestones',
  'sigchi_claim_attempts',
];

/* Composite primary keys become one deterministic id. md5 of the parts, cut to
   32 chars — inside Appwrite's 36-character limit, and the same every run, so
   re-importing updates rather than duplicates. */
const COMPOSITE = {
  saves: ['user_id', 'listing_id'],
  community_members: ['community_id', 'user_id'],
  event_rsvps: ['event_id', 'user_id'],
  event_saves: ['event_id', 'user_id'],
  user_blocks: ['blocker_id', 'target_id'],

  /* These three have no id column at all — Postgres keyed them on the value
     itself. That value cannot be the Appwrite row id: an email contains '@'
     and a moderation term can contain anything, while an Appwrite id allows
     only [a-zA-Z0-9._-] and at most 36 characters. So they are hashed the same
     way the composites are. Nothing looks a row up by id anyway — the app
     queries the email / term / key COLUMN, which is still there. */
  /* Not a composite — the row id is the hash of the endpoint so the PRIMARY KEY
     enforces "one subscription per browser". The unique index that used to do
     that cannot exist: the column is 450 characters and MySQL indexes 191. */
  push_subscriptions: ['endpoint'],

  moderation_terms: ['term'],
  sigchi_members: ['email'],
  sigchi_offer_config: ['key'],
};

const ARRAY_COLUMNS = new Set(['photo_urls', 'video_urls', 'tags', 'badges']);

/* Columns that exist in Postgres and have no column in the Appwrite schema. */
const DROP = new Set(['id']);

function unescapeCopy(v) {
  if (v === '\\N') return null;
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== '\\') { out += v[i]; continue; }
    const n = v[++i];
    out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r'
         : n === '\\' ? '\\' : n;
  }
  return out;
}

function pgArray(v) {
  if (v === null) return null;
  const s = v.trim();
  if (!s.startsWith('{')) return [s];
  const body = s.slice(1, -1);
  if (!body.trim()) return [];
  const out = [];
  let cur = '', q = false, esc = false;
  for (const ch of body) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2}(:?\d{2})?)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function coerce(key, raw) {
  if (raw === null) return null;
  if (ARRAY_COLUMNS.has(key)) return pgArray(raw);
  if (raw === 't') return true;
  if (raw === 'f') return false;
  if (DATE_ONLY.test(raw)) return `${raw}T00:00:00.000Z`;
  const m = TS.exec(raw);
  if (m) {
    const frac = m[3] ? (m[3] + '000').slice(0, 4) : '.000';
    return `${m[1]}T${m[2]}${frac}Z`;          // the dump is UTC
  }
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

async function api(path, body, method = 'POST') {
  if (DRY) return { ok: true, status: 200, dry: true };
  const res = await fetch(ENDPOINT + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': PROJECT,
      'X-Appwrite-Key': KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

async function readDump(path) {
  const tables = new Map();
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let cur = null;
  for await (const line of rl) {
    if (cur) {
      if (line === '\\.') { cur = null; continue; }
      cur.rows.push(line.split('\t').map(unescapeCopy));
      continue;
    }
    const m = /^COPY ([a-z_]+\.[a-z_0-9]+) \(([^)]*)\) FROM stdin;/.exec(line);
    if (!m) continue;
    const name = m[1];
    if (!name.startsWith('public.') && name !== 'auth.users') continue;
    cur = { columns: m[2].split(',').map((c) => c.trim().replace(/"/g, '')), rows: [] };
    tables.set(name, cur);
  }
  return tables;
}

async function main() {
  const dump = process.argv[2];
  if (!dump) { console.error('usage: node import-data.mjs <pg_dump .sql> [--users-only] [--dry-run]'); process.exit(2); }
  if (!DRY && (!PROJECT || !KEY)) {
    console.error('Set APPWRITE_PROJECT and APPWRITE_KEY (a server API key).');
    process.exit(2);
  }

  const tables = await readDump(dump);
  console.log(`\n${DRY ? '[dry run] ' : ''}read ${tables.size} tables from ${dump}\n`);

  /* ── 1. The accounts ── */
  const users = tables.get('auth.users');
  let made = 0, already = 0;
  const userFailures = [];

  if (users) {
    const col = (n) => users.columns.indexOf(n);
    for (const r of users.rows) {
      const id = r[col('id')];
      const email = r[col('email')];
      const hash = r[col('encrypted_password')];
      const name = (() => {
        try { return JSON.parse(r[col('raw_user_meta_data')] || '{}').full_name || undefined; }
        catch { return undefined; }
      })();
      if (!id || !email || !hash) { userFailures.push({ id, why: 'missing email or hash' }); continue; }

      const res = await api('/users/bcrypt', { userId: id, email, password: hash, name });
      if (res.ok) made++;
      else if (res.status === 409) already++;
      else userFailures.push({ id, why: `${res.status} ${res.json?.message ?? ''}`.trim() });
    }
    console.log(`users: ${made} created, ${already} already there, ${userFailures.length} failed`);
    for (const f of userFailures.slice(0, 5)) console.log(`   ! ${f.why}`);
  }

  if (USERS_ONLY) { console.log('\n--users-only: stopping here.\n'); return; }

  /* ── 2. The rows ── */
  const counts = [];
  const failures = [];

  for (const table of ORDER) {
    const got = tables.get(`public.${table}`);
    if (!got || !got.rows.length) continue;

    const idI = got.columns.indexOf('id');
    const comp = COMPOSITE[table];
    let ok = 0, dup = 0;

    /* Comments reference comments: a reply must not be written before the
       comment it answers, or the thread renders orphaned. */
    let rows = got.rows;
    if (table === 'comments') {
      const pI = got.columns.indexOf('parent_comment_id');
      const byId = new Map(rows.map((r) => [r[idI], r]));
      const seen = new Set(); const out = [];
      const visit = (r) => {
        if (!r || seen.has(r[idI])) return;
        seen.add(r[idI]);
        if (r[pI] && byId.has(r[pI])) visit(byId.get(r[pI]));
        out.push(r);
      };
      rows.forEach(visit);
      rows = out;
    }

    for (const r of rows) {
      const rowId = comp
        ? createHash('md5').update(comp.map((c) => r[got.columns.indexOf(c)]).join('|')).digest('hex').slice(0, 32)
        : (idI >= 0 ? r[idI] : null);

      /* A table with neither an id column nor an entry in COMPOSITE would
         otherwise send rowId: undefined and have Appwrite invent one, which
         breaks re-running (every run makes a fresh copy). Stop instead. */
      if (!rowId) {
        failures.push(`${table}: no row id — add it to COMPOSITE in this file`);
        break;
      }

      const data = {};
      got.columns.forEach((c, i) => {
        if (DROP.has(c)) return;
        const v = coerce(c, r[i]);
        if (v !== null) data[c] = v;      // Appwrite: omit rather than send null
      });

      const res = await api(`/tablesdb/${DB}/tables/${table}/rows`, { rowId, data });
      if (res.ok) ok++;
      else if (res.status === 409) dup++;
      else if (failures.length < 20) failures.push(`${table}: ${res.status} ${res.json?.message ?? ''}`.trim());
    }
    counts.push([table, ok, dup]);
    console.log(`  ${String(ok).padStart(4)} + ${String(dup).padStart(3)} existing  ${table}`);
  }

  const total = counts.reduce((a, [, n]) => a + n, 0);
  console.log(`\n${total} rows written`);

  if (failures.length) {
    console.log('\nfailures:');
    for (const f of [...new Set(failures)]) console.log('  ! ' + f);
    process.exitCode = 1;
  } else {
    console.log('\nNext: the 141 images. They are not in the dump —');
    console.log('  1. lift the Supabase quota');
    console.log('  2. node db/sqlserver/tools/fetch-storage.mjs ~/wecycle_backup.sql --out ~/wecycle-media');
    console.log('  3. node db/appwrite/tools/upload-media.mjs ~/wecycle-media');
  }
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
