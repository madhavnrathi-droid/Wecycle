'use client';

/* Minimal presence indicator — renders "● Online" in muted green wherever a
 * user appears (item owner card, event organizer, message row, etc.).
 *
 * We never render this for ourselves — that's noisy. The viewing user's own
 * `showOnlineStatus` setting only gates whether *other* people see *us* as
 * online; it doesn't suppress the badge on other people's profiles.
 *
 * If the source data has no `isOnline` field, we render nothing (safer than
 * showing a stale offline state for users we can't track yet). */

interface OnlineBadgeProps {
  isOnline?: boolean | null;
  /** Compact variant for tight rows — just the dot, no label. */
  dotOnly?: boolean;
  /** Optional override colour. Defaults to a calm presence-green. */
  color?: string;
}

export default function OnlineBadge({ isOnline, dotOnly, color = '#16A34A' }: OnlineBadgeProps) {
  if (!isOnline) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dotOnly ? 0 : 4,
        fontSize: 11,
        fontWeight: 600,
        color,
        letterSpacing: '0.01em',
        lineHeight: 1,
      }}
      aria-label="Online"
    >
      <span
        aria-hidden="true"
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 0 2px color-mix(in oklab, ${color} 28%, transparent)`,
        }}
      />
      {!dotOnly && 'Online'}
    </span>
  );
}
