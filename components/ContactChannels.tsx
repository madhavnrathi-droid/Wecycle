'use client';

/* How to reach the seller, always in the same order and always all of them:
 *
 *   Order (or the post's main action)  ·  Message  ·  Email  ·  WhatsApp
 *
 * Every channel keeps its place and its label, so a buyer learns the row once
 * and finds things where they were. A channel this seller hasn't shared stays
 * visible but quiet, and says so when tapped — "Sanvi hasn't shared WhatsApp,
 * message her here" — instead of the row silently changing shape from one
 * post to the next. Signed out, every channel asks for sign-in first: the
 * seller's details are only fetched for members. */

import type { ReactNode } from 'react';
import { MessageCircle, Mail, ShoppingBag } from 'lucide-react';
import type { ContactLink } from '../lib/contactUser';
import { toast } from '../lib/toast';
import { haptics } from '../lib/haptics';

/* WhatsApp's mark, drawn: a speech bubble with a handset in it. The bubble on
   its own was the same shape as the Message icon beside it. */
export function WhatsAppMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 20.5 4.9 16.6A8.6 8.6 0 1 1 7.6 19.3Z" />
      <g transform="translate(7.1 6.6) scale(0.41)" strokeWidth={4.4}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </g>
    </svg>
  );
}

export interface ContactChannelsProps {
  variant: 'mobile' | 'desktop';
  sellerName: string;
  /** The big button: Order on things for sale, the post's own action otherwise. */
  primary: { kind: 'order' | 'message'; label: string; ariaLabel: string; onClick: () => void } | null;
  /** Message on Wecycle as its own channel — shown whenever messaging exists
   *  and the primary isn't already "message". */
  onMessage?: () => void;
  links: ContactLink[];
  signedIn: boolean;
  onRequireAuth: () => void;
  onLink: (link: ContactLink) => void;
}

export default function ContactChannels({
  variant, sellerName, primary, onMessage, links, signedIn, onRequireAuth, onLink,
}: ContactChannelsProps) {
  const first = sellerName.split(/\s+/)[0] || 'The seller';
  const email = links.find(l => l.channel === 'email') ?? null;
  const whatsapp = links.find(l => l.channel === 'whatsapp') ?? null;

  const unavailable = (what: 'email' | 'whatsapp') => {
    haptics.light();
    toast(what === 'whatsapp'
      ? `${first} hasn’t shared WhatsApp. Message them on Wecycle instead.`
      : `${first} keeps their email private. Message them on Wecycle instead.`);
  };

  const channel = (key: string, icon: ReactNode, label: string, opts: {
    link?: ContactLink | null; off?: boolean; onClick?: () => void; tone?: 'wa'; aria: string;
  }) => (
    <button
      key={key}
      type="button"
      className="cc-ch ord-press"
      data-tone={opts.tone}
      data-off={opts.off || undefined}
      aria-disabled={opts.off || undefined}
      aria-label={opts.aria}
      title={variant === 'desktop' ? opts.aria : undefined}
      onClick={() => {
        if (!signedIn) { onRequireAuth(); return; }
        if (opts.onClick) { opts.onClick(); return; }
        if (opts.link) { onLink(opts.link); return; }
        unavailable(key === 'wa' ? 'whatsapp' : 'email');
      }}
    >
      <span className="cc-ch-icon">{icon}</span>
      <span className="cc-ch-label">{label}</span>
    </button>
  );

  /* Signed out the links aren't resolved yet, so nothing is "off" — every
     channel just leads to sign-in. */
  const emailOff = signedIn && !email;
  const waOff = signedIn && !whatsapp;

  return (
    <div className={`cc cc--${variant}`}>
      {primary && (
        <button type="button" className="cc-primary ord-press" onClick={primary.onClick} aria-label={primary.ariaLabel}>
          {primary.kind === 'order' ? <ShoppingBag size={17} strokeWidth={2} /> : <MessageCircle size={17} strokeWidth={2} />}
          <span>{primary.label}</span>
        </button>
      )}
      <div className="cc-channels" role="group" aria-label={`Other ways to reach ${first}`}>
        {onMessage && primary?.kind !== 'message' && channel('msg', <MessageCircle size={19} strokeWidth={1.9} />, 'Message', {
          onClick: onMessage, aria: `Message ${sellerName} on Wecycle`,
        })}
        {channel('email', <Mail size={19} strokeWidth={1.9} />, 'Email', {
          link: email, off: emailOff,
          aria: emailOff ? `Email — ${first} keeps their email private` : email?.ariaLabel ?? `Email ${sellerName}`,
        })}
        {channel('wa', <WhatsAppMark size={19} />, 'WhatsApp', {
          link: whatsapp, off: waOff, tone: 'wa',
          aria: waOff ? `WhatsApp — ${first} hasn’t shared WhatsApp` : whatsapp?.ariaLabel ?? `WhatsApp ${sellerName}`,
        })}
      </div>
    </div>
  );
}
