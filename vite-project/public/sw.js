// Bump when this file changes so installed apps pick up the new worker.
const CACHE_NAME = 'pharma-app-shell-v4';
const SHELL_FILES = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pharma-app-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return (await caches.match('/')) || (await caches.match('/index.html'));
        return Response.error();
      })
  );
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || '' };
  }

  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'Payment received', {
      body: data.body || 'An MR recorded a payment.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'payment',
      data: { url: data.url || '/#/admin' },
    }),
    // App already open: let the bell show the new collection straight away.
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => windows.forEach((client) => client.postMessage({ type: 'payment' }))),
  ]));
});

// Tapping an alert opens its invoice: "/#/admin/invoices?invoice=12".
// Older alerts pointed at "admin.html", which now means the Dashboard.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || '/#/admin';
  const target = /(^|\/)admin\.html(?:$|[?#])/.test(requestedUrl)
    ? new URL('/#/admin', self.location.origin)
    : new URL(requestedUrl, self.location.origin);
  const path = target.hash ? target.hash.slice(1) : '/admin';

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      // App already open: switch screens inside it (keeps the session and
      // avoids a full reload), then bring it to the front.
      existing.postMessage({ type: 'open', path });
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
