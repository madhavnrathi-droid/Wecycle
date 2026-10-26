/* ── Outbound links on posts ───────────────────────────────────────────────
 *
 * Any post can carry up to three links, and a listing can make its photo
 * follow the first one. The jobs that live here: deciding what counts as a
 * link at all, rendering one short enough to sit inside a sentence, and
 * storing several of them on tables that have no column for them (below).
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

/* ── Up to three links on any post ────────────────────────────────────────
 *
 * Every kind of post can carry links now — an event's registration form and
 * its Instagram, a request's "this exact model", a lost bag's map pin — not
 * only listings. Only listings ever had a column for one (link_url), and the
 * server key cannot add columns, so the links travel in the one free-text
 * column every post table already has: a short trailer at the end of the
 * description.
 *
 *     Selling my cycle, barely used.
 *
 *     Links
 *     Spec sheet: https://hero.com/sprint
 *     https://instagram.com/p/abc
 *
 * The trailer is plain text on purpose. An installed app built before this
 * change renders descriptions through LinkedText, so on those builds the same
 * row still reads as a tidy list of tappable links rather than as markup.
 * This build pulls the trailer back off (unpackLinks) and draws it as a list
 * under the description.
 *
 * Parsing is strict — a heading line that says exactly "Links", then one to
 * three lines that each END in a usable link — so ordinary prose that happens
 * to mention a URL is never lifted out of the description. */

export const MAX_LINKS = 3;
/** Long enough for "Register (closes Friday)", short enough to stay one line. */
export const MAX_LINK_LABEL = 40;
const TRAILER_HEAD = 'Links';

export interface PostLink {
  url: string;
  /** What the poster called it. Optional — linkName() names it otherwise. */
  label?: string;
}

/** A label as it may be stored: one line, no stray spacing, bounded. A colon
 *  at the end is dropped because the trailer already puts one there. */
export function cleanLinkLabel(raw: string | undefined): string | undefined {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim().replace(/[:\-–—]+$/, '').trim();
  return s ? s.slice(0, MAX_LINK_LABEL) : undefined;
}

/** De-duplicated, validated, at most MAX_LINKS. Anything that is not a usable
 *  link is dropped here; forms reject it earlier with a message. */
export function cleanLinks(links: readonly PostLink[] | undefined | null): PostLink[] {
  const out: PostLink[] = [];
  for (const l of links ?? []) {
    const url = normalizeLink(l.url ?? '');
    if (!url || out.some(o => o.url === url)) continue;
    const label = cleanLinkLabel(l.label);
    out.push(label ? { url, label } : { url });
    if (out.length === MAX_LINKS) break;
  }
  return out;
}

/** The description with its links written in as a trailer. */
export function packLinks(description: string | null | undefined, links: readonly PostLink[] | undefined | null): string {
  const text = (description ?? '').trim();
  const clean = cleanLinks(links);
  if (clean.length === 0) return text;
  const lines = clean.map(l => (l.label ? `${l.label}: ${l.url}` : l.url));
  return `${text}${text ? '\n\n' : ''}${TRAILER_HEAD}\n${lines.join('\n')}`;
}

/** One trailer line back into a link, or null if the line is not one. A line
 *  is a bare URL, or "Label: URL" — the URL is the last word, and anything
 *  before it must be a short label ending in that colon, which is what keeps a
 *  sentence that ends in a URL from being read as a labelled link. */
function parseLine(line: string): PostLink | null {
  const s = line.trim();
  if (!s) return null;
  const cut = s.search(/\S+$/);
  const url = normalizeLink(s.slice(cut));
  if (!url) return null;
  const prefix = s.slice(0, cut).trim();
  if (!prefix) return { url };
  if (!prefix.endsWith(':') || prefix.length > MAX_LINK_LABEL + 1) return null;
  const label = cleanLinkLabel(prefix);
  return label ? { url, label } : { url };
}

/** Split a stored description into the text to show and its links. A
 *  description without a well-formed trailer comes back untouched. */
