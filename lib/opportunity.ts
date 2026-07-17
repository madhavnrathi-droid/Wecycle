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

/** Minimal shape the label helpers need — MarketplaceItem satisfies it. */
export interface CompShape {
  comp?: Comp | null;
  price?: number | null;
  priceBand?: PriceBand | null;
}

export const COMP_META: Record<Comp, { label: string; emoji: string; blurb: string }> = {
  volunteer: { label: 'Volunteer', emoji: '🌱', blurb: 'Give your time to a cause — no pay' },
  free:      { label: 'Free help', emoji: '🤝', blurb: 'Offer a service at no charge' },
  paid:      { label: 'Paid',      emoji: '💼', blurb: 'Set a rate or a price band' },
};

export const COMP_OPTIONS: Comp[] = ['volunteer', 'free', 'paid'];

export const PRICE_BANDS: { id: PriceBand; label: string }[] = [
  { id: 'under_200', label: 'Under ₹200' },
  { id: '200_500',   label: '₹200–500' },
  { id: '500_1000',  label: '₹500–1,000' },
  { id: 'over_1000', label: '₹1,000+' },
];

export function priceBandLabel(b?: PriceBand | null): string | null {
  return PRICE_BANDS.find(x => x.id === b)?.label ?? null;
}

/** True only when the opportunity carries an exact numeric rate (renders a ₹). */
export function opportunityHasExactPrice(o: CompShape): boolean {
  return o.comp === 'paid' && typeof o.price === 'number';
}

/** The compensation label shown in the price slot on cards + detail.
 *  volunteer → 'Volunteer' · free → 'Free' · paid → '₹X' | band | 'Rate on ask'. */
export function opportunityCompLabel(o: CompShape): string {
  if (o.comp === 'volunteer') return 'Volunteer';
  if (o.comp === 'free')      return 'Free';
  /* paid (default when comp is absent but listing came through as sell) */
  if (typeof o.price === 'number') return `₹${o.price.toLocaleString('en-IN')}`;
  const band = priceBandLabel(o.priceBand);
  if (band) return band;
  return 'Rate on ask';
}

/** Past-tense ribbon label for a completed opportunity. */
export function opportunityClosedLabel(o: CompShape): string {
  return o.comp === 'volunteer' ? 'Filled' : 'Completed';
}

/** Derive the compensation triple into the listing_type/price the DB stores.
 *  paid → listing_type 'sell' (+ exact price when given); everything else 'free'. */
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
