'use client';

/* A brand's store — what opens instead of a storefront when the member is a
 * brand Wecycle features (lib/brands.ts). The Swiggy restaurant page and the
 * Amazon brand store are the references: the brand first, then its range in
 * the groups the maker uses, a sticky row to jump between them, and the one
 * action that matters on every product one tap away.
 *
 *   ┌ bar ─ back · (wordmark once scrolled) · share ───────┐
 *   │ canvas: brand colours, mascot, wordmark, tagline      │
 *   └───────────────────────────────────────────────────────┘
 *     Student brand · SMI          16 products · ₹70–₹150
 *     ◯ Run by aagam tambi                      [Message]
 *   ┌ sticky: Picks · Marbled · Swirl · Journals · … ───────┐
 *     Picks — four products as stickers on brand colours
 *     Marbled bangles  3                        ₹100 each
 *     ▢ ▢   photo, name, price, Order
 *     …
 *     About Foku — the brand's art, its words, its range
 *
 * Every product row is the owner's live listings, so nothing here can offer
 * what has gone. Sold things sit in a last section, stamped. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Share2, MoreHorizontal, MessageCircle, Check, Plus, Package } from 'lucide-react';
import type { MarketplaceItem, User } from '../../lib/mockData';
import { MARKETPLACE_ITEMS, closedLabelFor } from '../../lib/mockData';
import { sectionsFor, picksFor, priceLine, rangeLine, brandUrl, type Brand } from '../../lib/brands';
import { resolveItemMedia, getAvatar } from '../../lib/photos';
import { fetchListingsByUser, onPostsChanged } from '../../lib/liveData';
import { hasSupabaseEnv, supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/demoMode';
import { useAuth } from '../../lib/AuthContext';
import { messagingAvailable } from '../../lib/messaging/store';
import { useOrders, ordersAvailable, openOrderFor, probeOrdersAvailable } from '../../lib/orders/store';
import { isOrderable } from '../../lib/orders/model';
import { normalizeCollege } from '../../lib/colleges';
import { useGlide } from '../../lib/useGlide';
import { haptics } from '../../lib/haptics';
import { reducedMotion } from '../../lib/motion';
import { shareLink } from '../../lib/share';
import { toast } from '../../lib/toast';
import { track, EVT } from '../../lib/analytics';
import PostStamp from '../PostStamp';
import ReportSheet from '../ReportSheet';
import BrandCanvas from './BrandCanvas';
import BrandWordmark from './BrandWordmark';

interface BrandScreenProps {
  brand: Brand;
  /** The member who runs it — the listings are theirs. */
  owner: User;
  onBack: () => void;
  onOpenItem: (item: MarketplaceItem) => void;
  onMessage?: (user: User) => void;
  onOrder?: (item: MarketplaceItem) => void;
}

/* Sticky bar + section row: what a section has to clear when jumped to. */
const BAR_H = 56;
const NAV_H = 52;

