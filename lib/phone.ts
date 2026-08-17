/* ── Phone numbers ────────────────────────────────────────────────────────
 *
 * Wecycle launches in India and every campus it serves is Indian, so the
 * country code is not a question worth asking. Sign-up and the Account screen
 * both show a fixed `+91` affix and take ten digits; nobody types a country
 * code and nobody can get it wrong.
 *
 * This lives in one file because the two screens had already drifted. Sign-up
 * accepted free text against /^\+?[0-9\s\-()]{7,20}$/ and stored whatever was
 * typed, while Account stripped to ten digits and stored `+91` + those digits.
 * The same column therefore held "+91 98765 43210", "9876543210" and
 * "+919876543210" depending on which screen last wrote it — the same failure
 * the college column had, for the same reason.
 *
 * Stored form is always E.164: +91 followed by exactly ten digits, or null.
 */

/** Strip to the local ten digits, dropping a pasted +91 / 91 / leading 0. */
export function tenDigits(raw: string): string {
  let d = raw.replace(/\D+/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Indian mobile numbers start 6-9. Ten digits beginning 0-5 is a typo, not a
 *  number, so catching it here saves an unreachable contact later. */
export function isValidLocal(local: string): boolean {
  return /^[6-9][0-9]{9}$/.test(local);
}

/** Empty is allowed (the field is optional); anything present must be valid. */
export function isAcceptable(local: string): boolean {
  return local === '' || isValidLocal(local);
}

/** The value to store: E.164, or null when the field was left empty. */
export function toE164(local: string): string | null {
  return isValidLocal(local) ? `+91${local}` : null;
}

/** Display helper: 98765 43210 */
export function formatLocal(local: string): string {
  return local.length > 5 ? `${local.slice(0, 5)} ${local.slice(5)}` : local;
}
