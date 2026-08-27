/* Wecycle service worker — cache-first for static, network-first for HTML */

/* Bumped to v3: the activate handler deletes every cache whose key is not
   VERSION, so changing this string is what evicts a stale cache from a device
   that already has one. It had sat on v2 across every deploy, which meant the
   eviction branch never once fired in production. */
const VERSION = 'wecycle-v3';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        /* swallow — initial pre-cache is best-effort */
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  /* Skip non-GET requests */
  if (request.method !== 'GET') return;

  /* Skip cross-origin requests (don't cache other domains) */
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Skip Next.js HMR + dev endpoints */
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;
  if (url.pathname.startsWith('/__nextjs')) return;

  /* HTML navigation requests: network-first, fall back to cache */
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /* Cache a fresh copy of the homepage */
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  /* Next's build output is content-hashed and already served immutable, so the
     browser's own HTTP cache handles it correctly and for free. This used to
     intercept it anyway with stale-while-revalidate — `cached || fetchPromise`
     hands back the stored copy and refreshes in the background — which buys
     nothing on a filename that changes whenever its contents do, and quietly
     stakes the correctness of every deploy on that being true. Combined with a
     VERSION constant that never moved (so nothing was ever evicted), this was
     the one place a device could keep serving code from a build we had already
     replaced. Leave it to HTTP. */
  if (url.pathname.startsWith('/_next/')) return;

  /* What is left is the small, stable shell — icons and the manifest — where
     cache-first is genuinely what we want, because it is what makes the app
     open at all offline. Anything not pre-cached falls through to the network
     untouched rather than being opportunistically stored. */
  const isShell = APP_SHELL.includes(url.pathname);
  if (!isShell) return;

  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
    )
  );
});

/* ──────────────────────────────────────────────────────────────────────────
   WEB PUSH
   Receives encrypted pushes from the Wecycle Edge Function and renders a
   native notification. Tapping it focuses an existing tab (deep-linking to
   the relevant screen) or opens a new one. Works in installed PWA + the
   Android TWA (Chrome forwards these to the system notification tray).
   ────────────────────────────────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_e) { payload = {}; }

  const title = payload.title || 'Wecycle';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || undefined,         /* collapse duplicates */
    renotify: !!payload.tag,
    data: { url: payload.url || '/', ...(payload.data || {}) },
    vibrate: [60, 30, 60],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      /* Reuse an open Wecycle tab — focus it and tell the app where to go. */
      if ('focus' in client) {
        await client.focus();
        if ('postMessage' in client) client.postMessage({ type: 'wecycle:navigate', url: target });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
