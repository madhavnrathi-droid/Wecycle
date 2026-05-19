'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PhotoCarouselProps {
  photos: string[];
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
}: PhotoCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const single = photos.length <= 1;
  /* Track whether the pointer moved enough to count as a drag */
  const dragRef = useRef<{ startX: number; moved: boolean }>({ startX: 0, moved: false });

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
        aria-label={`${photos.length} photo${photos.length > 1 ? 's' : ''}`}
      >
        {photos.map((src, i) => (
          <div
            key={i}
            className="carousel-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`Photo ${i + 1} of ${photos.length}`}
          >
            <img
              src={src}
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
              }}
            />
          </div>
        ))}
      </div>

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
