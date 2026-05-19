/**
 * Per-post metrics — mock data for the Activity dashboard.
 *
 * The real backend already tracks `listings.view_count` and `save_count`.
 * Once wired, query `listings` with the auth user's id and aggregate.
 */

import { MARKETPLACE_ITEMS, EVENTS } from './mockData';

export interface PostMetrics {
  itemId: string;
  views: number;
  saves: number;
  shares: number;
  inquiries: number; // messages received
}

/* Deterministic mock metrics — keyed off item id so refreshes are stable */
function pseudoRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function getPostMetrics(itemId: string): PostMetrics {
  const h = pseudoRandom(itemId);
  return {
    itemId,
    views: (h % 487) + 23,        // 23 – 510
    saves: (h % 47) + 2,          // 2 – 48
    shares: (h % 11),             // 0 – 10
    inquiries: (h % 18) + 1,      // 1 – 18
  };
}

export interface MetricsSummary {
  totalViews: number;
  totalSaves: number;
  totalShares: number;
  totalInquiries: number;
  topPost?: { itemId: string; title: string; views: number };
}

/** Aggregate metrics across an array of user-owned item ids. */
export function summarizeMetrics(itemIds: string[]): MetricsSummary {
  let totalViews = 0, totalSaves = 0, totalShares = 0, totalInquiries = 0;
  let topItemId: string | null = null;
  let topViews = -1;

  for (const id of itemIds) {
    const m = getPostMetrics(id);
    totalViews += m.views;
    totalSaves += m.saves;
    totalShares += m.shares;
    totalInquiries += m.inquiries;
    if (m.views > topViews) {
      topViews = m.views;
      topItemId = id;
    }
  }

  const topItem = topItemId ? MARKETPLACE_ITEMS.find(i => i.id === topItemId) : undefined;

  return {
    totalViews,
    totalSaves,
    totalShares,
    totalInquiries,
    topPost: topItem ? { itemId: topItem.id, title: topItem.title, views: topViews } : undefined,
  };
}

/* ── Event metrics ────────────────────────────────────────── */

export interface EventMetrics {
  eventId: string;
  views: number;
  rsvps: number;       // confirmed attendees (real number from EVENTS.attendees)
  shares: number;
  questions: number;   // mock inquiries
}

export function getEventMetrics(eventId: string): EventMetrics {
  const h = pseudoRandom(eventId);
  const ev = EVENTS.find(e => e.id === eventId);
  return {
    eventId,
    views:     (h % 813) + 42,       // 42 – 854
    rsvps:     ev?.attendees ?? 0,
    shares:    (h % 24) + 1,         // 1 – 24
    questions: (h % 9),              // 0 – 9
  };
}

/** Aggregated stats over a user's posts AND events combined */
export interface CombinedSummary extends MetricsSummary {
  totalRsvps: number;
  itemCount: number;
  eventCount: number;
}

export function summarizeCombined(itemIds: string[], eventIds: string[]): CombinedSummary {
  const items = summarizeMetrics(itemIds);
  let evViews = 0, evShares = 0, evRsvps = 0, evQuestions = 0;
  for (const id of eventIds) {
    const m = getEventMetrics(id);
    evViews += m.views;
    evShares += m.shares;
    evRsvps += m.rsvps;
    evQuestions += m.questions;
  }
  return {
    totalViews:    items.totalViews + evViews,
    totalSaves:    items.totalSaves,
    totalShares:   items.totalShares + evShares,
    totalInquiries: items.totalInquiries + evQuestions,
    totalRsvps:    evRsvps,
    itemCount:     itemIds.length,
    eventCount:    eventIds.length,
    topPost:       items.topPost,
  };
}
