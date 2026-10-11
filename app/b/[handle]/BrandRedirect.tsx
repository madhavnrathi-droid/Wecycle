'use client';

import { useEffect } from 'react';

/* The human side of /b/<handle>: a beat of the brand's colour and mascot,
 * then into the app with the store open. Crawlers never run this; they read
 * the tags in the page's <head>. */
export default function BrandRedirect({ to, name, mascot, colour, ink }: {
  to: string; name: string; mascot: string; colour: string; ink: string;
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
        <img src={mascot} alt="" width={120} style={{ height: 'auto' }} />
        <div style={{ fontSize: 17, fontWeight: 600 }}>Opening {name} on Wecycle…</div>
        <a href={to} style={{ color: ink, fontSize: 14, textDecoration: 'underline' }}>
          Tap here if it doesn’t open
        </a>
      </div>
    </div>
  );
}
