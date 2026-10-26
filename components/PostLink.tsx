'use client';

import {
  ExternalLink, Link2, ArrowUpRight, ClipboardList, InstagramLogo, WhatsappLogo, YoutubeLogo, LinkedinLogo,
  XLogo, SpotifyLogo, GithubLogo, MapTrifold, GoogleDriveLogo, FileText, Ticket, ShoppingBag, Globe,
  type LucideIcon,
} from '@/lib/icons';
import { linkHost, shortLink, linkify, linkKind, linkTitle, type LinkKind, type PostLink } from '../lib/postLink';

/* Presentation for outbound links on a post. Several pieces, one rule: the
   destination host is always visible before the tap. See lib/postLink.ts for
   why these are shortened for display rather than redirected through us. */

/** Attributes every outbound anchor must carry.
 *  noopener stops the opened page reaching back through window.opener;
 *  nofollow keeps member-supplied links from passing our domain's ranking on
 *  to whatever they point at, which is what makes a listings board worth
 *  spamming in the first place. */
const OUT = {
  target: '_blank',
  rel: 'noopener noreferrer nofollow',
} as const;

const GLYPH: Record<LinkKind, LucideIcon> = {
  form: ClipboardList, instagram: InstagramLogo, whatsapp: WhatsappLogo, youtube: YoutubeLogo,
  linkedin: LinkedinLogo, x: XLogo, spotify: SpotifyLogo, github: GithubLogo, map: MapTrifold,
  drive: GoogleDriveLogo, doc: FileText, ticket: Ticket, shop: ShoppingBag, web: Globe,
};

/** The mark for where a link goes — Instagram's logo, a form, a map — so the
 *  destination reads before the address does. A plain globe for the rest. */
export function LinkGlyph({ url, size = 18 }: { url: string; size?: number }) {
  const Icon = GLYPH[linkKind(url)] ?? Globe;
  return <Icon size={size} aria-hidden="true" />;
}

/** A post's links, under its description: one quiet group, a row per link —
 *  what it is (the poster's name for it, or the service's), then where it
 *  goes, the host always in full. Rows are real anchors, so long-press, copy
 *  and open-in-browser all behave as they do everywhere else. */
export function LinkList({ links, onOpen, style }: {
  links: readonly PostLink[];
  onOpen?: (link: PostLink, index: number) => void;
  style?: React.CSSProperties;
}) {
  if (!links.length) return null;
  return (
    <ul className="plinks" aria-label={links.length === 1 ? 'Link' : 'Links'} style={style}>
      {links.map((l, i) => (
        <li key={l.url}>
          <a href={l.url} {...OUT} className="plinks-row" onClick={() => onOpen?.(l, i)}>
            <span className="plinks-glyph"><LinkGlyph url={l.url} /></span>
            <span className="plinks-text">
              <span className="plinks-title">{linkTitle(l)}</span>
              <span className="plinks-url">{shortLink(l.url, 30)}</span>
            </span>
            <ArrowUpRight size={16} className="plinks-go" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Prose with any URLs in it turned into anchors.
 *  Built from segments rather than dangerouslySetInnerHTML — the text is
 *  member-written, so it must never be parsed as markup. */
export function LinkedText({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <p style={style}>
      {linkify(text).map((seg, i) =>
        seg.href ? (
          <a
            key={i}
            href={seg.href}
            {...OUT}
            style={{ color: 'var(--accent-forest, #008939)', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-word' }}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

/** The marker that tells someone a photo is a link before they tap it.
 *  A linked photo has to look different from a photo that opens full screen,
 *  because the two do very different things and the tap target is identical. */
export function PhotoLinkBadge({ url }: { url: string }) {
  return (
    <span
      style={{
        position: 'absolute', left: 10, bottom: 10, zIndex: 3,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        maxWidth: 'calc(100% - 20px)',
        padding: '6px 10px',
        borderRadius: 999,
        /* Its own dark plate rather than a tint of the photo — the badge has to
           stay readable over an unknown image. */
        background: 'rgba(14,14,8,0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: '#FFFFFF',
        fontSize: 'calc(11.5px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.01em',
        pointerEvents: 'none',
      }}
    >
      <Link2 size={12} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {linkHost(url)}
      </span>
      <ExternalLink size={11} strokeWidth={2.2} style={{ flexShrink: 0, opacity: 0.8 }} />
    </span>
  );
}

/** Follow a link from a handler rather than an anchor.
 *
 *  The photo cannot simply BE an anchor: an <a> laid over the carousel would
 *  swallow the swipe, and the carousel already distinguishes a tap from a drag.
 *  So a real anchor is synthesised and clicked, which keeps the platform's own
 *  link handling — the part that matters inside the iOS WKWebView, where
 *  window.open is unreliable and can be swallowed silently. */
export function openExternal(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer nofollow';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export { OUT as OUTBOUND_ANCHOR_ATTRS };
