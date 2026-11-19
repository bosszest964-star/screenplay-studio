const cachePrefix = "sceneform-shell-";
const cacheName = cachePrefix + "__CACHE_VERSION__";
const precacheUrls = "__PRECACHE_URLS__";
const assetPaths = new Set(precacheUrls);
const navigationPaths = new Map([
  ["/", "/"],
  ["/index.html", "/"],
  ["/editor", "/editor/"],
  ["/editor/", "/editor/"],
  ["/editor/index.html", "/editor/"],
  ["/production", "/production/"],
  ["/production/", "/production/"],
  ["/production/index.html", "/production/"],
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      cache.addAll(precacheUrls.map((url) => new Request(url, { cache: "reload" }))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const page = request.mode === "navigate" && navigationPaths.get(url.pathname);
  if (!page && !assetPaths.has(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(page || url.pathname);
    return cached ?? fetch(request);
  })());
});
