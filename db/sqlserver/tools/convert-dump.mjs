#!/usr/bin/env node
/**
 * convert-dump.mjs — turn a Postgres pg_dump into the SQL Server data load.
 *
 *     node convert-dump.mjs ~/wecycle_backup.sql
 *
 * Writes ../../data/wecycle-data.sql, which is gitignored and must stay that
 * way: it is 99 real students' names, email addresses, bcrypt password hashes
 * and phone numbers, plus the 57-address SIGCHI roster. Load it, then delete it.
 *
 * ── WHY THIS EXISTS ALONGSIDE export-data.mjs ───────────────────────────────
 *
 * export-data.mjs reads the live database, which needs it to be reachable and
 * needs the password. This reads a file, so it works when the project is
 * suspended, restricted, or gone — which is the situation this was written in:
 * the Supabase project was answering 402 on everything, and a pg_dump taken
 * beforehand was the only copy that could be reached.
 *
 * Use whichever you have. They produce the same file.
 *
 * ── HOW COLUMNS ARE MATCHED ─────────────────────────────────────────────────
 *
 * Not from a hand-written mapping, which is a list that goes stale silently.
 * The COPY header in the dump names the Postgres columns; wecycle-sqlserver.sql
 * names the SQL Server ones. This intersects them, and REPORTS every column on
 * either side that has no partner. So a column added to one and not the other
 * shows up as a line of output rather than as data that quietly did not arrive.
 */

import { readFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = join(HERE, '..', 'wecycle-sqlserver.sql');
const OUT_DIR = join(HERE, '..', '..', 'data');
const OUT = join(OUT_DIR, 'wecycle-data.sql');

/* Parents before children, and the SQL Server name for each Postgres table.
   Anything not listed here is deliberately not migrated — see SKIPPED below. */
const TABLES = [
  ['public.communities',           'app.communities'],
  ['public.categories',            'app.categories'],
  ['public.moderation_terms',      'app.moderation_terms'],
  ['public.sigchi_members',        'app.sigchi_members'],
  ['public.sigchi_offer_config',   'app.sigchi_offer_config'],
  ['auth.users',                   'auth.users'],
  ['public.profiles',              'app.profiles'],
  ['public.community_members',     'app.community_members'],
  ['public.listings',              'app.listings'],
  ['public.requests',              'app.requests'],
  ['public.events',                'app.events'],
  ['public.lost_found_reports',    'app.lost_found_reports'],
  ['public.event_forms',           'app.event_forms'],
  ['public.event_form_responses',  'app.event_form_responses'],
  ['public.event_rsvps',           'app.event_rsvps'],
  ['public.event_saves',           'app.event_saves'],
  ['public.saves',                 'app.saves'],
  ['public.listing_responses',     'app.listing_responses'],
  ['public.request_offers',        'app.request_offers'],
  ['public.comments',              'app.comments'],
  ['public.reactions',             'app.reactions'],
  ['public.notifications',         'app.notifications'],
  ['public.alerts',                'app.alerts'],
  ['public.push_subscriptions',    'app.push_subscriptions'],
  ['public.push_queue',            'app.push_queue'],
  ['public.saved_searches',        'app.saved_searches'],
  ['public.conversations',         'app.conversations'],
  ['public.messages',              'app.messages'],
  ['public.user_blocks',           'app.user_blocks'],
  ['public.content_reports',       'app.content_reports'],
  ['public.inventory_items',       'app.inventory_items'],
  ['public.impact_log',            'app.impact_log'],
  ['public.announcements',         'app.announcements'],
  ['public.community_milestones',  'app.community_milestones'],
  ['public.sigchi_claim_attempts', 'app.sigchi_claim_attempts'],
];

/* Not migrated, and why — so nobody later wonders whether it was an oversight.
     auth.sessions / refresh_tokens / identities / mfa_*  GoTrue's own state.
       Sessions do not survive a change of auth system; everyone signs in again
       once, against the same password. auth.identities is OAuth linkage, and
       there is no OAuth here.
     cron.*                  216,631 rows of pg_cron run logs. Noise.
     storage.*               file METADATA. The files themselves are not in a
       pg_dump at all — see fetch-storage.mjs.
     realtime.* supabase_functions.* supabase_migrations.* vault.*
       Supabase's own plumbing, which has no counterpart here. */
const TABLE_COLUMNS_IDENTITY = new Set(['app.sigchi_claim_attempts']);

/* ── Reading the SQL Server schema ── */

function sqlServerSchema() {
  const sql = readFileSync(SCHEMA_SQL, 'utf8');
  const cols = new Map();      // table -> [names]
  const limits = new Map();    // table.col -> max length
  let table = null;
  for (const line of sql.split('\n')) {
    const t = line.match(/^CREATE TABLE ([a-z]+\.[a-z_]+)/);
    if (t) { table = t[1]; cols.set(table, []); continue; }
    if (!table) continue;
    if (/^\);/.test(line)) { table = null; continue; }
    const c = line.match(/^\s{4}(\[?[a-z_][a-z0-9_]*\]?)\s+([a-z]+)/i);
    if (!c) continue;
    const name = c[1].replace(/[[\]]/g, '');
    if (['constraint', 'primary', 'foreign', 'check', 'unique'].includes(name.toLowerCase())) continue;
    /* Computed columns are derived by SQL Server, never inserted. */
    if (/\sAS\s.+PERSISTED/i.test(line)) continue;
    cols.get(table).push(name);
    const w = line.match(/n?varchar\((\d+)\)/i);
    if (w) limits.set(`${table}.${name}`, Number(w[1]));
  }
  return { cols, limits };
}

