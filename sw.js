/* Offline cache for the pinned home-screen app.
 *
 * Precache on install and drop old caches on activate. Static assets are served
 * cache-first -- they are versioned, so there is nothing stale to serve. The
 * document is served network-first, falling back to the cache only when there is
 * no connectivity, so an online device never renders a superseded build.
 * CACHE_VERSION tracks the version label in index.html and must stay
 * in sync with it, or a pinned app keeps serving the old build. Don't edit it by
 * hand -- run scripts/bump-version.sh, which updates both files together. */
const CACHE_VERSION = 'told-v1.2.0';
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

  /* The document itself is network-first. Cache-first was wrong for it: after a
   * deploy an already-installed device kept rendering the previous build until
   * it was loaded a second time, so a pilot could read stale numbers while
   * believing they were current. Online, the page is always the live one;
   * offline, it falls back to the cached copy, which is what the cache is for.
   *
   * Static assets below stay cache-first -- they are versioned by CACHE_VERSION
   * and a new build precaches its own, so there is nothing stale to serve. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone();
            // Store under the canonical entry, so the offline fallback finds it
            // whatever URL the navigation used.
            caches.open(CACHE_VERSION).then((cache) => cache.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error()))
    );
    return;
  }

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
        .catch(() => Response.error());
    })
  );
});