export function unpackLinks(raw: string | null | undefined): { text: string; links: PostLink[] } {
  const full = (raw ?? '').replace(/\r\n/g, '\n').trimEnd();
  const lines = full.split('\n');
  for (let h = lines.length - 2; h >= 0 && h >= lines.length - 1 - MAX_LINKS; h--) {
    if (lines[h].trim() !== TRAILER_HEAD) continue;
    /* The heading starts the post or follows a blank line — "Links" in the
       middle of a sentence's paragraph is the poster's own prose. */
    if (h > 0 && lines[h - 1].trim() !== '') continue;
    const parsed = lines.slice(h + 1).map(parseLine);
    if (parsed.length === 0 || parsed.some(p => !p)) continue;
    return { text: lines.slice(0, h).join('\n').trimEnd(), links: cleanLinks(parsed as PostLink[]) };
  }
  return { text: full, links: [] };
}

/* Names for the places people actually link to from a campus post, so an
   unlabelled link still reads as "Instagram" rather than as a hostname. */
const KNOWN: { test: RegExp; name: string; kind: LinkKind }[] = [
  { test: /(^|\.)forms\.gle$|^docs\.google\.com\/forms|(^|\.)typeform\.com$|(^|\.)tally\.so$|^forms\.office\.com/, name: 'Form', kind: 'form' },
  { test: /(^|\.)instagram\.com$|^instagr\.am$/, name: 'Instagram', kind: 'instagram' },
  { test: /(^|\.)whatsapp\.com$|^wa\.me$/, name: 'WhatsApp', kind: 'whatsapp' },
  { test: /(^|\.)youtube\.com$|^youtu\.be$/, name: 'YouTube', kind: 'youtube' },
  { test: /(^|\.)linkedin\.com$|^lnkd\.in$/, name: 'LinkedIn', kind: 'linkedin' },
  { test: /^(x|twitter)\.com$/, name: 'X', kind: 'x' },
  { test: /(^|\.)spotify\.com$|^spotify\.link$/, name: 'Spotify', kind: 'spotify' },
  { test: /(^|\.)github\.com$/, name: 'GitHub', kind: 'github' },
  { test: /^maps\.app\.goo\.gl$|^(www\.)?google\.[a-z.]+\/maps|^maps\.google\./, name: 'Map', kind: 'map' },
  { test: /^drive\.google\.com$/, name: 'Google Drive', kind: 'drive' },
  { test: /^docs\.google\.com$/, name: 'Google Doc', kind: 'doc' },
  { test: /(^|\.)unstop\.com$/, name: 'Unstop', kind: 'ticket' },
  { test: /(^|\.)lu\.ma$|(^|\.)luma\.com$/, name: 'Luma', kind: 'ticket' },
  { test: /(^|\.)bookmyshow\.com$|(^|\.)district\.in$|(^|\.)insider\.in$|(^|\.)konfhub\.com$|(^|\.)devfolio\.co$/, name: '', kind: 'ticket' },
  { test: /(^|\.)amazon\.(in|com)$|^amzn\.(in|to)$|(^|\.)flipkart\.com$/, name: '', kind: 'shop' },
];

export type LinkKind =
  | 'form' | 'instagram' | 'whatsapp' | 'youtube' | 'linkedin' | 'x' | 'spotify'
  | 'github' | 'map' | 'drive' | 'doc' | 'ticket' | 'shop' | 'web';

function classify(url: string): { name: string; kind: LinkKind } {
  let u: URL;
  try { u = new URL(url); } catch { return { name: '', kind: 'web' }; }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  const hostPath = `${host}${u.pathname}`;
  for (const k of KNOWN) {
    if (k.test.test(host) || k.test.test(hostPath)) return { name: k.name, kind: k.kind };
  }
  return { name: '', kind: 'web' };
}

export function linkKind(url: string): LinkKind {
  return classify(url).kind;
}

/** What to call a link when its poster didn't: the service's name if it is one
 *  people know, otherwise the host. Doubles as the label field's suggestion. */
export function linkName(url: string): string {
  return classify(url).name || linkHost(url);
}

/** The label a link should display under: the poster's, or its name. */
export function linkTitle(l: PostLink): string {
  return l.label || linkName(l.url);
}
