'use client';

import { useEffect } from 'react';

/* The human side of /b/<handle>: a beat of the brand's colour and mascot,
 * then into the app with the store open. Crawlers never run this; they read
 * the tags in the page's <head>. */
export default function BrandRedirect({ to, name, mascot, wordmark, colour, ink }: {
  to: string; name: string; mascot?: string; wordmark: string; colour: string; ink: string;
}) {
  useEffect(() => {
    const t = setTimeout(() => { window.location.replace(to); }, 60);
    return () => clearTimeout(t);
  }, [to]);
  return (
    <div style={{
      minHeight: '100svh', display: 'grid', placeItems: 'center',
      background: colour, color: ink,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 14 }}>
        {mascot
          ? <img src={mascot} alt="" width={120} style={{ height: 'auto' }} />
          /* No mascot: the wordmark, drawn in the brand's ink through a mask. */
          : <span aria-hidden="true" style={{
              display: 'block', width: 200, height: 70, background: ink,
              WebkitMask: `url(${wordmark}) center / contain no-repeat`, mask: `url(${wordmark}) center / contain no-repeat`,
            }} />}
        <div style={{ fontSize: 17, fontWeight: 600 }}>Opening {name} on Wecycle…</div>
        <a href={to} style={{ color: ink, fontSize: 14, textDecoration: 'underline' }}>
          Tap here if it doesn’t open
        </a>
      </div>
    </div>
  );
}
