'use client';

/* MarketingBanner — the dynamic "what Wecycle is for" carousel that sits to
 * the right of the home-feed greeting.
 *
 * Each slide is a hero card promoting one use case (Share / Request / Events
 * / Lost & Found). The carousel:
 *
 *   - auto-advances every 4 s with a cross-fade between slides
 *   - is swipeable on touch (scroll-snap), draggable on desktop
 *   - pauses auto-advance the moment a finger / cursor touches it, and
 *     resumes after a beat once interaction ends
 *   - is keyboard accessible (Tab → Enter on the focused slide fires its
 *     onClick handler, exactly as a button would)
 *   - each slide is its own <button> so tapping anywhere navigates — the
 *     "banner isn't a button but redirects" requirement is preserved because
 *     the outer container is a <section>, not a single CTA.
 *
 * Motion: each slide carries a slow Ken-Burns zoom on its hero image plus a
 * gentle float on the emoji glyph, so even a single-slide pause feels alive.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

export interface BannerSlide {
  id: string;
  /** Big glyph in the top-right corner of the card. */
  emoji: string;
  /** 2–4 word headline. */
  title: string;
  /** One-line tagline shown beneath the title. */
  subtitle: string;
  /** Background image URL (Unsplash works well — 800×600+). */
  image: string;
  /** Foreground gradient overlay laid OVER the image for legibility.
   *  Pass a CSS value like `linear-gradient(...)`. */
  gradient: string;
  /** Action fired when the slide is tapped / Enter is pressed. */
  onClick: () => void;
  /** Slot-specific aria label override. Defaults to `${title} — ${subtitle}`. */
  ariaLabel?: string;
}

interface MarketingBannerProps {
  slides: BannerSlide[];
  /** Auto-advance interval in ms. Defaults to 4000. Pass 0 to disable. */
  intervalMs?: number;
}

export default function MarketingBanner({ slides, intervalMs = 4000 }: MarketingBannerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  /* Pause auto-advance while the user is interacting, then resume after a
     short grace period so they aren't ambushed mid-read. */
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const track = trackRef.current;
    if (!track) return;
    const slideWidth = track.clientWidth;
    track.scrollTo({ left: slideWidth * i, behavior });
    setActive(i);
  }, []);

  /* Auto-advance */
  useEffect(() => {
    if (paused || slides.length < 2 || intervalMs <= 0) return;
    const t = setInterval(() => {
      setActive(prev => {
        const next = (prev + 1) % slides.length;
        const track = trackRef.current;
        if (track) {
          track.scrollTo({ left: track.clientWidth * next, behavior: 'smooth' });
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [paused, intervalMs, slides.length]);

  /* Keep active dot in sync with manual swipe / scroll. We sample the
     scrollLeft inside a rAF so the dot snaps cleanly without thrashing. */
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

  /* Pause helpers — touchend / mouseleave kick a delayed resume so the user
     has time to read whichever slide they swiped to. */
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
      className="marketing-banner"
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
            {/* Zooming hero image lives in its own absolutely-positioned div
               so the Ken-Burns transform doesn't disturb the text layer. */}
            <span
              className="marketing-banner-image"
              style={{ backgroundImage: `url(${slide.image})` }}
              aria-hidden="true"
            />
            <span
              className="marketing-banner-gradient"
              style={{ backgroundImage: slide.gradient }}
              aria-hidden="true"
            />
            <span className="marketing-banner-emoji" aria-hidden="true">{slide.emoji}</span>
            <span className="marketing-banner-text">
              <span className="marketing-banner-title">{slide.title}</span>
              <span className="marketing-banner-subtitle">{slide.subtitle}</span>
            </span>
            <span className="marketing-banner-arrow" aria-hidden="true">
              <ArrowUpRight size={13} strokeWidth={2.4} />
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
