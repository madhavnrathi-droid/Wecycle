'use client';

/*
 * OnboardingTour — first-time user click-map.
 *
 * A lightweight DOM-targeted spotlight tour. Each step references an element
 * with `data-tour="<id>"` somewhere in the live UI; the tour finds the
 * element, draws a translucent overlay everywhere *except* the target's
 * bounding box, and pins a tooltip next to it.
 *
 * The "smooth click map" — instead of forcing the user to actually click the
 * target, the tour itself drives a sequence of routes via the `onJumpTo`
 * callback, so the user can sit back and watch the app explain itself.
 *
 * Persistence: completion / skip is written to localStorage under
 * `wecycle.onboarding.v1.done = true`. The host page mounts <OnboardingTour />
 * only when that flag is missing.
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { track, EVT } from '../lib/analytics';

export const ONBOARDING_KEY = 'wecycle.onboarding.v1.done';

export function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(ONBOARDING_KEY) === 'true'; }
  catch { return true; }
}

export function markOnboardingDone(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* swallow */ }
}

export function resetOnboarding(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(ONBOARDING_KEY); } catch { /* swallow */ }
}

/** A "screen" the tour can ask the host to render before showing a step. */
export type TourScreen = 'feed' | 'events' | 'lost_found' | 'inventory' | 'account';

interface TourStep {
  /** Target element selector (the `data-tour` value). null = full-screen card. */
  selector: string | null;
  title: string;
  body: string;
  /** Switch the host screen before resolving this step. */
  screen?: TourScreen;
  /** Where to anchor the tooltip relative to the highlight. */
  placement?: 'top' | 'bottom' | 'auto';
}

const STEPS: TourStep[] = [
  {
    selector: null,
    title: 'Welcome to Wecycle 🌱',
    body:
      "Wecycle is your campus's circular-economy hub — share what you don't need, find what you do, and keep stuff out of landfills. Quick tour?",
  },
  {
    selector: '[data-tour="feed-tabs"]',
    title: 'Browse the feed',
    body:
      'Switch between everything happening, requests from neighbours, and the latest items shared on campus.',
    screen: 'feed',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="feed-search"]',
    title: 'Find what you need',
    body:
      'Search for items, materials, or even other students. Categories live just below.',
    screen: 'feed',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="nav-post"], [data-tour="topnav-post"]',
    title: 'Post in seconds',
    body:
      'Tap the green Post button to share an item, raise a request, or report something lost or found.',
    screen: 'feed',
    placement: 'top',
  },
  {
    selector: '[data-tour="nav-events"]',
    title: 'Campus events',
    body:
      'See repair cafés, swap meets, and student org meetups. RSVP in one tap.',
    screen: 'events',
    placement: 'top',
  },
  {
    selector: '[data-tour="nav-lostfound"]',
    title: 'Lost & Found',
    body:
      'Dropped your AirPods? Found a hoodie? Post it here — the whole campus sees it.',
    screen: 'lost_found',
    placement: 'top',
  },
  {
    selector: '[data-tour="nav-inventory"]',
    title: 'Your inventory',
    body:
      'Everything you\'ve posted, saved, RSVPd to, or reported lives here. Edit or delete anytime.',
    screen: 'inventory',
    placement: 'top',
  },
  {
    selector: '[data-tour="topnav-account"]',
    title: 'Your profile & settings',
    body:
      'Tap your avatar for your storefront, settings, theme, and contact preferences.',
    screen: 'feed',
    placement: 'bottom',
  },
  {
    selector: null,
    title: "You're all set ✨",
    body:
      "That's the gist. Post your first item or browse what's nearby — your campus is already on Wecycle.",
  },
];

interface Props {
  /** Switch the host screen before each step that requests it. */
  onJumpTo: (screen: TourScreen) => void;
  /** Called when the tour is dismissed (skip or finish). */
  onClose: () => void;
}

