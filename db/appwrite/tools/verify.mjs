#!/usr/bin/env node
/**
 * verify.mjs — count what is in Appwrite and compare it to the dump.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a
 *   node db/appwrite/tools/verify.mjs ~/wecycle_backup.sql
 *
 * ── WHY A SEPARATE STEP ─────────────────────────────────────────────────────
 *
 * Because "the import printed no errors" is not evidence. An import can skip a
 * row it never reached, a 409 can hide a row that differs from the one already
 * there, and a table whose name was mistyped simply never appears. The only
 * statement worth making before anyone deletes the source is: I counted what
 * arrived, and it equals what left.
 *
 * So this reads the counts back OUT of Appwrite and diffs them against the
 * COPY blocks in the dump. It writes nothing.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || 'wecycle';

if (!ENDPOINT || !PROJECT || !KEY) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT and APPWRITE_KEY.');
  process.exit(2);
}

async function api(path) {
  const res = await fetch(ENDPOINT + path, {
    headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

async function dumpCounts(path) {
  const counts = new Map();
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let cur = null, n = 0;
  for await (const line of rl) {
    if (cur) {
      if (line === '\\.') { counts.set(cur, n); cur = null; n = 0; }
      else n++;
      continue;
    }
    const m = /^COPY (public\.[a-z_0-9]+|auth\.users|storage\.objects) \(/.exec(line);
    if (m) { cur = m[1]; n = 0; }
  }
  return counts;
}

async function main() {
  const dump = process.argv[2];
  if (!dump) { console.error('usage: node verify.mjs <pg_dump .sql>'); process.exit(2); }

  const source = await dumpCounts(dump);

  console.log('\n  source → Appwrite\n');
  let mismatches = 0, checked = 0;

  /* Accounts first — the one thing with no second copy anywhere. */
  const users = await api('/users?queries[]=' + encodeURIComponent(JSON.stringify({ method: 'limit', values: [1] })));
  const wantUsers = source.get('auth.users') ?? 0;
  const gotUsers = users.json?.total ?? -1;
  const uOk = gotUsers >= wantUsers;
  if (!uOk) mismatches++;
  checked++;
  console.log(`  ${uOk ? 'ok  ' : 'BAD '} ${String(wantUsers).padStart(5)} → ${String(gotUsers).padStart(5)}   auth users`);
  console.log('');

  for (const [pgName, want] of [...source].sort()) {
    if (pgName === 'auth.users' || pgName.startsWith('storage.')) continue;
    const table = pgName.replace('public.', '');
    const res = await api(`/tablesdb/${DB}/tables/${table}/rows?queries[]=`
      + encodeURIComponent(JSON.stringify({ method: 'limit', values: [1] })));

    if (!res.ok) {
      /* A table that is not there at all is different from one that is empty,
         and only one of those is a problem. */
      if (want > 0) { mismatches++; console.log(`  BAD  ${String(want).padStart(5)} →     ?   ${table}  (${res.status} ${res.json?.message ?? ''})`.trim()); }
      continue;
    }
    const got = res.json?.total ?? -1;
    checked++;
    /* MORE rows than the dump is the app being used, not a fault. The dump is
       a snapshot from before the cutover; members have posted since. Only
       FEWER rows means something did not arrive. */
    if (got < want) {
      mismatches++;
      console.log(`  BAD  ${String(want).padStart(5)} → ${String(got).padStart(5)}   ${table}  (${want - got} missing)`);
    } else if (got > want) {
      console.log(`  ok   ${String(want).padStart(5)} → ${String(got).padStart(5)}   ${table}  (+${got - want} since the dump)`);
    } else if (want > 0) {
      console.log(`  ok   ${String(want).padStart(5)} → ${String(got).padStart(5)}   ${table}`);
    }
  }

  /* Storage: metadata says 141 files exist. Until they are uploaded this is
     expected to be short, and saying so is the point. */
  const buckets = await api('/storage/buckets');
  /* The runtime key deliberately has no buckets.read — it was narrowed to six
     scopes. Reporting "0 files, DO NOT delete Supabase" when the real answer is
     "this key cannot look" is worse than reporting nothing: it is a verifier
     crying wolf, and the next real warning gets ignored. */
  const blind = buckets.status === 401;
  const nBuckets = buckets.json?.total ?? 0;
  let files = 0;
  for (const b of buckets.json?.buckets ?? []) {
    const f = await api(`/storage/buckets/${b.$id}/files?queries[]=`
      + encodeURIComponent(JSON.stringify({ method: 'limit', values: [1] })));
    files += f.json?.total ?? 0;
  }

  /* The dump records how many objects Storage held, so the expected number is
     read from it rather than hardcoded — otherwise this check quietly stops
     meaning anything the first time someone uploads a photo. */
  const expectedFiles = source.get('storage.objects') ?? 0;
  if (blind) {
    console.log(`\n  storage: NOT CHECKED — this key has no buckets.read.`);
    console.log('  That is deliberate (the runtime key is narrowed), not a failure.');
    console.log('  Check it the way the app does, with no key at all:');
    console.log('    node verify-media.mjs ~/wecycle-media');
  } else {
    console.log(`\n  storage: ${nBuckets} bucket(s), ${files} file(s) of ${expectedFiles} recorded in the dump`);
    if (!(expectedFiles > 0 && files >= expectedFiles)) {
      mismatches++;
      console.log(`  ${expectedFiles - files} file(s) missing — they exist only in Supabase.`);
      console.log('  Checksums are the real test: node verify-media.mjs ~/wecycle-media');
    }
  }

  console.log(`\n  ${checked} checks, ${mismatches} mismatch${mismatches === 1 ? '' : 'es'}`);
  if (mismatches) {
    console.log('\n  DO NOT delete the Supabase project.\n');
    process.exitCode = 1;
  } else {
    console.log('\n  Database and accounts match the source.');
    console.log(blind
      ? '  Storage was NOT checked — run verify-media.mjs for that.\n'
      : '  Storage matches too; byte-level proof is verify-media.mjs.\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
