// Offline cache for Parcours B2.
//
// Strategy:
//   - navigations: network first, fall back to the cached shell when offline
//   - content JSON: network first, cache the fresh copy, fall back to cache
//     (so a newly added pack is picked up as soon as you're online)
//   - hashed build assets: cache first, they never change under the same name

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

const scope = new URL(self.registration.scope);
const shellUrl = new URL('index.html', scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Content packs are precached so the very first offline launch still has
      // a challenge to serve.
      const urls = [shellUrl, new URL('content/index.json', scope).pathname];
      await cache.addAll(urls).catch(() => {});
      try {
        const idx = await fetch(new URL('content/index.json', scope)).then((r) => r.json());
        await cache.addAll((idx.packs || []).map((p) => new URL(`content/${p}`, scope).pathname));
      } catch {
        // First load offline — nothing to precache yet.
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL).catch(async () => {
        const cache = await caches.open(SHELL);
        return (await cache.match(shellUrl)) || Response.error();
      })
    );
    return;
  }

  if (url.pathname.includes('/content/')) {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }

  if (/\.(js|css|png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
