import { SITE_URL } from './siteUrl';

/* Short share links.
 *
 * `/s/<full-uuid>` was 36 characters of hex nobody reads. In a WhatsApp bubble
 * it wrapped over four lines and dwarfed the message, which is the opposite of
 * what a share card is for — the card should carry the message and the link
 * should be a quiet afterthought.
 *
 * The trick is that a uuid prefix identifies a *contiguous range* of uuids, so
 * a row can be found from a prefix using ordinary comparison operators. That
 * buys a real shortener with no new column, no lookup table, no extra request
 * and no third-party service — and because the short id is derived from the
 * real one, every full-length link already sitting in someone's chat history
 * keeps resolving forever.
 */

/** Hex characters of the uuid kept in a short link.
 *
 *  12, not 8. A prefix collision does not produce a 404 — it opens *the wrong
 *  post*, so someone sharing their bike could send a friend to a lost-keys
 *  report. That failure is bad enough to be worth four characters nobody will
 *  notice. Birthday probability of any collision across all posts:
 *
 *      chars        10k posts    100k posts      1M posts
 *          8           1.157%       68.781%      ~100%
 *         10           0.005%        0.454%       36.5%
 *         12          <0.001%        0.002%       0.177%
 *
 *  At 12 the link is still one line in a chat bubble (35 characters including
 *  the origin, against 71 before), so the safety costs nothing that matters. */
export const SHORT_ID_LEN = 12;

/** The canonical short link for a post.
 *
 *  Built from SITE_URL rather than `window.location.origin` on purpose: shares
 *  from a preview deployment used to leak `wecycle-seven.vercel.app` into other
 *  people's chats. The database is the same behind every deployment, so the
 *  canonical host always resolves. */
export function shareUrl(id: string): string {
  return `${SITE_URL}/s/${shortId(id)}`;
}

/** Just the short id, no origin. */
export function shortId(id: string): string {
  return id.replace(/-/g, '').toLowerCase().slice(0, SHORT_ID_LEN);
}

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the path segment is already a complete uuid. */
export function isFullUuid(s: string): boolean {
  return FULL_UUID.test(s);
}

const dashed = (h: string) =>
  `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

/** The inclusive uuid range a prefix covers, or null if the segment isn't hex.
 *
 *  `3f22523a` spans 3f22523a-0000-…-000000000000 through
 *  3f22523a-ffff-…-ffffffffffff, so `id >= lo AND id <= hi` finds the row.
 *  Postgres compares uuids natively, so this needs no cast and stays index-
 *  friendly — unlike a LIKE against `id::text`, which cannot use the primary
 *  key index and does not even typecheck against a uuid column. */
export function idPrefixBounds(prefix: string): { lo: string; hi: string } | null {
  const hex = prefix.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{4,32}$/.test(hex)) return null;
  return { lo: dashed(hex.padEnd(32, '0')), hi: dashed(hex.padEnd(32, 'f')) };
}
