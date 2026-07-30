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
      // The sentence bank gets its own tolerant call. It's optional, and a 404
      // inside the addAll above would reject the whole batch and lose the packs
      // with it.
      await cache.add(new URL('content/sentences.json', scope).pathname).catch(() => {});
      // Pictogram photos, likewise tolerant: they're optional, and a card
      // without one falls back to its emoji.
      try {
        const credits = await fetch(new URL('photos/credits.json', scope)).then((r) => r.json());
        await Promise.all(
          Object.keys(credits.photos || {}).map((slug) =>
            cache.add(new URL(`photos/${slug}.webp`, scope).pathname).catch(() => {})
          )
        );
      } catch {
        // No photo set shipped — nothing to precache.
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

  // Photos are cache-first and live in SHELL alongside the content they belong
  // to. Their names aren't content-hashed, so they can't go in the ASSETS cache
  // that assumes a name never changes meaning — but they only change when the
  // photo workflow runs, which bumps the shell anyway.
  if (url.pathname.includes('/photos/')) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (/\.(js|css|png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
