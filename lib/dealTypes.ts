/* ── How a thing changes hands ─────────────────────────────────────────────
 *
 * Four ways, and the database has held all four since the beginning:
 * listing_type is an enum of free | sell | swap | borrow. The share form only
 * ever offered the first two, so half the vocabulary was unreachable — you
 * could not rent out a drill or swap a calculator, which are the two most
 * obviously campus-shaped transactions there are.
 *
 * The product word and the stored word differ in one place. The column says
 * `borrow`, which is what it meant when everything was free; the students'
 * word for "you pay me per day and give it back" is RENT. Renaming the enum
 * value would rewrite history on every existing row for no gain, so the mapping
 * lives here, in one function, rather than as a `=== 'borrow'` scattered
 * through the UI.
 *
 * Each type also decides which money fields make sense, which is why this
 * module owns that too — the alternative is a switch in the form, a second one
 * in the card renderer, and a third in the detail screen, drifting apart.
 */

export type DealType = 'free' | 'sell' | 'rent' | 'swap';

/** The enum value actually stored in listings.listing_type. */
export type ListingType = 'free' | 'sell' | 'swap' | 'borrow';

export interface DealMeta {
  id: DealType;
  /** The word on the button. */
  label: string;
  /** One line under it — what this choice actually commits you to. */
  blurb: string;
  emoji: string;
  /** Shown on cards and detail pages once posted. */
  badge: string;
  /** Which money inputs this type needs. */
  needsPrice: boolean;
  needsPeriod: boolean;
  needsDeposit: boolean;
  needsSwapFor: boolean;
}

export const DEAL_TYPES: DealMeta[] = [
  {
    id: 'free', label: 'Give away', blurb: 'Free to a good home', emoji: '🎁',
    badge: 'Free',
    needsPrice: false, needsPeriod: false, needsDeposit: false, needsSwapFor: false,
  },
  {
    id: 'sell', label: 'Sell', blurb: 'One-off price', emoji: '💸',
    badge: 'For sale',
    needsPrice: true, needsPeriod: false, needsDeposit: false, needsSwapFor: false,
  },
  {
    id: 'rent', label: 'Rent out', blurb: 'They give it back', emoji: '🔁',
    badge: 'For rent',
    needsPrice: true, needsPeriod: true, needsDeposit: true, needsSwapFor: false,
  },
  {
    id: 'swap', label: 'Swap', blurb: 'Trade for something', emoji: '🔄',
    badge: 'Swap',
    needsPrice: false, needsPeriod: false, needsDeposit: false, needsSwapFor: true,
  },
];

export const DEAL_BY_ID: Record<DealType, DealMeta> =
  Object.fromEntries(DEAL_TYPES.map(d => [d.id, d])) as Record<DealType, DealMeta>;

/** Rental periods. A subset of the rate_period check constraint, which also
 *  allows hour/session/year/project — those belong to services, not to lending
 *  a textbook, and offering all seven here would be a menu built from the
 *  database's vocabulary rather than the renter's. */
export const RENT_PERIODS = [
  { id: 'day',   label: 'day' },
  { id: 'week',  label: 'week' },
  { id: 'month', label: 'month' },
] as const;

export type RentPeriod = typeof RENT_PERIODS[number]['id'];
export const DEFAULT_RENT_PERIOD: RentPeriod = 'day';

/** Product word → stored enum value. */
export function toListingType(deal: DealType): ListingType {
  return deal === 'rent' ? 'borrow' : deal;
}

/** Stored enum value → product word. Anything unrecognised reads as a give-away,
 *  which is the safe direction: a listing shown as free that is not costs the
 *  poster a conversation, while one shown as priced that is free costs them the
 *  enquiry entirely. */
export function fromListingType(stored?: string | null): DealType {
  if (stored === 'borrow') return 'rent';
  if (stored === 'sell' || stored === 'swap' || stored === 'free') return stored;
  return 'free';
}

/** The money line as a reader sees it: "₹450", "₹200 / day", "Free", or the
 *  swap ask. One function so the card, the feed and the detail page cannot
 *  render the same listing three different ways. */
export function priceLine(input: {
  deal: DealType;
  price?: number | null;
  ratePeriod?: string | null;
  swapFor?: string | null;
}): string {
  const { deal, price, ratePeriod, swapFor } = input;
  if (deal === 'swap') return swapFor?.trim() ? `Swap for ${swapFor.trim()}` : 'Open to swaps';
  if (deal === 'free') return 'Free';
  if (typeof price !== 'number' || Number.isNaN(price)) {
    return deal === 'rent' ? 'Rent — ask' : 'Ask';
  }
  const amount = `₹${price.toLocaleString('en-IN')}`;
  return deal === 'rent' ? `${amount} / ${ratePeriod || DEFAULT_RENT_PERIOD}` : amount;
}

/** The money as a small pill on a feed card, where there is room for about ten
 *  characters and no more.
 *
 *  Deliberately different from priceLine(): a swap's whole point is what the
 *  poster wants back, and "Swap for any scientific calculator" is the right
 *  answer on a detail page and impossible on a 90px chip. The chip says the
 *  KIND, the page says the terms. Truncating the ask with an ellipsis instead
 *  would show a fragment — "Swap for any scien…" — which is worse than the
 *  category word, because it looks like information and is not. */
export function priceChip(input: {
  deal: DealType;
  price?: number | null;
  ratePeriod?: string | null;
}): string {
  const { deal, price, ratePeriod } = input;
  if (deal === 'swap') return 'Swap';
  if (deal === 'free') return 'Free';
  const hasPrice = typeof price === 'number' && !Number.isNaN(price);
  if (deal === 'rent') {
    return hasPrice
      ? `₹${price!.toLocaleString('en-IN')}/${ratePeriod || DEFAULT_RENT_PERIOD}`
      : 'For rent';
  }
  return hasPrice ? `₹${price!.toLocaleString('en-IN')}` : 'Selling';
}
