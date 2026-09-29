'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getMessagingState, subscribeMessaging, type MessagingState, type ChatContext } from './store';
import { fetchPostById, type DeepLinkPost } from '../liveData';
import { isDemoMode } from '../demoMode';
import { MARKETPLACE_ITEMS, OPPORTUNITIES, EVENTS, LOST_FOUND_ITEMS, closedLabelFor } from '../mockData';
import { getItemPhoto, resolveEventPhoto, resolveLostFoundPhoto } from '../photos';
import type { StarterContext } from './format';

/** The whole messaging state. Components derive what they draw from it with
 *  the selectors in store.ts; the snapshot only changes when something did. */
export function useMessaging(): MessagingState {
  return useSyncExternalStore(subscribeMessaging, getMessagingState, getMessagingState);
}

/* ── The post a conversation is about ────────────────────────────────────── */

export interface PostPreview {
  title: string;
  image: string | null;
  /** "₹200", "Free", "Lost", "Sat, 4 Oct" — the one fact that identifies it. */
  subtitle: string;
  /** "Sold", "Taken", "Claimed" … when it is no longer available. */
  closedLabel: string | null;
  /** For the starter prompts, which are worded per post type. */
  starter: StarterContext;
  post: DeepLinkPost;
}

const cache = new Map<string, PostPreview | null>();
const inflight = new Map<string, Promise<PostPreview | null>>();

function previewOf(post: DeepLinkPost): PostPreview {
  switch (post.kind) {
    case 'item':
    case 'request': {
      const it = post.data;
      const subtitle = post.kind === 'request' ? 'Request'
        : it.kind === 'opportunity' ? (it.comp === 'paid' && it.price ? `₹${it.price.toLocaleString('en-IN')}` : it.comp === 'volunteer' ? 'Volunteer' : 'Service')
        : it.listingType === 'sell' && it.price ? `₹${it.price.toLocaleString('en-IN')}`
        : it.listingType === 'free' ? 'Free'
        : it.listingType === 'borrow' ? (it.price ? `₹${it.price.toLocaleString('en-IN')} to borrow` : 'To borrow')
        : it.listingType === 'swap' ? 'Swap'
        : '';
      return {
        title: it.title,
        image: it.photoUrls?.[0] ?? getItemPhoto(it.id) ?? null,
        subtitle,
        closedLabel: it.isClosed ? closedLabelFor(it) : null,
        starter: post.kind === 'request'
          ? { type: 'request' }
          : { type: 'listing', listingType: it.listingType, kind: it.kind },
        post,
      };
    }
    case 'event':
      return {
        title: post.data.title,
        image: resolveEventPhoto(post.data),
        subtitle: [post.data.date, post.data.time].filter(Boolean).join(' · '),
        closedLabel: null,
        starter: { type: 'event' },
        post,
      };
    case 'lostfound':
      return {
        title: post.data.title,
        image: resolveLostFoundPhoto(post.data.id, post.data.photoUrls),
        subtitle: post.data.status === 'lost' ? 'Lost' : post.data.status === 'found' ? 'Found' : 'Claimed',
        closedLabel: post.data.status === 'claimed' ? 'Claimed' : null,
        starter: { type: 'lost_found', lostFoundStatus: post.data.status },
        post,
      };
  }
}

function demoPost(id: string): DeepLinkPost | null {
  const item = [...MARKETPLACE_ITEMS, ...OPPORTUNITIES].find(i => i.id === id);
  if (item) return { kind: item.isRequest ? 'request' : 'item', data: item };
  const ev = EVENTS.find(e => e.id === id);
  if (ev) return { kind: 'event', data: ev };
  const lf = LOST_FOUND_ITEMS.find(l => l.id === id);
  if (lf) return { kind: 'lostfound', data: lf };
  return null;
}

export function loadPostPreview(ctx: ChatContext): Promise<PostPreview | null> {
  if (cache.has(ctx.id)) return Promise.resolve(cache.get(ctx.id) ?? null);
  const running = inflight.get(ctx.id);
  if (running) return running;
  const p = (async () => {
    try {
      const post = isDemoMode() ? demoPost(ctx.id) : await fetchPostById(ctx.id);
      const preview = post ? previewOf(post) : null;
      cache.set(ctx.id, preview);
      return preview;
    } catch {
      return null;
    } finally {
      inflight.delete(ctx.id);
    }
  })();
  inflight.set(ctx.id, p);
  return p;
}

/** Seed the cache with a post already on screen, so opening a chat from it
 *  draws the card at once instead of fetching what the screen just showed. */
export function primePostPreview(post: DeepLinkPost): void {
  cache.set(post.data.id, previewOf(post));
}

/** undefined while loading, null when the post is gone. */
export function usePostPreview(ctx: ChatContext | null): PostPreview | null | undefined {
  const [value, setValue] = useState<PostPreview | null | undefined>(() =>
    (ctx ? (cache.has(ctx.id) ? cache.get(ctx.id) ?? null : undefined) : null));
  useEffect(() => {
    if (!ctx) { setValue(null); return; }
    if (cache.has(ctx.id)) { setValue(cache.get(ctx.id) ?? null); return; }
    let live = true;
    setValue(undefined);
    loadPostPreview(ctx).then(v => { if (live) setValue(v); });
    return () => { live = false; };
  }, [ctx?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}
