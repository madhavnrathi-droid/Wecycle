'use client';

/* Friendly empty-state card.
 *
 * Used everywhere a feed surface might be empty for a fresh community: feed,
 * marketplace, events, requests, inventory, lost & found, storefront tabs,
 * comments, activity. Each call site passes a cute one-liner so the surface
 * feels alive even with zero data, and an optional CTA that opens the right
 * "create" sheet.
 *
 * Keep these short, warm, and never instructional. We're greeting the first
 * person through the door, not handing them a manual. */

import type { ReactNode } from 'react';
import LottiePlayer from './LottiePlayer';

interface EmptyStateProps {
  /** Required. Tightly phrased, max ~80 chars, no punctuation tyranny. */
  prompt: string;
  /** Optional secondary line giving context. */
  sub?: string;
  /** Emoji or compact icon node. If omitted, a branded Lottie "bloom" plays. */
  icon?: ReactNode;
  /** Optional primary CTA. */
  cta?: {
    label: string;
    onClick: () => void;
  };
  /** Tighter padding for smaller surfaces (e.g. storefront tabs). */
  compact?: boolean;
}

export default function EmptyState({ prompt, sub, icon, cta, compact }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '40px 24px' : '64px 24px',
        color: 'var(--text-secondary)',
        gap: 10,
      }}
    >
      {icon ? (
        <div style={{ fontSize: compact ? 30 : 40, lineHeight: 1, opacity: 0.92 }} aria-hidden="true">
          {icon}
        </div>
      ) : (
        <LottiePlayer
          src="/animations/bloom.json"
          size={compact ? 72 : 104}
          aria-label="Nothing here yet"
          fallback={<span style={{ fontSize: compact ? 30 : 40, lineHeight: 1 }} aria-hidden="true">✨</span>}
        />
      )}
      <p style={{
        margin: 0,
        fontSize: compact ? 14 : 15,
        fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        maxWidth: 320,
        lineHeight: 1.35,
      }}>
        {prompt}
      </p>
      {sub && (
        <p style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--text-muted)',
          maxWidth: 360,
          lineHeight: 1.45,
        }}>
          {sub}
        </p>
      )}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          style={{
            marginTop: 6,
            background: 'var(--text-primary)',
            color: 'var(--bg-base)',
            border: 'none',
            borderRadius: 999,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            cursor: 'pointer',
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
