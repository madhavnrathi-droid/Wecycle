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

/** Minimal shape the label helpers need — MarketplaceItem satisfies it. */
export interface CompShape {
  comp?: Comp | null;
  price?: number | null;
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
 *  and photography work. */
export const RATE_PERIODS: { id: RatePeriod; label: string; short: string }[] = [
  { id: 'hour',    label: 'Per hour',    short: '/hr' },
  { id: 'session', label: 'Per session', short: '/session' },
  { id: 'day',     label: 'Per day',     short: '/day' },
  { id: 'week',    label: 'Per week',    short: '/week' },
  { id: 'month',   label: 'Per month',   short: '/month' },
  { id: 'year',    label: 'Per year',    short: '/year' },
  { id: 'project', label: 'Per project', short: '/project' },
];

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

/** True only when the opportunity carries an exact numeric rate (renders a ₹). */
export function opportunityHasExactPrice(o: CompShape): boolean {
  return o.comp === 'paid' && typeof o.price === 'number';
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
  const per = ratePeriodSuffix(o.ratePeriod);
  if (typeof o.price === 'number') return `₹${o.price.toLocaleString('en-IN')}${per}`;
  const band = priceBandLabel(o.priceBand);
  if (band) return `${band}${per}`;
  /* No number at all. If they at least said "per month", that's still useful
     signal, so keep it rather than flattening to a bare "Rate on ask". */
  const label = ratePeriodLabel(o.ratePeriod);
  return label ? `Rate on ask · ${label.toLowerCase()}` : 'Rate on ask';
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
