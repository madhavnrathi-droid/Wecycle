#!/usr/bin/env node
/**
 * generate-schema.mjs — the SQL Server schema, rewritten as an Appwrite
 * TablesDB config.
 *
 *     node generate-schema.mjs            # writes ../appwrite.json
 *
 * ── WHY IT IS GENERATED AND NOT WRITTEN BY HAND ─────────────────────────────
 *
 * 34 tables and about 400 columns. Written by hand it would be right on the
 * day it was written and wrong within a month, because the truth would live in
 * two files. This reads db/sqlserver/wecycle-sqlserver.sql — which was itself
 * derived from the live Postgres schema — so there stays ONE description of
 * what Wecycle's data looks like, and the other two are outputs of it.
 *
 * Change a column there, re-run this, and the Appwrite config follows.
 *
 * ── THE MAPPING ─────────────────────────────────────────────────────────────
 *
 *   uniqueidentifier  -> varchar(36)     a UUID is a string here
 *   nvarchar(n)       -> varchar(n) / text / mediumtext / longtext, by size
 *   nvarchar(max)     -> longtext
 *   int / bigint      -> integer / bigint
 *   decimal(p,s)      -> double          Appwrite has no fixed-point type;
 *                                        see the note on money below
 *   bit               -> boolean
 *   datetime2(3)      -> datetime        ISO-8601, still UTC
 *   CHECK (c IN (…))  -> string, format "enum", elements […]
 *   JSON array column -> varchar array:true
 *
 * Three of those deserve more than a line:
 *
 * ENUMS COME BACK. Postgres had 19 enum types; SQL Server could only express
 * them as CHECK constraints; Appwrite has a real enum column. So this parses
 * the CHECK constraints back into enums, and the schema ends up closer to the
 * Postgres original than the SQL Server one was.
 *
 * ARRAYS COME BACK TOO. photo_urls, video_urls, tags and badges were Postgres
 * text[], became JSON in an nvarchar(max), and are native array columns here.
 * The JSON-in-a-string workaround disappears.
 *
 * DECIMAL BECOMES DOUBLE, which is the one lossy step. co2_saved_kg and
 * money_saved are decimal(12,2) today; a double cannot hold every 2-decimal
 * value exactly. For CO2 estimates and a running "money saved" total that is
 * noise far below the accuracy of the estimate itself. It would NOT be
 * acceptable for money anyone is owed — if Wecycle ever charges for anything,
 * that column should be an integer number of paise, not a double.
 *
 * ── WHAT IS DELIBERATELY NOT GENERATED ──────────────────────────────────────
 *
 * RELATIONSHIP COLUMNS. Appwrite can model user_id as a real relationship, and
 * this does not: every foreign key stays a plain varchar(36) holding the UUID.
 * Two reasons. The app already reads these as ids and fetches by id, so
 * relationships would change the shape of every response for no gain. And
 * Appwrite's relationship loading has its own depth and count limits, which
 * turn into surprises on exactly the screens that list a lot of rows.
 *
 * FILTERED INDEXES. `WHERE status = 'active'` has no equivalent, so those
 * become ordinary indexes on the same columns. They still serve the same
 * queries, just without skipping dead rows.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'sqlserver', 'wecycle-sqlserver.sql');
const OUT = join(HERE, '..', 'appwrite.json');

const DB_ID = 'wecycle';

/* Columns that hold a JSON array in SQL Server and become native arrays here.
   Everything else validated by ISJSON is a JSON *object* (notification_prefs,
   payload, answers, raw_user_meta_data) and stays a long string. */
const ARRAY_COLUMNS = new Set(['photo_urls', 'video_urls', 'tags', 'badges']);

/* Tables whose primary key was a composite in SQL Server. Appwrite rows are
   keyed by a single $id, so the pair becomes a deterministic hashed id (see
   import-data.mjs) plus a unique index, which is what actually enforces
   "one save per person per listing". */
