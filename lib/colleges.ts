/* ── MAHE schools ─────────────────────────────────────────────────────────
 *
 * The single source of truth for "which college are you at". Imported by the
 * sign-up form AND the Account screen, so the two can't drift.
 *
 * They drifted before, badly. `profiles.department` was a school picker in the
 * Account screen (list: mit/smi/dlhs/mirm/tapmi/mls/doc, labelled "Pick your
 * school") while sign-up asked for the same column as free text labelled
 * "Department / course", placeholder "e.g. Computer Science". The column ended
 * up holding `smi` and `SMI` and `SMI - BSSD` and `VCSB` and
 * `Design (spatial design)` all at once — an enum and a text field fighting over
 * one column. `college` replaces it, constrained at the database to exactly
 * these codes.
 *
 * Codes, not full names, because that's what students actually call them and
 * what their own email says: …smiblr2026@learner.manipal.edu. The descriptions
 * are only there to disambiguate in the dropdown.
 *
 * Adding one here is not enough on its own — profiles_college_check in the
 * database constrains the same set, so a new code needs a migration too.
 */
export const COLLEGES = [
  { id: 'SMI',   name: 'School of Information Sciences' },
  { id: 'MIT',   name: 'Manipal Institute of Technology' },
  { id: 'TAPMI', name: 'T. A. Pai Management Institute' },
  { id: 'MLHS',  name: 'Manipal Lifestyle & Health Sciences' },
  { id: 'MIRM',  name: 'Manipal Institute of Regenerative Medicine' },
  { id: 'MLS',   name: 'Manipal Life Sciences' },
  { id: 'DOC',   name: 'Department of Commerce' },
] as const;

export type CollegeCode = typeof COLLEGES[number]['id'];

export const COLLEGE_CODES: readonly string[] = COLLEGES.map(c => c.id);

/** True when the value is one of the seven codes the DB will accept. */
export function isCollegeCode(v: unknown): v is CollegeCode {
  return typeof v === 'string' && COLLEGE_CODES.includes(v);
}

/** Full name for a code, for places with room to spell it out. */
export function collegeName(code?: string | null): string | null {
  return COLLEGES.find(c => c.id === code)?.name ?? null;
}

/** A stored value normalised to a valid code, or '' when it isn't one.
 *  Legacy rows can hold lowercase or decorated values ('smi', 'SMI - BSSD'),
 *  so a plain equality check would silently show an empty dropdown and then
 *  overwrite their school on the next auto-save. */
export function normalizeCollege(v?: string | null): CollegeCode | '' {
  if (!v) return '';
  const head = v.split(' - ')[0].trim().toUpperCase();
  return isCollegeCode(head) ? head : '';
}
