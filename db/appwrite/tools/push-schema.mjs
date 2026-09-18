#!/usr/bin/env node
/**
 * push-schema.mjs — create the database, tables, columns and indexes described
 * by appwrite.json.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a
 *   node db/appwrite/tools/push-schema.mjs --dry-run
 *   node db/appwrite/tools/push-schema.mjs
 *
 * Written rather than using `appwrite push` so that the thing creating the
 * schema and the thing that generated appwrite.json agree exactly, and so a
 * failure names the column it failed on instead of the file.
 *
 * ── COLUMNS ARE CREATED ASYNCHRONOUSLY ──────────────────────────────────────
 *
 * This is the detail that breaks naive scripts. Appwrite accepts a column
 * immediately and builds it in the background; it carries a status of
 * "processing" until it is "available". An index created against a column that
 * is still processing fails — and it fails *sometimes*, depending on timing,
 * which is the worst kind of failure to debug. So every table is polled until
 * its columns settle before any index is attempted.
 *
 * Idempotent: a 409 means it already exists, which is counted as success, so
 * this can be re-run after a partial failure and only does what is missing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(HERE, '..', 'appwrite.json'), 'utf8'));

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || CONFIG.tablesDB[0].$id;
const DRY = process.argv.includes('--dry-run');

if (!DRY && (!ENDPOINT || !PROJECT || !KEY)) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT and APPWRITE_KEY.');
  console.error('  set -a && . db/appwrite/appwrite.env && set +a');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  if (DRY) return { ok: true, status: 200, json: {} };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT,
        'X-Appwrite-Key': KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    /* Appwrite rate-limits; backing off is cheaper than failing 1,000 calls in. */
    if (res.status === 429 && attempt < 5) { await sleep(1000 * (attempt + 1)); continue; }
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  }
}

/* appwrite.json speaks the CLI's type names; the REST API has an endpoint per
   type. This is the only place the two vocabularies meet. */
function endpointFor(col) {
  if (col.format === 'enum') return 'enum';
  switch (col.type) {
    case 'varchar': return 'varchar';
    case 'text': return 'text';
    case 'mediumtext': return 'mediumtext';
    case 'longtext': return 'longtext';
    case 'string': return 'string';
    case 'integer': return 'integer';
    case 'bigint': return 'bigint';
    case 'double': return 'float';
    case 'boolean': return 'boolean';
    case 'datetime': return 'datetime';
    default: return null;
  }
}

function bodyFor(col) {
  const b = { key: col.key, required: !!col.required };
  if (col.array) b.array = true;
  if (col.default !== undefined && !col.required && !col.array) b.default = col.default;
  if (col.format === 'enum') b.elements = col.elements;
  else if (['varchar', 'text', 'string'].includes(col.type)) b.size = col.size;
  return b;
}

async function waitForColumns(tableId, expected) {
  if (DRY) return { ready: expected, stuck: [] };
  for (let i = 0; i < 60; i++) {
    const res = await api('GET', `/tablesdb/${DB}/tables/${tableId}`);
    const cols = res.json?.columns ?? [];
    const pending = cols.filter((c) => c.status === 'processing');
    const failed = cols.filter((c) => c.status === 'failed');
    if (!pending.length) return { ready: cols.length, stuck: failed.map((c) => c.key) };
    await sleep(700);
  }
  return { ready: -1, stuck: ['timed out waiting for columns'] };
}

async function main() {
  console.log(`\n${DRY ? '[dry run] ' : ''}pushing schema to ${DRY ? '(nowhere)' : ENDPOINT}`);
  console.log(`database: ${DB}   tables: ${CONFIG.tables.length}\n`);

  const dbRes = await api('POST', '/tablesdb', { databaseId: DB, name: 'Wecycle' });
  console.log(dbRes.ok ? 'database created' : dbRes.status === 409 ? 'database already there' : `database FAILED: ${dbRes.status} ${dbRes.json?.message ?? ''}`);
  if (!dbRes.ok && dbRes.status !== 409) process.exit(1);

  let madeTables = 0, madeCols = 0, madeIdx = 0;
  const problems = [];

  for (const t of CONFIG.tables) {
    const tRes = await api('POST', `/tablesdb/${DB}/tables`, {
      tableId: t.$id,
      name: t.name,
      permissions: t['$permissions'] ?? [],
      rowSecurity: t.documentSecurity !== false,
      enabled: true,
    });
    if (tRes.ok) madeTables++;
    else if (tRes.status !== 409) { problems.push(`table ${t.$id}: ${tRes.status} ${tRes.json?.message ?? ''}`); continue; }

    let cols = 0;
    for (const col of t.columns) {
      const ep = endpointFor(col);
      if (!ep) { problems.push(`${t.$id}.${col.key}: no endpoint for type ${col.type}`); continue; }
      const res = await api('POST', `/tablesdb/${DB}/tables/${t.$id}/columns/${ep}`, bodyFor(col));
      if (res.ok) { cols++; madeCols++; }
      else if (res.status !== 409) problems.push(`${t.$id}.${col.key} (${ep}): ${res.status} ${res.json?.message ?? ''}`);
    }

    const { stuck } = await waitForColumns(t.$id, t.columns.length);
    if (stuck.length) problems.push(`${t.$id}: columns not available — ${stuck.join(', ')}`);

    let idx = 0;
    for (const index of t.indexes) {
      const res = await api('POST', `/tablesdb/${DB}/tables/${t.$id}/indexes`, {
        key: index.key,
        type: index.type,
        columns: index.columns,
        orders: index.orders,
      });
      if (res.ok) { idx++; madeIdx++; }
      else if (res.status !== 409) problems.push(`${t.$id} index ${index.key}: ${res.status} ${res.json?.message ?? ''}`);
    }

    console.log(`  ${t.$id.padEnd(24)} ${String(cols).padStart(3)} columns, ${String(idx).padStart(2)} indexes`);
  }

  console.log(`\n${madeTables} tables, ${madeCols} columns, ${madeIdx} indexes created`);
  if (problems.length) {
    console.log('\nproblems:');
    for (const p of problems.slice(0, 40)) console.log('  ! ' + p);
    if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
    process.exitCode = 1;
  } else {
    console.log('\nSchema is up. Next: import-data.mjs\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
