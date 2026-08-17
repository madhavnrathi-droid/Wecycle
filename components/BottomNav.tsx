'use client';

import { Home, Plus, Package, CalendarDays, PackageSearch } from 'lucide-react';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';

/* Activity dropped from the bottom nav — its post-level metrics now live
   inline on each Inventory card (and on the item-detail page for the owner).
   Lost & Found takes the freed-up slot since it's a high-traffic flow. */
export type Screen =
  | 'feed' | 'events' | 'lost_found' | 'inventory'
  | 'market' | 'impact' | 'account' | 'activity';

interface BottomNavProps {
  active: Screen;
  onChange: (screen: Screen) => void;
  onPost: () => void;
}

/* ── Section colours ───────────────────────────────────────────────────────
 *
 * The active pill takes the colour of the section it sits on. Every pair below
 * was solved numerically against the nav's white surface rather than picked by
 * eye, because the brief was a hard 3:1 floor as the colours switch:
 *
 *   section      fill      ink       ink-on-fill   edge-vs-bar
 *   home         #008939   white          4.53:1        4.53:1
 *   lost&found   #DB3A00   white          4.55:1        4.55:1
 *   events       #A43BFF   white          4.52:1        4.52:1
 *   inventory    #FFC526   near-black    12.23:1        5.54:1  (via `edge`)
 *
 * Two things fall out of the maths and are worth knowing before editing these.
 *
 * First, when a pill is a solid colour on a white bar carrying white text, the
 * two checks — pill against bar, and text against pill — are the SAME
 * computation. One number governs both, so 4.5:1 for the label automatically
 * clears the 3:1 the indicator needs.
 *
 * Second, yellow cannot be part of that scheme. A yellow dark enough to carry
 * white text at 4.5:1 has stopped being yellow (it lands on #967000, an olive).
 * Yellow is inherently near-white in luminance, so it can never reach 3:1
 * against a white bar on fill alone. Inventory therefore flips to dark ink on a
 * bright amber — how yellow is used everywhere, and a far higher 12.23:1 — and
 * takes its 3:1 boundary from a darker amber rim instead, which WCAG 1.4.11
 * explicitly allows. Do not "fix" the inconsistency by darkening the amber; it
 * costs the hue and gains nothing.
 */
const INK_LIGHT = '#FFFFFF';
const INK_DARK = '#0E0E08';

interface Section { fill: string; ink: string; edge: string }

/* The four screens that own a slot in the bar. `Screen` is deliberately wider
   than this — 'account', 'impact' and 'activity' are all reachable — so this
   stays a separate, narrower type instead of being derived from `Screen`. */
type SectionKey = 'feed' | 'events' | 'lost_found' | 'inventory';

const SECTION: Record<SectionKey, Section> = {
  feed:       { fill: '#008939', ink: INK_LIGHT, edge: 'transparent' },
  events:     { fill: '#A43BFF', ink: INK_LIGHT, edge: 'transparent' },
  lost_found: { fill: '#DB3A00', ink: INK_LIGHT, edge: 'transparent' },
  inventory:  { fill: '#FFC526', ink: INK_DARK,  edge: '#8A6100' },
};

/* Screens with no slot of their own — Account, Impact, Activity — still render
 * the bar, just with nothing lit and no pill. They need a Section regardless,
 * because the bar reads `.ink` off it while building the buttons.
 *
 * This fallback is not defensive padding; its absence was a crash. The bar this
 * one replaced asked `active === 'feed'` four times, and that is merely false on
 * an off-slot screen. The redesign turned those comparisons into a lookup, and a
 * lookup that misses yields undefined — so opening Account threw "Cannot read
 * properties of undefined (reading 'ink')" during render and took the entire app
 * down to Next's client-exception notice, on every device.
 *
 * `ink` is never actually painted from here (only an active button takes it, and
 * on these screens none is active) but it has to exist. */
const NEUTRAL: Section = { fill: 'transparent', ink: 'inherit', edge: 'transparent' };

/* Which slot each screen lights. Partial over the full `Screen` union on
 * purpose: a lookup returns `SectionKey | undefined`, so TypeScript forces the
 * miss to be handled rather than letting it reach the DOM as undefined. The
 * previous code asserted `as keyof typeof SECTION` instead, which told the
 * compiler the other four Screen values could not occur — that lie is precisely
 * why this shipped. Adding a member to `Screen` now cannot smuggle an unhandled
 * key into the lookups below.
 *
 * `market` is the storefront view of the feed, so it lights Home. */
const SLOT_FOR: Partial<Record<Screen, SectionKey>> = {
  feed:       'feed',
  market:     'feed',
  events:     'events',
  lost_found: 'lost_found',
  inventory:  'inventory',
};

/* Slot order drives both the layout and where the indicator slides to. The
   post button is the middle slot so the row stays symmetrical — five equal
   grid columns, not space-around, which is what left the old bar looking
   off-centre once the post button and the labels were in it. */
