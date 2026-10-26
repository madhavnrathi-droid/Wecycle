/* ── Event partners: campus pages that repost other clubs' events ────────────
 *
 * A partner is an account the team ties up with to keep the Events tab full —
 * Kya Scene MAHE BLR reposts what clubs across the colleges are running. Their
 * posts are not first-hand events, so they read differently:
 *
 *   • shown in the partner's own colours and logo, as an Instagram-shaped (4:5)
 *     card, because the poster IS the post;
 *   • a poster alone is a complete post — no caption, date or venue required;
 *   • RSVP works as everywhere else, but no registration forms: the form
 *     belongs to the club that runs the event, not to the page reposting it.
 *
 * Keyed by profile id (the account behind the partner's email), which is what
 * every event row carries as organizer_id. Adding a partner is a code change
 * plus the logo under public/partners/<handle>/ — like lib/brands.ts.
 */

export interface EventPartner {
  /** Profile id of the partner's account. */
  id: string;
  /** Shown as the account name, Instagram-style. */
  handle: string;
  /** The page's full name. */
  name: string;
  logo: string;
  /** Card ground and ink, from the partner's logo. */
  bg: string;
  ink: string;
}

export const PARTNERS: readonly EventPartner[] = [
  {
    /* sanskar.tapmiblr2026@learner.manipal.edu — the account Kya Scene posts from. */
    id: '6adc14f800153bd69ee6',
    handle: 'kyascene.mahe',
    name: 'Kya Scene MAHE BLR',
    logo: '/partners/kyascene/logo.png',
    bg: '#FFB020',
    ink: '#17124A',
  },
];

export function eventPartnerFor(userId: string | null | undefined): EventPartner | null {
  if (!userId) return null;
  return PARTNERS.find(p => p.id === userId) ?? null;
}

/* ── A post with no date ──
 *
 * A repost is often just the poster, with the date printed on it. The events
 * table has no column for "no date" (and the server key cannot add one), and
 * starts_at is required — it is also what hides an event once it has started
 * and what the janitor purges by. So an undated post is stored with a
 * starts_at UNDATED_DAYS ahead, which keeps it up for a week and then lets it
 * expire like any other event, and it is marked in color_accent (a free text
 * column nothing else reads for these posts) so no screen shows that
 * placeholder as if it were the real date. */
export const UNDATED_MARK = 'undated';
export const UNDATED_DAYS = 7;
export const UNDATED_LABEL = 'Date on the poster';

export function undatedStartsAt(now = Date.now()): string {
  return new Date(now + UNDATED_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
