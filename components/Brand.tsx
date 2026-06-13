'use client';

/* ── Wecycle brand marks ──────────────────────────────────────────────
 * The single source of truth for rendering the logo. Two marks:
 *
 *   <Wordmark/>  — the cursive "Wecycle" lettering. Use in top headers and
 *                  anywhere the full brand name is appropriate.
 *   <Logomark/>  — the looped "W" symbol. Use for compact / square contexts:
 *                  splash, auth, onboarding, avatars-of-the-app, favicons.
 *
 * Both source from transparent PNGs in /public/brand (white knocked out),
 * so they sit cleanly on cream, dark, and the green/blue brand panels alike.
 * Plain <img> (not next/image) — these are tiny static decorative assets and
 * the codebase already uses raw <img> for similar cases.
 * ──────────────────────────────────────────────────────────────────── */

interface WordmarkProps {
  /** Rendered height in px. Width scales to the ~2.83:1 aspect ratio. */
  height?: number;
  /** Extra className for layout (margins etc.). */
  className?: string;
  style?: React.CSSProperties;
  /** Decorative by default; pass a label when it's the only brand cue. */
  alt?: string;
}

/* Intrinsic aspect ratios of the trimmed source art (w / h). */
const WORDMARK_AR = 1719 / 607;   // ≈ 2.832
const LOGOMARK_AR = 1;            // square

export function Wordmark({ height = 26, className, style, alt = 'Wecycle' }: WordmarkProps) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/brand/wordmark.png"
      alt={alt}
      width={Math.round(height * WORDMARK_AR)}
      height={height}
      decoding="async"
      draggable={false}
      className={className}
      style={{ height, width: 'auto', display: 'block', userSelect: 'none', ...style }}
    />
  );
}

interface LogomarkProps {
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export function Logomark({ size = 48, className, style, alt = 'Wecycle' }: LogomarkProps) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/brand/logomark.png"
      alt={alt}
      width={Math.round(size * LOGOMARK_AR)}
      height={size}
      decoding="async"
      draggable={false}
      className={className}
      style={{ height: size, width: size, display: 'block', userSelect: 'none', ...style }}
    />
  );
}
