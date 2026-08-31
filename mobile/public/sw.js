// __BUILD_ID__ is rewritten to a fresh value on every export by
// scripts/patch-html.mjs, so each deploy gets its own cache name and the
// activate handler below evicts the previous one. Without that rewrite the
// name would be constant, eviction would never fire, and every superseded
// bundle would accumulate on the user's device forever.
const CACHE_VERSION = '__BUILD_ID__';
const CACHE_NAME = `sapako-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Take over as soon as possible rather than waiting for every tab holding
  // the previous worker to close — in a standalone PWA there is usually only
  // one, and waiting just delays updates.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Only ever touch our own origin. API calls to the Railway backend must
  // reach the network untouched — caching them is explicitly out of scope
  // (spec §9), and intercepting them would break auth error handling.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Content-hashed bundle output: the filename changes whenever the content
  // changes, so a cached copy can never be stale. Safe to serve cache-first.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Everything else — the app shell and the manifest — is network-first, so
  // a new deploy is picked up on the next launch. The cache is only a
  // fallback for when the network is unavailable.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Cached under the URL actually navigated to (e.g. /login), not
        // /index.html — the SPA rewrite happens server-side, so the worker
        // never sees that path. A deep link never visited online therefore
        // has no cached entry and fails here, which is the accepted
        // behaviour: offline support is out of scope (spec section 9).
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        throw error;
      }
    })(),
  );
});
