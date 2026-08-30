/* ── The academic year ─────────────────────────────────────────────────────
 *
 * A campus marketplace has a demand curve a general one does not: it is
 * seasonal, the season is the term, and everybody moves through it at once.
 * Furniture, kettles and textbooks spike in the fortnight either side of a term
 * boundary — one cohort arriving and needing everything, another leaving and
 * shedding everything — and that is a bigger swing than most personalisation
 * will ever find in an individual's history.
 *
 * The dates below are hardcoded to the Indian academic calendar that Manipal
 * and Srishti run on: an odd semester from roughly late July, an even one from
 * roughly early January. They are approximate on purpose. The brief's
 * suggestion is that these patterns be LEARNED eventually, and they should be —
 * but learning them needs a year of data the app does not have, and a hardcoded
 * calendar that is roughly right beats an empty model that is precisely nothing.
 *
 * The boost is small by design (at most ~15%). It nudges an already-relevant
 * listing up; it must never be able to put a mattress above the thing someone
 * literally just searched for.
 */

export type Phase = 'term_start' | 'mid_term' | 'term_end' | 'break';

export interface PhaseInfo {
  phase: Phase;
  /** 0..1 — how deep into the phase, for scaling the boost. */
  intensity: number;
  /** Human label, for the "why am I seeing this" copy. */
  label: string;
}

/* month is 1-12. Windows are inclusive of the day range. */
interface Window { from: [number, number]; to: [number, number]; phase: Phase; label: string }

const WINDOWS: Window[] = [
  /* Odd semester — the big one: a whole intake arriving with empty rooms. */
  { from: [7, 15], to: [8, 20], phase: 'term_start', label: 'Move-in season' },
  { from: [8, 21], to: [10, 31], phase: 'mid_term', label: 'Mid-semester' },
  { from: [11, 1], to: [12, 20], phase: 'term_end', label: 'End of semester' },
  /* Winter break. */
  { from: [12, 21], to: [1, 5], phase: 'break', label: 'Winter break' },
  /* Even semester. */
  { from: [1, 6], to: [1, 31], phase: 'term_start', label: 'New semester' },
  { from: [2, 1], to: [3, 31], phase: 'mid_term', label: 'Mid-semester' },
  { from: [4, 1], to: [5, 20], phase: 'term_end', label: 'End of semester' },
  { from: [5, 21], to: [7, 14], phase: 'break', label: 'Summer break' },
];

export function currentPhase(now: Date = new Date()): PhaseInfo {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  for (const w of WINDOWS) {
    if (inWindow(m, d, w)) {
      return { phase: w.phase, intensity: intensityIn(m, d, w), label: w.label };
    }
  }
  return { phase: 'mid_term', intensity: 0.5, label: 'Term time' };
}

function inWindow(m: number, d: number, w: Window): boolean {
  const val = m * 100 + d;
  const from = w.from[0] * 100 + w.from[1];
  const to = w.to[0] * 100 + w.to[1];
  /* Windows that wrap the new year (Dec 21 → Jan 5) need both halves. */
  return from <= to ? val >= from && val <= to : val >= from || val <= to;
}

/** Peaks in the middle of the window and tapers at both edges, so a boost fades
 *  in and out rather than switching on overnight. */
function intensityIn(m: number, d: number, w: Window): number {
  const val = m * 100 + d;
  const from = w.from[0] * 100 + w.from[1];
  let to = w.to[0] * 100 + w.to[1];
  let v = val;
  if (from > to) { to += 1200; if (v < from) v += 1200; }
  const span = Math.max(1, to - from);
  const t = (v - from) / span;
  return 1 - Math.abs(t - 0.5) * 2 * 0.6;      /* 0.4 at the edges, 1.0 mid-window */
}

/** Category ids favoured by each phase. Ids, not labels — see lib/categories.ts. */
const PHASE_CATEGORIES: Record<Phase, string[]> = {
  term_start: ['furniture', 'kitchen', 'books', 'electronics', 'art', 'mobility'],
  mid_term:   ['electronics', 'hobbies', 'art', 'sports', 'services', 'tickets'],
  term_end:   ['furniture', 'kitchen', 'books', 'mobility', 'adopt'],
  break:      ['hobbies', 'sports', 'tickets', 'services'],
};

/**
 * Multiplier for a category in the current phase. 1.0 when it is not in season.
 *
 * Capped at 1.15 deliberately. A seasonal prior is a statement about the
 * average student, and the person in front of you is not the average student —
 * it should tilt a close call, never overrule what someone is visibly doing.
 */
export function semesterBoost(categoryId: string | null, info: PhaseInfo): number {
  if (!categoryId) return 1;
  const favoured = PHASE_CATEGORIES[info.phase] ?? [];
  const idx = favoured.indexOf(categoryId);
  if (idx < 0) return 1;
  /* Earlier in the list = more strongly in season. */
  const rank = 1 - idx / Math.max(1, favoured.length);
  return 1 + 0.15 * info.intensity * rank;
}
