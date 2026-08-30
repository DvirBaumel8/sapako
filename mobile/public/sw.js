// Cache name is bumped on every deploy by the build (see CACHE_VERSION).
// Anything cached under an older name is deleted on activate.
const CACHE_VERSION = 'v1';
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
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        // SPA navigation with no cached copy of that exact URL: fall back to
        // the shell, which is what the server's SPA rewrite would have done.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) {
            return shell;
          }
        }
        throw error;
      }
    })(),
  );
});
