// Offline support. The app files are cached so it opens with no signal;
// covers and fonts are cached as you see them. TMDB API calls always go to the network.
const VERSION = 'nice-list-v1';
const SHELL = ['./', 'index.html', 'css/styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/tmdb.js', 'js/ui.js', 'js/list.js', 'js/spin.js', 'js/discover.js', 'js/more.js', 'js/detail.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.themoviedb.org') return;            // never cache API calls
  const cacheable = url.origin === location.origin || ['image.tmdb.org', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!cacheable) return;
  // Stale-while-revalidate: instant from cache, refreshed in the background for next time.
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: false });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
