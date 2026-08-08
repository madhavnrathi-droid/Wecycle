/* ── Opportunity (service) compensation model ─────────────────────────────
 *
 * An "opportunity" (kind='opportunity' listing) is anything you offer to *do*
 * with or for the community — spanning a compensation spectrum:
 *
 *   volunteer → give your time to a cause (unpaid, contribution-framed)
 *   free      → free help / a service at no charge
 *   paid      → a paid service, priced via a band (or an exact rate)
 *
 * This module is the single source of truth for the labels/derivations so the
 * create form, feed cards, detail screen and inline editor all stay in sync.
 */

export type Comp = 'volunteer' | 'free' | 'paid';
export type PriceBand = 'under_200' | '200_500' | '500_1000' | 'over_1000';
/** What a rate is charged against. ₹300 an hour and ₹300 a month are wildly
 *  different offers, so a bare number is close to meaningless on its own. */
export type RatePeriod = 'hour' | 'session' | 'day' | 'week' | 'month' | 'year' | 'project';

/** Minimal shape the label helpers need — MarketplaceItem satisfies it.
 *  `price` is the FROM end of a range and `priceMax` the optional TO end. */
export interface CompShape {
  comp?: Comp | null;
  price?: number | null;
  priceMax?: number | null;
  priceBand?: PriceBand | null;
  ratePeriod?: RatePeriod | null;
}

/* Nothing in the paid branch is required. The blurb says so, because the form
   used to read as though a number were expected — and the insert then failed
   outright if you left it blank. */
export const COMP_META: Record<Comp, { label: string; emoji: string; blurb: string }> = {
  volunteer: { label: 'Volunteer', emoji: '🌱', blurb: 'Give your time to a cause — no pay' },
  free:      { label: 'Free help', emoji: '🤝', blurb: 'Offer a service at no charge' },
  paid:      { label: 'Paid',      emoji: '💼', blurb: 'Rate optional — sort it out later' },
};

export const COMP_OPTIONS: Comp[] = ['volunteer', 'free', 'paid'];

export const PRICE_BANDS: { id: PriceBand; label: string }[] = [
  { id: 'under_200', label: 'Under ₹200' },
  { id: '200_500',   label: '₹200–500' },
  { id: '500_1000',  label: '₹500–1,000' },
  { id: 'over_1000', label: '₹1,000+' },
];

/** Ordered roughly by how often a campus gig uses them: an hour or a session
 *  for tutoring and repairs, a month for an internship, a project for design
 *  and photography work.
 *
 *  `label` is the picker's wording; `short` is the suffix on a card. Note
 *  'project' reads as "Fixed for the job" rather than "Per project" — on every
 *  freelance platform the first fork is hourly-vs-fixed (Upwork's two contract
 *  types), and "fixed" is what people call it. */
export const RATE_PERIODS: { id: RatePeriod; label: string; short: string }[] = [
  { id: 'hour',    label: 'Hour',              short: '/hr' },
  { id: 'session', label: 'Session',           short: '/session' },
  { id: 'day',     label: 'Day',               short: '/day' },
  { id: 'week',    label: 'Week',              short: '/week' },
  { id: 'month',   label: 'Month',             short: '/month' },
  { id: 'year',    label: 'Year',              short: '/year' },
  { id: 'project', label: 'Fixed for the job', short: ' fixed' },
];

/** What the picker actually offers. 'year' stays valid in the type and the DB
 *  (older rows and the label path still handle it) but isn't offered: a student
 *  gig priced by the year is an internship stipend, i.e. Month. Six options fit
 *  two tidy rows of pills — no dropdown, which hides the choices and is slow to
 *  operate on a phone. */
export const RATE_BASIS_OPTIONS: RatePeriod[] =
  ['hour', 'session', 'day', 'week', 'month', 'project'];

export function priceBandLabel(b?: PriceBand | null): string | null {
  return PRICE_BANDS.find(x => x.id === b)?.label ?? null;
}

