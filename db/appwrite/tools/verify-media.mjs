#!/usr/bin/env node
/**
 * verify-media.mjs — prove every migrated file is byte-identical to its source.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a
 *   node db/appwrite/tools/verify-media.mjs ~/wecycle-media
 *
 * ── WHY CHECKSUMS AND NOT COUNTS ────────────────────────────────────────────
 *
 * "141 files uploaded" and "141 files present" can both be true while a file
 * is truncated, is the wrong file under the right name, or is an error page an
 * uploader helpfully saved with a .jpg extension. Counting catches none of it.
 *
 * So this downloads each file back out of Appwrite and compares an MD5 of the
 * bytes against the local copy. MD5 is chosen deliberately: this is a
 * corruption check against accident, not a defence against an adversary
 * choosing colliding files, and the id scheme already derives from the path.
 *
 * Downloads with no credentials on purpose — as an anonymous visitor would —
 * so it also proves the bucket permissions actually allow the app to read
 * them. A file that verifies with an API key but 401s for a real user has not
 * migrated in any sense that matters.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;

const md5 = (b) => createHash('md5').update(b).digest('hex');
const fileIdFor = (bucket, path) => md5(`${bucket}/${path}`).slice(0, 32);

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

async function main() {
  const dir = resolve(process.argv[2] || '/Users/madhavrathi/wecycle-media');
  if (!existsSync(dir) || !ENDPOINT || !PROJECT) {
    console.error('need APPWRITE_ENDPOINT, APPWRITE_PROJECT and a media directory');
    process.exit(2);
  }

  const buckets = readdirSync(dir).filter((b) => statSync(join(dir, b)).isDirectory());
  const jobs = [];
  for (const b of buckets) for (const rel of walk(join(dir, b))) jobs.push({ bucket: b, rel });

  console.log(`\n  verifying ${jobs.length} files, byte for byte, as an anonymous visitor\n`);

  let ok = 0;
  const bad = [];
  let bytes = 0;

  const queue = [...jobs];
  const worker = async () => {
    for (;;) {
      const j = queue.shift();
      if (!j) return;
      const local = readFileSync(join(dir, j.bucket, j.rel));
      const id = fileIdFor(j.bucket, j.rel);
      const url = `${ENDPOINT}/storage/buckets/${j.bucket}/files/${id}/download?project=${PROJECT}`;
      try {
        const res = await fetch(url);
        if (!res.ok) { bad.push(`${j.bucket}/${j.rel}: HTTP ${res.status}`); continue; }
        const remote = Buffer.from(await res.arrayBuffer());
        if (md5(remote) === md5(local)) { ok++; bytes += remote.length; }
        else bad.push(`${j.bucket}/${j.rel}: checksum differs (${local.length} local vs ${remote.length} remote)`);
      } catch (e) {
        bad.push(`${j.bucket}/${j.rel}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  console.log(`  ${ok} of ${jobs.length} byte-identical  (${(bytes / 1048576).toFixed(1)} MB verified)`);
  if (bad.length) {
    console.log(`\n  ${bad.length} PROBLEM(S):`);
    for (const b of bad.slice(0, 20)) console.log('    ! ' + b);
    console.log('\n  DO NOT delete the Supabase project.\n');
    process.exitCode = 1;
  } else {
    console.log('\n  Every file matches its source, and every one is readable without credentials.\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
