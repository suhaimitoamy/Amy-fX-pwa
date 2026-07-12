/* Amy FX PWA service worker */
'use strict';

const VERSION = '2026.07.12.1';
const SHELL_CACHE = `amyfx-pwa-shell-${VERSION}`;
const STATIC_CACHE = `amyfx-pwa-static-${VERSION}`;
const DATA_CACHE = `amyfx-pwa-data-${VERSION}`;
const CACHE_PREFIX = 'amyfx-pwa-';

const SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/platform-adapter.js',
  '/pwa-bootstrap.js',
  '/icons/amy-fx.svg',
  '/icons/amy-fx-maskable.svg',
  '/app/src/main/assets/styles.css',
  '/app/src/main/assets/app.js',
  '/app/src/main/assets/apps/mapping/index.html',
  '/app/src/main/assets/apps/market-intel/index.html',
  '/app/src/main/assets/apps/journal/index.html',
  '/app/src/main/assets/apps/academy/index.html',
  '/app/src/main/assets/apps/shared/market-intelligence.css',
  '/app/src/main/assets/apps/shared/market-intelligence.js'
];

async function precacheIndividually() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(SHELL.map(async (url) => {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheIndividually());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, STATIC_CACHE, DATA_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(request, url) {
  if (request.destination && ['style', 'script', 'image', 'font', 'worker'].includes(request.destination)) return true;
  return /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|json|txt|pine)$/i.test(url.pathname);
}

function isDataRequest(url) {
  return url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('twelvedata.com') ||
    url.pathname.includes('/functions/v1/');
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  } finally {
    clearTimeout(timer);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then((response) => {
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);
  return cached || update || fetch(request);
}

async function handleNavigation(request) {
  try {
    return await networkFirst(request, SHELL_CACHE, 6500);
  } catch (_) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(request)) || (await cache.match('/')) || (await cache.match('/offline.html'));
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE, 10000).catch(() => fetch(request)));
    return;
  }

  if (url.origin === self.location.origin && isStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || payload.notification?.title || 'Amy FX';
  const body = payload.body || payload.notification?.body || payload.text || 'Informasi baru tersedia.';
  const targetUrl = payload.target_url || payload.url || payload.data?.url || '/app/src/main/assets/apps/market-intel/index.html';
  const tag = payload.news_id ? `amyfx-news-${payload.news_id}` : (payload.tag || 'amyfx-update');

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/amy-fx.svg',
    badge: '/icons/amy-fx.svg',
    tag,
    renotify: false,
    data: { url: targetUrl },
    actions: [{ action: 'open', title: 'Buka Amy FX' }]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return null;
  })());
});
