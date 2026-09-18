#!/usr/bin/env node
/**
 * export-data.mjs — read every row out of the live PostgreSQL database and
 * write a T-SQL script that loads it into the SQL Server schema.
 *
 *     node export-data.mjs "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"
 *
 * The connection string is in the Supabase dashboard under
 * Settings → Database → Connection string → URI. Use the DIRECT connection on
 * port 5432, not the pooler: the pooler runs in transaction mode and does not
 * hold a session across the whole export.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM THE SCHEMA ─────────────────────────────
 *
 * Because of what it writes. The output is 99 real students' names, email
 * addresses, bcrypt password hashes and phone numbers, plus the 57-address
 * SIGCHI roster. The Wecycle repository is PUBLIC. So:
 *
 *     THE OUTPUT OF THIS SCRIPT MUST NEVER BE COMMITTED.
 *
 * It is written to ../data/wecycle-data.sql, and db/.gitignore ignores that
 * whole directory. Move the file to the server over something private (scp, a
 * USB stick), load it, and delete it. It is a password file in every way that
 * matters.
 *
 * ── WHAT IT GUARANTEES ──────────────────────────────────────────────────────
 *
 * 1. NOTHING IS TRUNCATED. Postgres text is unbounded; SQL Server nvarchar has
 *    a number. This reads those numbers straight out of wecycle-sqlserver.sql
 *    and checks every value against them, and REFUSES to write the file if one
 *    would be cut. A silent truncation on import is the worst outcome here —
 *    it looks like it worked.
 *
 * 2. TRIGGERS ARE OFF DURING THE LOAD. Not an optimisation — a correctness
 *    requirement. The counter triggers would re-count every save and RSVP on
 *    top of the values already in the data, and the notification triggers
 *    would generate a notification for every historical comment and like. The
 *    generated file disables them, loads, and turns them back on.
 *
 * 3. THE ORDER IS A DEPENDENCY ORDER. No cascading foreign keys means no
 *    forgiveness: a child inserted before its parent fails. TABLES below is
 *    sorted so that never happens, and comments are ordered by created_at so
 *    a reply never lands before the comment it answers.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = join(HERE, '..', 'wecycle-sqlserver.sql');
const OUT_DIR = join(HERE, '..', '..', 'data');
const OUT = join(OUT_DIR, 'wecycle-data.sql');

/* Parents before children. Getting this wrong is a foreign key error, which is
   loud — but it is still quicker to read the order than to discover it. */
const TABLES = [
  { pg: 'communities',           ms: 'app.communities' },
  { pg: 'categories',            ms: 'app.categories' },
  { pg: 'moderation_terms',      ms: 'app.moderation_terms' },
  { pg: 'sigchi_members',        ms: 'app.sigchi_members' },
  { pg: 'sigchi_offer_config',   ms: 'app.sigchi_offer_config' },
  { auth: true, pg: 'users',     ms: 'auth.users',
    cols: ['id', 'email', 'encrypted_password', 'email_confirmed_at', 'phone',
           'phone_confirmed_at', 'raw_user_meta_data', 'last_sign_in_at',
           'banned_until', 'deleted_at', 'created_at', 'updated_at'] },
  { pg: 'profiles',              ms: 'app.profiles' },
  { pg: 'community_members',     ms: 'app.community_members' },
  { pg: 'listings',              ms: 'app.listings' },
  { pg: 'requests',              ms: 'app.requests' },
  { pg: 'events',                ms: 'app.events' },
  { pg: 'lost_found_reports',    ms: 'app.lost_found_reports' },
  { pg: 'event_forms',           ms: 'app.event_forms' },
  { pg: 'event_form_responses',  ms: 'app.event_form_responses' },
  { pg: 'event_rsvps',           ms: 'app.event_rsvps' },
  { pg: 'event_saves',           ms: 'app.event_saves' },
  { pg: 'saves',                 ms: 'app.saves' },
  { pg: 'listing_responses',     ms: 'app.listing_responses' },
  { pg: 'request_offers',        ms: 'app.request_offers' },
  /* Parent comments first — the self-referencing key has no cascade. */
  { pg: 'comments',              ms: 'app.comments', order: 'created_at' },
  { pg: 'reactions',             ms: 'app.reactions' },
  { pg: 'notifications',         ms: 'app.notifications' },
  { pg: 'alerts',                ms: 'app.alerts' },
  { pg: 'push_subscriptions',    ms: 'app.push_subscriptions' },
  { pg: 'push_queue',            ms: 'app.push_queue' },
  { pg: 'saved_searches',        ms: 'app.saved_searches' },
  { pg: 'conversations',         ms: 'app.conversations',
    skip: ['listing_key'] },   /* computed column — SQL Server derives it */
  { pg: 'messages',              ms: 'app.messages' },
  { pg: 'user_blocks',           ms: 'app.user_blocks' },
  { pg: 'content_reports',       ms: 'app.content_reports' },
  { pg: 'inventory_items',       ms: 'app.inventory_items' },
  { pg: 'impact_log',            ms: 'app.impact_log' },
  { pg: 'announcements',         ms: 'app.announcements' },
  { pg: 'community_milestones',  ms: 'app.community_milestones' },
  { pg: 'sigchi_claim_attempts', ms: 'app.sigchi_claim_attempts', identity: true },
];

/* ── The length map, read from the schema itself ──
   So that changing a column width in wecycle-sqlserver.sql automatically
   changes what this validates against, instead of leaving a second copy of
   the numbers here to drift out of step. */
