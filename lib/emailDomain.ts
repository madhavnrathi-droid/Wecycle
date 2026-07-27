/* ── Who is allowed an account ──────────────────────────────────────────────
 *
 * Wecycle is a Manipal community, so accounts are restricted to Manipal email
 * addresses. The check runs BEFORE any email is sent — a rejected address
 * costs us nothing, which is the whole point.
 *
 * The rule is on the DOMAIN, never the local part: `manipal@gmail.com` is a
 * Gmail address and is rejected, while `x.230905@learner.manipal.edu` passes.
 * A domain qualifies when it IS one of the Manipal roots or is a subdomain of
 * one — see MANIPAL_ROOT_DOMAINS below for why that's a suffix test and not a
 * "contains manipal" test.
 *
 * Mirrored server-side by the enforce_manipal_signup_email trigger on
 * auth.users, so this can't be bypassed by calling the API directly. Keep the
 * two in step if you change the rule.
 */

import { ADMIN_EMAILS } from './AuthContext';

/** Shown wherever we need to say what's required. */
export const MANIPAL_DOMAIN_HINT = 'Manipal email only (e.g. …@learner.manipal.edu)';

/** Addresses allowed through regardless of domain.
 *  - the Play Console reviewer account (Google must be able to sign in, and it
 *    only ever opens a demo session — never real member data)
 *  - the admin accounts, which are already public in ADMIN_EMAILS */
export const DOMAIN_EXEMPT_EMAILS: ReadonlyArray<string> = [
  'playreview@wecycle.page',
  ...ADMIN_EMAILS,
] as const;

/** Domains people typo when they mean a Manipal one → what they probably meant.
 *  Only ever consulted AFTER isManipalEmail() has said no, so a pattern that
 *  happens to also match the correct spelling can't misfire on a valid
 *  address (that bug shipped once — `manipa?l?` matches "manipal"). */
const TYPO_SUGGESTIONS: ReadonlyArray<[RegExp, string]> = [
  [/^learner\.manip[a-z]*\.[a-z.]*$/i, 'learner.manipal.edu'],
  [/^learners?\.manipal.*$/i, 'learner.manipal.edu'],
  [/^lea?rn?er\.manip.*$/i, 'learner.manipal.edu'],
  [/^manip[a-z]*\.(ed|edu\.co|eduu|co|de|com?)$/i, 'manipal.edu'],
  [/^manip[a-z]*\.[a-z.]*$/i, 'manipal.edu'],
];

export function emailDomainOf(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

export function isExemptEmail(email: string): boolean {
  return DOMAIN_EXEMPT_EMAILS.includes(email.trim().toLowerCase());
}

/* The Manipal mail domains that actually exist — each verified to have live MX
 * records (Microsoft 365):
 *     learner.manipal.edu   students   (a subdomain of manipal.edu)
 *     manipal.edu           staff / faculty
 *     manipal.com           Manipal group
 * Listing ROOTS and accepting any subdomain of them keeps this future-proof for
 * new MAHE subdomains without an exhaustive list.
 *
 * This is an exact-suffix rule, NOT a substring one. A "does the domain contain
 * manipal" test looks equivalent and isn't: `manipal.com.attacker.net` contains
 * a manipal label, so a substring rule accepts any address at a domain an
 * attacker can register for pocket change. Suffix-matching is the whole
 * guarantee — don't loosen it.
 *
 * If MAHE turns out to use a domain that isn't a subdomain of these, add the
 * root here AND to the enforce_manipal_signup_email trigger. Anyone caught out
 * meanwhile has the help link on the auth screen. */
export const MANIPAL_ROOT_DOMAINS: ReadonlyArray<string> = [
  'manipal.edu',
  'manipal.com',
] as const;

/* A syntactically real hostname: dot-separated labels, each starting and ending
 * alphanumeric. Checked before the suffix test because a suffix match alone lets
 * malformed domains through — `.manipal.edu` ends with ".manipal.edu" but has an
 * empty first label, so it can't exist in DNS and can never receive the code.
 * Letting it past would spend an email on an address that provably can't reply,
 * which is the one thing this gate is here to stop. */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/** True when the address belongs to a Manipal domain (or is exempt). */
export function isManipalEmail(email: string): boolean {
  if (isExemptEmail(email)) return true;
  const domain = emailDomainOf(email);
  if (!domain || !HOSTNAME.test(domain)) return false;
  return MANIPAL_ROOT_DOMAINS.some(
    root => domain === root || domain.endsWith(`.${root}`),
  );
}

/** Did they *nearly* type a Manipal domain? Returns the intended domain. */
export function manipalTypoSuggestion(email: string): string | null {
  const domain = emailDomainOf(email);
  if (!domain) return null;
  for (const [pattern, fix] of TYPO_SUGGESTIONS) {
    if (pattern.test(domain)) return fix;
  }
  return null;
}

/**
 * The gate. Returns a human error string, or null when the address may proceed.
 * Call this BEFORE requesting an OTP so a bad address never costs an email.
 *
 * `purpose` only shapes the wording — the rule itself is identical everywhere,
 * because an address that can't hold an account shouldn't be able to trigger a
 * reset email either.
 */
export function emailGateProblem(
  email: string,
  purpose: 'signup' | 'signin' | 'reset' = 'signup',
): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Enter your email';

  /* Valid (or exempt) wins outright — check this BEFORE typo-guessing, or a
     suggestion pattern that also matches the correct spelling would reject a
     perfectly good address. */
  if (isManipalEmail(trimmed)) return null;

  const suggestion = manipalTypoSuggestion(trimmed);
  if (suggestion) return `Did you mean @${suggestion}?`;

  const domain = emailDomainOf(trimmed);
  const named = domain ? `@${domain} addresses` : 'That address';
  return purpose === 'signin'
    ? `${named} can’t sign in — Wecycle accounts use your Manipal email.`
    : `${named} can’t be used. Wecycle is Manipal-only — sign up with your Manipal email (e.g. …@learner.manipal.edu).`;
}
