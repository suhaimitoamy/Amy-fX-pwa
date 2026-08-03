import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'pwa-config.json',
  'platform-adapter.js',
  'member-auth.js',
  'pwa-bootstrap.js',
  'pwa-live-price-bridge.js',
  'pwa-update-bridge.js',
  'pwa-navigation.js',
  'pwa-push-test.js',
  'offline.html',
  'icons/amy-fx-180.png',
  'icons/amy-fx-192.png',
  'icons/amy-fx-512.png',
  'vercel.json',
  'assets/styles.css',
  'assets/app.js',
  'assets/apps/mapping/index.html',
  'assets/apps/mapping/js/api-request-coordinator.js',
  'assets/apps/mapping/js/mapping-runtime-repair-v3.js',
  'assets/apps/market-intel/index.html',
  'assets/apps/journal/index.html',
  'assets/apps/journal/app.js',
  'assets/apps/journal/app-core.js',
  'assets/apps/academy/index.html',
  'assets/apps/academy/assets/js/auth.js'
];

function absolute(file) {
  return path.join(root, file);
}
function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}
function fail(message) {
  console.error(`PWA validation failed: ${message}`);
  process.exitCode = 1;
}

for (const file of required) {
  if (!fs.existsSync(absolute(file))) fail(`missing ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const manifest = JSON.parse(read('manifest.webmanifest'));
const config = JSON.parse(read('pwa-config.json'));
const packageInfo = JSON.parse(read('package.json'));
const expectedStream = 'https://amy-fx.vercel.app/api/pwa-live-price';

if (packageInfo.version !== '2.2.1-pwa.6.0') fail('package version must be 2.2.1-pwa.6.0');
if (manifest.id !== './' || manifest.start_url !== './' || manifest.scope !== './') fail('manifest paths must stay portable');
if (manifest.display !== 'standalone') fail('manifest display must be standalone');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '192x192')) fail('manifest needs a 192x192 PNG icon');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '512x512')) fail('manifest needs a 512x512 PNG icon');
if (!(manifest.icons || []).some(icon => String(icon.purpose || '').includes('maskable'))) fail('manifest needs a maskable icon');

if (config.authRequired !== true) fail('member authentication must be enabled');
if (!String(config.authEndpoint || '').startsWith('https://')) fail('authEndpoint must use HTTPS');
if (config.apiBaseUrl !== 'https://amy-fx.vercel.app') fail('apiBaseUrl must use Amy FX production');
if (config.livePriceStreamEndpoint !== expectedStream) fail('livePriceStreamEndpoint must use the Amy FX authenticated WebSocket relay');
if (config.webPushEnabled !== true) fail('Web Push must remain enabled');
if (!String(config.webPushRegisterEndpoint || '').startsWith('https://')) fail('webPushRegisterEndpoint must use HTTPS');

const index = read('index.html');
for (const marker of ['<base href="./assets/">', '../manifest.webmanifest', '../platform-adapter.js', '../member-auth.js', '../pwa-bootstrap.js', '../pwa-update-bridge.js']) {
  if (!index.includes(marker)) fail(`root index missing ${marker}`);
}
if (index.includes('update-checker.js')) fail('Android APK updater must not run in PWA');

const mappingIndex = read('assets/apps/mapping/index.html');
for (const marker of ['../../../platform-adapter.js', '../../../pwa-live-price-bridge.js', '../../../member-auth.js', '../../../pwa-bootstrap.js', '../../../pwa-update-bridge.js']) {
  if (!mappingIndex.includes(marker)) fail(`Mapping index missing ${marker}`);
}

const coordinator = read('assets/apps/mapping/js/api-request-coordinator.js');
for (const marker of [
  "PERSISTENT_CACHE_KEY = 'amyfx_market_response_cache_v3'",
  'BACKGROUND_M1_REFRESH_SECONDS = 300',
  'RETRY_COOLDOWN_MS = 60_000',
  'SUPABASE_VERIFIED_CURRENT',
  'restorePersistentCache()',
  'persistResponseCache()'
]) {
  if (!coordinator.includes(marker)) fail(`market request coordinator missing ${marker}`);
}
try { new Function(coordinator); } catch (error) { fail(`market request coordinator has invalid JavaScript: ${error.message}`); }

const freshnessRepair = read('assets/apps/mapping/js/mapping-runtime-repair-v3.js');
for (const marker of [
  "version: '4.0.0'",
  'cachedSeriesIsCurrent',
  'expectedClosedCandleOpen',
  'primeCurrentCandleFreshness',
  'setCandleFetchedAt(normalizedTf, current ? nowMs : 0)'
]) {
  if (!freshnessRepair.includes(marker)) fail(`Mapping freshness repair missing ${marker}`);
}

const bridge = read('pwa-live-price-bridge.js');
for (const marker of [
  `const FALLBACK_ENDPOINT = '${expectedStream}'`,
  "Accept: 'text/event-stream'",
  'Authorization: `Bearer ${session.access_token}`',
  'response.body.getReader()',
  'TWELVE_DATA_WEBSOCKET_EDGE',
  'amyfx:twelvedata-price',
  "version: 'pwa-websocket-backend-relay-4.0.0'"
]) {
  if (!bridge.includes(marker)) fail(`live-price bridge missing ${marker}`);
}
if (bridge.includes('api.twelvedata.com')) fail('browser bridge must not call Twelve Data directly');
if (bridge.includes('setInterval(poll')) fail('live price must not retain REST polling');
if (/TWELVEDATA_API_KEY|(?:const|let|var)\s+\w*api[_-]?key\s*=/i.test(bridge)) fail('browser bridge must not contain provider credentials');

const worker = read('service-worker.js');
for (const eventName of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
  if (!worker.includes(`addEventListener('${eventName}'`)) fail(`service worker missing ${eventName}`);
}
for (const marker of ['-pwa-ws-price-v4-market-cache-v6', 'function isLivePriceStream(url)', "url.pathname.endsWith('/api/pwa-live-price')", 'event.respondWith(fetch(request))', "appUrl('pwa-live-price-bridge.js')", "appUrl('pwa-update-bridge.js')"]) {
  if (!worker.includes(marker)) fail(`service worker missing ${marker}`);
}

const bootstrap = read('pwa-bootstrap.js');
for (const marker of ['pushManager.subscribe', 'webPushRegisterEndpoint', 'enableNotifications']) {
  if (!bootstrap.includes(marker)) fail(`PWA bootstrap missing ${marker}`);
}

const journal = read('assets/apps/journal/app.js');
if (!journal.includes('AmyFXAuth.requireAuth') || !journal.includes('app-core.js')) fail('Journal authentication wrapper is incomplete');
const academy = read('assets/apps/academy/assets/js/auth.js');
if (!academy.includes('AmyFXAuth.requireAuth') || academy.includes('window.prompt(')) fail('Academy authentication wrapper is invalid');

for (const file of ['service-worker.js', 'platform-adapter.js', 'member-auth.js', 'pwa-bootstrap.js', 'pwa-live-price-bridge.js', 'pwa-update-bridge.js', 'pwa-navigation.js', 'pwa-push-test.js']) {
  try { new Function(read(file)); } catch (error) { fail(`${file} has invalid JavaScript: ${error.message}`); }
}

JSON.parse(read('vercel.json'));
if (!process.exitCode) console.log(`PWA validation passed: ${required.length} files, closed-candle Mapping freshness, persistent candle cache, authenticated backend WebSocket relay v4, market-cache v6, offline cache, and Web Push.`);
