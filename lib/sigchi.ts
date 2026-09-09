'use client';

/* ── Verifying a SIGCHI membership ─────────────────────────────────────────
 *
 * The 35% code used to be issued by hand: the member mailed the Wecycle team,
 * somebody read the mail, checked a spreadsheet and replied. That works, and
 * it is also a day of waiting for a discount the answer to which was already
 * known — the roster exists, it just was not reachable from the app.
 *
 * So the check moved into the product. A member types the address they
 * registered to SIGCHI with, and either gets their code immediately or gets
 * told plainly that it did not match, with the email path still there for
 * anyone the list has wrong.
 *
 * ── WHY THIS IS NOT A CLIENT-SIDE LIST ──
 *
 * The obvious build is to ship the roster as a constant and compare in the
 * browser. It must not be built that way. The roster is fifty-five real
 * students' personal email addresses, and anything the browser can compare
 * against, the browser has already downloaded — a scraper's contact list, one
 * devtools tab away, published by us.
 *
 * Hashing them is not enough either. A list of hashes of the address space
 * "firstname.lastname@gmail.com" is not meaningfully private; you confirm a
 * guess by hashing it, and the guesses are cheap.
 *
 * So the roster, the attempt log and the code itself all live in Postgres
 * behind RLS with no policy for the app's role, and `claim_sigchi_offer` is
 * the only door. It is SECURITY DEFINER, it takes an address and it answers
 * one bit plus, on a match, the code. The client never holds the list and
 * never holds the code until it has earned it.
 *
 * ── WHAT THIS IS AND IS NOT PROTECTING ──
 *
 * Not the code. The code is typed into UXINDIA's checkout, which Wecycle does
 * not control, so anyone who obtains one can use it and the first member to
 * share it in a group chat has published it. What is being protected is the
 * ROSTER — the thing that is genuinely not ours to leak — and the throttle
 * exists so the door cannot be used to enumerate it.
 */

import { rpcUntyped } from './supabase';

/** The code and who it belongs to, or a plain no. */
export type SigchiResult =
  | { kind: 'matched'; code: string; name: string | null }
  | { kind: 'no-match' }
  /** Not signed in — the RPC refuses, because auth.uid() is the throttle key. */
  | { kind: 'signin' }
  /** Too many misses in ten minutes. */
  | { kind: 'throttled' }
  /** Network, offline, Supabase down. Distinct from 'no-match' on purpose. */
  | { kind: 'error'; message: string };

interface ClaimRow {
  matched: boolean | null;
  code: string | null;
  member_name: string | null;
}

/**
 * Basic shape check, done here so an obvious typo costs a round trip and a
 * throttle slot instead of a confusing "not on the list".
 *
 * Deliberately loose. Real addresses break every strict pattern anyone writes,
 * and the authoritative check is the roster itself — this only catches input
 * that cannot be an address at all.
 */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/**
 * Ask the server whether this address is on the SIGCHI roster.
 *
 * Errors are mapped by SQLSTATE rather than by message text, because the
 * message is user-facing prose that will get reworded and the code will not.
 */
export async function claimSigchiOffer(email: string): Promise<SigchiResult> {
  const trimmed = email.trim();
  if (!looksLikeEmail(trimmed)) return { kind: 'no-match' };

  let data: ClaimRow[] | ClaimRow | null = null;
  let error: { message?: string; code?: string } | null = null;
  try {
    const res = await rpcUntyped<ClaimRow[] | ClaimRow>('claim_sigchi_offer', {
      p_email: trimmed,
    });
    data = res.data;
    error = res.error as { message?: string; code?: string } | null;
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Could not check right now' };
  }

  if (error) {
    /* 42501 insufficient_privilege — the function's own "sign in" guard.
       54000 program_limit_exceeded — the throttle. */
    if (error.code === '42501') return { kind: 'signin' };
    if (error.code === '54000') return { kind: 'throttled' };
    return { kind: 'error', message: error.message || 'Could not check right now' };
  }

  /* A set-returning function comes back as an array through PostgREST, but a
     single-row shape is not worth betting on. */
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.matched || !row.code) return { kind: 'no-match' };

  return { kind: 'matched', code: row.code, name: row.member_name ?? null };
}
