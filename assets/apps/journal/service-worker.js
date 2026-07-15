const CACHE_VERSION = "20260519TradingWorkspaceAI1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("trading-library-manager-")).map((key) => caches.delete(key)));
    }
    await self.registration.unregister();
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clientsList.forEach((client) => client.navigate(client.url));
  })());
});

self.addEventListener("fetch", () => {});
