'use client';

/* ── A person, not a product ───────────────────────────────────────────────
 *
 * The homepage now has a row about WHO is selling rather than WHAT is for sale,
 * and it has to look like it at a glance. If a business used the product card
 * the row would read as four more things to buy — the reader would have to
 * stop and parse the text to notice the difference, which is the moment the
 * distinction is already lost.
 *
 * So the visual language inverts on purpose. A product card is a photograph
 * with text laid over it; this is a tinted field with a round portrait and a
 * line of stock counts. Landscape rather than portrait, no price, no save
 * heart. Nothing about it can be mistaken for an item at thumbnail size, which
 * is the only size that matters in a scrolling rail.
 *
 * The honest caveat, which is worth stating where the card is built: there is
 * no business entity in the schema yet. This is assembled from a seller's
 * listings, so "Studio M, design studio, 12 products" is really "this person
 * has twelve live listings across these categories". A real venture profile —
 * logo, cover, services, portfolio, reviews — needs its own table and its own
 * creation flow.
 */

import { getAvatar } from '../lib/photos';
import OnlineBadge from './OnlineBadge';
import type { SellerSummary } from '../lib/feed/modules';

export default function SellerCard({
  seller, onClick,
}: {
  seller: SellerSummary;
  onClick: () => void;
}) {
  const { user, listingCount, serviceCount, categories } = seller;
  const total = listingCount + serviceCount;

  /* What this person is known for. Two categories is the readable maximum at
     this width; a third turns the line into a list nobody finishes. */
  const trade = serviceCount > 0 && listingCount === 0
    ? 'Services'
    : categories.slice(0, 2).join(' · ') || user.role;

  const counts = [
    listingCount ? `${listingCount} item${listingCount === 1 ? '' : 's'}` : null,
    serviceCount ? `${serviceCount} service${serviceCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <button type="button" onClick={onClick} className="seller-card" aria-label={`View ${user.name}'s storefront`}>
      <span className="seller-card-band" aria-hidden="true" />
      <img
        className="seller-card-avatar"
        src={getAvatar(user.id || user.name, 96)}
        alt=""
        loading="lazy"
        width={52}
        height={52}
      />
      <span className="seller-card-body">
        <span className="seller-card-name">
          {user.name}
          <OnlineBadge isOnline={user.isOnline} dotOnly />
        </span>
        <span className="seller-card-trade">{trade}</span>
        <span className="seller-card-meta">{counts || `${total} live`}</span>
      </span>
    </button>
  );
}
