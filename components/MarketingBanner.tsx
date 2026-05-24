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
 *   - Auto-advance every 4 s (pauses on touch/hover, resumes 2 s after)
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
   *  underneath stay visible). */
  gradient: string;
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
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * i, behavior });
    setActive(i);
  }, []);

  /* Auto-advance */
  useEffect(() => {
    if (paused || slides.length < 2 || intervalMs <= 0) return;
    const t = setInterval(() => {
      setActive(prev => {
        const next = (prev + 1) % slides.length;
        const track = trackRef.current;
        if (track) track.scrollTo({ left: track.clientWidth * next, behavior: 'smooth' });
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [paused, intervalMs, slides.length]);

  /* Sync active dot with manual swipe. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
        setActive(prev => (prev === i ? prev : Math.max(0, Math.min(slides.length - 1, i))));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [slides.length]);

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
      className={`marketing-banner marketing-banner-${variant}`}
      aria-label="What you can do on Wecycle"
      aria-roledescription="carousel"
      onMouseEnter={pauseNow}
      onMouseLeave={() => resumeSoon()}
      onTouchStart={pauseNow}
      onTouchEnd={() => resumeSoon()}
    >
      <div className="marketing-banner-track" ref={trackRef}>
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={slide.onClick}
            className="marketing-banner-slide"
            data-active={i === active || undefined}
            aria-label={slide.ariaLabel ?? `${slide.title} — ${slide.subtitle}`}
            aria-roledescription="slide"
            aria-current={i === active ? 'true' : undefined}
          >
            {/* Foreground accent gradient — provides legibility + color code. */}
            <span
              className="marketing-banner-gradient"
              style={{ backgroundImage: slide.gradient }}
              aria-hidden="true"
            />

            {/* Abstract hand-drawn-feel doodles behind the illustration. */}
            <AbstractDoodles />

            {/* Hand-drawn illustration via Iconify. Twemoji set looks loose
                and abstract — feels hand-crafted vs the literal photo. */}
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
              {/* Size adapts via CSS for the wide variant; the SVG size here
                 is the medium-of-both so it scales crisp on either device. */}
              <ArrowUpRight size={variant === 'wide' ? 15 : 13} strokeWidth={2.4} />
            </span>
          </button>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="marketing-banner-dots" aria-hidden="true">
          {slides.map((_, i) => (
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
              aria-label={`Show slide ${i + 1} of ${slides.length}`}
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
