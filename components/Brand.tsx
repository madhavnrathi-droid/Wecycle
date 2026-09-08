'use client';

/* ── Wecycle brand marks ──────────────────────────────────────────────
 * The single source of truth for rendering the logo. Two marks:
 *
 *   <Wordmark/>  — the "Wecycle" lettering. Use in top headers and
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

/* Intrinsic aspect ratios of the trimmed source art (w / h). Keep in step with
 * the actual files in /public/brand — this only sizes the width attribute that
 * reserves layout space, but a wrong value makes the header jump on load. */
const WORDMARK_AR = 885 / 240;    // ≈ 3.688
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

/* The four fills of the same mark. Solid variants are generated from the
 * gradient's own alpha channel, so all four are one geometry rather than four
 * tracings that drift apart.
 *
 *   gradient  the primary mark. Default everywhere on cream or white.
 *   green     one colour, where a gradient would be noise — small sizes,
 *             single-colour print, anywhere the mark sits on busy imagery.
 *   black     high-contrast light surfaces, stamps, watermarks.
 *   white     dark surfaces. The partner panels are near-black, and a green
 *             mark on #141210 sits at about 3:1 — fine for a large shape,
 *             muddy at 20px. White is legible at every size it is used. */
export type LogomarkVariant = 'gradient' | 'green' | 'black' | 'white';

const LOGOMARK_SRC: Record<LogomarkVariant, string> = {
  gradient: '/brand/logomark.png',
  green: '/brand/logomark-green.png',
  black: '/brand/logomark-black.png',
  white: '/brand/logomark-white.png',
};

interface LogomarkProps {
  /** Rendered size in px (square). */
  size?: number;
  variant?: LogomarkVariant;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export function Logomark({
  size = 48, variant = 'gradient', className, style, alt = 'Wecycle',
}: LogomarkProps) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={LOGOMARK_SRC[variant]}
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
