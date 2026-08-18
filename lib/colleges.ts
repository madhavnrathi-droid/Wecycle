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
/* These are the MAHE **Bengaluru** campus units (Yelahanka/Govindapura), which
 * is what the sign-up domain and the …blr… in student addresses point at. Three
 * names were wrong and were displayed to every student picking their school:
 *
 *   SMI was "School of Information Sciences" — it is Srishti Manipal Institute
 *   of Art, Design and Technology, the Bengaluru art-and-design institute MAHE
 *   took over. The clue was in this file's own comment all along: addresses
 *   read smiblr2026@learner.manipal.edu, and "blr" is Bengaluru.
 *
 *   MLS was "Manipal Life Sciences" — it is Manipal Law School.
 *
 *   MLHS was "Manipal Lifestyle & Health Sciences" — it is the Manipal Institute
 *   of Liberal Arts, Humanities & Social Sciences. This was the one entry left
 *   unverified when the other two were corrected, and guessing from the acronym
 *   is what produced the wrong expansion: L-H-S reads as "Lifestyle & Health
 *   Sciences" just as plausibly as "Liberal arts, Humanities & Social sciences".
 *   Corrected on the owner's word.
 *
 * Only the display names changed. profiles_college_check constrains the CODES,
 * so no migration is needed and no stored row is affected. */
export const COLLEGES = [
  { id: 'SMI',   name: 'Srishti Manipal Institute of Art, Design & Technology' },
  { id: 'MIT',   name: 'Manipal Institute of Technology, Bengaluru' },
  { id: 'TAPMI', name: 'T. A. Pai Management Institute, Bengaluru' },
  { id: 'MLHS',  name: 'Manipal Institute of Liberal Arts, Humanities & Social Sciences' },
  { id: 'MIRM',  name: 'Manipal Institute of Regenerative Medicine' },
  { id: 'MLS',   name: 'Manipal Law School' },
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
