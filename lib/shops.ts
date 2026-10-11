/* ── Shops: a member account that is also a student business ────────────────
 *
 * Chosen at sign-up ("A student business or brand") or later from the
 * account screen. No new table and no new column: a profile already has a
 * public `role` (shown under the name on a storefront, and empty on every
 * profile until now) and a `bio` nothing in the app displayed. A shop is
 *
 *     role = 'Student business'   and   bio = the shop's name
 *
 * which is public on purpose — a shop name is something you want people to
 * see. Being a shop changes what the account LOOKS like (the storefront is
 * titled with the shop's name, run by the member) and turns on the Orders
 * counter in Inventory; it grants nothing else. Promotion — a brand page, a
 * place on the home feed — is the team's call, see lib/brands.ts.
 */

export const BUSINESS_ROLE = 'Student business';

/** Shop names: a short line, not a paragraph. */
export const SHOP_NAME_MAX = 40;

export type AccountKind = 'member' | 'business';

export function isBusinessRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === BUSINESS_ROLE.toLowerCase();
}

/** Trimmed, single-spaced, control characters out, capped. Empty → null. */
export function cleanShopName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SHOP_NAME_MAX)
    .trim();
  return s || null;
}

/** The shop's name for a profile, or null when the profile is not a shop.
 *  A bio on a profile that is not a shop (an onboarded collective's
 *  description, say) is not a shop name. */
export function shopNameOf(p: { role?: string | null; bio?: string | null } | null | undefined): string | null {
  if (!p || !isBusinessRole(p.role)) return null;
  return cleanShopName(p.bio);
}

/** The profile fields to write for an account kind — what ensure_profile sets
 *  at sign-up and what the account screen saves. Turning a shop off clears
 *  both, so a former shop name cannot linger in bio. */
export function shopFields(kind: AccountKind, name: unknown): { role: string | null; bio: string | null } {
  if (kind !== 'business') return { role: null, bio: null };
  return { role: BUSINESS_ROLE, bio: cleanShopName(name) };
}
