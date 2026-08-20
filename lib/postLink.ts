/* ── Outbound links on posts ───────────────────────────────────────────────
 *
 * A member can attach one link to a listing, and optionally make the photo
 * itself follow it. Two jobs live here: deciding what counts as a link at all,
 * and rendering one short enough to sit inside a sentence.
 *
 * ON "SHORT URL". These are shortened for DISPLAY — manipal.edu/admissions…  —
 * and always show the real host. The alternative, minting wecycle.page/l/ab12
 * codes that redirect outward, was deliberately not built: a redirector on our
 * own domain is an open redirector, and an open redirector is a phishing tool.
 * It would let any member hand out a wecycle.page link that lands anywhere,
 * borrowing our domain's credibility to do it, and it hides from the person
 * tapping exactly the thing they need to decide with. Showing the host is both
 * safer and what X and LinkedIn settled on after years of the other approach.
 *
 * The href is separately constrained at the database (listings_link_url_check).
 * Nothing here is a security boundary on its own — the client is not what
 * decides what a row contains.
 */

/** Schemes that may ever become an href. Everything else is a way to run code
 *  or launch an app, dressed as a link. */
const SAFE_SCHEME = /^https?:$/;

/** Canonical form of what someone typed, or null if it isn't a usable link.
 *  A bare "manipal.edu/x" is assumed https — that is how people type links,
 *  and refusing them over a missing scheme is friction with no upside. */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try { url = new URL(withScheme); } catch { return null; }

  if (!SAFE_SCHEME.test(url.protocol)) return null;
  /* A host with no dot is a hostname on a local network, not a public link. */
  if (!url.hostname.includes('.')) return null;
  if (url.href.length > 500) return null;
  return url.href;
}

/** Hostname without the www., which carries no information. */
export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return url; }
}

/** The link as it should read inside a sentence: the host, plus as much of the
 *  path as fits. The host is never truncated — it is the part that matters. */
export function shortLink(url: string, maxPath = 16): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  const host = u.hostname.replace(/^www\./i, '');
  const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`;
  if (!rest) return host;
  return rest.length <= maxPath ? `${host}${rest}` : `${host}${rest.slice(0, maxPath - 1)}…`;
}

/* Matches a URL inside prose. Trailing punctuation is excluded so "see
   example.com." does not swallow the full stop into the href. */
const IN_TEXT = /\b((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"]|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*[^\s<>().,;:!?'"])?)/gi;

export interface TextSegment { text: string; href?: string }

/** Split prose into plain runs and link runs, so a description can render its
 *  URLs as real anchors without ever putting caller-supplied HTML in the DOM. */
export function linkify(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(IN_TEXT)) {
    const at = m.index ?? 0;
    const href = normalizeLink(m[0]);
    if (!href) continue;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: shortLink(href), href });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
