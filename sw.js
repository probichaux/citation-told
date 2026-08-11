/* Offline cache for the pinned home-screen app.
 *
 * Everything here is a small, static, versioned asset, so the strategy is
 * simple: precache on install, serve cache-first, and drop old caches on
 * activate. CACHE_VERSION tracks the version label in index.html and must stay
 * in sync with it, or a pinned app keeps serving the old build. Don't edit it by
 * hand -- run scripts/bump-version.sh, which updates both files together. */
const CACHE_VERSION = 'told-v1.1.0';
/* './' is the canonical entry -- deliberately no 'index.html' entry. Pages
 * 308-redirects /index.html to /, so precaching it would store a response with
 * redirected=true, which browsers refuse to serve for a navigation request. */
const ASSETS = [
  './',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Never touch /api/ -- those are live weather observations. This cache is
   * cache-first, so caching them would serve an old altimeter setting and
   * temperature as though they were current. Let the network answer, and let it
   * fail honestly when there is no connectivity. */
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // Never store a redirected response: serving one for a later
          // navigation is a network error, not a cache hit.
          if (res && res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./') : Response.error()));
    })
  );
});
