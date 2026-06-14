'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';

/* Each slide is either a photo URL (string) or a video descriptor. We keep the
 * legacy "string[]" entry point so existing callers (detail screens, picker
 * preview) keep working — they just pass photo URLs. The feed wraps its photo
 * arrays in `mediaSlides()` to opt into video slides + autoplay. */
export type Slide = string | VideoSlide;

export interface VideoSlide {
  kind: 'video';
  src: string;
  /** Poster shown while paused / before metadata arrives. */
  poster?: string;
}

interface PhotoCarouselProps {
  photos: Slide[];
  /** Aspect ratio (CSS aspect-ratio value), e.g. '1', '4/5', '0.72' */
  aspectRatio?: string;
  /** Show prev/next arrows on hover (desktop). */
  showArrows?: boolean;
  /** Custom overlay rendered on top of every slide (e.g. badges) */
  overlay?: React.ReactNode;
  /** Make image rounded (defaults to 0 — let parent decide) */
  radius?: number | string;
  /** Click handler — fired only when the user did not swipe */
  onClick?: () => void;
  /** Object-fit for images */
  objectFit?: 'cover' | 'contain';
  /** Position of the dot indicators */
  dotsPosition?: 'top' | 'bottom';
  /** Autoplay video slides when they become the active slide AND the carousel
   *  is at least partially in the viewport. Default true. */
  autoplayVideos?: boolean;
}

/* Mute state is shared across every carousel on the page so toggling sound
   on one card affects the whole feed (matches Instagram / Reels behavior). */
