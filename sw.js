// Service worker: offline support for the app shell.
// Strategy: network-first with cache fallback for same-origin requests,
// so deploys propagate immediately and the app still works offline.
// The Google Sheet data is cross-origin and handled separately
// (localStorage cache in index.html).
const CACHE = "gage-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./assets/SF-cum.mp3",
  "./manifest.json",
  "./assets/fonts/onest-latin.woff2",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
