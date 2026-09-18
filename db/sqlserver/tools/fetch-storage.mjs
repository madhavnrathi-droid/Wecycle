#!/usr/bin/env node
/**
 * fetch-storage.mjs — download the files a pg_dump cannot contain.
 *
 *     node fetch-storage.mjs ~/wecycle_backup.sql
 *     node fetch-storage.mjs ~/wecycle_backup.sql --out ~/wecycle-media
 *
 * ── THE GAP THIS FILLS ──────────────────────────────────────────────────────
 *
 * A pg_dump contains the DATABASE. Supabase Storage is not in the database —
 * it is object storage, and all the dump has is storage.objects, a table of
 * file names. 141 rows of "this file exists", and not one byte of any file.
 *
 * Those files are every listing photo, every event cover and every lost-and-
 * found picture in the app. Restore the dump without them and the schema is
 * perfect, the data is perfect, and every photo is a broken image, because
 * listings.photo_urls still points at a Supabase URL that no longer serves
 * anything.
 *
 * So this walks storage.objects in the dump, fetches each file from the public
 * bucket URL, and writes it to disk as <out>/<bucket>/<path>.
 *
 * ── IT WILL NOT WORK WHILE THE PROJECT IS RESTRICTED ────────────────────────
 *
 * Checked on 2026-09-18: those URLs answer 402, the same
 * exceed_cached_egress_quota that took sign-in down. Which is itself the
 * diagnosis — "cached egress" is CDN bandwidth, and 119 listing photos being
 * served to every visitor is where the bandwidth went.
 *
 * So the order has to be: lift the quota first, then run this. There is no way
 * around it; the files are behind the same wall. And when the images do move
 * to another host, that wall stops being reachable at all.
 *
 * Resumable — a file already on disk is skipped, so re-running after a failure
 * costs only what it missed.
 */

import { createReadStream, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';

const PROJECT = process.env.SUPABASE_PROJECT_REF || 'oxqnwqaumrqdiwrlvfel';
const BASE = process.env.SUPABASE_URL || `https://${PROJECT}.supabase.co`;
const CONCURRENCY = 4;

async function objectsFromDump(path) {
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  const out = [];
  let inCopy = false;
  let cols = null;
  for await (const line of rl) {
    if (inCopy) {
      if (line === '\\.') break;
      const f = line.split('\t');
      const bucket = f[cols.indexOf('bucket_id')];
      const name = f[cols.indexOf('name')];
      if (bucket && name && bucket !== '\\N' && name !== '\\N') out.push({ bucket, name });
      continue;
    }
    const m = /^COPY storage\.objects \(([^)]*)\) FROM stdin;/.exec(line);
    if (m) { inCopy = true; cols = m[1].split(',').map((c) => c.trim().replace(/"/g, '')); }
  }
  return out;
}

async function main() {
  const dump = process.argv[2];
  const outIdx = process.argv.indexOf('--out');
  const outDir = resolve(outIdx > 0 ? process.argv[outIdx + 1] : './wecycle-media');

  if (!dump) {
    console.error('usage: node fetch-storage.mjs <pg_dump .sql> [--out <dir>]');
    process.exit(2);
  }

  const objects = await objectsFromDump(dump);
  console.log(`\n${objects.length} files listed in the dump`);
  const byBucket = objects.reduce((a, o) => ((a[o.bucket] = (a[o.bucket] || 0) + 1), a), {});
  for (const [b, n] of Object.entries(byBucket)) console.log(`  ${String(n).padStart(4)}  ${b}`);
  console.log(`\nwriting to ${outDir}\n`);

  let ok = 0, skipped = 0;
  const failed = [];

  const queue = [...objects];
  const worker = async () => {
    for (;;) {
      const o = queue.shift();
      if (!o) return;
      const dest = join(outDir, o.bucket, o.name);
      if (existsSync(dest) && statSync(dest).size > 0) { skipped++; continue; }

      const url = `${BASE}/storage/v1/object/public/${o.bucket}/${o.name}`;
      try {
        const res = await fetch(url);
        if (!res.ok) { failed.push({ url, status: res.status }); continue; }
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        ok++;
      } catch (e) {
        failed.push({ url, status: (e && e.message) || 'network error' });
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`downloaded ${ok}, already had ${skipped}, failed ${failed.length}`);

  if (failed.length) {
    const statuses = failed.reduce((a, f) => ((a[f.status] = (a[f.status] || 0) + 1), a), {});
    console.log('\nfailures by status:');
    for (const [s, n] of Object.entries(statuses)) console.log(`  ${String(n).padStart(4)}  ${s}`);
    if (statuses[402]) {
      console.log('\n402 means the project is still restricted — the files are behind the same');
      console.log('quota wall as the API. Lift it in the Supabase dashboard (Billing), then');
      console.log('run this again. Nothing already downloaded is refetched.');
    }
    process.exitCode = 1;
  } else if (ok + skipped === objects.length) {
    console.log('\nAll files accounted for.');
    console.log('Next: host them somewhere, then rewrite the URLs in photo_urls /');
    console.log('cover_url — they still point at Supabase. See db/README.md.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