const muteStore = (() => {
  const listeners = new Set<(muted: boolean) => void>();
  let muted = true;
  return {
    get: () => muted,
    set: (next: boolean) => {
      if (muted === next) return;
      muted = next;
      listeners.forEach(l => l(muted));
    },
    subscribe: (fn: (muted: boolean) => void) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
})();

export function useCarouselMuted(): [boolean, (next: boolean) => void] {
  const [muted, setMuted] = useState(() => muteStore.get());
  useEffect(() => muteStore.subscribe(setMuted), []);
  return [muted, (v: boolean) => muteStore.set(v)];
}

/**
 * Native scroll-snap carousel. Touch swipe works out of the box on mobile
 * thanks to overflow-x: auto + scroll-snap-type. Dots reflect the active
 * slide via scroll-position observation.
 */
export default function PhotoCarousel({
  photos, aspectRatio, showArrows = true, overlay,
  radius, onClick, objectFit = 'cover',
  dotsPosition = 'bottom',
  autoplayVideos = true,
}: PhotoCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const [active, setActive] = useState(0);
  /* Whether the whole carousel is in viewport — drives play/pause when scrolling */
  const [inView, setInView] = useState(true);
  const single = photos.length <= 1;
  const [muted, setMuted] = useCarouselMuted();
  /* Track whether the pointer moved enough to count as a drag */
  const dragRef = useRef<{ startX: number; moved: boolean }>({ startX: 0, moved: false });

  /* Pre-resolve which slides are videos so we can expose an unmute button only
     when at least one exists. */
  const hasVideo = useMemo(
    () => photos.some(p => typeof p !== 'string' && p.kind === 'video'),
    [photos],
  );
  const activeIsVideo = useMemo(() => {
    const p = photos[active];
    return typeof p !== 'string' && p?.kind === 'video';
  }, [photos, active]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        setActive(Math.max(0, Math.min(photos.length - 1, i)));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [photos.length]);

  /* Track whether the frame is on-screen so we don't autoplay a video that
     scrolled out of view (would burn the user's battery on long feeds). */
  useEffect(() => {
    if (!autoplayVideos || !hasVideo) return;
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.target === el) setInView(e.intersectionRatio > 0.4);
        }
      },
      { threshold: [0, 0.4, 0.8] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoplayVideos, hasVideo]);

  /* Drive play/pause on every render that might change the active slide,
     visibility, or mute state. The "second post + swiped to it" case in the
     spec lands here: when the user swipes to a video slide and the carousel
     is in view, that slide starts playing — even if other cards on the page
     are still images. */
  useEffect(() => {
    if (!autoplayVideos) return;
    videoRefs.current.forEach((video, idx) => {
      const shouldPlay = inView && idx === active;
      video.muted = muted;
      if (shouldPlay) {
        /* play() can reject (autoplay policy etc.); we swallow because muted
           autoplay is the universally-allowed fallback we already use. */
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [active, inView, muted, autoplayVideos, photos]);

  const scrollToIndex = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, moved: false };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - dragRef.current.startX) > 6) {
      dragRef.current.moved = true;
    }
  };
  const handleClick = () => {
    if (!dragRef.current.moved && onClick) onClick();
  };

  return (
    <div
      ref={frameRef}
      className="carousel-frame"
      style={{
        aspectRatio,
        borderRadius: radius,
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
    >
      <div
        ref={trackRef}
        className="carousel-track"
        role="region"
        aria-roledescription="carousel"
        aria-label={`${photos.length} item${photos.length > 1 ? 's' : ''}`}
      >
        {photos.map((slide, i) => {
          const isVideo = typeof slide !== 'string' && slide.kind === 'video';
          return (
            <div
              key={i}
              className="carousel-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${isVideo ? 'Video' : 'Photo'} ${i + 1} of ${photos.length}`}
            >
              {isVideo ? (
                <video
                  ref={el => {
                    if (el) videoRefs.current.set(i, el);
                    else videoRefs.current.delete(i);
                  }}
                  src={(slide as VideoSlide).src}
                  poster={(slide as VideoSlide).poster}
                  playsInline
                  loop
                  muted={muted}
                  preload="metadata"
                  /* Disable native controls — we drive playback via the
                     IntersectionObserver + active-slide effect above. */
                  controls={false}
                  /* Prevent pointer events so the card's click handler still
                     bubbles when the user taps a video. */
                  style={{
                    width: '100%', height: '100%',
                    objectFit, display: 'block',
                    pointerEvents: 'none',
                    background: '#000',
                  }}
                />
              ) : (
                <img
                  src={slide as string}
                  alt=""
                  draggable={false}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit,
                    display: 'block',
                    userSelect: 'none',
                    pointerEvents: 'none',
                    /* A bg-removed cut-out (transparent .png) must sit on white,
                       never let the dark UI show through it. */
                    background: typeof slide === 'string' && /\.png(\?|$)/i.test(slide) ? '#fff' : undefined,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Unmute / mute pill — only when the active slide is a video.
          Lives in the top-right by default; sits above any other overlay. */}
      {activeIsVideo && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setMuted(!muted); }}
          aria-label={muted ? 'Unmute video' : 'Mute video'}
          aria-pressed={!muted}
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            border: 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            cursor: 'pointer', zIndex: 4,
          }}
        >
          {muted ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
        </button>
      )}

      {overlay}

      {/* Dot indicators */}
      {!single && (
        <div
          className="carousel-dots"
          data-position={dotsPosition}
          aria-hidden="true"
        >
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              className="carousel-dot"
              data-active={i === active || undefined}
              onClick={e => { e.stopPropagation(); scrollToIndex(i); }}
              aria-label={`Go to photo ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Arrows (hidden on touch / mobile via CSS) */}
      {!single && showArrows && (
        <>
          <button
            type="button"
            className="carousel-arrow carousel-arrow-prev"
            onClick={e => { e.stopPropagation(); scrollToIndex(Math.max(0, active - 1)); }}
            aria-label="Previous photo"
            disabled={active === 0}
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="carousel-arrow carousel-arrow-next"
            onClick={e => { e.stopPropagation(); scrollToIndex(Math.min(photos.length - 1, active + 1)); }}
            aria-label="Next photo"
            disabled={active === photos.length - 1}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}
