// AK Solar service worker
// Strategy:
// - App shell (static Next.js assets, icons, manifest) -> cache-first for speed offline.
// - Page navigations -> network-first (data must be fresh: stock/prices/invoices), falling back
//   to a cached copy if present, then to the offline page if nothing is available at all.
// - Supabase/API/auth requests are NEVER cached -> always go to the network untouched.
const VERSION = "v1";
const SHELL_CACHE = `aksolar-shell-${VERSION}`;
const PAGES_CACHE = `aksolar-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// Never touch Supabase, other cross-origin API calls, or Next.js server actions / API routes.
function isNoCacheRequest(request, url) {
  if (!isSameOrigin(url)) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (request.method !== "GET") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isNoCacheRequest(request, url)) {
    return; // let the browser handle it normally, no SW interception
  }

  // Page navigations: network-first, cache as a fallback, offline page as last resort.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Static Next.js build assets (JS/CSS/fonts/images): cache-first, refresh in background.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else same-origin GET: network-first, fall back to cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
