'use client';

/* ── The engine, wired to React ────────────────────────────────────────────
 *
 * Everything under lib/feed is pure and knows nothing about the DOM. This is
 * the one file that does: it owns the memory object, watches what actually
 * reaches the screen, and hands the component an ordered page.
 *
 * Two things here are load-bearing and easy to get wrong.
 *
 * The clock is frozen per pass. Ranking reads `now` in a dozen places, and if
 * each read called Date.now() the page would re-rank between two lines of the
 * same computation — items would shuffle on every render with no input having
 * changed. `now` is captured once, alongside the seed, and the pair is what
 * makes a render reproducible.
 *
 * Memory is a ref, not state. Impressions fire on scroll, several a second; if
 * each one set state the feed would re-rank continuously and the page would
 * crawl out from under the reader's thumb. Writes accumulate in the ref and are
 * flushed to storage on a timer, and the ranking only re-reads them when the
 * page is deliberately recomputed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketplaceItem, CommunityEvent, LostItem } from '../mockData';
import { normalizeCategory } from '../categories';
import {
  loadMemory, saveMemory, startSession, decayMemory, recordImpression,
  recordInteraction, recordSearch, recordDwell, recordNotInterested,
  affinityProfile, emptyMemory,
  type FeedMemory, type Interaction,
} from './memory';
import { estimateIntent, dominantIntent, type IntentWeights } from './intent';
import { currentPhase } from './semester';
import { rankFeed, eligible, sessionSeed, rng } from './rank';
import { orchestrate, summariseSellers, type PlacedModule, type ModulePools } from './modules';

const categoryIdOf = (it: MarketplaceItem) => it.categoryId ?? normalizeCategory(it.category);

export interface EngineInput {
  items: MarketplaceItem[];
  requests: MarketplaceItem[];
  opportunities: MarketplaceItem[];
  events: CommunityEvent[];
  lostFound: LostItem[];
  blocked: Set<string>;
  viewer: { id?: string | null; college?: string | null; location?: string | null } | null;
  /** Gate everything until the client has mounted, so the server and the first
   *  client render agree. Personalisation cannot be server-rendered — it reads
   *  localStorage — and a mismatch here is a hydration error on the homepage. */
  ready: boolean;
}

export interface Engine {
  modules: PlacedModule[];
  ranked: MarketplaceItem[];
  /** The eligible catalogue — blocks, closed posts, the viewer's own listings
   *  and anything they said "not interested" to already removed. Anything the
   *  screen builds itself (the category rails) must draw from THIS, or a
   *  rejected item quietly survives in the row the engine does not own. */
  items: MarketplaceItem[];
  intent: IntentWeights;
  dominant: string;
  phaseLabel: string;
  /** Attach to each rendered card's wrapper to count it as seen. */
  observe: (el: HTMLElement | null, itemId: string, sellerId: string) => void;
  note: (kind: Interaction, meta: {
    itemId?: string; sellerId?: string; categoryId?: string | null; price?: number | null;
  }) => void;
  noteSearch: (q: string) => void;
  noteSignal: (name: string) => void;
  /** Explicit rejection — the only unambiguous negative signal the feed gets. */
  noteNotInterested: (meta: {
    itemId?: string; sellerId?: string; categoryId?: string | null; scope: 'item' | 'seller';
  }) => void;
  /** Recompute the page — new session seed, fresh rotation. */
  refresh: () => void;
}

