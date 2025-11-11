/* static/service-worker.js */
/* Robust service worker for Collecte Mobile (version stable) */

const CACHE_NAME = 'collecte-shell-v3';
const RUNTIME = 'collecte-runtime-v1';
const MAX_RUNTIME_ENTRIES = 100;
const NAV_TIMEOUT = 4000; // ms

const PRECACHE_URLS = [
  '/', 
  '/index.html',
  '/static/offline.html',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/manifest.json'
];

async function safePrecache(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
      if (res && (res.ok || res.type === 'opaque')) {
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
    const obsolete = keys.filter(key => key !== CACHE_NAME && key !== RUNTIME);
    await Promise.all(obsolete.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Do not handle non-GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-first for API endpoints (cache on success)
  if (isApiRequest(url)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          try {
            const copy = res.clone();
            const cache = await caches.open(RUNTIME);
            await cache.put(req, copy);
            trimCache(RUNTIME, MAX_RUNTIME_ENTRIES); // don't await blocking
          } catch (e) { /* ignore cache put errors */ }
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

  // Navigation requests -> network-first with timeout, fallback to cached shell, then offline page
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const networkPromise = (async () => {
        try {
          const resp = await fetch(req);
          return resp;
        } catch (e) {
          throw e;
        }
      })();

      // race network vs timeout
      try {
        const resp = await Promise.race([
          networkPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('nav-timeout')), NAV_TIMEOUT))
        ]);
        return resp;
      } catch (e) {
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
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          try {
            const cache = await caches.open(RUNTIME);
            await cache.put(req, res.clone());
            trimCache(RUNTIME, MAX_RUNTIME_ENTRIES);
          } catch (e) { /* ignore */ }
        }
        return res;
      } catch (e) {
        // fallback for images -> placeholder
        if (req.destination === 'image') {
          const placeholder = await caches.match('/static/icons/icon-192.png');
          if (placeholder) return placeholder;
        }
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

