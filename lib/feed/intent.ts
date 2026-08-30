/* ── What is this person here for, right now? ──────────────────────────────
 *
 * The homepage cannot be personalised on long-term taste alone. Someone whose
 * profile says "furniture" may have opened the app to find a photographer, and
 * a page built from their history will be wrong for the whole visit. Intent is
 * the short-horizon read that corrects it — it is about THIS session, and it is
 * allowed to disagree with the profile.
 *
 * Five modes, from the brief. They are returned as weights rather than a single
 * winner because sessions are genuinely mixed: browsing while half-looking for
 * a desk is the common case, and a hard classification would flip between two
 * layouts on every tap. The orchestrator consumes the weights and moves modules
 * by degrees.
 */

import type { FeedMemory } from './memory';

export type IntentMode = 'shopping' | 'service' | 'business' | 'browsing' | 'selling';

export type IntentWeights = Record<IntentMode, number>;

/** Words that betray someone looking for a person to do a job rather than a
 *  thing to buy. Deliberately short and high-precision: a broad list would
 *  catch "camera" and flip a shopper into service mode, and being wrong here
 *  reorders their entire homepage. */
const SERVICE_TERMS = [
  'design', 'designer', 'photo', 'photographer', 'photography', 'video', 'edit',
  'editing', 'tutor', 'tuition', 'repair', 'fix', 'print', 'printing', 'makeup',
  'hair', 'illustrat', 'branding', 'poster', 'website', 'developer', 'freelance',
  'shoot', 'portfolio', 'commission', 'custom',
];

const BUSINESS_TERMS = ['studio', 'store', 'shop', 'business', 'brand', 'label', 'collective'];

export function estimateIntent(m: FeedMemory, now: number, opts?: { recentMs?: number }): IntentWeights {
  const recentMs = opts?.recentMs ?? 30 * 60_000;
  const w: IntentWeights = { shopping: 0, service: 0, business: 0, browsing: 0, selling: 0 };

  const s = m.session;
  const opens = s.click ?? 0;
  const saves = s.save ?? 0;
  const messages = s.message ?? 0;
  const searches = s.search ?? 0;

  /* Depth of engagement separates shopping from browsing. Opening listings,
     saving them and contacting sellers is a person trying to acquire something;
     scrolling without any of that is a person passing time, and the right page
     for the second is not a narrowed version of the first — it is a wider one. */
  w.shopping += opens * 1.0 + saves * 2.0 + messages * 3.0 + searches * 1.5;
  w.browsing += 2.0;                                   /* the default posture */

  const recent = m.searches.filter(q => now - q.at < recentMs);
  for (const { q } of recent) {
    if (SERVICE_TERMS.some(t => q.includes(t))) w.service += 3.0;
    if (BUSINESS_TERMS.some(t => q.includes(t))) w.business += 3.0;
    w.shopping += 0.5;
  }

  /* Explicit signals from what they actually looked at. */
  w.service += (s.service_view ?? 0) * 2.0;
  w.business += (s.storefront_view ?? 0) * 2.5;
  w.selling += (s.post_started ?? 0) * 4.0 + (s.inventory_view ?? 0) * 1.5;

  /* A long session with nothing opened is browsing, harder. */
  const minutes = (now - m.sessionAt) / 60_000;
  if (minutes > 2 && opens === 0) w.browsing += 2.0;

  return normalise(w);
}

function normalise(w: IntentWeights): IntentWeights {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total <= 0) return { shopping: 0, service: 0, business: 0, browsing: 1, selling: 0 };
  const out = {} as IntentWeights;
  for (const k of Object.keys(w) as IntentMode[]) out[k] = w[k] / total;
  return out;
}

/** The strongest mode, for logging and for the hero copy. Ties go to browsing,
 *  which is the safe page to be wrong with. */
export function dominantIntent(w: IntentWeights): IntentMode {
  let best: IntentMode = 'browsing';
  let bestV = -1;
  for (const k of ['shopping', 'service', 'business', 'selling', 'browsing'] as IntentMode[]) {
    if (w[k] > bestV) { bestV = w[k]; best = k; }
  }
  return best;
}
