/* ── The category taxonomy ─────────────────────────────────────────────────
 *
 * ONE list. It used to be five: the feed chips in mockData, and a separate
 * hardcoded array inside each of the four post forms. They had already
 * diverged — the chips offered nine categories while Share-an-item offered
 * twelve, so a member could file something under "Stationery" or "Other" and
 * land it in a category with no chip to filter by and no rail to appear in.
 * The post was live and effectively invisible.
 *
 * So this is not tidying. A marketplace where the thing a seller picks is not
 * a thing a buyer can browse is a marketplace with a hole in it, and the hole
 * is invisible from either end.
 *
 * ORDER IS MERCHANDISING, not alphabet. It runs most-traded first, because it
 * drives the chip row and the order of the category rails on the storefront —
 * the things people actually trade should be the ones they reach without
 * scrolling.
 *
 * Adding one here is not enough on its own: `categories` in Supabase is a real
 * table that listings.category_id points at, so a new entry needs a row there
 * too or the insert fails on the foreign key.
 */

export interface Category {
  id: string;
  /** Full name. Used where there is room: the post form, the detail header. */
  label: string;
  /** One word, for the chip strip. The full names collide there — the tiles are
   *  a fixed width and "Furniture & Room Essentials" is three times it, so
   *  neighbouring labels overlapped. A filter chip wants a word, not a name. */
  short: string;
  /** Emoji fallback. Still used by the <select> dropdowns in the post forms —
   *  an HTML <option> renders text only, so an image cannot go there. */
  icon: string;
  /** The voxel icon, cropped from the brand sheet. Used wherever real markup
   *  can render, which is the two chip strips. */
  iconSrc: string;
  /** Examples, shown as a hint when posting so the pick is obvious. */
  examples: string;
  /** Rail heading + subtitle on the storefront. Every category can carry a
   *  rail; whether it earns one is decided by how much is in it. */
  rail: { title: string; sub: string };
}

export const CATEGORIES: Category[] = [
  {
    id: 'electronics', label: 'Electronics', short: 'Electronics', icon: '💻', iconSrc: '/icons/categories/electronics.webp',
    examples: 'Phones, laptops, tablets, monitors, headphones, keyboards, calculators',
    rail: { title: 'Gently-used gadgets', sub: 'Half the price, all the specs' },
  },
  {
    id: 'furniture', label: 'Furniture & Room Essentials', short: 'Furniture', icon: '🪑', iconSrc: '/icons/categories/furniture.webp',
    examples: 'Chairs, tables, mattresses, lamps, shelves, storage',
    rail: { title: 'Dorm glow-up', sub: 'Desks, chairs, the whole set-up' },
  },
  {
    id: 'fashion', label: 'Fashion', short: 'Fashion', icon: '👕', iconSrc: '/icons/categories/fashion.webp',
    examples: 'Clothes, shoes, bags, watches, accessories',
    rail: { title: 'Second-hand, first-rate', sub: 'Clothes, shoes and watches worth a second run' },
  },
  {
    id: 'books', label: 'Books & Academic', short: 'Books', icon: '📚', iconSrc: '/icons/categories/books.webp',
    examples: 'Textbooks, reference books, notes, lab coats',
    rail: { title: 'Passed-down reads', sub: 'Someone survived this syllabus' },
  },
  {
    id: 'mobility', label: 'Vehicles & Mobility', short: 'Mobility', icon: '🚲', iconSrc: '/icons/categories/mobility.webp',
    examples: 'Bicycles, scooters, helmets, skateboards',
    rail: { title: 'Get around campus', sub: 'Cycles, scooters and the helmet to match' },
  },
  {
    id: 'kitchen', label: 'Hostel & Kitchen', short: 'Kitchen', icon: '🍳', iconSrc: '/icons/categories/kitchen.webp',
    examples: 'Cookware, induction stoves, kettles, utensils, mini appliances',
    rail: { title: 'Midnight-Maggi kit', sub: 'Kettles, pans, mugs and more' },
  },
  {
    id: 'sports', label: 'Sports & Fitness', short: 'Sports', icon: '⚽', iconSrc: '/icons/categories/sports.webp',
    examples: 'Gym equipment, sports gear, cycles, badminton rackets',
    rail: { title: 'Game on', sub: 'Gear after a second player' },
  },
  {
    id: 'services', label: 'Services & Skills', short: 'Services', icon: '🤝', iconSrc: '/icons/categories/services.webp',
    examples: 'Tutoring, photography, design, editing, music, freelance work',
    rail: { title: 'Hire a classmate', sub: 'Skills for rent, right here on campus' },
  },
  {
    id: 'tickets', label: 'Events & Tickets', short: 'Tickets', icon: '🎟️', iconSrc: '/icons/categories/tickets.webp',
    examples: 'Event tickets, passes, club and event merchandise',
    rail: { title: 'Tickets & passes', sub: 'Going spare before the night' },
  },
  {
    id: 'hobbies', label: 'Hobbies & Collectibles', short: 'Hobbies', icon: '🎸', iconSrc: '/icons/categories/hobbies.webp',
    examples: 'Instruments, cameras, gaming gear, collectibles',
    rail: { title: 'For the hobby', sub: 'Instruments, cameras and gaming gear' },
  },
  {
    id: 'art', label: 'Art & Stationery', short: 'Art', icon: '🎨', iconSrc: '/icons/categories/art.webp',
    examples: 'Paints, brushes, sketchbooks, pens, paper, craft supplies',
    rail: { title: 'Make something', sub: 'Paint, paper and everything in between' },
  },
  {
    id: 'adopt', label: 'Adopt', short: 'Adopt', icon: '🐾', iconSrc: '/icons/categories/adopt.webp',
    examples: 'Pets and plants looking for someone to care for them',
    /* Never priced in practice, and the copy stays away from anything that
       reads as selling an animal. */
    rail: { title: 'Looking for a home', sub: 'Pets and plants that need someone' },
  },
];

/** The chip row starts with All, which is a filter and not a category — it has
 *  no row in the database and nothing can be posted into it. */
export const ALL_CATEGORY = { id: 'all', label: 'All', icon: '⚡' } as const;

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map(c => c.id);

export function categoryLabel(id?: string | null): string {
  return CATEGORIES.find(c => c.id === id)?.label ?? 'Other';
}

/* Ids retired when the taxonomy was rewritten. Kept as a map rather than
   deleted so a stale client, a cached page or an in-flight draft cannot write
   an id the database no longer has. */
const LEGACY: Record<string, string> = {
  stationery: 'art',      /* merged: Art & Stationery is one category now */
  clothing:   'fashion',
  lab:        'books',    /* lab coats sit under Books & Academic */
  tools:      'hobbies',
  other:      'hobbies',
};

/** Whatever a client sends, mapped onto a live category id.
 *
 *  Accepts an id, a retired id, or a LABEL. The label case matters: the post
 *  forms used to submit the visible text and the server lowercased it into an
 *  id, which worked only while every label was a single word. "Furniture &
 *  Room Essentials" lowercases to something no category has, and the insert
 *  would fail its foreign key — so a client that has not reloaded since the
 *  taxonomy changed would simply be unable to post. */
export function normalizeCategory(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (CATEGORY_IDS.includes(v)) return v;
  if (LEGACY[v]) return LEGACY[v];
  const byLabel = CATEGORIES.find(c => c.label.toLowerCase() === v);
  if (byLabel) return byLabel.id;
  /* Old single-word labels that are now part of a merged category. */
  const byLegacyLabel = LEGACY[v.split(' ')[0]];
  return byLegacyLabel ?? null;
}
