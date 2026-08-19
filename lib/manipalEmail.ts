/* ── Manipal address composition ───────────────────────────────────────────
 *
 * Campus addresses follow a fixed shape, so sign-up can build one instead of
 * asking a student to transcribe it. Two shapes, and the domain decides which:
 *
 *   students   nirnay.dlhsblr2024@learner.manipal.edu
 *              first name · '.' · college code · 'blr' · year of joining
 *
 *   faculty    devan.das@manipal.edu
 *              first name · '.' · last name
 *
 * Every manipal.edu address is faculty, and faculty addresses carry no year —
 * so the domain is not a cosmetic suffix here, it selects the whole format.
 *
 * The code is the lowercased college id followed by 'blr' — mitblr, docblr,
 * mirmblr, smiblr, tapmiblr — with ONE exception, which is the reason this is a
 * function with a lookup rather than a bare template:
 *
 *   MLHS students are dlhsblr, not mlhsblr.
 *
 * That is not a guess in either direction. It appears on a real profile in the
 * database and on a real address (nirnay.dlhsblr2024@learner.manipal.edu), and
 * 'dlhs' is also the code the retired DEPARTMENTS list used for the same school.
 * If MAHE has since moved that school to mlhsblr, change the exception — but
 * change it on the strength of an address, not of the acronym.
 *
 * MLS is the one code with no address to check; it follows the pattern on the
 * strength of the other five rather than on direct evidence.
 */
import type { CollegeCode } from './colleges';

export const LEARNER_DOMAIN = 'learner.manipal.edu';
export const FACULTY_DOMAIN = 'manipal.edu';
export const DOMAINS = [LEARNER_DOMAIN, FACULTY_DOMAIN] as const;
export type ManipalDomain = (typeof DOMAINS)[number];

/** Colleges whose code is NOT their lowercased id. Evidence required. */
const CODE_EXCEPTIONS: Partial<Record<CollegeCode, string>> = {
  MLHS: 'dlhs',
};

/** Letters between the dot and the year, e.g. 'mitblr'. */
export function emailCode(college: string): string | null {
  if (!college) return null;
  const id = college.toUpperCase() as CollegeCode;
  return `${CODE_EXCEPTIONS[id] ?? id.toLowerCase()}blr`;
}

/** Addresses are all-lowercase letters and digits; drop anything else. */
function slug(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
}

const words = (full: string) => full.trim().split(/\s+/).filter(Boolean);

export function firstNameOf(full: string): string {
  return slug(words(full)[0] ?? '');
}

/** Last word of the name, which is what faculty addresses use. */
export function lastNameOf(full: string): string {
  const w = words(full);
  return w.length > 1 ? slug(w[w.length - 1]) : '';
}

/** Realistic intake years, newest first — a list rather than a text box so the
 *  one number the address depends on cannot be fat-fingered. */
export function joiningYears(now = new Date().getFullYear()): number[] {
  const out: number[] = [];
  for (let y = now + 1; y >= now - 9; y--) out.push(y);
  return out;
}

/** The part before the '@'. Empty when there isn't enough to build one — the
 *  caller leaves the field alone rather than filling in something half-formed. */
export function composeLocalPart(opts: {
  fullName: string;
  college: string;
  joiningYear: string;
  domain: ManipalDomain;
}): string {
  const first = firstNameOf(opts.fullName);
  if (!first) return '';

  if (opts.domain === FACULTY_DOMAIN) {
    const last = lastNameOf(opts.fullName);
    return last ? `${first}.${last}` : '';
  }

  const code = emailCode(opts.college);
  if (!code || !/^[0-9]{4}$/.test(opts.joiningYear)) return '';
  return `${first}.${code}${opts.joiningYear}`;
}

export function composeEmail(local: string, domain: ManipalDomain): string {
  return local ? `${local}@${domain}` : '';
}

/** Split an existing address so the editor can show it in its two halves. */
export function splitEmail(email: string): { local: string; domain: ManipalDomain } {
  const at = email.lastIndexOf('@');
  if (at < 0) return { local: email, domain: LEARNER_DOMAIN };
  const domain = email.slice(at + 1).toLowerCase();
  return {
    local: email.slice(0, at),
    domain: domain === FACULTY_DOMAIN ? FACULTY_DOMAIN : LEARNER_DOMAIN,
  };
}
