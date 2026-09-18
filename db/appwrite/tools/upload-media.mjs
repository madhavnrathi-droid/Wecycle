#!/usr/bin/env node
/**
 * upload-media.mjs — put the 141 images into Appwrite Storage and repoint the
 * rows at them.
 *
 *   export APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
 *   export APPWRITE_PROJECT="<project id>"
 *   export APPWRITE_KEY="<a server API key>"
 *
 *   node upload-media.mjs ~/wecycle-media              # upload + rewrite
 *   node upload-media.mjs ~/wecycle-media --no-rewrite # upload only
 *   node upload-media.mjs ~/wecycle-media --dry-run
 *
 * Expects the layout fetch-storage.mjs writes: <dir>/<bucket>/<path...>.
 *
 * ── THIS IS THE STEP THAT IS EASY TO FORGET, AND FATAL TO FORGET ────────────
 *
 * Uploading the files is only half of it. listings.photo_urls, events.cover_url
 * and lost_found_reports.photo_urls all contain ABSOLUTE Supabase URLs. Import
 * the data, upload the images, and stop there, and every photo in the app is
 * still requested from a Supabase project that is restricted, suspended, or
 * eventually deleted. It looks like it worked until the day it does not.
 *
 * So this walks every row that can hold an image URL and rewrites it. That is
 * also why uploads use a DETERMINISTIC file id — the md5 of the original
 * bucket+path — so the new URL can be computed from the old one without
 * keeping a mapping file around, and re-running is safe.
 *
 * Appwrite file ids allow [a-zA-Z0-9._-] and at most 36 characters, which a
 * Supabase storage path ("<uuid>/1779271124055-0.jpg") is not.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || 'wecycle';
const SUPABASE_REF = process.env.SUPABASE_PROJECT_REF || 'oxqnwqaumrqdiwrlvfel';

const DRY = process.argv.includes('--dry-run');
const NO_REWRITE = process.argv.includes('--no-rewrite');

/* Which tables hold image URLs, and in which columns. Array columns and single
   ones are handled the same way. */
const URL_COLUMNS = {
  listings:           ['photo_urls', 'video_urls'],
  requests:           ['photo_urls', 'video_urls'],
  events:             ['photo_urls', 'video_urls', 'cover_url'],
  lost_found_reports: ['photo_urls', 'video_urls'],
  profiles:           ['avatar_url'],
  communities:        ['cover_url'],
  inventory_items:    ['photo_url'],
};

const fileIdFor = (bucket, path) =>
  createHash('md5').update(`${bucket}/${path}`).digest('hex').slice(0, 32);

const publicUrl = (bucket, fileId) =>
  `${ENDPOINT}/storage/buckets/${bucket}/files/${fileId}/view?project=${PROJECT}`;

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.pdf': 'application/pdf',
};

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

async function api(path, init = {}) {
  if (DRY) return { ok: true, status: 200 };
  const res = await fetch(ENDPOINT + path, {
    ...init,
    headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY, ...(init.headers || {}) },
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

async function ensureBucket(id) {
  const got = await api(`/storage/buckets/${id}`, { method: 'GET' });
  if (got.ok) return;
  await api('/storage/buckets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    /* read("any") because these are listing photos on a public feed — the same
       thing the Supabase buckets were. Nothing private goes in here; the
       form-uploads bucket was private and holds no images. */
    body: JSON.stringify({ bucketId: id, name: id, permissions: ['read("any")'], fileSecurity: false }),
  });
}

async function main() {
  const dir = resolve(process.argv[2] || './wecycle-media');
  if (!existsSync(dir)) {
    console.error(`${dir} does not exist. Run fetch-storage.mjs first — and note it`);
    console.error('cannot download anything while the Supabase project is restricted.');
    process.exit(2);
  }
  if (!DRY && (!PROJECT || !KEY)) {
    console.error('Set APPWRITE_PROJECT and APPWRITE_KEY (a server API key).');
    process.exit(2);
  }

  const buckets = readdirSync(dir).filter((b) => statSync(join(dir, b)).isDirectory());
  console.log(`\n${DRY ? '[dry run] ' : ''}buckets found: ${buckets.join(', ') || '(none)'}\n`);

  const map = new Map();       // old Supabase URL -> new Appwrite URL
  let uploaded = 0, already = 0;
  const failed = [];

  for (const bucket of buckets) {
    await ensureBucket(bucket);
    for (const rel of walk(join(dir, bucket))) {
      const fileId = fileIdFor(bucket, rel);
      const oldUrl = `https://${SUPABASE_REF}.supabase.co/storage/v1/object/public/${bucket}/${rel}`;
      map.set(oldUrl, publicUrl(bucket, fileId));

      if (DRY) { uploaded++; continue; }

      const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
      const form = new FormData();
      form.append('fileId', fileId);
      form.append('file', new Blob([readFileSync(join(dir, bucket, rel))],
        { type: MIME[ext] || 'application/octet-stream' }), rel.split('/').pop());

      const res = await api(`/storage/buckets/${bucket}/files`, { method: 'POST', body: form });
      if (res.ok) uploaded++;
      else if (res.status === 409) already++;
      else failed.push(`${bucket}/${rel}: ${res.status} ${res.json?.message ?? ''}`.trim());
    }
  }

  console.log(`files: ${uploaded} uploaded, ${already} already there, ${failed.length} failed`);
  for (const f of failed.slice(0, 5)) console.log('  ! ' + f);

  if (NO_REWRITE || !map.size) { console.log(''); return; }

  /* ── Repoint the rows ── */
  console.log('\nrewriting URLs in rows…');
  let changed = 0;

  for (const [table, columns] of Object.entries(URL_COLUMNS)) {
    let cursor = null;
    for (;;) {
      const q = new URLSearchParams();
      q.append('queries[]', JSON.stringify({ method: 'limit', values: [100] }));
      if (cursor) q.append('queries[]', JSON.stringify({ method: 'cursorAfter', values: [cursor] }));

      const page = await api(`/tablesdb/${DB}/tables/${table}/rows?${q}`, { method: 'GET' });
      if (!page.ok) break;
      const rows = page.json?.rows ?? [];
      if (!rows.length) break;

      for (const row of rows) {
        const patch = {};
        for (const col of columns) {
          const v = row[col];
          if (Array.isArray(v)) {
            const next = v.map((u) => map.get(u) ?? u);
            if (next.some((u, i) => u !== v[i])) patch[col] = next;
          } else if (typeof v === 'string' && map.has(v)) {
            patch[col] = map.get(v);
          }
        }
        if (Object.keys(patch).length) {
          const res = await api(`/tablesdb/${DB}/tables/${table}/rows/${row.$id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: patch }),
          });
          if (res.ok) changed++;
        }
      }
      cursor = rows[rows.length - 1].$id;
      if (rows.length < 100) break;
    }
  }

  console.log(`rewrote ${changed} rows`);
  console.log('\nAnything still pointing at supabase.co is a file that was not on disk —');
  console.log('re-run fetch-storage.mjs and then this again.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
