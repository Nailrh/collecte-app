/* static/service-worker.js
   Robust service worker for Collecte Mobile
   - Precaches a minimal shell and icons
   - Runtime caching for static assets (CSS/JS/images/fonts)
   - Network-first for API with cache fallback
   - Offline navigation fallback to /static/offline.html
   - Safe precache (no credentials) and graceful error logging
*/

const CACHE_NAME = 'collecte-shell-v3';
const RUNTIME = 'collecte-runtime-v1';
const MAX_RUNTIME_ENTRIES = 100; // trim runtime cache to avoid unbounded growth

const PRECACHE_URLS = [
  '/',                       // ensure your root returns the app shell
  '/static/offline.html',    // offline fallback page (create this)
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

async function safePrecache(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async url => {
    try {
      const res = await fetch(url);
      if (res && res.ok) await cache.put(url, res.clone());
      else console.warn('Precache skipped (not ok):', url, res && res.status);
    } catch (e) {
      console.warn('Precache failed for', url, e);
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
    console.warn('trimCache error', e);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await safePrecache(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key !== CACHE_NAME && key !== RUNTIME) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
}

self.addEventListener('fetch', event => {
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

  // Navigation requests -> serve shell from cache, fallback to network, then offline page
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cachedShell = await caches.match('/');
      if (cachedShell) return cachedShell;
      try {
        return await fetch(req);
      } catch (e) {
        const offline = await caches.match('/static/offline.html');
        return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
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

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'SYNC_OUTBOX') {
    // Client requests SW to trigger an outbox sync flow.
    // SW can postMessage clients back to confirm; actual network sync is handled in the page.
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'SYNC_OUTBOX_REQUEST' });
      }
    })();
  }
});
