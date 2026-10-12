/* A product photo has usually just been shown on the page as a plain <img>,
   and the browser will answer a crossOrigin request for the same URL from that
   cached, non-CORS copy — the load fails and the card comes out with no
   products. A query parameter makes it a different URL and a fresh CORS
   request. (Not Appwrite's /preview resizer: that counts against the image
   transformation quota.) */
export function corsFresh(src: string): string {
  if (!/^https?:/i.test(src)) return src;
  /* The requesting host is part of the key: storage doesn't send
     `Vary: Origin`, so a copy fetched for one origin (the app's own, say)
     would otherwise come back to another with the wrong allow-origin. */
  const host = typeof location !== 'undefined' ? location.host || 'app' : 'app';
  return `${src}${src.includes('?') ? '&' : '?'}cors=${encodeURIComponent(host)}`;
}
