'use client';

/* A brand's wordmark, inline, so it takes the ink colour (currentColor) and
 * its letters can move. The SVG is the brand's own traced file in
 * public/brands/<handle>/, fetched once and kept for the session; its letters
 * are <path class="l"> so the hero can bring them in one by one.
 *
 * The box is reserved from the start (aspect ratio) so nothing shifts when the
 * file arrives. If it never does, the brand name is still there for screen
 * readers, and an <img> of the same file stands in. */

import { useEffect, useState } from 'react';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function load(src: string): Promise<string | null> {
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(src);
  if (!p) {
    p = fetch(src)
      .then(r => (r.ok ? r.text() : null))
      /* Our own static file — but only the <svg> element goes in, never
         anything around it. */
      .then(t => {
        const m = t?.match(/<svg[\s\S]*<\/svg>/);
        if (!m || /<script|on\w+=/i.test(m[0])) return null;
        cache.set(src, m[0]);
        return m[0];
      })
      .catch(() => null);
    pending.set(src, p);
  }
  return p;
}

interface BrandWordmarkProps {
  src: string;
  name: string;
  /** width / height of the artwork. */
  ratio?: number;
  className?: string;
  /** Decorative copies (the compact bar) hide from assistive tech. */
  decorative?: boolean;
}

export default function BrandWordmark({ src, name, ratio = 625 / 359, className, decorative }: BrandWordmarkProps) {
  const [svg, setSvg] = useState<string | null>(() => cache.get(src) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (svg) return;
    let live = true;
    load(src).then(s => { if (!live) return; if (s) setSvg(s); else setFailed(true); });
    return () => { live = false; };
  }, [src, svg]);

  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': name };

  return (
    <span className={`bw ${className ?? ''}`} style={{ aspectRatio: String(ratio) }} {...a11y} data-ready={svg ? '' : undefined}>
      {svg
        ? <span className="bw-art" dangerouslySetInnerHTML={{ __html: svg }} />
        : failed && <img src={src} alt="" className="bw-art" draggable={false} />}
    </span>
  );
}
