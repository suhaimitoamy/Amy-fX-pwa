import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, content) {
  fs.writeFileSync(path.join(root, relative), content);
}

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`[live-price-stream-guard] missing ${label}`);
  return content.replace(before, after);
}

let worker = read('service-worker.js');
worker = replaceOnce(
  worker,
  "  if (isDataRequest(url)) {\n    event.respondWith(networkFirst(request, DATA_CACHE, 10000).catch(() => fetch(request)));\n    return;\n  }",
  "  // Streaming live prices must never be cached or wrapped in the 10-second data timeout.\n  if (url.hostname.includes('supabase.co') && url.pathname.endsWith('/functions/v1/pwa-live-price')) {\n    event.respondWith(fetch(request));\n    return;\n  }\n\n  if (isDataRequest(url)) {\n    event.respondWith(networkFirst(request, DATA_CACHE, 10000).catch(() => fetch(request)));\n    return;\n  }",
  'service-worker data request block'
);
write('service-worker.js', worker);

let validatePwa = read('scripts/validate-pwa.mjs');
validatePwa = replaceOnce(
  validatePwa,
  "  'pwa-bootstrap.js',\n  'pwa-navigation.js',",
  "  'pwa-bootstrap.js',\n  'pwa-live-price-bridge.js',\n  'pwa-navigation.js',",
  'PWA required live bridge entry'
);
validatePwa = replaceOnce(
  validatePwa,
  "if (!String(config.apiBaseUrl || '').startsWith('https://')) fail('apiBaseUrl must use HTTPS');\nif (config.webPushEnabled !== true)",
  "if (!String(config.apiBaseUrl || '').startsWith('https://')) fail('apiBaseUrl must use HTTPS');\nif (!String(config.livePriceStreamEndpoint || '').startsWith('https://')) fail('livePriceStreamEndpoint must use HTTPS');\nif (!String(config.livePriceStreamEndpoint || '').includes('/functions/v1/pwa-live-price')) fail('livePriceStreamEndpoint must use the Amy FX WebSocket edge stream');\nif (config.webPushEnabled !== true)",
  'PWA live stream config validation'
);
validatePwa = replaceOnce(
  validatePwa,
  "const pushTest = read('pwa-push-test.js');",
  "const livePriceBridge = read('pwa-live-price-bridge.js');\nfor (const marker of [\n  'pwa-live-price',\n  \"Accept: 'text/event-stream'\",\n  'Authorization: `Bearer ${session.access_token}`',\n  'response.body.getReader()',\n  'TWELVE_DATA_WEBSOCKET_EDGE',\n  'amyfx:twelvedata-price'\n]) {\n  if (!livePriceBridge.includes(marker)) fail(`PWA live-price bridge missing marker: ${marker}`);\n}\nif (livePriceBridge.includes('/api/twelvedata')) fail('PWA live price must not poll the Twelve Data REST candle endpoint');\nif (livePriceBridge.includes('setInterval(poll')) fail('PWA live price must not use legacy REST polling');\n\nconst pushTest = read('pwa-push-test.js');",
  'PWA live bridge validation block'
);
validatePwa = replaceOnce(
  validatePwa,
  "if (!worker.includes('pwa-push-test.js')) fail('service worker does not load the Web Push verification UI');",
  "if (!worker.includes('pwa-push-test.js')) fail('service worker does not load the Web Push verification UI');\nif (!worker.includes(\"url.pathname.endsWith('/functions/v1/pwa-live-price')\")) fail('service worker does not bypass the live price stream');\nif (!worker.includes('event.respondWith(fetch(request))')) fail('service worker must pass the live price stream directly to network');",
  'service-worker live stream validation'
);
validatePwa = replaceOnce(
  validatePwa,
  "  'pwa-bootstrap.js',\n  'pwa-navigation.js',\n  'pwa-push-test.js',",
  "  'pwa-bootstrap.js',\n  'pwa-live-price-bridge.js',\n  'pwa-navigation.js',\n  'pwa-push-test.js',",
  'PWA JavaScript syntax list'
);
write('scripts/validate-pwa.mjs', validatePwa);

let validateSync = read('scripts/validate-amyfx-sync.mjs');
validateSync = replaceOnce(
  validateSync,
  "for (const marker of [\n  'window.AmyLivePrice',\n  'amyfx:twelvedata-price',\n  'amyfx:twelvedata-status',\n  '/api/twelvedata',\n  'hasApiKey'\n]) {\n  if (!bridge.includes(marker)) fail(`PWA live-price bridge missing ${marker}`);\n}",
  "for (const marker of [\n  'window.AmyLivePrice',\n  'amyfx:twelvedata-price',\n  'amyfx:twelvedata-status',\n  'pwa-live-price',\n  \"Accept: 'text/event-stream'\",\n  'Authorization: `Bearer ${session.access_token}`',\n  'response.body.getReader()',\n  'TWELVE_DATA_WEBSOCKET_EDGE',\n  'hasApiKey'\n]) {\n  if (!bridge.includes(marker)) fail(`PWA live-price bridge missing ${marker}`);\n}\nif (bridge.includes('/api/twelvedata')) fail('PWA live price must not use REST candle polling');\nif (bridge.includes('setInterval(poll')) fail('PWA live price must not retain the legacy polling timer');",
  'synchronized live bridge markers'
);
write('scripts/validate-amyfx-sync.mjs', validateSync);

console.log('Amy FX PWA live WebSocket stream guard applied.');
