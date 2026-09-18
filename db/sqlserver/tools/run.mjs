#!/usr/bin/env node
/**
 * run.mjs — run a .sql script against SQL Server without sqlcmd installed.
 *
 *     node run.mjs ../wecycle-sqlserver.sql
 *     node run.mjs ../../data/wecycle-data.sql
 *
 * Connection comes from MSSQL_URL, e.g.
 *     export MSSQL_URL="Server=localhost,1433;User Id=sa;Password=...;TrustServerCertificate=true"
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * GO is not SQL. It is a batch separator that sqlcmd and SSMS understand and
 * that no driver does — send a file containing GO straight to the mssql
 * package and it fails on the first one. Since the schema NEEDS batches (you
 * cannot CREATE PROCEDURE in the middle of another statement), the file has to
 * be split on GO and the pieces sent one at a time. That is all this does.
 *
 * The split is deliberately naive — a line that is only GO — so a GO inside a
 * string literal or a comment would split wrongly. wecycle-sqlserver.sql is
 * written to never contain one.
 */

import { readFileSync } from 'node:fs';
import sql from 'mssql';

const file = process.argv[2];
const conn = process.env.MSSQL_URL;
if (!file || !conn) {
  console.error('usage: MSSQL_URL="Server=...;User Id=...;Password=...;TrustServerCertificate=true" node run.mjs <file.sql>');
  process.exit(2);
}

const batches = readFileSync(file, 'utf8')
  .split(/^\s*GO\s*$/im)
  .map((b) => b.trim())
  .filter(Boolean);

const pool = await sql.connect(conn);

/* PRINT output arrives as an "info" event, not in the result set. Without this
   the verification section at the end of the schema prints nothing and the run
   looks like it did less than it did. */
pool.on('info', (m) => { if (m.message) console.log(m.message); });

let ok = 0;
for (const [i, batch] of batches.entries()) {
  try {
    const req = pool.request();
    req.on('info', (m) => { if (m.message) console.log(m.message); });
    await req.batch(batch);
    ok++;
  } catch (e) {
    console.error(`\n✗ batch ${i + 1} of ${batches.length} failed:`);
    console.error('  ' + e.message);
    console.error('  ' + batch.split('\n').slice(0, 4).join('\n  '));
    await pool.close();
    process.exit(1);
  }
}

console.log(`\n${ok}/${batches.length} batches OK — ${file}`);
await pool.close();
