/* ── What a post's share card says ─────────────────────────────────────────
 *
 * One builder per kind of post, used by EVERY place that shares it — the
 * detail page on a phone, the detail page on a desktop, and the feed card's
 * ⋯ menu. They used to build their own specs, and drifted: the desktop one
 * dropped the rent period ("₹200" for a ₹200/day rental), and the feed menu
 * sent a bare link with no card at all.
 */

import type { MarketplaceItem } from './mockData';
import type { ShareCardSpec } from './shareCard';
import { priceLine, fromListingType, DEAL_BY_ID } from './dealTypes';
import { opportunityCompLabel, oppRoleBadge } from './opportunity';
import { getAvatar, resolveItemMedia } from './photos';
import { shareUrl } from './shareUrl';

/** Still images only — a video entry contributes its poster frame. */
export function shareablePhotos(media: unknown[]): string[] {
  return media
    .map(p => (typeof p === 'string' ? p : (p as { poster?: string; src?: string } | null)?.poster
      ?? (p as { src?: string } | null)?.src))
    .filter((u): u is string => !!u && /^https?:|^\//.test(u));
}

/** Listings, services and requests (all MarketplaceItem-shaped). `photos`
 *  defaults to the post's own media; the detail page passes what is on screen,
 *  which includes a photo just edited. */
export function itemShareSpec(item: MarketplaceItem, photos?: string[]): ShareCardSpec {
  const isRequest = !!item.isRequest;
  const isOpportunity = item.kind === 'opportunity';
  const isPriced = !isRequest && item.listingType === 'sell' && typeof item.price === 'number';
  const deal = fromListingType(item.listingType);
  /* The money exactly as it should read, through the one formatter the feed
     and the detail page use — "₹200 / day", "Swap for a calculator", "Free". */
  const money = priceLine({ deal, price: item.price, ratePeriod: item.ratePeriod, swapFor: item.swapFor });
  const badge = isRequest
    ? (item.urgent ? 'Urgent' : 'Wanted')
    : isOpportunity ? opportunityCompLabel(item)
    : DEAL_BY_ID[deal].badge;

  return {
    kind: isRequest ? 'request' : isOpportunity ? 'job' : 'item',
    title: item.title,
    imageUrls: photos ?? shareablePhotos(resolveItemMedia(item)),
    price: isPriced ? item.price : undefined,
    priceLine: isRequest || isOpportunity ? undefined : (isPriced ? `₹${item.price!.toLocaleString('en-IN')}` : money),
    badge,
    roleLabel: isOpportunity ? oppRoleBadge(item.oppRole) : undefined,
    conditionLabel: isOpportunity || isRequest
      ? undefined
      : ({ like_new: 'Like new', good: 'Good', fair: 'Fair' } as const)[item.condition],
    location: item.location,
    description: item.description,
    byName: item.user.name,
    byInitials: item.user.initials,
    byAvatar: getAvatar(item.user.id, 128),
    byColor: item.user.color,
    verified: true,
    url: shareUrl(item.id),
  };
}
