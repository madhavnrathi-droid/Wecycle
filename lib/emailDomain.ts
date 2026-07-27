/* ── Who is allowed an account ──────────────────────────────────────────────
 *
 * Wecycle is a Manipal community, so accounts are restricted to Manipal email
 * addresses. The check runs BEFORE any email is sent — a rejected address
 * costs us nothing, which is the whole point.
 *
 * The rule is on the DOMAIN, never the local part: `manipal@gmail.com` is a
 * Gmail address and is rejected, while `x.230905@learner.manipal.edu` passes.
 * Any domain label containing "manipal" qualifies, so every MAHE variant works
 * without maintaining an exhaustive list:
 *     learner.manipal.edu   manipal.edu   manipal.com   mahe.manipal.edu   …
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

/* The domain must also END in a real TLD, or "learner.manipal.ed" (a genuine
   typo) would pass the label test and we'd pay to email a domain that doesn't
   resolve. Deliberately broad — it only has to be a plausible suffix, not an
   exhaustive registry. */
const PLAUSIBLE_TLD = /\.(edu|com|org|net|in|edu\.in|ac\.in|co\.in|ac\.uk|edu\.au)$/i;

/** True when the address belongs to a Manipal domain (or is exempt). */
export function isManipalEmail(email: string): boolean {
  if (isExemptEmail(email)) return true;
  const domain = emailDomainOf(email);
  if (!domain) return false;
  /* Label-scoped so the LOCAL part can never qualify an address
     (manipal@gmail.com stays rejected), and permissive within the domain so
     every MAHE sub-domain works without an exhaustive list. */
  const hasManipalLabel = domain.split('.').some(label => label.includes('manipal'));
  return hasManipalLabel && PLAUSIBLE_TLD.test(domain);
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
