/* Amy FX PWA service worker */
'use strict';

const VERSION = '2026.07.21.2';
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
  appUrl('pwa-push-test.js'),
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
  event.waitUntil((async () => {
    await precacheIndividually();
    await self.skipWaiting();
  })());
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

async function withPwaScripts(response, request) {
  if (!response || !response.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  try {
    const url = new URL(request.url);
    const html = await response.clone().text();
    const scripts = [];

    if (!isRootNavigation(url) && !html.includes('pwa-navigation.js')) {
      scripts.push(`<script src="${appUrl('pwa-navigation.js')}"></script>`);
    }
    if (!html.includes('pwa-push-test.js')) {
      scripts.push(`<script src="${appUrl('pwa-push-test.js')}"></script>`);
    }
    if (!scripts.length) return response;

    const injection = scripts.join('');
    const body = html.includes('</body>')
      ? html.replace('</body>', `${injection}</body>`)
      : `${html}${injection}`;
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
  return withPwaScripts(response, request);
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

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (_) {
    try { return { body: event.data.text() }; } catch (_) { return {}; }
  }
}

async function notifyOpenClients(detail) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(windows.map(client => client.postMessage({
    type: 'AMYFX_PUSH_RECEIVED',
    detail
  })));
}

async function setUnreadBadge() {
  try {
    if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
      await self.navigator.setAppBadge();
    }
  } catch (error) {
    console.warn('Amy FX badge gagal diperbarui', error);
  }
}

async function clearUnreadBadge() {
  try {
    if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
      await self.navigator.clearAppBadge();
    }
  } catch (_) {}
}

async function displayPushNotification(payload) {
  const title = payload.title || payload.notification?.title || 'Amy FX';
  const body = payload.body || payload.notification?.body || payload.text || 'Informasi baru tersedia.';
  const targetUrl = new URL(
    payload.target_url || payload.url || payload.data?.url || 'assets/apps/market-intel/index.html',
    BASE_URL
  ).href;
  const newsId = String(payload.news_id || payload.id || '');
  const tag = payload.tag || (newsId ? `amyfx-news-${newsId}` : `amyfx-update-${Date.now()}`);
  const data = {
    url: targetUrl,
    newsId,
    source: payload.source || '',
    type: payload.type || 'news'
  };

  const options = {
    body,
    icon: appUrl('icons/amy-fx-192.png'),
    badge: appUrl('icons/amy-fx-192.png'),
    tag,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data
  };

  let fallback = false;
  try {
    await self.registration.showNotification(title, options);
  } catch (error) {
    fallback = true;
    console.error('Amy FX notification options fallback', error);
    await self.registration.showNotification(title, { body, tag, data });
  }

  await Promise.allSettled([
    setUnreadBadge(),
    notifyOpenClients({
      received: true,
      displayed: true,
      fallback,
      type: data.type,
      newsId,
      tag,
      receivedAt: Date.now()
    })
  ]);
}

self.addEventListener('push', event => {
  const payload = readPushPayload(event);
  event.waitUntil(displayPushNotification(payload));
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map(client => client.postMessage({ type: 'AMYFX_PUSH_SUBSCRIPTION_CHANGED' })));
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', BASE_URL).href;

  event.waitUntil((async () => {
    await clearUnreadBadge();
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
