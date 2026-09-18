/**
 * Sign-in, sessions and signup — the part Supabase used to do.
 *
 * GoTrue is a Go service that ships with Supabase and does not come with the
 * database. Everything it did now happens here.
 *
 * ── THE ONE THING THAT MAKES THIS MIGRATION PAINLESS ────────────────────────
 *
 * Supabase stored bcrypt in auth.users.encrypted_password. bcrypt is bcrypt:
 * the hashes carry across unchanged and bcryptjs verifies them as they are. So
 * all 99 existing members keep the password they already have. Nobody is asked
 * to reset anything because the database moved — which would have lost a
 * chunk of them, and for nothing.
 *
 * That is why export-data.mjs copies encrypted_password verbatim and why
 * COST below is 10: it matches the existing hashes, so old and new passwords
 * cost the same to check and nothing gives away which is which.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 *
 * Sending the email. The one-time code is generated and stored here; putting
 * it in an inbox is the mail layer's job (lib/api/auth.ts already knows how to
 * talk to it). This file never logs a code and never returns one to a caller —
 * a code that reaches the client is not a second factor, it is a comment.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { withUser, sql, type Db } from './db';

const COST = 10;                               // matches the Supabase hashes
const SESSION_DAYS = 30;
const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

export interface Session { token: string; userId: string; expiresAt: Date; }
export interface Member  { id: string; email: string | null; username: string; fullName: string | null; }

/** Tokens are stored as SHA-256. A session table in plaintext is a table of
 *  live passwords — anyone who can read one row can be that member. */
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/* ── Sign in ────────────────────────────────────────────────────────────── */

export async function signIn(
  email: string,
  password: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<Session | null> {
  const addr = email.trim().toLowerCase();

  return withUser(null, async (db) => {
    const found = await db
      .input('email', sql.NVarChar(320), addr)
      .query(`SELECT TOP (1) id, encrypted_password, email_confirmed_at, banned_until
                FROM auth.users
               WHERE email = @email AND deleted_at IS NULL`);

    const user = found.recordset[0];

    /* Always run a bcrypt compare, even when there is no such account. Return
       early and sign-in becomes a fast answer for unknown addresses and a slow
       one for real ones, which is a way to enumerate the membership by clock. */
    const hash = user?.encrypted_password ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) return null;
    if (user.banned_until && new Date(user.banned_until) > new Date()) return null;
    if (!user.email_confirmed_at) return null;

    return issueSession(db, user.id, meta);
  });
}

async function issueSession(
  db: Db,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<Session> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db
    .input('uid',  sql.UniqueIdentifier, userId)
    .input('hash', sql.Char(64),         hashToken(token))
    .input('exp',  sql.DateTime2,        expiresAt)
    .input('ua',   sql.NVarChar(400),    meta.userAgent ?? null)
    .input('ip',   sql.NVarChar(64),     meta.ip ?? null)
    .query(`INSERT INTO auth.sessions (user_id, token_hash, expires_at, user_agent, ip)
            VALUES (@uid, @hash, @exp, @ua, @ip);
            UPDATE auth.users SET last_sign_in_at = SYSUTCDATETIME() WHERE id = @uid;`);

  return { token, userId, expiresAt };
}

/* ── Every request ──────────────────────────────────────────────────────── */

/** Resolve a bearer token to a member, or null. This is what the API calls
 *  before anything else, and what supplies the userId for withUser(). */
export async function verifySession(token: string | null | undefined): Promise<Member | null> {
  if (!token) return null;

  return withUser(null, async (db) => {
    const r = await db
      .input('hash', sql.Char(64), hashToken(token))
      .query(`SELECT TOP (1) s.id AS session_id, u.id, u.email, p.username, p.full_name
                FROM auth.sessions AS s
                JOIN auth.users    AS u ON u.id = s.user_id
                LEFT JOIN app.profiles AS p ON p.id = u.id
               WHERE s.token_hash = @hash
                 AND s.revoked_at IS NULL
                 AND s.expires_at > SYSUTCDATETIME()
                 AND u.deleted_at IS NULL
                 AND (u.banned_until IS NULL OR u.banned_until <= SYSUTCDATETIME())`);

    const row = r.recordset[0];
    if (!row) return null;

    /* Cheap liveness, so "last seen" means something without a write per
       request. Only moves the clock once an hour. */
    await db
      .input('sid', sql.UniqueIdentifier, row.session_id)
      .query(`UPDATE auth.sessions SET last_seen_at = SYSUTCDATETIME()
               WHERE id = @sid AND last_seen_at < DATEADD(hour, -1, SYSUTCDATETIME());`);

    return { id: row.id, email: row.email, username: row.username, fullName: row.full_name };
  });
}

export async function signOut(token: string): Promise<void> {
  await withUser(null, (db) =>
    db.input('hash', sql.Char(64), hashToken(token))
      .query(`UPDATE auth.sessions SET revoked_at = SYSUTCDATETIME()
               WHERE token_hash = @hash AND revoked_at IS NULL`));
}

/** Every session everywhere — for a password change, or "sign out other
 *  devices". A password change that leaves old sessions alive has not
 *  actually locked anyone out. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await withUser(null, (db) =>
    db.input('uid', sql.UniqueIdentifier, userId)
      .query(`UPDATE auth.sessions SET revoked_at = SYSUTCDATETIME()
               WHERE user_id = @uid AND revoked_at IS NULL`));
}

/* ── Signing up ─────────────────────────────────────────────────────────── */

