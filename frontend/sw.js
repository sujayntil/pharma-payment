// Minimal service worker. Its only real job is to satisfy the browser's
// "installable PWA" checklist (which requires a registered service worker
// with a fetch handler) -- it deliberately does NOT cache API responses,
// since this app's data changes constantly and stale cached data would be
// actively wrong.
//
// The app shell (HTML/CSS/JS/icons) uses a NETWORK-FIRST strategy: always
// try to fetch the latest version first, and only fall back to whatever's
// cached if the network is genuinely unreachable (e.g. actually offline).
// An earlier version of this file used cache-first, which could get a
// browser permanently stuck showing an old version of the app after a
// deploy, even on a hard refresh -- this fixes that class of bug.

const CACHE_NAME = "pharma-app-shell-v2"; // bumped to invalidate the old cache-first version
const SHELL_FILES = [
  "index.html",
  "mr.html",
  "admin.html",
  "css/style.css",
  "js/api.js",
  "js/mr.js",
  "js/admin.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // don't wait for old tabs to close before taking over
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      self.clients.claim(), // take control of already-open tabs immediately
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
