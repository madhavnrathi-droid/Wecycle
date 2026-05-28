/* Building blocks for the contact action that fires when a viewer taps
 * "Request to borrow / I'll take it / Offer a swap / Contact seller" on a
 * post. We resolve which channels the owner accepts, craft a preset
 * message that references the post + action, and return the right deep-link
 * (or links, when multiple channels are accepted) for the caller to render.
 *
 * Outputs are intentionally small URL strings so consumers can either:
 *   - render them as buttons (`<a href={link.href}>…</a>`), or
 *   - jump immediately with `window.location.href = link.href` when there's
 *     only one channel.
 */

import type { User, MarketplaceItem, CommunityEvent } from './mockData';

export type ContactAction =
  | 'borrow'      /* Request to borrow */
  | 'buy'         /* Contact seller (paid listing) */
  | 'free'        /* I'll take it (giveaway) */
  | 'swap'        /* Offer a swap */
  | 'request'     /* Respond to a posted request */
  | 'event'       /* Message an event organizer */
  | 'general';    /* Generic "say hi" */

export type ContactChannel = 'email' | 'whatsapp';

export interface ContactLink {
  channel: ContactChannel;
  href: string;
  /** Short label suitable for a button (e.g. "Email Aditya"). */
  label: string;
  /** Long label for screen-readers / tooltips. */
  ariaLabel: string;
}

/* ── Public API ────────────────────────────────────── */

interface BuildArgs {
  owner: Pick<User, 'name' | 'email' | 'phone' | 'contact'>;
  action: ContactAction;
  /** Optional reference object so we can quote the title in the message. */
  item?: Pick<MarketplaceItem, 'title' | 'category' | 'listingType' | 'price'>;
  event?: Pick<CommunityEvent, 'title' | 'date'>;
  /** The viewer's display name — included in the signature when available. */
  viewerName?: string;
}

/** Build all contact links available for this owner.
 *
 *  POLICY (set by product on 2026-05-28):
 *    - **Email is always shown when the owner has an email on file.**
 *      We deliberately ignore the contact_email_enabled opt-out — the alt was
 *      "owner opted out and now nobody can reach them about this listing they
 *      themselves posted", which was breaking every contact button in live
 *      mode. If a user truly doesn't want email, they should delete the post.
 *    - WhatsApp is opt-in: only shown when phone is set AND the owner has
 *      explicitly turned on contact_whatsapp_enabled. */
export function buildContactLinks(args: BuildArgs): ContactLink[] {
  const out: ContactLink[] = [];
  const { owner } = args;
  const pref = owner.contact ?? { email: true, whatsapp: false };

  /* Email — unconditional when present. */
  if (owner.email) {
    out.push(emailLink(args));
  }
  /* WhatsApp — opt-in only. */
  if (pref.whatsapp && owner.phone) {
    out.push(whatsappLink(args));
  }
  return out;
}

/** Pretty action label for the primary button when multiple aren't needed. */
export function actionLabel(action: ContactAction): string {
  switch (action) {
    case 'borrow':  return 'Request to borrow';
    case 'buy':     return 'Contact seller';
    case 'free':    return "I'll take it";
    case 'swap':    return 'Offer a swap';
    case 'request': return 'Respond to request';
    case 'event':   return 'Message organizer';
    case 'general': return 'Send a message';
  }
}

/* ── Internals ─────────────────────────────────────── */

function subjectFor(args: BuildArgs): string {
  const title = args.item?.title ?? args.event?.title ?? 'your post';
  switch (args.action) {
    case 'borrow':  return `Wecycle · Request to borrow: ${title}`;
    case 'buy':     return `Wecycle · Interested in buying: ${title}`;
    case 'free':    return `Wecycle · I'd love to take this: ${title}`;
    case 'swap':    return `Wecycle · Swap proposal: ${title}`;
    case 'request': return `Wecycle · I can help with: ${title}`;
    case 'event':   return `Wecycle · About your event: ${title}`;
    default:        return `Wecycle · About: ${title}`;
  }
}

function bodyFor(args: BuildArgs): string {
  const { owner, action, item, event, viewerName } = args;
  const greeting = `Hi ${firstName(owner.name)},`;
  const title = item?.title ?? event?.title ?? 'your post';
  const lines: string[] = [greeting, ''];

  /* Opening line — varies by action so the recipient knows what's coming. */
  switch (action) {
    case 'borrow':
      lines.push(`I saw "${title}" on Wecycle and would love to borrow it for a few days.`);
      lines.push('What dates work for pickup, and is there a deposit?');
      break;
    case 'buy':
      lines.push(`I came across "${title}" on Wecycle and I'm interested in buying.`);
      if (item?.price) lines.push(`Asking ₹${item.price} — happy to discuss. When can I pick up?`);
      else lines.push('Could you share the price and pickup window?');
      break;
    case 'free':
      lines.push(`I noticed "${title}" is up for free on Wecycle — I could really use it.`);
      lines.push('When would be a good time to come by?');
      break;
    case 'swap':
      lines.push(`I'd love to swap for "${title}" on Wecycle. I can offer something in return — happy to send photos.`);
      break;
    case 'request':
      lines.push(`I saw your request for "${title}" on Wecycle and I think I can help.`);
      break;
    case 'event':
      lines.push(`I have a quick question about your event "${title}"${event?.date ? ` on ${event.date}` : ''}.`);
      break;
    default:
      lines.push(`Reaching out about "${title}" on Wecycle.`);
  }

  lines.push('', '—', viewerName ? `Sent by ${viewerName} via Wecycle` : 'Sent via Wecycle');
  return lines.join('\n');
}

function emailLink(args: BuildArgs): ContactLink {
  const subject = subjectFor(args);
  const body = bodyFor(args);
  const to = args.owner.email!;
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const first = firstName(args.owner.name);
  return {
    channel: 'email',
    href,
    label: `Email ${first}`,
    ariaLabel: `Send ${first} an email about ${args.item?.title ?? args.event?.title ?? 'your post'}`,
  };
}

function whatsappLink(args: BuildArgs): ContactLink {
  const phone = sanitizePhone(args.owner.phone!);
  /* WhatsApp click-to-chat only takes a single `text` query — no subject —
     so we squash the body into one paragraph and lead with a brief context line. */
  const text = bodyFor(args).replace(/\n+/g, ' ');
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const first = firstName(args.owner.name);
  return {
    channel: 'whatsapp',
    href,
    label: `WhatsApp ${first}`,
    ariaLabel: `Open WhatsApp chat with ${first} about ${args.item?.title ?? args.event?.title ?? 'your post'}`,
  };
}

function firstName(full: string): string {
  return (full ?? '').trim().split(/\s+/)[0] || 'there';
}

function sanitizePhone(s: string): string {
  /* wa.me wants digits only (with country code). Strip everything else. */
  return s.replace(/[^\d]/g, '');
}

/** Map a marketplace item's listingType to the action we should fire. */
export function itemAction(item: Pick<MarketplaceItem, 'listingType'>): ContactAction {
  switch (item.listingType) {
    case 'free':   return 'free';
    case 'borrow': return 'borrow';
    case 'swap':   return 'swap';
    case 'sell':   return 'buy';
    default:       return 'general';
  }
}