/**
 * Create the account, unconfirmed. auth.tr_users_make_profile builds the
 * profile from `meta`, and auth.tr_users_email_gate refuses a non-Manipal
 * address — the gate is in the database on purpose, so it holds no matter
 * which code path creates the user.
 */
export async function signUp(
  email: string,
  password: string,
  meta: Record<string, unknown> = {},
): Promise<{ userId: string } | { error: 'exists' | 'email_not_allowed' }> {
  const addr = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, COST);

  try {
    return await withUser(null, async (db) => {
      const r = await db
        .input('email', sql.NVarChar(320), addr)
        .input('pw',    sql.NVarChar(200), hash)
        .input('meta',  sql.NVarChar(sql.MAX), JSON.stringify(meta))
        .query(`INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
                OUTPUT inserted.id
                VALUES (@email, @pw, @meta)`);
      return { userId: r.recordset[0].id as string };
    });
  } catch (e) {
    const n = (e as { number?: number }).number;
    if (n === 50012) return { error: 'email_not_allowed' };
    if (n === 2601 || n === 2627) return { error: 'exists' };   // unique index
    throw e;
  }
}

/* ── One-time codes ─────────────────────────────────────────────────────── */

export type CodePurpose = 'signup' | 'recovery' | 'email_change' | 'magic_link';

/** Generates, stores the hash, and RETURNS the code exactly once so the mail
 *  layer can send it. Do not log it, do not return it to a client. */
export async function issueCode(email: string, purpose: CodePurpose): Promise<string> {
  const addr = email.trim().toLowerCase();
  const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');

  await withUser(null, (db) =>
    db.input('email',   sql.NVarChar(320), addr)
      .input('purpose', sql.NVarChar(20),  purpose)
      .input('hash',    sql.Char(64),      hashToken(code))
      .input('exp',     sql.DateTime2,     new Date(Date.now() + CODE_TTL_MINUTES * 60_000))
      .query(`UPDATE auth.one_time_codes SET consumed_at = SYSUTCDATETIME()
               WHERE email = @email AND purpose = @purpose AND consumed_at IS NULL;
              INSERT INTO auth.one_time_codes (user_id, email, purpose, code_hash, expires_at)
              SELECT (SELECT TOP (1) id FROM auth.users WHERE email = @email AND deleted_at IS NULL),
                     @email, @purpose, @hash, @exp;`));

  return code;
}

/**
 * Check a code and burn it. Burning on success is the whole point — a code
 * that still works after it has been used is a password with a short name.
 */
export async function consumeCode(
  email: string,
  purpose: CodePurpose,
  code: string,
): Promise<{ ok: true; userId: string | null } | { ok: false; reason: 'invalid' | 'expired' | 'too_many' }> {
  const addr = email.trim().toLowerCase();

  return withUser(null, async (db) => {
    const r = await db
      .input('email',   sql.NVarChar(320), addr)
      .input('purpose', sql.NVarChar(20),  purpose)
      .query(`SELECT TOP (1) id, user_id, code_hash, attempts, expires_at
                FROM auth.one_time_codes
               WHERE email = @email AND purpose = @purpose AND consumed_at IS NULL
               ORDER BY created_at DESC`);

    const row = r.recordset[0];
    if (!row) return { ok: false, reason: 'invalid' as const };
    if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: 'too_many' as const };
    if (new Date(row.expires_at) <= new Date()) return { ok: false, reason: 'expired' as const };

    /* timingSafeEqual rather than ===. Both are 64 hex characters, so the
       length check never fails and the comparison cannot leak a prefix. */
    const given = Buffer.from(hashToken(code), 'utf8');
    const want  = Buffer.from(row.code_hash as string, 'utf8');
    const match = given.length === want.length && timingSafeEqual(given, want);

    if (!match) {
      await db.input('id', sql.UniqueIdentifier, row.id)
              .query('UPDATE auth.one_time_codes SET attempts = attempts + 1 WHERE id = @id');
      return { ok: false, reason: 'invalid' as const };
    }

    await db.input('id2', sql.UniqueIdentifier, row.id)
            .query(`UPDATE auth.one_time_codes SET consumed_at = SYSUTCDATETIME() WHERE id = @id2;`);

    /* A confirmed signup code is also the email confirmation. */
    if (purpose === 'signup' && row.user_id) {
      await db.input('uid', sql.UniqueIdentifier, row.user_id)
              .query(`UPDATE auth.users SET email_confirmed_at = SYSUTCDATETIME()
                       WHERE id = @uid AND email_confirmed_at IS NULL`);
    }

    return { ok: true, userId: row.user_id as string | null };
  });
}

/** Password change. Revokes every session, including the one that asked —
 *  the caller signs the member back in. */
export async function setPassword(userId: string, password: string): Promise<void> {
  const hash = await bcrypt.hash(password, COST);
  await withUser(null, (db) =>
    db.input('uid', sql.UniqueIdentifier, userId)
      .input('pw',  sql.NVarChar(200), hash)
      .query(`UPDATE auth.users SET encrypted_password = @pw, updated_at = SYSUTCDATETIME()
               WHERE id = @uid`));
  await revokeAllSessions(userId);
}