/* ── Postgres COPY text format ──
   Fields are tab separated; \N is NULL; backslash escapes the rest. */
function unescapeCopy(v) {
  if (v === '\\N') return null;
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== '\\') { out += v[i]; continue; }
    const n = v[++i];
    out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r'
         : n === 'b' ? '\b' : n === 'f' ? '\f' : n === 'v' ? '\v'
         : n === '\\' ? '\\' : n;
  }
  return out;
}

/* Postgres array literal -> JSON array, because that is what the SQL Server
   column holds. {} is empty; elements may be quoted and may contain commas. */
function pgArrayToJson(v) {
  if (v === null) return null;
  const s = v.trim();
  if (!s.startsWith('{')) return JSON.stringify([s]);
  const body = s.slice(1, -1);
  if (!body.trim()) return '[]';
  const out = [];
  let cur = '', q = false, esc = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return JSON.stringify(out.map((x) => (!q && x === 'NULL' ? null : x)));
}

/* 2026-05-12 04:03:47.870172+00 -> 2026-05-12 04:03:47.870
   The dump is in UTC (Supabase default) and datetime2 here is UTC by
   convention, so the offset is dropped rather than applied. Anything with a
   non-zero offset would be a real problem and is reported, not silently
   shifted. */
const TS_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2}(:?\d{2})?)?$/;
function toDatetime2(v, problems, where) {
  const m = TS_RE.exec(v);
  if (!m) return null;
  if (m[4] && !/^[+-]00(:?00)?$/.test(m[4])) {
    problems.push(`${where}: timestamp is not UTC (${m[4]}) — ${v}`);
  }
  const frac = m[3] ? (m[3] + '000').slice(0, 4) : '.000';
  return `${m[1]} ${m[2]}${frac}`;
}

const qq = (s) => `N'${s.replace(/'/g, "''")}'`;

function literal(raw, where, limits, problems) {
  if (raw === null) return 'NULL';
  if (raw === 't') return '1';
  if (raw === 'f') return '0';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  if (TS_RE.test(raw)) {
    const d = toDatetime2(raw, problems, where);
    if (d) return qq(d);
  }
  let s = raw;
  if (s.startsWith('{') && s.endsWith('}') && !s.startsWith('{"') === false) { /* handled by caller */ }
  const max = limits.get(where);
  if (max !== undefined && s.length > max) {
    problems.push(`${where}: a value is ${s.length} characters, the column holds ${max}`);
  }
  return qq(s);
}

/* ── Main ── */