const SLOTS: { key: SectionKey; screen: Screen; label: string; srLabel?: string }[] = [
  { key: 'feed',       screen: 'feed',       label: 'Home' },
  { key: 'events',     screen: 'events',     label: 'Events' },
  { key: 'lost_found', screen: 'lost_found', label: 'Lost', srLabel: 'Lost & Found' },
  { key: 'inventory',  screen: 'inventory',  label: 'Inventory' },
];

/** Which slot the indicator sits under, in grid-column terms (post is col 3). */
const COLUMN_OF: Record<SectionKey, number> = { feed: 1, events: 2, lost_found: 4, inventory: 5 };

export default function BottomNav({ active, onChange, onPost }: BottomNavProps) {
  /* Wraps the parent's onChange so we get a single source of nav events. */
  const navigate = (next: Screen) => {
    if (next === active) return;
    haptics.selection();   /* iOS-style light tick on tab change */
    track(EVT.nav_switched, { from: active, to: next });
    onChange(next);
  };

  /* null on Account / Impact / Activity: no slot is lit, no pill is drawn, and
     `section` falls back to NEUTRAL so nothing reads a field off undefined. */
  const activeKey = SLOT_FOR[active] ?? null;
  const section = activeKey ? SECTION[activeKey] : NEUTRAL;
  const column = activeKey ? COLUMN_OF[activeKey] : null;

  return (
    <nav
      aria-label="Primary"
      className="mobile-only-nav bottom-nav"
    >
      <div className="bottom-nav-inner">
        {/* The sliding indicator. One element that moves between columns rather
            than a background on each button — that is what makes it read as a
            single object travelling along the bar instead of four pills taking
            turns lighting up. Hidden from AT; aria-current on the button is the
            real signal. */}
        {column ? (
          <span
            className="bottom-nav-slider"
            aria-hidden="true"
            /* Colours are set here rather than inherited through CSS custom
               properties on the <nav>. The indirection looked tidier but did
               not survive contact with the browser: the properties resolved
               correctly on the element (verified with getComputedStyle) while
               the painted background stayed on the first section's colour, and
               overriding the property on the element itself changed nothing.
               Setting the two values the section actually owns, on the two
               elements that actually draw them, has no such ambiguity. */
            style={{
              gridColumn: column,
              background: section.fill,
              boxShadow: section.edge === 'transparent'
                ? 'none'
                : `inset 0 0 0 1.5px ${section.edge}`,
            }}
          />
        ) : null}

        {SLOTS.slice(0, 2).map(s => (
          <NavButton
            key={s.key}
            label={s.label}
            ariaLabel={s.srLabel}
            isActive={activeKey === s.key}
            ink={section.ink}
            onClick={() => navigate(s.screen)}
          >
            <SlotIcon slot={s.key} active={activeKey === s.key} />
          </NavButton>
        ))}

        <button
          onClick={() => { haptics.medium(); onPost(); }}
          aria-label="Create post"
          className="bottom-nav-post"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>

        {SLOTS.slice(2).map(s => (
          <NavButton
            key={s.key}
            label={s.label}
            ariaLabel={s.srLabel}
            isActive={activeKey === s.key}
            ink={section.ink}
            onClick={() => navigate(s.screen)}
          >
            <SlotIcon slot={s.key} active={activeKey === s.key} />
          </NavButton>
        ))}
      </div>
    </nav>
  );
}

function SlotIcon({ slot, active }: { slot: SectionKey; active: boolean }) {
  const sw = active ? 2.1 : 1.7;
  if (slot === 'feed') return <Home size={21} strokeWidth={sw} />;
  if (slot === 'events') return <CalendarDays size={21} strokeWidth={sw} />;
  /* PackageSearch — a box with a magnifier overlay. Literally "find stuff in
     this box". Visually distinct from both the plain Search magnifier (which
     confused users) and the plain Package icon used by Inventory next to it. */
  if (slot === 'lost_found') return <PackageSearch size={21} strokeWidth={sw} />;
  return <Package size={21} strokeWidth={sw} />;
}

function NavButton({
  label, ariaLabel, isActive, ink, onClick, children,
}: {
  label: string;
  /** Ink for the active state — the section colour's paired foreground. */
  ink: string;
  /** Screen-reader name, when the visible label is abbreviated
   *  (e.g. "Lost" pill / "Lost & Found" for SR users). Defaults to label. */
  ariaLabel?: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-current={isActive ? 'page' : undefined}
      className="bottom-nav-btn"
      data-active={isActive || undefined}
      style={isActive ? { color: ink } : undefined}
    >
      {children}
      {/* Always rendered AND always visible — the label no longer expands on
          selection. Four permanent labels is the whole point of the redesign:
          an icon-only tab bar makes people guess, and the references all show
          the word under the glyph. aria-hidden because the button already
          carries the accessible name. */}
      <span className="bottom-nav-btn-label" aria-hidden="true">{label}</span>
    </button>
  );
}
