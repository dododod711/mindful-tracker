// Lumen — service worker. Precaches the app shell so the whole thing works
// offline and installs as a PWA. Cross-origin requests (e.g. the MediaPipe CDN
// used on the Stargaze page) are left to the network so they still load online
// and simply fall back when offline.

// Bump this on every meaningful release. The activate handler wipes older
// caches, and the network-first fetch handler (below) means returning users
// get fresh files while online and still fall back to this cache offline.
const CACHE = "mindful-v21";
const ASSETS = [
  "./",
  "index.html",
  "today.html",
  "insights.html",
  "galaxy.html",
  "friends.html",
  "styles.css",
  "galaxy.css",
  "icon.svg",
  "app.js",
  "ui.js",
  "galaxy.js",
  "handtracking.js",
  "iridescence.js",
  "tour.js",
  "scrollstack.js",
  "borderglow.js",
  "config.js",
  "friends.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let the CDN go straight to network

  // Network-first so a new deploy reaches returning users right away; refresh
  // the cache on every successful fetch, and fall back to it (then the app
  // shell) when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("index.html"))
      )
  );
});