const COMPOSITE_KEYS = {
  saves:             ['user_id', 'listing_id'],
  community_members: ['community_id', 'user_id'],
  event_rsvps:       ['event_id', 'user_id'],
  event_saves:       ['event_id', 'user_id'],
  user_blocks:       ['blocker_id', 'target_id'],
};

/* Indexes that cannot exist here, and why each one is a deliberate drop rather
   than an oversight.

   MySQL underneath indexes at most 767 bytes, which is 191 utf8mb4 characters,
   and a `text` column cannot be indexed without a prefix length that Appwrite
   does not expose. Two columns run into that, and shrinking them to fit would
   be the wrong trade in both cases:

   profiles.email (320) — the index it replaced was a Postgres TRIGRAM index
     serving "contains" search, which a plain B-tree could not accelerate
     anyway; it was already documented as degraded. Shrinking the column to 191
     to keep a near-useless index would start REJECTING valid addresses (RFC
     allows 254). At 99 profiles the scan is free. Dropped.

   push_subscriptions.endpoint (450) — this one was UNIQUE, and uniqueness
     genuinely matters: it is what stops one browser registering twice and
     getting every notification twice. So it is not dropped, it MOVES — the row
     id is the hash of the endpoint (see COMPOSITE in import-data.mjs), which
     makes the primary key enforce it, with no length limit at all. The longest
     endpoint in the live data is 188 characters and a 191-char cap would have
     had three characters of headroom, which is not a margin. */
const INDEX_SKIP = new Set([
  'profiles:email',
  'push_subscriptions:endpoint',
]);

/* auth.users is not a table here — Appwrite Auth owns it. Only the profile
   half crosses over, keyed by the Appwrite user id. */
const SKIP_TABLES = new Set(['auth.users', 'auth.sessions', 'auth.one_time_codes']);

/* Dropped because Appwrite provides the thing they existed for. */
const SKIP_COLUMNS = new Set(['id']);   // becomes $id

/* ── Columns that must not exist on a publicly readable row ────────────────
 *
 * Appwrite has no column-level permission: a row is readable or it is not.
 * profiles MUST be readable, because every listing shows its seller's name and
 * avatar — so anything left on that row is public. Postgres protected these
 * two with RLS and only ever served them through get_contact, which honours
 * each member's sharing preferences; the SQL Server port used DENY SELECT.
 * Neither has an equivalent here.
 *
 * So they are not on the profile at all. They live in profile_contacts, which
 * no client permission touches, and a server endpoint applies the preferences.
 * This was found the hard way: an anonymous request carrying nothing but the
 * project id returned all 99 students' email addresses and phone numbers. */
const MOVED_TO_SERVER_ONLY = { profiles: ['email', 'phone'] };

function varcharFor(size) {
  if (size <= 255) return { type: 'varchar', size };
  if (size <= 65535) return { type: 'text', size };
  return { type: 'mediumtext', size };
}

