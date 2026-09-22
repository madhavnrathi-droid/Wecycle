#!/usr/bin/env node
/**
 * split-contacts.mjs — take email and phone out of the public profile row.
 *
 *   set -a && . db/appwrite/appwrite.env && set +a
 *   node db/appwrite/tools/split-contacts.mjs --dry-run
 *   node db/appwrite/tools/split-contacts.mjs
 *
 * ── THE PROBLEM THIS FIXES ─────────────────────────────────────────────────
 *
 * Postgres protected these two columns with RLS, and the app only ever read
 * them through get_contact — a SECURITY DEFINER function that returns an
 * address only if that member switched contact sharing on. The SQL Server port
 * used DENY SELECT (email, phone).
 *
 * Appwrite has NO column-level permission. A row is readable or it is not. So
 * the moment profiles became readable — which it must be, because every
 * listing shows its seller's name and avatar — all 99 students' email
 * addresses and phone numbers became readable with them. Verified: an
 * anonymous request with nothing but the project id returned them.
 *
 * There is no permission that fixes that, so the data moves instead. The
 * contact details go to profile_contacts, which no client permission touches,
 * and the public profile keeps only what a public profile needs. Enforcing the
 * share preferences then belongs to a server endpoint, exactly as the SIGCHI
 * roster already works in this codebase.
 *
 * Safe to run twice: a profile whose contacts have already moved is skipped.
 */

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT;
const KEY = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB || 'wecycle';
const DRY = process.argv.includes('--dry-run');

if (!DRY && (!ENDPOINT || !PROJECT || !KEY)) {
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT and APPWRITE_KEY.');
  process.exit(2);
}

async function api(method, path, body) {
  if (DRY && method !== 'GET') return { ok: true, status: 200, json: {} };
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(ENDPOINT + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (i < 4) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue; }
      return { ok: false, status: 0, json: { message: String(e) } };
    }
    if (res.status === 429 && i < 5) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); continue; }
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  }
}

async function main() {
  console.log(`\n${DRY ? '[dry run] ' : ''}splitting contact details out of profiles\n`);

  /* 1. the server-only table */
  let r = await api('POST', `/tablesdb/${DB}/tables`, {
    tableId: 'profile_contacts', name: 'profile_contacts',
    permissions: [], rowSecurity: true, enabled: true,
  });
  console.log(r.ok ? '  created profile_contacts' : r.status === 409 ? '  profile_contacts already there' : `  FAILED: ${r.status} ${r.json?.message ?? ''}`);
  if (!r.ok && r.status !== 409) process.exit(1);

  for (const [key, size] of [['email', 320], ['phone', 32]]) {
    const c = await api('POST', `/tablesdb/${DB}/tables/profile_contacts/columns/varchar`,
      { key, size, required: false });
    if (!c.ok && c.status !== 409) console.log(`  ! column ${key}: ${c.status} ${c.json?.message ?? ''}`);
  }
  /* Columns build in the background; an insert against one still processing
     fails with a message that names the column but not the reason. */
  for (let i = 0; i < 40; i++) {
    const t = await api('GET', `/tablesdb/${DB}/tables/profile_contacts`);
    const cols = t.json?.columns ?? [];
    if (cols.length >= 2 && cols.every(c => c.status === 'available')) break;
    await new Promise(x => setTimeout(x, 700));
  }

  /* 2. move the values */
  let moved = 0, cleared = 0, already = 0, empty = 0;
  const problems = [];
  let cursor = null;

  for (;;) {
    const q = [`{"method":"limit","values":[100]}`];
    if (cursor) q.push(`{"method":"cursorAfter","values":["${cursor}"]}`);
    const qs = q.map(x => `queries[]=${encodeURIComponent(x)}`).join('&');
    const page = await api('GET', `/tablesdb/${DB}/tables/profiles/rows?${qs}`);
    if (!page.ok) { problems.push(`list profiles: ${page.status}`); break; }
    const rows = page.json?.rows ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      const id = row.$id;
      const email = row.email ?? null;
      const phone = row.phone ?? null;

      if (!email && !phone) { empty++; continue; }

      const put = await api('POST', `/tablesdb/${DB}/tables/profile_contacts/rows`, {
        rowId: id, data: { email, phone }, permissions: [],
      });
      if (put.ok) moved++;
      else if (put.status === 409) already++;
      else { problems.push(`contacts/${id}: ${put.status} ${put.json?.message ?? ''}`); continue; }

      /* Only blank the public row once the copy is definitely there. The
         order matters: the other way round, a failure here loses the data. */
      const clear = await api('PATCH', `/tablesdb/${DB}/tables/profiles/rows/${id}`,
        { data: { email: null, phone: null } });
      if (clear.ok) cleared++;
      else problems.push(`profiles/${id}: ${clear.status} ${clear.json?.message ?? ''}`);
    }
    cursor = rows[rows.length - 1].$id;
    if (rows.length < 100) break;
  }

  console.log(`\n  ${moved} contacts moved, ${already} already moved, ${empty} had none`);
  console.log(`  ${cleared} public profiles cleared`);
  if (problems.length) {
    console.log('\n  problems:');
    for (const p of problems.slice(0, 15)) console.log('    ! ' + p);
    process.exitCode = 1;
  }
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
