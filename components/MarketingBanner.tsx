'use client';

/* MarketingBanner — auto-cycling, swipeable carousel that pitches Wecycle's
 * use cases to first-time visitors.
 *
 * Layout / size adapts to the `variant` prop:
 *   - "compact" → mobile-shape pill that fits next to the greeting header
 *   - "wide"    → desktop-shape strip below the search bar, with room for
 *                 a larger hand-drawn illustration and a third "detail" line
 *
 * Both variants render the same `BannerSlide[]` content; the only difference
 * is sizing, layout, and which optional fields are shown.
 *
 * Visuals:
 *   - Each slide carries a Wecycle accent gradient + a hand-drawn-feel
 *     illustration loaded over HTTPS from the Iconify API (Twemoji set).
 *     Twemoji renders as flat, abstract, hand-drawn-looking artwork; the
 *     API serves stable, CDN-cached SVGs.
 *   - Loose abstract blobs in white (low opacity) sit behind the
 *     illustration for that "abstract hand-drawn" feel.
 *
 * Motion:
 *   - Auto-advance every 4 s. Ticks are skipped while the pointer is over
 *     the banner (checked at tick time, not latched) and paused briefly
 *     after a touch or a dot tap.
 *   - Subtle float on the illustration
 *   - Slow drift on the background blobs
 *   - prefers-reduced-motion disables every animation
 *
 * Interaction:
 *   - Each slide is a real <button> — keyboard/screen-reader friendly
 *   - Swipe / drag scrubs the track (scroll-snap)
 *   - Dot indicator at the bottom is tappable
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

export interface BannerSlide {
  id: string;
  /** Iconify illustration key, e.g. "twemoji:wrapped-gift".
   *  Loaded from https://api.iconify.design/<key>.svg — pick any set; the
   *  Twemoji / Noto / OpenMoji sets render with the most hand-drawn feel. */
  illustration: string;
  /** Short headline (2–4 words). */
  title: string;
  /** One-line tagline beneath the title. */
  subtitle: string;
  /** Optional third line, shown only on the wide / desktop variant. */
  detail?: string;
  /** CSS gradient laid OVER the background (use rgba so the abstract blobs
   *  underneath stay visible). Used as the fallback render when `image` is
   *  absent or fails to load. */
  gradient: string;
  /** Full-bleed banner artwork (e.g. /banners/share.webp). When set and it
   *  loads, the whole card is just this image — the gradient + doodles +
   *  illustration + text overlay are skipped because the artwork already
   *  contains all of that. If it 404s or errors, we fall back to the
   *  gradient + text composition automatically (no broken-image state). */
  image?: string;
  /** Fired when the slide is tapped / activated via keyboard. */
  onClick: () => void;
  ariaLabel?: string;
}

interface MarketingBannerProps {
  slides: BannerSlide[];
  /** Visual size + density. Defaults to "compact". */
  variant?: 'compact' | 'wide';
  /** Auto-advance interval in ms. Defaults to 4000. Pass 0 to disable. */
  intervalMs?: number;
}

/* Iconify-hosted SVG — accepts a `?color=` query to tint, but we leave it
 * native so Twemoji's original palette shows through (more illustrative). */
function iconifyUrl(key: string): string {
  return `https://api.iconify.design/${key}.svg`;
}

