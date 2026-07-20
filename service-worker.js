/* Amy FX PWA service worker */
'use strict';

const VERSION = '2026.07.20.3';
const SHELL_CACHE = `amyfx-pwa-shell-${VERSION}`;
const STATIC_CACHE = `amyfx-pwa-static-${VERSION}`;
const DATA_CACHE = `amyfx-pwa-data-${VERSION}`;
const CACHE_PREFIX = 'amyfx-pwa-';
const BASE_URL = new URL('./', self.location.href);
const BASE_PATH = BASE_URL.pathname.endsWith('/') ? BASE_URL.pathname : `${BASE_URL.pathname}/`;
const appUrl = path => new URL(path, BASE_URL).href;

const SHELL = [
  appUrl('./'),
  appUrl('index.html'),
  appUrl('offline.html'),
  appUrl('manifest.webmanifest'),
  appUrl('pwa-config.json'),
  appUrl('platform-adapter.js'),
  appUrl('member-auth.js'),
  appUrl('pwa-bootstrap.js'),
  appUrl('pwa-navigation.js'),
  appUrl('icons/amy-fx.svg'),
  appUrl('icons/amy-fx-maskable.svg'),
  appUrl('icons/amy-fx-180.png'),
  appUrl('icons/amy-fx-192.png'),
  appUrl('icons/amy-fx-512.png'),
  appUrl('assets/styles.css'),
  appUrl('assets/app.js'),
  appUrl('assets/apps/mapping/index.html'),
  appUrl('assets/apps/market-intel/index.html'),
  appUrl('assets/apps/journal/index.html'),
  appUrl('assets/apps/academy/index.html'),
  appUrl('assets/apps/shared/market-intelligence.css'),
  appUrl('assets/apps/shared/market-intelligence.js')
];

async function precacheIndividually() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(SHELL.map(async (url) => {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheIndividually());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, STATIC_CACHE, DATA_CACHE].includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(request, url) {
  if (request.destination && ['style', 'script', 'image', 'font', 'worker'].includes(request.destination)) return true;
  return /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|json|txt|pine)$/i.test(url.pathname);
}

function isDataRequest(url) {
  return url.pathname.includes('/api/') ||
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
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request).then(response => {
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);
  return cached || update || fetch(request);
}

function isRootNavigation(url) {
  const path = url.pathname.replace(/index\.html$/, '');
  return path === BASE_PATH || path === BASE_PATH.replace(/\/$/, '');
}

async function withDashboardNavigation(response, request) {
  if (!response || !response.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const url = new URL(request.url);
  if (isRootNavigation(url)) return response;

  try {
    const html = await response.clone().text();
    if (html.includes('pwa-navigation.js')) return response;

    const script = `<script src="${appUrl('pwa-navigation.js')}"></script>`;
    const body = html.includes('</body>')
      ? html.replace('</body>', `${script}</body>`)
      : `${html}${script}`;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (_) {
    return response;
  }
}

async function handleNavigation(request) {
  let response;
  try {
    response = await networkFirst(request, SHELL_CACHE, 6500);
  } catch (_) {
    const cache = await caches.open(SHELL_CACHE);
    response = (await cache.match(request)) ||
      (await cache.match(appUrl('index.html'))) ||
      (await cache.match(appUrl('offline.html')));
  }
  return withDashboardNavigation(response, request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH)) {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE, 10000).catch(() => fetch(request)));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH) && isStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || payload.notification?.title || 'Amy FX';
  const body = payload.body || payload.notification?.body || payload.text || 'Informasi baru tersedia.';
  const targetUrl = new URL(
    payload.target_url || payload.url || payload.data?.url || 'assets/apps/market-intel/index.html',
    BASE_URL
  ).href;
  const newsId = String(payload.news_id || payload.id || '');
  const tag = newsId ? `amyfx-news-${newsId}` : (payload.tag || 'amyfx-update');
  const highImpact = String(payload.impact || '').toLowerCase() === 'high';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: appUrl('icons/amy-fx-192.png'),
    badge: appUrl('icons/amy-fx-192.png'),
    tag,
    renotify: false,
    requireInteraction: highImpact,
    timestamp: Date.now(),
    data: {
      url: targetUrl,
      newsId,
      source: payload.source || ''
    },
    actions: [{ action: 'open', title: 'Buka Amy FX' }]
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', BASE_URL).href;

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