async function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) {
    console.error('usage: node convert-dump.mjs <pg_dump .sql file>');
    process.exit(2);
  }

  const { cols: msCols, limits } = sqlServerSchema();
  const wanted = new Map(TABLES);             // pgTable -> msTable
  const data = new Map();                     // pgTable -> { columns, rows }

  /* One streaming pass. The dump is 31MB and 234k lines, most of it cron logs
     nobody wants in memory. */
  const rl = createInterface({ input: createReadStream(dumpPath, 'utf8'), crlfDelay: Infinity });
  let cur = null;
  for await (const line of rl) {
    if (cur) {
      if (line === '\\.') { cur = null; continue; }
      cur.rows.push(line.split('\t').map(unescapeCopy));
      continue;
    }
    const m = /^COPY ([a-z_]+\.[a-z_0-9]+) \(([^)]*)\) FROM stdin;/.exec(line);
    if (!m) continue;
    const pgTable = m[1];
    if (!wanted.has(pgTable)) continue;
    cur = { columns: m[2].split(',').map((c) => c.trim().replace(/"/g, '')), rows: [] };
    data.set(pgTable, cur);
  }

  const problems = [];
  const notes = [];
  const out = [];
  const counts = [];

  out.push('/* Wecycle data for SQL Server — generated by tools/convert-dump.mjs');
  out.push(` * source: ${dumpPath}`);
  out.push(` * ${new Date().toISOString()}`);
  out.push(' *');
  out.push(' * CONTAINS PERSONAL DATA: names, email addresses, bcrypt password hashes,');
  out.push(' * phone numbers. DO NOT COMMIT. Load it, verify, then delete it.');
  out.push(' *');
  out.push(' * Run wecycle-sqlserver.sql first — this assumes the schema exists.');
  out.push(' */');
  out.push('', 'USE [Wecycle];', 'GO', 'SET NOCOUNT ON;', 'GO', '');
  out.push('/* Triggers OFF. The counters in this data are already correct; leaving the');
  out.push('   triggers on would count every save and RSVP a second time and raise a');
  out.push('   notification for every historical comment and like. */');
  out.push("EXEC sp_MSforeachtable 'ALTER TABLE ? DISABLE TRIGGER ALL';", 'GO', '');

  for (const [pgTable, msTable] of TABLES) {
    const got = data.get(pgTable);
    if (!got || got.rows.length === 0) { counts.push([msTable, 0]); continue; }

    const target = msCols.get(msTable);
    if (!target) { problems.push(`${msTable}: not found in wecycle-sqlserver.sql`); continue; }

    /* Intersect, preserving the SQL Server column order. */
    const pairs = target
      .map((name) => ({ name, idx: got.columns.indexOf(name) }))
      .filter((p) => p.idx >= 0);

    const missingInDump = target.filter((c) => !got.columns.includes(c));
    const droppedFromPg = got.columns.filter((c) => !target.includes(c));
    if (missingInDump.length) notes.push(`${msTable}: no value in the dump for ${missingInDump.join(', ')} — default applies`);
    if (droppedFromPg.length) notes.push(`${msTable}: dump column(s) not in the SQL Server table, dropped: ${droppedFromPg.join(', ')}`);

    let rows = got.rows;

    /* Comments reference comments. Parents must be inserted first, and there
       is no cascade to forgive getting it wrong. */
    if (msTable === 'app.comments') {
      const idI = got.columns.indexOf('id');
      const parentI = got.columns.indexOf('parent_comment_id');
      const byId = new Map(rows.map((r) => [r[idI], r]));
      const done = new Set();
      const ordered = [];
      const visit = (r) => {
        if (!r || done.has(r[idI])) return;
        done.add(r[idI]);
        const p = r[parentI];
        if (p && byId.has(p)) visit(byId.get(p));
        ordered.push(r);
      };
      rows.forEach(visit);
      rows = ordered;
    }

    const colList = pairs.map((p) => `[${p.name}]`).join(', ');
    out.push(`/* ${msTable} — ${rows.length} row${rows.length === 1 ? '' : 's'} */`);
    if (TABLE_COLUMNS_IDENTITY.has(msTable)) out.push(`SET IDENTITY_INSERT ${msTable} ON;`);

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      out.push(`INSERT INTO ${msTable} (${colList}) VALUES`);
      out.push(chunk.map((r) => '  (' + pairs.map((p) => {
        const where = `${msTable}.${p.name}`;
        let v = r[p.idx];
        if (v !== null && v.startsWith('{') && v.endsWith('}')
            && limits.get(where) === undefined && /_urls$|^tags$|^badges$/.test(p.name)) {
          v = pgArrayToJson(v);
        }
        return literal(v, where, limits, problems);
      }).join(', ') + ')').join(',\n') + ';');
    }

    if (TABLE_COLUMNS_IDENTITY.has(msTable)) out.push(`SET IDENTITY_INSERT ${msTable} OFF;`);
    out.push('GO', '');
    counts.push([msTable, rows.length]);
  }

  if (problems.length) {
    console.error('\nREFUSING TO WRITE:\n');
    for (const p of [...new Set(problems)]) console.error('  ' + p);
    console.error('');
    process.exit(1);
  }

  out.push('/* Triggers back on. */');
  out.push("EXEC sp_MSforeachtable 'ALTER TABLE ? ENABLE TRIGGER ALL';", 'GO', '');
  out.push('/* Re-verify every foreign key. A bulk load can leave keys NOT TRUSTED,');
  out.push('   which means SQL Server has quietly stopped enforcing them. WITH CHECK');
  out.push('   CHECK is not a typo: verify what is there, then enforce from now on. */');
  out.push("EXEC sp_MSforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL';", 'GO', '');
  out.push('SELECT name AS untrusted_foreign_key FROM sys.foreign_keys WHERE is_not_trusted = 1;');
  out.push('GO');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, out.join('\n'), 'utf8');

  const total = counts.reduce((a, [, n]) => a + n, 0);
  console.log(`\nWrote ${OUT}`);
  for (const [n, c] of counts) if (c) console.log(`  ${String(c).padStart(6)}  ${n}`);
  console.log(`  ${String(total).padStart(6)}  total rows`);
  if (notes.length) {
    console.log('\nNotes:');
    for (const n of [...new Set(notes)]) console.log('  - ' + n);
  }
  console.log('\nContains personal data. Do not commit it.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
