'use client';

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

/* ── One green, not four ───────────────────────────────────────────────────
 *
 * The bar used to recolour itself per section — green on Home, purple on
 * Events, orange on Lost & Found, amber on Inventory — and now carries a single
 * mint pill everywhere. That changes what the colour is DOING: four colours
 * identified the section, one colour identifies the selection. The icon is what
 * tells you where you are.
 *
 * The palette and the contrast arithmetic behind it live with the rest of the
 * bar's styling, on `.bottom-nav` in globals.css. They are deliberately NOT
 * duplicated here as constants — nothing in this component paints, so a copy
 * would only be a second place to keep in step.
 */

/* The four screens that own a slot in the bar. `Screen` is deliberately wider
   than this — 'account', 'impact' and 'activity' are all reachable — so this
   stays a separate, narrower type instead of being derived from `Screen`. */
type SectionKey = 'feed' | 'events' | 'lost_found' | 'inventory';

/* Which slot each screen lights. Partial over the full `Screen` union on
 * purpose: a lookup returns `SectionKey | undefined`, so TypeScript forces the
 * miss to be handled rather than letting it reach the DOM as undefined. The
 * code this replaced asserted `as keyof typeof SECTION` instead, which told the
 * compiler the other four Screen values could not occur — that lie is precisely
 * why opening Account once took the whole app down with "Cannot read properties
 * of undefined". Adding a member to `Screen` now cannot smuggle an unhandled key
 * into the lookups below.
 *
 * `market` is the storefront view of the feed, so it lights Home. */
const SLOT_FOR: Partial<Record<Screen, SectionKey>> = {
  feed:       'feed',
  market:     'feed',
  events:     'events',
  lost_found: 'lost_found',
  inventory:  'inventory',
};

/* Slot order drives both the layout and where the pill slides to. The post
   button is the middle slot so the row stays symmetrical — five equal grid
   columns, not space-around, which is what left the old bar looking off-centre.

   `icon` names a file in /icons/nav. Those are alpha masks, not pictures: the
   artwork arrived as five black glyphs baked into one 2173×725 sprite sheet,
   wrapped in an SVG that cropped a window onto it — 340KB per "icon", and flat
   raster, so the black was not a colour that could be changed. Cut out and kept
   as masks, each glyph is ~4KB, takes its colour from `currentColor`, and
   therefore animates between resting and active ink for free. The white
   negatives in the same folder were not needed at all — a mask has no colour to
   invert.

   `col` is the grid column, and doubles as the pill's slide target. */
const SLOTS: {
  key: SectionKey; screen: Screen; label: string; icon: string; col: number;
}[] = [
  { key: 'feed',       screen: 'feed',       label: 'Home',         icon: 'home',      col: 1 },
  { key: 'events',     screen: 'events',     label: 'Events',       icon: 'events',    col: 2 },
  { key: 'lost_found', screen: 'lost_found', label: 'Lost & Found', icon: 'lostfound', col: 4 },
  { key: 'inventory',  screen: 'inventory',  label: 'Inventory',    icon: 'inventory', col: 5 },
];

export default function BottomNav({ active, onChange, onPost }: BottomNavProps) {
  /* Wraps the parent's onChange so we get a single source of nav events. */
  const navigate = (next: Screen) => {
    if (next === active) return;
    haptics.selection();   /* iOS-style light tick on tab change */
    track(EVT.nav_switched, { from: active, to: next });
    onChange(next);
  };

  /* null on Account / Impact / Activity: no slot is lit and the pill fades out
     where it stands rather than sliding off to a column that means nothing. */
  const activeKey = SLOT_FOR[active] ?? null;
  const activeSlot = activeKey ? SLOTS.find(s => s.key === activeKey) ?? null : null;

  return (
    <nav aria-label="Primary" className="mobile-only-nav bottom-nav">
      <div className="bottom-nav-inner">
        {/* The sliding pill.
            It lives permanently in grid column 1 and moves by translating whole
            multiples of its own width — which, in a five-equal-column grid, is
            exactly one column. That is the difference between sliding and
            teleporting: the previous version re-assigned `gridColumn` on every
            tab change, and grid-column is not an animatable property, so the
            indicator described as "travelling along the bar" was in fact
            jumping. A transform animates, and composites on the GPU.
            Hidden from AT; aria-current on the button is the real signal. */}
        <span
          className="bottom-nav-slider"
          aria-hidden="true"
          data-lit={activeSlot ? true : undefined}
          style={{ ['--nav-i' as string]: activeSlot ? activeSlot.col - 1 : 0 }}
        />

        {SLOTS.slice(0, 2).map(s => (
          <NavButton key={s.key} slot={s} isActive={activeKey === s.key}
                     onClick={() => navigate(s.screen)} />
        ))}

        <button
          onClick={() => { haptics.medium(); onPost(); }}
          aria-label="Create post"
          className="bottom-nav-post"
        >
          {/* The same plus the icon set draws inside a ring — the ring cropped
              off, because this button already is one. */}
          <i className="nav-ico nav-ico--plus" aria-hidden="true" />
        </button>

        {SLOTS.slice(2).map(s => (
          <NavButton key={s.key} slot={s} isActive={activeKey === s.key}
                     onClick={() => navigate(s.screen)} />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  slot, isActive, onClick,
}: {
  slot: { label: string; icon: string; col: number };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      /* The visible label is gone, so this is now the ONLY name the button has.
         It is not decoration: without it a screen reader announces five unnamed
         buttons. */
      aria-label={slot.label}
      aria-current={isActive ? 'page' : undefined}
      className="bottom-nav-btn"
      data-active={isActive || undefined}
      style={{ gridColumn: slot.col }}
    >
      <i
        className="nav-ico"
        aria-hidden="true"
        style={{ ['--ico' as string]: `url(/icons/nav/${slot.icon}.png)` }}
      />
    </button>
  );
}
