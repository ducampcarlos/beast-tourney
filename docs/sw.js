// Offline support. The build writes precache.json: every file of the site and a version that changes
// whenever any of them does. Installing downloads them all once; after that the game runs without a
// connection, and a new version replaces the old cache as soon as it is deployed.

const PREFIX = "beast-tourney-";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const meta = await (await fetch("precache.json", { cache: "no-store" })).json();
      const cache = await caches.open(PREFIX + meta.version);
      await cache.addAll(meta.files.map((f) => new Request(f, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const meta = await (await fetch("precache.json", { cache: "no-store" })).json().catch(() => null);
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && (!meta || key !== PREFIX + meta.version)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        // offline and not cached: the page itself is the only thing worth falling back to
        if (request.mode === "navigate") return (await caches.match("index.html")) ?? Response.error();
        return Response.error();
      }
    })(),
  );
});