/** The compact suffix appended to an amount — '/hr', '/month'. Empty when the
 *  poster didn't say, which is a normal and complete answer. */
export function ratePeriodSuffix(p?: RatePeriod | null): string {
  return RATE_PERIODS.find(x => x.id === p)?.short ?? '';
}

export function ratePeriodLabel(p?: RatePeriod | null): string | null {
  return RATE_PERIODS.find(x => x.id === p)?.label ?? null;
}

/** True when the opportunity carries any numeric rate at all (renders a ₹) —
 *  either end of the range counts. */
export function opportunityHasExactPrice(o: CompShape): boolean {
  return o.comp === 'paid' && (typeof o.price === 'number' || typeof o.priceMax === 'number');
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The money part of a paid opportunity, period excluded. Null when no number
 *  was given at all. Every partial combination is legitimate — a poster may
 *  know their floor, their ceiling, both, or neither. */
export function rateAmountLabel(o: CompShape): string | null {
  const from = typeof o.price    === 'number' ? o.price    : null;
  const to   = typeof o.priceMax === 'number' ? o.priceMax : null;
  /* One ₹ for a range, not two: "₹200–500" rather than "₹200–₹500". The cards
     are ~190px wide and Indian digit grouping is already long
     ("₹1,50,000–₹2,00,000/month" doesn't fit; the single-symbol form does). */
  if (from !== null && to !== null) {
    return from === to ? inr(from) : `${inr(from)}–${to.toLocaleString('en-IN')}`;
  }
  if (from !== null) return inr(from);
  if (to !== null)   return `Up to ${inr(to)}`;
  /* Fall back to a legacy band (retired from the forms, still rendered). */
  return priceBandLabel(o.priceBand);
}

/** The compensation label shown in the price slot on cards + detail.
 *  volunteer → 'Volunteer' · free → 'Free'
 *  paid      → '₹300/hr' | '₹200–500/session' | 'Rate on ask'
 *  The period is only ever a suffix, so an amount with no period still reads
 *  fine — both halves are independently optional. */
export function opportunityCompLabel(o: CompShape): string {
  if (o.comp === 'volunteer') return 'Volunteer';
  if (o.comp === 'free')      return 'Free';
  /* paid (default when comp is absent but listing came through as sell) */
  const amount = rateAmountLabel(o);
  if (amount) return `${amount}${ratePeriodSuffix(o.ratePeriod)}`;
  /* No number at all — which is a legitimate way to post. If they at least
     said what it's charged against, keep that: it's real information. */
  if (o.ratePeriod === 'project') return 'Fixed rate on ask';
  const label = ratePeriodLabel(o.ratePeriod);
  return label ? `Rate on ask · per ${label.toLowerCase()}` : 'Rate on ask';
}

/** Past-tense ribbon label for a completed opportunity. */
export function opportunityClosedLabel(o: CompShape): string {
  return o.comp === 'volunteer' ? 'Filled' : 'Completed';
}

/** Derive the compensation triple into the listing_type/price the DB stores.
 *  paid → listing_type 'sell' (+ exact price when given); everything else 'free'.
 *  A paid opportunity with no price is deliberately allowed — it stores as a
 *  'sell' with a null price and reads as "Rate on ask". That used to be
 *  rejected by the price_required_for_sell CHECK, which is why posting a paid
 *  gig failed; the constraint was dropped in the
 *  optional_price_and_rate_period_for_opportunities migration. */
export function compToListing(comp: Comp, price?: number): {
  listingType: 'free' | 'sell';
  price?: number;
} {
  if (comp === 'paid') return { listingType: 'sell', price };
  return { listingType: 'free', price: undefined };
}

/** Reverse of compToListing for a row that predates `comp` (fallback only). */
export function listingToComp(listingType: string): Comp {
  return listingType === 'sell' ? 'paid' : 'free';
}