function lengthLimits() {
  const sql = readFileSync(SCHEMA_SQL, 'utf8');
  const limits = new Map();
  let table = null;
  for (const line of sql.split('\n')) {
    const t = line.match(/^CREATE TABLE ([a-z]+\.[a-z_]+)/);
    if (t) { table = t[1]; continue; }
    if (!table) continue;
    if (/^\);/.test(line)) { table = null; continue; }
    const c = line.match(/^\s{4}(\[?[a-z_][a-z0-9_]*\]?)\s+n?varchar\((\d+)\)/i);
    if (c) limits.set(`${table}.${c[1].replace(/[[\]]/g, '')}`, Number(c[2]));
  }
  if (limits.size === 0) throw new Error(`No column widths found in ${SCHEMA_SQL}`);
  return limits;
}

const q = (s) => `N'${String(s).replace(/'/g, "''")}'`;

function literal(v, { table, column, limits, problems }) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (v instanceof Date) return q(v.toISOString().replace('T', ' ').replace('Z', ''));

  /* Postgres arrays and jsonb both arrive as JS values and both land in an
     nvarchar(max) column holding JSON. One conversion covers both. */
  let s = (Array.isArray(v) || typeof v === 'object') ? JSON.stringify(v) : String(v);

  const max = limits.get(`${table}.${column}`);
  if (max !== undefined && s.length > max) {
    problems.push(`${table}.${column}: a value is ${s.length} characters, column holds ${max}`);
  }
  return q(s);
}

async function main() {
  const conn = process.argv[2] || process.env.PG_URL;
  if (!conn) {
    console.error('usage: node export-data.mjs "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"');
    process.exit(2);
  }

  const limits = lengthLimits();
  const problems = [];
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const out = [];
  const counts = [];

  out.push('/* Wecycle data — generated by db/sqlserver/tools/export-data.mjs');
  out.push(` * ${new Date().toISOString()}`);
  out.push(' *');
  out.push(' * CONTAINS PERSONAL DATA: names, email addresses, bcrypt password hashes,');
  out.push(' * phone numbers. DO NOT COMMIT THIS FILE. Load it, then delete it.');
  out.push(' *');
  out.push(' * Run wecycle-sqlserver.sql first — this file assumes the schema exists.');
  out.push(' */');
  out.push('');
  out.push('USE [Wecycle];');
  out.push('GO');
  out.push('SET NOCOUNT ON;');
  out.push('GO');
  out.push('');
  out.push('/* Triggers OFF for the load. The counters in this data are already correct;');
  out.push('   leaving the triggers on would count every save and RSVP a second time and');
  out.push('   send a notification for every historical comment. */');
  out.push("EXEC sp_MSforeachtable 'ALTER TABLE ? DISABLE TRIGGER ALL';");
  out.push('GO');
  out.push('');

  for (const t of TABLES) {
    const schema = t.auth ? 'auth' : 'public';
    const order = t.order ? ` ORDER BY ${t.order}` : '';
    const cols = t.cols ? t.cols.map((c) => `"${c}"`).join(', ') : '*';
    const { rows } = await client.query(`SELECT ${cols} FROM ${schema}.${t.pg}${order}`);
    counts.push([t.ms, rows.length]);
    if (rows.length === 0) { out.push(`/* ${t.ms}: no rows */`); out.push(''); continue; }

    const columns = Object.keys(rows[0]).filter((c) => !(t.skip || []).includes(c));
    const colList = columns.map((c) => `[${c}]`).join(', ');

    out.push(`/* ${t.ms} — ${rows.length} row${rows.length === 1 ? '' : 's'} */`);
    if (t.identity) out.push(`SET IDENTITY_INSERT ${t.ms} ON;`);

    /* 1000 is the hard limit on rows in one VALUES clause. */
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      out.push(`INSERT INTO ${t.ms} (${colList}) VALUES`);
      out.push(chunk.map((r) => '  (' + columns
        .map((c) => literal(r[c], { table: t.ms, column: c, limits, problems }))
        .join(', ') + ')').join(',\n') + ';');
    }

    if (t.identity) out.push(`SET IDENTITY_INSERT ${t.ms} OFF;`);
    out.push('GO');
    out.push('');
  }

  await client.end();

  /* Refuse to write a file that would lose data. Finding out at import time,
     or worse not finding out at all, is the thing this exists to prevent. */
  if (problems.length) {
    console.error('\nREFUSING TO WRITE — values do not fit the SQL Server columns:\n');
    for (const p of [...new Set(problems)]) console.error('  ' + p);
    console.error('\nWiden the column in wecycle-sqlserver.sql and run this again.\n');
    process.exit(1);
  }

  out.push('/* Triggers back on. */');
  out.push("EXEC sp_MSforeachtable 'ALTER TABLE ? ENABLE TRIGGER ALL';");
  out.push('GO');
  out.push('');
  out.push('/* Re-verify every foreign key. A bulk load can leave keys marked NOT');
  out.push('   TRUSTED, which means SQL Server has stopped enforcing them — silently.');
  out.push('   WITH CHECK CHECK is not a typo: the first says verify the existing rows,');
  out.push('   the second says enforce from now on. */');
  out.push("EXEC sp_MSforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL';");
  out.push('GO');
  out.push('');
  out.push('SELECT name AS untrusted_foreign_key FROM sys.foreign_keys WHERE is_not_trusted = 1;');
  out.push('GO');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, out.join('\n'), 'utf8');

  const total = counts.reduce((a, [, n]) => a + n, 0);
  console.log(`\nWrote ${OUT}`);
  for (const [name, n] of counts) if (n) console.log(`  ${String(n).padStart(6)}  ${name}`);
  console.log(`  ${String(total).padStart(6)}  total rows\n`);
  console.log('This file contains personal data. Do not commit it.');
  console.log('Load it, verify the counts, then delete it.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
