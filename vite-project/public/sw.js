// Pharma Sales & Collection - Progressive Web App Service Worker
const CACHE_NAME = 'pharma-pwa-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.svg',
];

// Install Event: cache minimal app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => console.warn('PWA Precache failed:', err))
  );
});

// Activate Event: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Network-first for HTML navigation & static assets, ignore API routes
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests from the same origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Do not intercept API requests or uploads
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth') || url.pathname.startsWith('/uploads')) {
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Cache valid responses for static assets and page navigations
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback to cache if network fails (offline)
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If request is navigation, return cached root / index.html
        if (request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }

        return new Response('Network error occurred and no cached content available', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      })
  );
});
