'use client';

import { useEffect, useState } from 'react';

/* Tailwind-style breakpoints */
export const BREAKPOINTS = {
  sm:  640,
  md:  768,
  lg:  1024,
  xl:  1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Returns the largest matching breakpoint name plus boolean helpers.
 * SSR-safe — returns 'sm' on the server, then re-renders client-side.
 */
export function useBreakpoint() {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? BREAKPOINTS.sm : window.innerWidth,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const current: Breakpoint =
    width >= BREAKPOINTS['2xl'] ? '2xl' :
    width >= BREAKPOINTS.xl   ? 'xl'  :
    width >= BREAKPOINTS.lg   ? 'lg'  :
    width >= BREAKPOINTS.md   ? 'md'  :
    width >= BREAKPOINTS.sm   ? 'sm'  : 'sm';

  return {
    width,
    current,
    isMobile:  width < BREAKPOINTS.md,
    isTablet:  width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isWide:    width >= BREAKPOINTS.xl,
  };
}