function parseSchema() {
  const sql = readFileSync(SRC, 'utf8');
  const tables = new Map();
  let table = null;

  for (const raw of sql.split('\n')) {
    const line = raw.replace(/\s+$/, '');

    const t = /^CREATE TABLE ([a-z]+)\.([a-z_]+)/.exec(line);
    if (t) {
      table = { schema: t[1], name: t[2], columns: [], enums: new Map(), json: new Set(), uniques: [] };
      tables.set(`${t[1]}.${t[2]}`, table);
      continue;
    }
    if (!table) continue;
    if (/^\);/.test(line)) { table = null; continue; }

    /* An enum, hiding in a CHECK constraint. */
    const e = /CHECK \(([a-z_0-9]+) IN \(([^)]*)\)\)/.exec(line);
    if (e) {
      const elements = [...e[2].matchAll(/N'([^']*)'/g)].map((m) => m[1]);
      if (elements.length) table.enums.set(e[1], elements);
      continue;
    }
    const e2 = /CHECK \(([a-z_0-9]+) IS NULL OR \1 IN \(([^)]*)\)\)/.exec(line);
    if (e2) {
      const elements = [...e2[2].matchAll(/N'([^']*)'/g)].map((m) => m[1]);
      if (elements.length) table.enums.set(e2[1], elements);
      continue;
    }
    const j = /CHECK \(ISJSON\(([a-z_0-9]+)\)/.exec(line);
    if (j) { table.json.add(j[1]); continue; }

    /* A UNIQUE declared inline in CREATE TABLE, which the CREATE INDEX sweep
       below never sees. Missing these is not cosmetic: without the one on
       profiles.username two members can take the same handle, and without the
       one on reactions the same person can like a post twice. */
    const u = /CONSTRAINT [a-z_0-9]+ UNIQUE \(([^)]*)\)/.exec(line);
    if (u) {
      table.uniques.push(u[1].split(',').map((c) => c.trim()));
      continue;
    }

    const c = /^\s{4}(\[?[a-z_][a-z0-9_]*\]?)\s+([a-z0-9]+)(\(([^)]*)\))?(.*)$/i.exec(line);
    if (!c) continue;
    const key = c[1].replace(/[[\]]/g, '');
    if (['constraint', 'primary', 'foreign', 'check', 'unique'].includes(key.toLowerCase())) continue;
    if (/\sAS\s.+PERSISTED/i.test(line)) continue;     // computed

    const sqlType = c[2].toLowerCase();
    const arg = c[4] || '';
    const rest = c[5] || '';
    const notNull = /NOT NULL/i.test(rest);
    const def = /DEFAULT\s+(.+?)(,|$)/i.exec(rest);

    table.columns.push({ key, sqlType, arg, notNull, default: def ? def[1].trim() : null });
  }
  return tables;
}