const photoOf = (it: MarketplaceItem): string | null => {
  const first = resolveItemMedia(it)[0];
  if (!first) return null;
  return typeof first === 'string' ? first : (first.poster ?? null);
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/* Where the reader was in each store, so Back from a product lands on the
   same row rather than the top of the page. Kept for ten minutes. */
const scrollMemory = new Map<string, { top: number; at: number; back?: boolean }>();
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

export default function BrandScreen({ brand, owner, onBack, onOpenItem, onMessage, onOrder }: BrandScreenProps) {
  const { user: viewer } = useAuth();
  const isMe = !!viewer && viewer.id === owner.id;
  const demo = isDemoMode();
  const [items, setItems] = useState<MarketplaceItem[] | null>(
    demo && !hasSupabaseEnv ? MARKETPLACE_ITEMS.filter(i => i.user.id === owner.id) : null,
  );
  const [college, setCollege] = useState<string>(normalizeCollege(owner.college) || '');
  const [reportOpen, setReportOpen] = useState(false);
  const [dmAvailable] = useState(() => messagingAvailable());
  const canMessage = !!onMessage && dmAvailable && !isMe;

  useEffect(() => {
    track(EVT.brand_opened, { brand: brand.handle, self_view: isMe });
  }, [brand.handle]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The owner's listings, kept fresh while the page is open. Read live even
     in demo mode: a brand's range is public, and the demo account (App
     Review's) should see the real store the home spotlight points at, not an
     empty one. The seeded catalogue is only the fallback. */
  useEffect(() => {
    if (!hasSupabaseEnv) { if (!demo) setItems([]); return; }
    let live = true;
    const load = () => {
      fetchListingsByUser(owner.id)
        .then(rows => { if (live) setItems(rows.length || !demo ? rows : MARKETPLACE_ITEMS.filter(i => i.user.id === owner.id)); })
        .catch(() => { if (live) setItems(prev => prev ?? []); });
    };
    load();
    const off = onPostsChanged(load);
    return () => { live = false; off(); };
  }, [owner.id, demo]);

  /* Their school, for the line under the canvas. One small read. */
  useEffect(() => {
    if (college || !hasSupabaseEnv) return;
    let live = true;
    supabase.from('profiles').select('college, department').eq('id', owner.id).single()
      .then(({ data }) => {
        if (!live || !data) return;
        const d = data as unknown as { college: string | null; department: string | null };
        setCollege(normalizeCollege(d.college) || normalizeCollege(d.department) || '');
      });
    return () => { live = false; };
  }, [owner.id, college]);

  /* Ordering, exactly as on a product page: only once the orders table is
     known to answer, so nobody is offered a button that can only fail. */
  const [ordersOn] = useState(() => ordersAvailable());
  const os = useOrders();
  useEffect(() => { if (ordersOn) probeOrdersAvailable(); }, [ordersOn]);
  const orderable = (it: MarketplaceItem) => !!onOrder && ordersOn && os.available === true && !isMe
    && dmAvailable && !it.isClosed && !it.isRequest
    && isOrderable({ kind: it.kind ?? 'item', listing_type: it.listingType, status: 'active' });

  const all = items ?? [];
  const sections = useMemo(() => sectionsFor(brand, all), [brand, all]);
  const picks = useMemo(() => picksFor(brand, all), [brand, all]);
  const openCount = all.filter(i => !i.isClosed && !i.isRequest).length;
  const price = priceLine(all);
  const range = rangeLine(sections);
  const navSections = useMemo(() => [
    ...(picks.length >= 2 ? [{ id: 'picks', label: 'Picks' }] : []),
    ...sections.map(s => ({ id: s.id, label: s.id === 'more' ? 'More' : s.id === 'sold' ? 'Sold' : s.label })),
    { id: 'about', label: `About` },
  ], [picks.length, sections]);

  /* ── The bar turns solid once the canvas has scrolled under it ── */
  const sentinel = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setSolid(!e.isIntersecting && e.boundingClientRect.top < BAR_H + 1),
      { rootMargin: `-${BAR_H}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Section row: follows the scroll, jumps on tap ── */
  const [active, setActive] = useState<string>('');
  const lockUntil = useRef(0);
  const navGlide = useGlide(active);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !items) return;
    const visible = new Set<string>();
    const order = navSections.map(s => s.id);
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.section ?? '';
        if (e.isIntersecting) visible.add(id); else visible.delete(id);
      }
      if (Date.now() < lockUntil.current) return;
      const first = order.find(id => visible.has(id));
      if (first) setActive(first);
    }, { rootMargin: `-${BAR_H + NAV_H + 8}px 0px -55% 0px` });
    sectionEls.current.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [navSections, items]);

  const jump = (id: string) => {
    const el = sectionEls.current.get(id);
    if (!el) return;
    haptics.selection();
    setActive(id);
    lockUntil.current = Date.now() + 900;
    track(EVT.brand_section_jump, { brand: brand.handle, section: id });
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  const sectionRef = (id: string) => (el: HTMLElement | null) => {
    if (el) sectionEls.current.set(id, el); else sectionEls.current.delete(id);
  };

  /* ── Cards arrive as their section comes into view, once ── */
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!items) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(new Set(navSections.map(s => s.id))); return; }
    const io = new IntersectionObserver(entries => {
      const add = entries.filter(e => e.isIntersecting).map(e => (e.target as HTMLElement).dataset.section ?? '');
      if (add.length) setSeen(prev => { const next = new Set(prev); add.forEach(a => next.add(a)); return next; });
    }, { rootMargin: '0px 0px -8% 0px' });
    sectionEls.current.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [items, navSections]);

  const share = async () => {
    haptics.selection();
    track(EVT.brand_shared, { brand: brand.handle });
    const res = await shareLink({ title: `${brand.name} on Wecycle`, text: `${brand.name} — ${brand.tagline}`, url: brandUrl(brand) });
    if (res === 'copied') toast('Link copied');
  };

  const openItem = (it: MarketplaceItem, section: string) => {
    haptics.light();
    track(EVT.brand_item_opened, { brand: brand.handle, item_id: it.id, section });
    const m = scrollMemory.get(brand.handle);
    if (m) m.back = true;
    onOpenItem(it);
  };

  const order = (it: MarketplaceItem) => {
    haptics.medium();
    track(EVT.brand_order_tapped, { brand: brand.handle, item_id: it.id, existing: !!openOrderFor(os, it.id) });
    onOrder?.(it);
  };

  const first = owner.name.split(/\s+/)[0] || owner.name;
  const loading = items === null;

  /* Put the reader back where they were once the range is in, then keep
     note of where they are (read as they scroll: by the time a screen
     unmounts its scroller is already detached and reads 0). */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading) return;
    const sp = scrollParent(rootRef.current);
    if (!sp) return;
    /* Only on the way back from one of its products — arriving fresh (from
       home, a link) starts at the brand. */
    const saved = scrollMemory.get(brand.handle);
    if (saved?.back && Date.now() - saved.at < 10 * 60_000) {
      sp.scrollTop = saved.top;
    }
    scrollMemory.delete(brand.handle);
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scrollMemory.set(brand.handle, { top: sp.scrollTop, at: Date.now() });
      });
    };
    const target: HTMLElement | Window = sp === document.scrollingElement ? window : sp;
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => { target.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [loading, brand.handle]);

  return (
    <div
      ref={rootRef}
      className="bs"
      /* Cards wait for their section only where something will tell them it
         has arrived; without an observer they are simply there. */
      data-io={typeof IntersectionObserver !== 'undefined' || undefined}
      style={{
        ['--bs-ink' as string]: brand.palette.ink,
        ['--bs-c0' as string]: brand.palette.fields[0],
        ['--bs-c1' as string]: brand.palette.fields[1 % brand.palette.fields.length],
        ['--bs-c2' as string]: brand.palette.fields[2 % brand.palette.fields.length],
        ['--bs-c3' as string]: brand.palette.fields[3 % brand.palette.fields.length],
      }}
    >
      {/* ── BAR ── over the canvas, then solid once it has scrolled away */}
      <header className="bs-bar" data-solid={solid || undefined}>
        <button type="button" onClick={onBack} aria-label="Back" className="bs-round">
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <span className="bs-bar-mark">
          <BrandWordmark src={brand.assets.wordmark} name={brand.name} decorative />
        </span>
        <span className="bs-bar-end">
          <button type="button" onClick={() => { void share(); }} aria-label={`Share ${brand.name}`} className="bs-round">
            <Share2 size={17} strokeWidth={2} />
          </button>
          {viewer && !isMe && (
            <button type="button" onClick={() => setReportOpen(true)} aria-label={`More options for ${brand.name}`} className="bs-round">
              <MoreHorizontal size={19} strokeWidth={2} />
            </button>
          )}
        </span>
      </header>

      <BrandCanvas brand={brand} headingId="brand-title" />
      <div ref={sentinel} className="bs-sentinel" aria-hidden="true" />

      {/* ── WHO + WHAT ── */}
      <section className="bs-intro" aria-labelledby="brand-title">
        <div className="bs-facts">
          <p className="bs-eyebrow">{[brand.kind, college || null].filter(Boolean).join(' · ')}</p>
          <p className="bs-stats">
            {loading
              ? <span className="bs-skel-line" aria-label="Loading" />
              : <>
                  <b>{openCount}</b> {openCount === 1 ? 'product' : 'products'}
                  {price && <><span aria-hidden="true"> · </span>{price}</>}
                </>}
          </p>
        </div>
        <div className="bs-maker">
          <img src={getAvatar(owner.id, 96)} alt="" width={40} height={40} className="bs-maker-face" />
          <span className="bs-maker-text">
            <span className="bs-maker-role">Run by</span>
            <span className="bs-maker-name">{owner.name}</span>
          </span>
          {canMessage && (
            <button type="button" className="bs-msg ord-press" onClick={() => { haptics.light(); onMessage?.(owner); }}>
              <MessageCircle size={16} strokeWidth={2.1} />
              Message
            </button>
          )}
        </div>
      </section>

      {/* ── SECTION ROW ── */}
      {!loading && openCount + sections.length > 0 && (
        <nav className="bs-nav" aria-label={`${brand.name} sections`}>
          <div className="segmented segmented--scroll bs-nav-row" ref={navGlide}>
            {navSections.map(s => (
              <button
                key={s.id} type="button"
                onClick={() => jump(s.id)}
                aria-current={active === s.id ? 'true' : undefined}
                data-active={active === s.id || undefined}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {loading && (
        <div className="bs-grid bs-grid--skel" aria-busy="true" aria-label="Loading products">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bs-card bs-card--skel"><span className="dm-skel bs-card-photo" /><span className="dm-skel bs-skel-text" /></div>
          ))}
        </div>
      )}

      {!loading && openCount === 0 && sections.length === 0 && (
        <div className="bs-empty">
          <p>Nothing from {brand.name} is up right now.</p>
          {canMessage && <p>Ask {first} what’s coming next.</p>}
        </div>
      )}

      {/* ── PICKS ── stickers on the brand's colours, like its own poster */}
      {!loading && picks.length >= 2 && (
        <section className="bs-section" data-section="picks" ref={sectionRef('picks')} data-in={seen.has('picks') || undefined}
          style={{ scrollMarginTop: BAR_H + NAV_H + 4 }} aria-labelledby="bs-h-picks">
          <div className="bs-head">
            <h2 id="bs-h-picks">Picks from {brand.name}</h2>
          </div>
          <ul className="bs-picks" role="list">
            {picks.map((it, i) => {
              const photo = photoOf(it);
              return (
                <li key={it.id} className="bs-pick" style={{ ['--i' as string]: i, ['--pc' as string]: `var(--bs-c${i % 4})` }}>
                  <button type="button" className="bs-pick-hit ord-press" onClick={() => openItem(it, 'picks')}
                    aria-label={`${it.title}${typeof it.price === 'number' && it.listingType === 'sell' ? `, ${rupees(it.price)}` : ''}`}>
                    <span className="bs-pick-art">
                      {photo ? <img src={photo} alt="" loading="lazy" draggable={false} /> : <Package size={28} strokeWidth={1.6} />}
                    </span>
                    <span className="bs-pick-title">{it.title}</span>
                    {it.listingType === 'sell' && typeof it.price === 'number' && <span className="bs-pick-price">{rupees(it.price)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── THE RANGE ── */}
      {!loading && sections.map(s => {
        const sp = s.id === 'sold' ? null : priceLine(s.items);
        return (
          <section key={s.id} className="bs-section" data-section={s.id} ref={sectionRef(s.id)}
            data-in={seen.has(s.id) || undefined} style={{ scrollMarginTop: BAR_H + NAV_H + 4 }} aria-labelledby={`bs-h-${s.id}`}>
            <div className="bs-head">
              <h2 id={`bs-h-${s.id}`}>{s.label} <span className="bs-count">{s.items.length}</span></h2>
              {sp && <span className="bs-head-price">{sp}</span>}
            </div>
            <ul className="bs-grid" role="list">
              {s.items.map((it, i) => {
                const photo = photoOf(it);
                const canOrder = orderable(it);
                const ordered = canOrder && !!openOrderFor(os, it.id);
                return (
                  /* One card, two targets: the whole card opens the product
                     (the title's button stretches over it), and Order sits
                     above that on the photo — Swiggy's ADD, one tap from the
                     range without opening anything. */
                  <li key={it.id} className="bs-card" data-closed={it.isClosed || undefined} style={{ ['--i' as string]: Math.min(i, 8) }}>
                    <span className="bs-card-photo">
                      {photo ? <img src={photo} alt="" loading="lazy" draggable={false} /> : <Package size={22} strokeWidth={1.6} />}
                      {it.isClosed && <PostStamp label={closedLabelFor(it)} />}
                      {canOrder && (
                        <button type="button" className="bs-add ord-press" data-ordered={ordered || undefined} onClick={() => order(it)}
                          aria-label={ordered ? `${it.title} — open your order` : `Order ${it.title}`}>
                          {ordered ? <><Check size={14} strokeWidth={2.6} /> Ordered</> : <><Plus size={14} strokeWidth={2.6} /> Order</>}
                        </button>
                      )}
                    </span>
                    <button type="button" className="bs-card-hit" onClick={() => openItem(it, s.id)}
                      aria-label={it.isClosed ? `${it.title}, ${closedLabelFor(it).toLowerCase()}` : `${it.title}${it.listingType === 'sell' && typeof it.price === 'number' ? `, ${rupees(it.price)}` : ''}`}>
                      <span className="bs-card-title">{it.title}</span>
                    </button>
                    <span className="bs-card-price" aria-hidden="true">
                      {it.listingType === 'sell' && typeof it.price === 'number' ? rupees(it.price)
                        : it.listingType[0].toUpperCase() + it.listingType.slice(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* ── ABOUT ── the brand in its own words and pictures */}
      {!loading && (
        <section className="bs-section bs-about" data-section="about" ref={sectionRef('about')} data-in={seen.has('about') || undefined}
          style={{ scrollMarginTop: BAR_H + NAV_H + 4 }} aria-labelledby="bs-h-about">
          <div className="bs-head"><h2 id="bs-h-about">About {brand.name}</h2></div>
          {brand.assets.art && (
            <img className="bs-about-art" src={brand.assets.art} alt={`${brand.name} artwork: the wordmark in a cloud, surrounded by colourful doodles`} loading="lazy" />
          )}
          <div className="bs-about-copy">
            <p className="bs-about-tag">{brand.tagline}</p>
            <p>{brand.about}</p>
            {range && <p className="bs-about-range"><span>On Wecycle now</span>{range}.</p>}
          </div>
          {brand.assets.poster && (
            <img className="bs-about-poster" src={brand.assets.poster} alt={`${brand.name} poster: T-shirts, tote bags, stickers and more`} loading="lazy" />
          )}
          <div className="bs-about-actions">
            {canMessage && (
              <button type="button" className="bs-msg bs-msg--solid ord-press" onClick={() => { haptics.light(); onMessage?.(owner); }}>
                <MessageCircle size={16} strokeWidth={2.1} /> Message {first}
              </button>
            )}
            <button type="button" className="bs-msg ord-press" onClick={() => { void share(); }}>
              <Share2 size={16} strokeWidth={2.1} /> Share {brand.name}
            </button>
          </div>
        </section>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={owner.id}
        targetUserId={owner.id}
        targetLabel={brand.name}
      />
    </div>
  );
}
