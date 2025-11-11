// static/service-worker.js
// Robust service worker for Collecte Mobile
// - Precaches shell and offline page (fetch credentials: 'omit')
// - Runtime caching for assets
// - Network-first for API with cache fallback
// - Navigation: network-first, fallback to cached shell, then offline.html
// - Exposes messages SKIP_WAITING and SYNC_OUTBOX_REQUEST

const CACHE_NAME = 'collecte-shell-v3';
const RUNTIME = 'collecte-runtime-v1';
const MAX_RUNTIME_ENTRIES = 100;

const PRECACHE_URLS = [
  '/',                      // app shell entry (ensure server serves index.html at '/')
  '/index.html',            // explicit index if your server uses it
  '/static/offline.html',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

async function safePrecache(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
      if (res && res.ok) {
        await cache.put(url, res.clone());
        console.log('[SW] precached:', url);
      } else {
        console.warn('[SW] precache skipped (not ok):', url, res && res.status);
      }
    } catch (err) {
      console.warn('[SW] precache failed for', url, err);
    }
  }));
}

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;
    const deleteCount = keys.length - maxItems;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  } catch (e) {
    console.warn('[SW] trimCache error', e);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await safePrecache(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key !== CACHE_NAME && key !== RUNTIME) return caches.delete(key);
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first for API endpoints (cache on success)
  if (isApiRequest(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          const cache = await caches.open(RUNTIME);
          await cache.put(req, copy);
          await trimCache(RUNTIME, MAX_RUNTIME_ENTRIES);
        }
        return res;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // Navigation requests -> network-first, fallback to cached shell, then offline page
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Try network first to get latest app shell or route HTML
        const networkResponse = await fetch(req);
        return networkResponse;
      } catch (e) {
        // If network fails, try cached shell variants, then offline.html
        const cachedRoot = await caches.match('/');
        if (cachedRoot) return cachedRoot;
        const cachedIndex = await caches.match('/index.html');
        if (cachedIndex) return cachedIndex;
        const offline = await caches.match('/static/offline.html');
        if (offline) return offline;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Static assets: cache-first then network (and cache runtime)
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' || req.destination === 'font') {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(RUNTIME);
          await cache.put(req, res.clone());
          await trimCache(RUNTIME, MAX_RUNTIME_ENTRIES);
        }
        return res;
      } catch (e) {
        // If asset fails, optionally return offline.html for images/fonts or empty response
        const fallback = await caches.match('/static/offline.html');
        return fallback || new Response('', { status: 503 });
      }
    })());
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (e) {
      return await caches.match(req);
    }
  })());
});

// Message handler (skip waiting and outbox sync trigger)
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'SYNC_OUTBOX') {
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'SYNC_OUTBOX_REQUEST' });
      }
    })();
  }
});