export function useFeedEngine(input: EngineInput): Engine {
  const memRef = useRef<FeedMemory>(emptyMemory(0));
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const dirty = useRef(false);

  /* ── boot ── */
  useEffect(() => {
    const now = Date.now();
    const m = decayMemory(loadMemory(now), now);
    startSession(m, now);
    memRef.current = m;
    setLoaded(true);
  }, []);

  /* Flush on a timer rather than per write. Impressions are the highest-volume
     event the app has and JSON.stringify of the whole memory on each one would
     be felt on a mid-range phone. */
  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      saveMemory(memRef.current);
    }, 4000);
    const onHide = () => { if (dirty.current) { dirty.current = false; saveMemory(memRef.current); } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [loaded]);

  /* ── impressions ── */
  const seenThisPass = useRef(new Set<string>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const targets = useRef(new Map<Element, { itemId: string; sellerId: string }>());
  /* When each currently-visible card came into view, so leaving can be priced
     as dwell time. Cleared on unmount by the observer teardown. */
  const visibleSince = useRef(new Map<Element, number>());

  useEffect(() => {
    if (!loaded || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(entries => {
      const now = Date.now();
      for (const e of entries) {
        const meta = targets.current.get(e.target);
        if (!meta) continue;

        if (e.isIntersecting) {
          /* Start the clock. A card that leaves before it stops is a scroll
             past; one that stays was read. */
          if (!visibleSince.current.has(e.target)) visibleSince.current.set(e.target, now);
          /* Impression: once per item per pass. A rail scrolled back and forth
             would otherwise inflate its own fatigue until it vanished. */
          if (!seenThisPass.current.has(meta.itemId)) {
            seenThisPass.current.add(meta.itemId);
            recordImpression(memRef.current, meta.itemId, meta.sellerId, now);
            dirty.current = true;
          }
        } else {
          const since = visibleSince.current.get(e.target);
          if (since != null) {
            visibleSince.current.delete(e.target);
            recordDwell(memRef.current, meta.itemId, meta.sellerId, now - since, now);
            dirty.current = true;
          }
        }
      }
    }, { threshold: 0.5 });
    observerRef.current = obs;
    for (const el of targets.current.keys()) obs.observe(el);
    return () => { obs.disconnect(); observerRef.current = null; };
  }, [loaded]);

  const observe = useCallback((el: HTMLElement | null, itemId: string, sellerId: string) => {
    if (!el) return;
    targets.current.set(el, { itemId, sellerId });
    observerRef.current?.observe(el);
  }, []);

  const noteNotInterested = useCallback<Engine['noteNotInterested']>(meta => {
    recordNotInterested(memRef.current, meta, Date.now());
    dirty.current = true;
    seenThisPass.current.clear();
    /* Recompute immediately. Someone who has just said "not this" and watches
       it sit there has been told their answer did not count. */
    setTick(t => t + 1);
  }, []);

  /* ── writes ── */
  const note = useCallback<Engine['note']>((kind, meta) => {
    recordInteraction(memRef.current, kind, meta, Date.now());
    dirty.current = true;
  }, []);

  const noteSearch = useCallback((q: string) => {
    recordSearch(memRef.current, q, Date.now());
    dirty.current = true;
    /* A search is the strongest intent signal there is — recompute at once
       rather than waiting for the next natural refresh. */
    setTick(t => t + 1);
  }, []);

  const noteSignal = useCallback((name: string) => {
    const m = memRef.current;
    m.session[name] = (m.session[name] ?? 0) + 1;
    dirty.current = true;
  }, []);

  const refresh = useCallback(() => {
    seenThisPass.current.clear();
    setTick(t => t + 1);
  }, []);

  /* ── the page ── */
  const page = useMemo(() => {
    if (!input.ready || !loaded) {
      return { modules: [] as PlacedModule[], ranked: [] as MarketplaceItem[],
               items: [] as MarketplaceItem[],
               intent: estimateIntent(emptyMemory(0), 0), phaseLabel: '' };
    }
    /* Captured once — see the note at the top of this file. */
    const now = Date.now();
    const memory = memRef.current;
    const seed = sessionSeed(memory.sessionAt, tick);
    const rand = rng(seed);

    const opts = { blocked: input.blocked, selfId: input.viewer?.id ?? null, memory, now };
    const items = eligible(input.items, opts);
    const requests = eligible(input.requests, opts);
    const opportunities = eligible(input.opportunities, opts);

    const phase = currentPhase(new Date(now));
    const intent = estimateIntent(memory, now);
    const profile = affinityProfile(memory);

    /* Deliberately NOT passed through rotate().
       Rotation exists to keep a paginated feed steady while it is recomputed
       mid-scroll, and this homepage is rails, not an infinite list — there is
       no page 2 to stabilise against. Wiring it in anyway would mean mutating a
       ref during render, which React is free to run twice: the second pass
       would rotate the already-rotated list and the page would drift for no
       reason. The function and its tests stay in rank.ts for the infinite feed
       that will want them. */
    const { items: ranked } = rankFeed(items, {
      memory, viewer: input.viewer, now, categoryIdOf, phase, seed,
      pageSize: 24, page: tick,
    });

    const pools: ModulePools = {
      items,
      requests,
      opportunities,
      events: input.events.filter(e => !input.blocked.has(e.organizer?.id ?? '')),
      lostFound: input.lostFound.filter(l => !input.blocked.has(l.user?.id ?? '')),
      ranked,
      sellers: summariseSellers(items, opportunities, now),
    };

    const modules = orchestrate(pools, {
      intent, phase, warm: profile.warm,
      signedIn: !!input.viewer?.id,
      viewerCollege: input.viewer?.college ?? null,
      rand, now,
    });

    return { modules, ranked, items, intent, phaseLabel: phase.label };
  }, [
    input.ready, loaded, tick,
    input.items, input.requests, input.opportunities, input.events, input.lostFound,
    input.blocked, input.viewer,
  ]);

  return {
    modules: page.modules,
    ranked: page.ranked,
    items: page.items,
    intent: page.intent,
    dominant: dominantIntent(page.intent),
    phaseLabel: page.phaseLabel,
    observe, note, noteSearch, noteSignal, noteNotInterested, refresh,
  };
}
