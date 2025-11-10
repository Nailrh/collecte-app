/* static/service-worker.js */
const CACHE_NAME = 'collecte-shell-v3';
const RUNTIME = 'collecte-runtime-v1';

const PRECACHE_URLS = [
  '/', // root (assure-toi que ton server sert bien l'index HTML à /)
  '/static/css/styles.css',
  '/static/css/styled.css',
  '/static/js/indexeddb.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME && key !== RUNTIME) return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first for API endpoints (to keep sync fresh)
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(cached => cached || new Response('', { status: 503 })))
    );
    return;
  }

  // Navigation requests -> serve shell from cache first, fallback to network then to cache root
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then(cached => cached || fetch(req).catch(() => caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first then update runtime cache
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' || req.destination === 'font') {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        caches.open(RUNTIME).then(cache => cache.put(req, resp.clone()));
        return resp;
      }).catch(() => cached || new Response('', { status: 503 })))
    );
    return;
  }

  // Default fallback to network then cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') return self.skipWaiting();
  if (event.data.type === 'SYNC_OUTBOX') {
    // client can request a manual attempt to sync outbox (implementation app-side)
  }
});