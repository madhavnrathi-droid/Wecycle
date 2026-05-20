'use client';

/* Mutable in-memory store for the *current user's* posts while in demo mode.
 *
 * Demo mode has no backend, so the seeded MARKETPLACE_ITEMS arrays are static
 * and can't reflect edits or deletes. This store gives the demo experience a
 * working edit/delete loop: it starts from a small set of "my" mock posts and
 * supports update + delete, broadcasting `notifyPostsChanged()` so the
 * Inventory screen refreshes immediately — exactly like the live path.
 *
 * Live mode never touches this; it reads/writes Supabase directly. */

import { MARKETPLACE_ITEMS, type MarketplaceItem } from './mockData';
import { notifyPostsChanged } from './liveData';

/* Seed: a few items + one request the demo user "owns", cloned from the
   catalogue so edits don't mutate the shared mock arrays. */
const SEED_UPLOAD_IDS = ['m1', 'm5', 'm10'];

function clone(it: MarketplaceItem): MarketplaceItem {
  return { ...it, photoUrls: it.photoUrls ? [...it.photoUrls] : undefined };
}

let uploads: MarketplaceItem[] = MARKETPLACE_ITEMS
  .filter(i => SEED_UPLOAD_IDS.includes(i.id))
  .map(clone);

let requests: MarketplaceItem[] = [
  {
    id: 'demo-req-1',
    title: 'Looking for a graphing calculator',
    description: 'Need one for the stats final next week — happy to return it after.',
    category: 'Electronics',
    listingType: 'free',
    condition: 'good',
    photoColor: '#1C1C1A',
    photoIcon: '🙋',
    location: '',
    user: MARKETPLACE_ITEMS[0]?.user ?? ({} as MarketplaceItem['user']),
    saved: false,
    responses: 2,
    postedDaysAgo: 1,
    tags: ['urgent'],
    isRequest: true,
    urgent: true,
  },
];

export function demoOwnedIds(): string[] {
  return [...uploads.map(i => i.id), ...requests.map(i => i.id)];
}

export function getDemoUploads(): MarketplaceItem[] {
  return uploads.slice();
}
export function getDemoRequests(): MarketplaceItem[] {
  return requests.slice();
}
export function getDemoAll(): MarketplaceItem[] {
  return [...uploads, ...requests];
}

/** Apply an edit to a demo upload (or request). Patch uses the same field
 *  names as MarketplaceItem. Returns true if a row was found + updated. */
export function updateDemoPost(id: string, patch: Partial<MarketplaceItem>): boolean {
  let found = false;
  uploads = uploads.map(i => (i.id === id ? (found = true, { ...i, ...patch }) : i));
  requests = requests.map(i => (i.id === id ? (found = true, { ...i, ...patch }) : i));
  if (found) notifyPostsChanged();
  return found;
}

/** Bump a demo post to the top (repost). */
export function repostDemoPost(id: string, patch?: Partial<MarketplaceItem>): boolean {
  const apply = (arr: MarketplaceItem[]) => {
    const idx = arr.findIndex(i => i.id === id);
    if (idx === -1) return arr;
    const updated = { ...arr[idx], ...patch, postedDaysAgo: 0 };
    const next = arr.slice();
    next.splice(idx, 1);
    return [updated, ...next];
  };
  const beforeU = uploads, beforeR = requests;
  uploads = apply(uploads);
  requests = apply(requests);
  const changed = uploads !== beforeU || requests !== beforeR;
  if (changed) notifyPostsChanged();
  return changed;
}

/** Remove a demo post entirely. */
export function deleteDemoPost(id: string): boolean {
  const before = uploads.length + requests.length;
  uploads = uploads.filter(i => i.id !== id);
  requests = requests.filter(i => i.id !== id);
  const removed = uploads.length + requests.length < before;
  if (removed) notifyPostsChanged();
  return removed;
}

/** Add a freshly-created demo post to the top of uploads/requests. */
export function addDemoPost(item: MarketplaceItem) {
  if (item.isRequest) requests = [item, ...requests];
  else uploads = [item, ...uploads];
  notifyPostsChanged();
}
