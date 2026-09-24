#!/usr/bin/env node
/**
 * fix-buckets.mjs — make the storage buckets writable, and create the missing ones.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a
 *   node db/appwrite/tools/fix-buckets.mjs --dry-run
 *   node db/appwrite/tools/fix-buckets.mjs
 *
 * NEEDS A KEY WITH buckets.read + buckets.write. The runtime key does not have
 * them — it was deliberately narrowed to six scopes — so this wants a
 * short-lived admin key made in the console and deleted afterwards.
 *
 * ── WHAT WENT WRONG ────────────────────────────────────────────────────────
 *
 * upload-media.mjs created the buckets it needed in order to PUT the migrated
 * photos in, using a server key, and gave them `read("any")` — which was all
 * that reading them back required. Nobody noticed that no client could write,
 * because the migration never wrote as a client. The first member to add a
 * photo to a listing got:
 *
 *     Couldn't upload your photo: No permissions provided for action 'create'
 *
 * And only three buckets exist at all — listings, events, lost-found — because
 * those were the only three with files to migrate. avatars, community and
 * form-uploads were never created, so uploading an avatar fails differently
 * again, with a bucket that is not there.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────
 *
 * create("users")   signed-in members may upload.
 * NO bucket-wide update/delete. Granting those would let any member delete any
 *   other member's photo. Ownership is per file, stamped at upload by
 *   lib/appwrite/storageAdapter.ts — the same rule rows follow.
 * fileSecurity: true so those per-file permissions are actually consulted;
 *   with it off Appwrite ignores them and only the bucket's own apply.
 *
 * form-uploads is the exception: it was private in Supabase and stays private
 * here, so it gets no public read. See the note below it.
 */

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!DRY && (!ENDPOINT || !PROJECT || !KEY)) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT and APPWRITE_KEY (needs buckets.write).');
  process.exit(2);
}

/* 50MB: the largest migrated photo is 4.9MB, and a short clip can be larger. */
const MAX = 52428800;
const PUBLIC = ['read("any")', 'create("users")'];

const BUCKETS = [
  ['listings',     PUBLIC],
  ['events',       PUBLIC],
  ['lost-found',   PUBLIC],
  ['avatars',      PUBLIC],
  ['community',    PUBLIC],
  /* Private. Event form answers can carry anything an organiser asked for, so
     there is no public read: a file is readable only by whoever the uploader's
     per-file permissions name. The organiser reading responses is NOT solved
     by this and is noted in db/appwrite/README.md. */
  ['form-uploads', ['create("users")']],
];

async function api(method, path, body) {
  if (DRY) return { ok: true, status: 200, json: {} };
  const res = await fetch(ENDPOINT + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log(`\n${DRY ? '[dry run] ' : ''}fixing ${BUCKETS.length} storage buckets\n`);

  const probe = await api('GET', '/storage/buckets');
  if (!DRY && probe.status === 401) {
    console.error('  This key cannot see buckets — it needs buckets.read + buckets.write.');
    console.error('  Make a short-lived key in the Appwrite console, use it here, delete it after.');
    process.exit(1);
  }
  const existing = new Set((probe.json?.buckets ?? []).map(b => b.$id));

  let made = 0, fixed = 0;
  const problems = [];

  for (const [id, permissions] of BUCKETS) {
    const body = {
      name: id, permissions, fileSecurity: true,
      maximumFileSize: MAX, enabled: true, compression: 'none',
    };
    const res = existing.has(id)
      ? await api('PUT', `/storage/buckets/${id}`, body)
      : await api('POST', '/storage/buckets', { bucketId: id, ...body });

    if (res.ok) {
      existing.has(id) ? fixed++ : made++;
      console.log(`  ${existing.has(id) ? 'fixed  ' : 'created'} ${id.padEnd(14)} ${permissions.join(' ')}`);
    } else {
      problems.push(`${id}: ${res.status} ${res.json?.message ?? ''}`);
    }
  }

  console.log(`\n  ${made} created, ${fixed} fixed`);
  if (problems.length) {
    console.log('\n  problems:');
    for (const p of problems) console.log('    ! ' + p);
    process.exitCode = 1;
  } else {
    console.log('  Members can upload; each file names its uploader, so only they can delete it.\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