export default function MarketingBanner({
  slides, variant = 'compact', intervalMs = 4000,
}: MarketingBannerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /* While a programmatic scroll animates, the scroll listener would keep
     recomputing `active` from the in-flight position and clobber the index we
     just set — which made auto-advance jump around (2 -> 1 -> 3) instead of
     stepping in order. Ignore scroll events until the animation settles. */
  const settleUntil = useRef(0);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Slide ids whose `image` failed to load → fall back to the CSS render so
     we never show a broken-image box (e.g. before the art is dropped in). */
  const [imgErrored, setImgErrored] = useState<Set<string>>(new Set());
  const markImgError = useCallback((id: string) => {
    setImgErrored(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  /* How many slides are visible at once.
   *
   * Desktop shows two cards side by side (see the `wide` rules in globals.css);
   * mobile shows one. Rather than duplicate that breakpoint in JS — where it
   * would drift from the CSS the moment either changes — measure the rendered
   * slides. A ResizeObserver keeps it right through window resizes, font-size
   * changes and the desktop/mobile switch.
   *
   * This only decides how many dots there are and where the track stops.
   * Scrolling itself never multiplies a pitch; goTo asks each slide for its own
   * offsetLeft, so nothing here has to be pixel-exact. */
  const [perView, setPerView] = useState(1);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const first = track.children[0] as HTMLElement | undefined;
      if (!first || !first.offsetWidth) return;
      /* Layout offsets, never getBoundingClientRect(): the two disagree
         whenever the page is visually scaled (browser zoom, a scaled preview
         pane), and offsetLeft is the space scrollLeft lives in. It also
         absorbs the column-gap and any margin for free. */
      const second = track.children[1] as HTMLElement | undefined;
      const pitch = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
      if (pitch <= 0) return;
      /* Round to the nearest whole card so a sub-pixel remainder can't read
         as 1.97 cards and collapse perView back to 1. */
      setPerView(Math.max(1, Math.round(track.clientWidth / pitch)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [slides.length]);

  /* Last index that still fills every visible column. With 5 slides shown two
     at a time this is 3, giving the pairs (0,1) (1,2) (2,3) (3,4) — always two
     different cards, never a repeat and never a gap. */
  const maxIndex = Math.max(0, slides.length - perView);

  /* Scroll to a slide by asking the DOM where it is, rather than multiplying a
     measured pitch. Same reason as the pitch comment above — arithmetic on
     measured widths drifts under page scaling and lands off the snap point,
     where mandatory snapping then does something arbitrary. offsetLeft is the
     authoritative answer and scrollLeft shares its coordinate space. */
  const goTo = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const track = trackRef.current;
    if (!track) return;
    const target = Math.max(0, Math.min(i, Math.max(0, slides.length - perView)));
    const child = track.children[target] as HTMLElement | undefined;
    if (!child) return;
    settleUntil.current = Date.now() + 700;
    track.scrollTo({ left: child.offsetLeft, behavior });
    setActive(target);
  }, [perView, slides.length]);

  /* Auto-advance */
  useEffect(() => {
    if (paused || slides.length < 2 || intervalMs <= 0) return;
    if (maxIndex === 0) return; /* everything already on screen — nothing to cycle */
    const t = setInterval(() => {
      /* Ask the DOM whether the pointer is on us RIGHT NOW rather than trusting
         a latched hover flag. Pausing via onMouseEnter/onMouseLeave state meant
         a mouseenter with no matching mouseleave — pointer resting over the
         banner when the page loads, a leave swallowed during a re-render —
         latched `paused` true forever and the carousel never advanced again.
         Skipping a tick is self-healing; a stuck boolean isn't. */
      if (sectionRef.current?.matches(':hover')) return;
      setActive(prev => {
        const next = prev >= maxIndex ? 0 : prev + 1;
        const track = trackRef.current;
        const child = track?.children[next] as HTMLElement | undefined;
        if (track && child) {
          settleUntil.current = Date.now() + 700;
          track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [paused, intervalMs, slides.length, maxIndex]);

  /* Sync active dot with manual swipe. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        /* Our own animation is still running — don't fight it. */
        if (Date.now() < settleUntil.current) return;
        /* Nearest slide by position, for the same reason goTo reads offsetLeft:
           no division by a measured pitch. */
        let nearest = 0;
        let best = Infinity;
        for (let k = 0; k <= maxIndex; k++) {
          const child = track.children[k] as HTMLElement | undefined;
          if (!child) break;
          const d = Math.abs(child.offsetLeft - track.scrollLeft);
          if (d < best) { best = d; nearest = k; }
        }
        setActive(prev => (prev === nearest ? prev : nearest));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [slides.length, maxIndex]);

  const pauseNow = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setPaused(true);
  };
  const resumeSoon = (delay = 2200) => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), delay);
  };
  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`marketing-banner marketing-banner-${variant}`}
      aria-label="What you can do on Wecycle"
      aria-roledescription="carousel"
      onTouchStart={pauseNow}
      onTouchEnd={() => resumeSoon()}
    >
      <div className="marketing-banner-track" ref={trackRef}>
        {slides.map((slide, i) => {
          const useImage = !!slide.image && !imgErrored.has(slide.id);
          return (
          <button
            key={slide.id}
            type="button"
            onClick={slide.onClick}
            className="marketing-banner-slide"
            data-active={i === active || undefined}
            data-art={useImage || undefined}
            aria-label={slide.ariaLabel ?? `${slide.title} — ${slide.subtitle}`}
            aria-roledescription="slide"
            aria-current={i === active ? 'true' : undefined}
          >
            {useImage ? (
              /* ── The artwork, and nothing behind it ──
                 These are transparent voxel cut-outs, so they are shown as
                 supplied: no gradient panel, no scrim, no tinted card. The
                 scene sits on the page's own surface.

                 The scrim went WITH the gradient rather than as a separate
                 decision. Its only job was to darken the lower third enough to
                 hold white type against a coloured panel; over a cut-out on a
                 pale page it is a grey smudge floating under the art, which is
                 worse than the problem it solved.

                 So the type is dark ink with a soft light halo instead. It
                 stays REAL TEXT rather than being baked into the file — the
                 card renders ~343px wide on a phone, a 1400px asset is scaled
                 down four times over, and any text inside it would have to be
                 enormous to survive and still could not be translated,
                 selected, or read aloud. */
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.image}
                  alt=""
                  className="marketing-banner-art"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  onError={() => markImgError(slide.id)}
                />
                {/* No caption over the art.
                    With the panel gone there is nothing to hold type against a
                    busy voxel scene: white ink needs the scrim that went with
                    the gradient, and dark ink on a lit night-time illustration
                    is worse. A halo was tried and is not enough.

                    The card is already the artwork's exact 2:1, so the file IS
                    the banner — and one of the supplied assets carries its own
                    baked headline, which says the art is meant to speak for
                    itself. The words are not lost: the button's aria-label
                    still reads "<title> — <subtitle>", so a screen reader gets
                    the full message, and the arrow keeps the affordance
                    visible. Putting the caption back means moving it BELOW the
                    art, not back on top of it. */}
                <span className="marketing-banner-arrow" aria-hidden="true">
                  <ArrowUpRight size={variant === 'wide' ? 15 : 13} strokeWidth={2.4} />
                </span>
              </>
            ) : (
              <>
                {/* Foreground accent gradient — legibility + colour code. */}
                <span
                  className="marketing-banner-gradient"
                  style={{ backgroundImage: slide.gradient }}
                  aria-hidden="true"
                />

                {/* Abstract hand-drawn-feel doodles behind the illustration. */}
                <AbstractDoodles />

                {/* Hand-drawn illustration via Iconify. */}
                <span className="marketing-banner-illu-wrap" aria-hidden="true">
                  <img
                    src={iconifyUrl(slide.illustration)}
                    alt=""
                    className="marketing-banner-illu"
                    width={variant === 'wide' ? 110 : 56}
                    height={variant === 'wide' ? 110 : 56}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </span>

                <span className="marketing-banner-text">
                  <span className="marketing-banner-title">{slide.title}</span>
                  <span className="marketing-banner-subtitle">{slide.subtitle}</span>
                  {variant === 'wide' && slide.detail && (
                    <span className="marketing-banner-detail">{slide.detail}</span>
                  )}
                </span>

                <span className="marketing-banner-arrow" aria-hidden="true">
                  <ArrowUpRight size={variant === 'wide' ? 15 : 13} strokeWidth={2.4} />
                </span>
              </>
            )}
          </button>
          );
        })}
      </div>

      {/* One dot per scroll POSITION, not per slide. Showing two cards at a
          time means four positions across five slides, so a dot-per-slide
          would leave the last one permanently unreachable. */}
      {maxIndex > 0 && (
        <div className="marketing-banner-dots" aria-hidden="true">
          {Array.from({ length: maxIndex + 1 }, (_, i) => (
            <button
              key={i}
              type="button"
              className="marketing-banner-dot"
              data-active={i === active || undefined}
              onClick={(e) => {
                e.stopPropagation();
                pauseNow();
                goTo(i);
                resumeSoon(3500);
              }}
              aria-label={
                perView > 1
                  ? `Show slides ${i + 1}–${i + perView} of ${slides.length}`
                  : `Show slide ${i + 1} of ${slides.length}`
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* Abstract drift-y blob doodles. Inline SVG so we can animate paths via CSS
 * with no extra HTTP cost. Each blob uses a slightly different keyframe so
 * the composition never settles, reinforcing the hand-drawn feel. */
function AbstractDoodles() {
  return (
    <svg
      className="marketing-banner-doodles"
      viewBox="0 0 200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Big wavy blob — top-right */}
      <path
        className="mb-doodle mb-doodle-1"
        d="M 150 -10 C 190 0 210 40 195 75 C 180 100 140 110 120 90 C 105 75 110 50 130 30 C 140 18 145 5 150 -10 Z"
        fill="rgba(255,255,255,0.16)"
      />
      {/* Looping ring — left */}
      <circle
        className="mb-doodle mb-doodle-2"
        cx="22" cy="80" r="18"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="2.2"
        strokeDasharray="3 4"
      />
      {/* Squiggle */}
      <path
        className="mb-doodle mb-doodle-3"
        d="M 8 18 Q 22 8, 36 18 T 64 18 T 92 18"
        fill="none"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Tiny stars */}
      <path
        className="mb-doodle mb-doodle-4"
        d="M 170 95 L 170 105 M 165 100 L 175 100"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        className="mb-doodle mb-doodle-5"
        d="M 60 95 L 60 102 M 56.5 98.5 L 63.5 98.5"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
