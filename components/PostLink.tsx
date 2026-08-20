'use client';

import { ExternalLink, Link2 } from 'lucide-react';
import { linkHost, shortLink, linkify } from '../lib/postLink';

/* Presentation for outbound links on a post. Three pieces, one rule: the
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

/** The link as a standalone control, under the description. */
export function LinkChip({ url, onOpen }: { url: string; onOpen?: () => void }) {
  return (
    <a
      href={url}
      {...OUT}
      onClick={onOpen}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        maxWidth: '100%',
        padding: '10px 14px',
        borderRadius: 999,
        background: 'var(--bg-inset)',
        color: 'var(--text-primary)',
        textDecoration: 'none',
        fontSize: 13, fontWeight: 600,
        letterSpacing: '-0.01em',
      }}
    >
      <Link2 size={14} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortLink(url, 28)}
      </span>
      <ExternalLink size={13} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.55 }} />
    </a>
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
        fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.01em',
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
