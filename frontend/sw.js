// Minimal service worker. Its only real job is to satisfy the browser's
// "installable PWA" checklist (which requires a registered service worker
// with a fetch handler) -- it deliberately does NOT cache API responses,
// since this app's data changes constantly and stale cached data would be
// actively wrong. It only caches the static app shell (HTML/CSS/JS/icons),
// and only for same-origin requests; anything going to the backend API
// (a different origin) passes straight through to the network untouched.

const CACHE_NAME = "pharma-app-shell-v1";
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for the static shell; let
  // everything else (API calls, other origins) go straight to the network.
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
