'use client';

import { useEffect } from 'react';

/* A shared link lands here (so crawlers can read the per-post OG tags), then we
 * bounce the human into the SPA with the post open. */
export default function ShareRedirect({ to }: { to: string }) {
  useEffect(() => {
    const t = setTimeout(() => { window.location.replace(to); }, 60);
    return () => clearTimeout(t);
  }, [to]);
  return (
    <div style={{
      minHeight: '100svh', display: 'grid', placeItems: 'center',
      background: '#0E1116', color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'calc(18px * var(--text-scale))', fontWeight: 600 }}>Opening Wecycle…</div>
        <a href={to} style={{ color: '#22C55E', fontSize: 'calc(14px * var(--text-scale))', marginTop: 10, display: 'inline-block' }}>
          Tap here if it doesn’t open
        </a>
      </div>
    </div>
  );
}