export default function OnboardingTour({ onJumpTo, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const current = STEPS[step];

  useEffect(() => {
    setMounted(true);
    /* Fires once on mount — this is "tour was actually rendered for the
     * user", which is what we want to compare against onboarding_completed
     * to compute the abandonment rate. */
    track(EVT.onboarding_started);
  }, []);

  /* Jump the host screen, then wait one frame for the new screen to render
   * before we go hunting for the target node. */
  useEffect(() => {
    if (current.screen) onJumpTo(current.screen);
    track(EVT.onboarding_step_viewed, {
      step_index: step,
      step_count: STEPS.length,
      step_title: current.title.slice(0, 40),
    });
  }, [step, current.screen, onJumpTo, current.title]);

  /* Locate the target element and track its bounding box. We recompute on
   * resize/scroll because the bottom nav is fixed and the page underneath
   * scrolls — without this the highlight drifts off-target. */
  useLayoutEffect(() => {
    if (!current.selector) { setRect(null); return; }
    let raf = 0;
    const update = () => {
      const el = document.querySelector<HTMLElement>(current.selector!);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        /* Best-effort scroll-into-view for tall pages. */
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        setRect(null);
      }
    };
    /* Wait a frame to let the screen swap settle before measuring. */
    raf = requestAnimationFrame(() => {
      update();
      /* Then poll once more 250ms later so we catch lazy-rendered nodes. */
      setTimeout(update, 260);
    });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, current.selector]);

  if (!mounted) return null;

  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const finish = () => {
    track(EVT.onboarding_completed, { step_reached: step + 1, step_count: STEPS.length });
    markOnboardingDone();
    onClose();
  };
  const skip = () => {
    /* Distinct from completed — fires when the user bails before the last
     * step. The step_reached lets us see where the funnel breaks. */
    if (!isLast) track(EVT.onboarding_skipped, { step_reached: step + 1, step_count: STEPS.length });
    markOnboardingDone();
    onClose();
  };
  const next = () => isLast ? finish() : setStep(s => s + 1);
  const prev = () => setStep(s => Math.max(0, s - 1));

  /* Tooltip placement maths: pin to the rect's edge with a 14px gap and
   * keep it inside the viewport. */
  const TOOLTIP_W = 320;
  const tooltipStyle: React.CSSProperties = (() => {
    if (!rect) {
      return {
        position: 'fixed',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(360px, 90vw)',
      };
    }
    const wantsBottom = current.placement === 'bottom'
      || (current.placement !== 'top' && rect.top < window.innerHeight / 2);
    const top = wantsBottom ? rect.bottom + 14 : rect.top - 14;
    const transformY = wantsBottom ? '0' : '-100%';
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_W - 12));
    return {
      position: 'fixed',
      top, left,
      transform: `translateY(${transformY})`,
      width: TOOLTIP_W,
      maxWidth: '92vw',
    };
  })();

  /* Spotlight: 4 fixed rectangles surrounding the target = cheap mask that
   * works in every browser without needing SVG/clip-path. */
  const dimColor = 'rgba(8, 10, 14, 0.62)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
      style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none' }}
    >
      {rect ? (
        <>
          {/* Four-sided dim mask around the target. */}
          <div style={{ position: 'fixed', left: 0, top: 0, right: 0, height: rect.top, background: dimColor, pointerEvents: 'auto' }} onClick={skip} />
          <div style={{ position: 'fixed', left: 0, top: rect.bottom, right: 0, bottom: 0, background: dimColor, pointerEvents: 'auto' }} onClick={skip} />
          <div style={{ position: 'fixed', left: 0, top: rect.top, width: rect.left, height: rect.height, background: dimColor, pointerEvents: 'auto' }} onClick={skip} />
          <div style={{ position: 'fixed', left: rect.right, top: rect.top, right: 0, height: rect.height, background: dimColor, pointerEvents: 'auto' }} onClick={skip} />
          {/* Target glow ring. */}
          <div style={{
            position: 'fixed',
            left: rect.left - 6, top: rect.top - 6,
            width: rect.width + 12, height: rect.height + 12,
            borderRadius: 14,
            boxShadow: '0 0 0 3px rgba(196, 246, 73, 0.85), 0 0 0 9999px rgba(8, 10, 14, 0.0)',
            pointerEvents: 'none',
            animation: 'wecycleTourPulse 1.6s ease-in-out infinite',
          }} />
        </>
      ) : (
        <div
          onClick={skip}
          style={{ position: 'fixed', inset: 0, background: dimColor, pointerEvents: 'auto' }}
        />
      )}

      {/* Tooltip / card */}
      <div
        style={{
          ...tooltipStyle,
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          borderRadius: 18,
          padding: '18px 18px 14px',
          boxShadow: '0 18px 50px rgba(0,0,0,0.32)',
          border: '1px solid var(--border-subtle)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--accent-lime-dim)',
          }}>
            <Sparkles size={12} strokeWidth={2} /> Step {step + 1} of {STEPS.length}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={skip}
            aria-label="Skip tour"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--text-muted)',
              borderRadius: 8,
            }}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <h3 style={{
          margin: '0 0 6px', fontSize: 17, fontWeight: 700,
          letterSpacing: '-0.02em',
        }}>
          {current.title}
        </h3>
        <p style={{
          margin: 0, fontSize: 13.5, lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}>
          {current.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 5, marginTop: 14, marginBottom: 10 }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 18 : 6, height: 6,
              borderRadius: 999,
              background: i === step
                ? 'var(--text-primary)'
                : i < step ? 'var(--accent-lime-dim)' : 'var(--border-default)',
              transition: 'all 0.18s ease',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={skip}
            style={{
              flex: '0 0 auto',
              padding: '9px 14px',
              borderRadius: 12,
              border: '1px solid var(--border-default)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <span style={{ flex: 1 }} />
          {!isFirst && (
            <button
              onClick={prev}
              aria-label="Previous step"
              style={{
                padding: '9px 12px',
                borderRadius: 12,
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <ArrowLeft size={14} strokeWidth={2} /> Back
            </button>
          )}
          <button
            onClick={next}
            style={{
              padding: '9px 16px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--accent-lime)',
              color: '#0C0C0B',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              letterSpacing: '-0.01em',
            }}
          >
            {isLast ? 'Get started' : 'Next'}
            {!isLast && <ArrowRight size={14} strokeWidth={2.5} />}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes wecycleTourPulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(196, 246, 73, 0.85); }
          50%      { box-shadow: 0 0 0 6px rgba(196, 246, 73, 0.35); }
        }
      `}</style>
    </div>
  );
}