function defaultValue(col, type) {
  if (col.default === null) return undefined;
  const d = col.default;
  if (/SYSUTCDATETIME|NEWID|CAST\(/i.test(d)) return undefined;   // server-side, not a literal
  const s = /^N'(.*)'$/s.exec(d);
  if (s) {
    const v = s[1];
    if (type === 'longtext' || type === 'mediumtext') return undefined;  // Appwrite: no default on big text
    return v;
  }
  if (/^\d+$/.test(d)) return type === 'boolean' ? d === '1' : Number(d);
  if (/^-?\d+\.\d+$/.test(d)) return Number(d);
  return undefined;
}

function toColumn(col, table) {
  const notes = [];
  const enumEls = table.enums.get(col.key);
  const isArray = ARRAY_COLUMNS.has(col.key);

  let out;
  if (enumEls) {
    out = { key: col.key, type: 'string', format: 'enum', elements: enumEls };
  } else if (isArray) {
    /* A URL can be long; 2000 is the practical ceiling browsers honour. */
    out = { key: col.key, type: 'varchar', size: 2000, array: true };
  } else {
    switch (col.sqlType) {
      case 'uniqueidentifier': out = { key: col.key, type: 'varchar', size: 36 }; break;
      case 'bit':              out = { key: col.key, type: 'boolean' }; break;
      case 'int':              out = { key: col.key, type: 'integer' }; break;
      case 'bigint':           out = { key: col.key, type: 'bigint' }; break;
      case 'decimal':          out = { key: col.key, type: 'double' }; break;
      case 'datetime2':        out = { key: col.key, type: 'datetime' }; break;
      case 'date':             out = { key: col.key, type: 'datetime' }; break;
      case 'char':             out = { key: col.key, type: 'varchar', size: Number(col.arg) || 64 }; break;
      case 'nvarchar': {
        if (col.arg === 'max') out = { key: col.key, type: 'longtext', size: 1000000 };
        else out = { key: col.key, ...varcharFor(Number(col.arg)) };
        break;
      }
      default:
        out = { key: col.key, type: 'varchar', size: 255 };
        notes.push(`${table.name}.${col.key}: unmapped SQL type ${col.sqlType} -> varchar(255)`);
    }
  }

  /* Appwrite rejects a default on a required column and on an array column.
     A SQL Server column that is NOT NULL WITH a default is better expressed
     here as optional-with-that-default: the value still lands, and nothing has
     to send it explicitly. NOT NULL with no default stays required. */
  const d = out.array ? undefined : defaultValue(col, out.type);

  /* An array column can have neither a default nor, sensibly, required. In SQL
     Server photo_urls is NOT NULL DEFAULT '[]', so a post with no photos just
     omitted it. Marking it required here would make every create path send an
     explicit empty array or be rejected — friction on the most common case.
     So arrays are optional, and the READ side must treat a missing array as
     empty: `photo_urls ?? []`. That is the one rule this mapping asks of the
     application code, and it is written down in db/appwrite/README.md too. */
  out.required = col.notNull && d === undefined && !out.array;
  if (d !== undefined && !out.required) out.default = d;

  return { column: out, notes };
}

function main() {
  const tables = parseSchema();
  const allNotes = [];

  const sqlIndexes = readFileSync(SRC, 'utf8')
    .split('\n')
    .map((l) => /^CREATE (UNIQUE )?(?:CLUSTERED |NONCLUSTERED )?INDEX ([a-z_0-9]+) ON app\.([a-z_]+) \(([^)]*)\)/i.exec(l))
    .filter(Boolean);

  const out = {
    projectId: 'wecycle',
    projectName: 'Wecycle',
    tablesDB: [{ $id: DB_ID, name: 'Wecycle', enabled: true }],
    tables: [],
  };

  for (const [full, table] of tables) {
    if (SKIP_TABLES.has(full) || table.schema !== 'app') continue;

    const moved = MOVED_TO_SERVER_ONLY[table.name] ?? [];
    const columns = [];
    for (const col of table.columns) {
      if (SKIP_COLUMNS.has(col.key)) continue;
      if (moved.includes(col.key)) continue;
      const { column, notes } = toColumn(col, table);
      columns.push(column);
      allNotes.push(...notes);
    }

    const indexes = [];
    const composite = COMPOSITE_KEYS[table.name];
    if (composite) {
      indexes.push({
        key: `uq_${table.name}`,
        type: 'unique',
        columns: composite,
        orders: composite.map(() => 'ASC'),
      });
    }

    const skipped = (cols) => cols.some((c) => INDEX_SKIP.has(`${table.name}:${c}`));

    for (const cols of table.uniques) {
      const keep = cols.filter((c) => c !== 'id');
      if (skipped(keep)) continue;
      if (!keep.length || !keep.every((c) => columns.some((x) => x.key === c))) continue;
      indexes.push({
        key: `uq_${table.name}_${keep.join('_')}`.slice(0, 36),
        type: 'unique',
        columns: keep,
        orders: keep.map(() => 'ASC'),
      });
    }

    for (const m of sqlIndexes) {
      if (m[3] !== table.name) continue;
      const cols = m[4].split(',').map((c) => c.trim().split(/\s+/)[0]).filter((c) => c !== 'id');
      if (!cols.length) continue;
      if (!cols.every((c) => columns.some((x) => x.key === c))) continue;
      if (skipped(cols)) continue;
      indexes.push({
        key: m[2].slice(0, 36),
        type: m[1] ? 'unique' : 'key',
        columns: cols,
        orders: m[4].split(',').map((c) => (/DESC/i.test(c) ? 'DESC' : 'ASC')).slice(0, cols.length),
      });
    }

    out.tables.push({
      $id: table.name,
      databaseId: DB_ID,
      name: table.name,
      enabled: true,
      /* Deliberately empty. Appwrite permissions replace Row Level Security
         and are the one thing that MUST NOT be generated from a SQL schema —
         see the permissions section in db/appwrite/README.md. Set them per
         table, on purpose, before this project holds anyone's data. */
      '$permissions': [],
      documentSecurity: true,
      columns,
      indexes,
    });
  }

  /* The server-only half of the split. Empty permissions is the whole point:
     only a server key reads this. */
  out.tables.push({
    $id: 'profile_contacts',
    databaseId: DB_ID,
    name: 'profile_contacts',
    enabled: true,
    '$permissions': [],
    documentSecurity: true,
    columns: [
      { key: 'email', type: 'varchar', size: 320, required: false },
      { key: 'phone', type: 'varchar', size: 32, required: false },
    ],
    indexes: [],
  });

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  /* ── Columns the DATABASE used to fill ───────────────────────────────────
   *
   * Postgres had DEFAULT now() on posted_at, created_at, joined_at and forty
   * others, so the app never sent them and never had to. Appwrite cannot
   * express a server-side default, so those columns come out `required` — and
   * an app that has never sent posted_at would fail on every post, every save,
   * every comment and every sign-up, with a message naming a column its
   * authors correctly believe they do not manage.
   *
   * Rather than make the app supply 50 timestamps, the adapter fills them on
   * insert exactly as the database did. This file is that list, generated from
   * the same schema so it cannot drift from it.
   *
   * Note what is NOT here: events.starts_at is required and has no default,
   * because an event's start time is genuinely the user's to give. Postgres
   * would have rejected that insert too. Filling it with now() would turn a
   * real bug into an event that silently starts the moment it is created. */
  const filled = {};
  for (const [full, table] of tables) {
    if (table.schema !== 'app') continue;
    const cols = table.columns
      .filter(c => /SYSUTCDATETIME|GETUTCDATE/i.test(c.default ?? '') && c.notNull)
      .map(c => c.key);
    if (cols.length) filled[table.name] = cols;
  }
  /* ── Who owns a new row ──────────────────────────────────────────────────
   *
   * Migrated rows were given per-row owner permissions by set-permissions.mjs.
   * Rows the APP creates need the same stamp, or a member posts a listing and
   * then cannot edit or delete it — the table grants create, never update.
   *
   * Both read db/appwrite/ownership.json so the two cannot disagree. They
   * disagreeing is precisely how you get an app where old posts are editable
   * and new ones silently are not. */
  const own = JSON.parse(readFileSync(join(HERE, '..', 'ownership.json'), 'utf8'));
  const ownTs = `/* GENERATED by db/appwrite/tools/generate-schema.mjs — do not edit.
 * Source: db/appwrite/ownership.json
 */
export const OWNER_COLUMN: Record<string, string> = ${JSON.stringify(own.ownerColumn, null, 2)};
export const PRIVATE_TO_OWNER: ReadonlySet<string> = new Set(${JSON.stringify(own.privateToOwner)});
`;
  writeFileSync(join(HERE, '..', '..', '..', 'lib', 'appwrite', 'generatedOwnership.ts'), ownTs, 'utf8');

  const ts = `/* GENERATED by db/appwrite/tools/generate-schema.mjs — do not edit.
 *
 * Columns Postgres filled with DEFAULT now(). Appwrite has no server-side
 * default, so the adapter supplies them on insert instead. See the note in the
 * generator for why events.starts_at is deliberately absent.
 */
export const SERVER_FILLED_TIMESTAMPS: Record<string, string[]> = ${JSON.stringify(filled, null, 2)};
`;
  writeFileSync(join(HERE, '..', '..', '..', 'lib', 'appwrite', 'generatedDefaults.ts'), ts, 'utf8');
  console.log(`  ${Object.keys(filled).length} tables have columns the adapter must fill`);

  const cols = out.tables.reduce((a, t) => a + t.columns.length, 0);
  const idx = out.tables.reduce((a, t) => a + t.indexes.length, 0);
  const enums = out.tables.reduce((a, t) => a + t.columns.filter((c) => c.format === 'enum').length, 0);
  const arrays = out.tables.reduce((a, t) => a + t.columns.filter((c) => c.array).length, 0);

  console.log(`\nWrote ${OUT}`);
  console.log(`  ${out.tables.length} tables, ${cols} columns, ${idx} indexes`);
  console.log(`  ${enums} enum columns, ${arrays} array columns`);
  if (allNotes.length) {
    console.log('\nNotes:');
    for (const n of [...new Set(allNotes)]) console.log('  - ' + n);
  }
  console.log('');
}

main();
