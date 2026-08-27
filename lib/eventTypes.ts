/* ── Event types ───────────────────────────────────────────────────────────
 *
 * The original six — swap, repair, cleanup, drive, challenge, workshop — were
 * all sustainability-flavoured, which is a fraction of what a campus actually
 * runs. An exhibition at an art-and-design institute, a film screening, a food
 * stall: none had anywhere to go, so an organiser either mislabelled their
 * event or abandoned the form.
 *
 * Sixteen options is past the point where a flat list stays scannable, so they
 * are grouped. Grouping is what keeps the choice cheap: you scan four headings,
 * not sixteen labels, and the one you want is inside the heading you picked.
 * Ordered by how often a campus actually holds them, not alphabetically —
 * alphabetical ordering optimises for a lookup nobody is doing, since people
 * arrive knowing the KIND of thing they are running, not its initial.
 *
 * The ids are values of the event_type enum in Postgres. Adding one here needs
 * a migration adding it there, or the insert fails its type check.
 */

export interface EventTypeOption {
  id: string;
  label: string;
  group: string;
}

/** The value an organiser gets when they never open the picker. 'community' is
 *  the honest catch-all — broad enough to be true of almost any gathering, and
 *  unlike 'other' it reads as a real category on the card rather than as a
 *  shrug. The column defaults to the same value server-side. */
export const DEFAULT_EVENT_TYPE = 'community';

export const EVENT_TYPES: EventTypeOption[] = [
  /* Gatherings — the general-purpose ones most posts land in. */
  { id: 'community',   label: '🎪 Community event', group: 'Gatherings' },
  { id: 'fest',        label: '🎉 Fest or celebration', group: 'Gatherings' },
  { id: 'food',        label: '🍜 Food', group: 'Gatherings' },
  { id: 'stalls',      label: '🏬 Stalls or pop-up', group: 'Gatherings' },

  /* Culture — heavily used by Srishti Manipal, which is an art, design and
     technology institute; exhibitions and screenings are its bread and butter. */
  { id: 'exhibition',  label: '🖼️ Exhibition', group: 'Culture' },
  { id: 'film',        label: '🎬 Film screening', group: 'Culture' },
  { id: 'performance', label: '🎭 Performance or music', group: 'Culture' },
  { id: 'talk',        label: '🎤 Talk or panel', group: 'Culture' },

  /* Learning and doing. */
  { id: 'workshop',    label: '📚 Workshop', group: 'Learning & doing' },
  { id: 'repair',      label: '🔧 Repair café', group: 'Learning & doing' },
  { id: 'swap',        label: '🔄 Swap drive', group: 'Learning & doing' },
  { id: 'sports',      label: '⚽ Sports or fitness', group: 'Learning & doing' },

  /* Campus causes. */
  { id: 'cleanup',     label: '🌿 Cleanup', group: 'Campus causes' },
  { id: 'drive',       label: '🚛 Collection drive', group: 'Campus causes' },
  { id: 'challenge',   label: '⚡ Challenge', group: 'Campus causes' },
  { id: 'other',       label: '📌 Something else', group: 'Campus causes' },
];

export const EVENT_TYPE_IDS: readonly string[] = EVENT_TYPES.map(t => t.id);

/** Options in render order, bucketed by group and preserving the order above. */
export function eventTypeGroups(): { group: string; options: EventTypeOption[] }[] {
  const out: { group: string; options: EventTypeOption[] }[] = [];
  for (const t of EVENT_TYPES) {
    const bucket = out.find(g => g.group === t.group);
    if (bucket) bucket.options.push(t);
    else out.push({ group: t.group, options: [t] });
  }
  return out;
}

/** Label for a stored id. Falls back to the id rather than to "Other", so an
 *  event posted under a type this build has not heard of still reads as
 *  something rather than being quietly relabelled. */
export function eventTypeLabel(id?: string | null): string {
  if (!id) return eventTypeLabel(DEFAULT_EVENT_TYPE);
  return EVENT_TYPES.find(t => t.id === id)?.label ?? id;
}

/** The label without its emoji, for places that render their own icon. */
export function eventTypeText(id?: string | null): string {
  return eventTypeLabel(id).replace(/^\S+\s/u, '');
}

/** Whatever a client sends, mapped onto a type the enum will accept.
 *  Same defensive shape as normalizeCategory: a stale bundle or an old draft
 *  must not be able to fail the insert. */
export function normalizeEventType(raw?: string | null): string {
  if (!raw) return DEFAULT_EVENT_TYPE;
  const v = raw.trim().toLowerCase();
  if (EVENT_TYPE_IDS.includes(v)) return v;
  const byLabel = EVENT_TYPES.find(t => eventTypeText(t.id).toLowerCase() === v);
  return byLabel?.id ?? DEFAULT_EVENT_TYPE;
}
