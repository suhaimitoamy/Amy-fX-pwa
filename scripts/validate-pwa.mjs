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

if (manifest.id !== './' || manifest.start_url !== './' || manifest.scope !== './') {
  fail('manifest paths must stay portable');
}
if (manifest.display !== 'standalone') fail('manifest display must be standalone');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '192x192')) {
  fail('manifest needs a 192x192 PNG icon');
}
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '512x512')) {
  fail('manifest needs a 512x512 PNG icon');
}
if (!(manifest.icons || []).some(icon => String(icon.purpose || '').includes('maskable'))) {
  fail('manifest needs a maskable icon');
}

if (config.authRequired !== true) fail('member authentication must be enabled');
if (!String(config.authEndpoint || '').startsWith('https://')) fail('authEndpoint must use HTTPS');
if (config.apiBaseUrl !== 'https://amy-fx.vercel.app') fail('apiBaseUrl must use Amy FX production');
if (config.livePriceStreamEndpoint !== 'https://amy-fx.vercel.app/api/pwa-live-price') {
  fail('livePriceStreamEndpoint must use the Amy FX production WebSocket relay');
}
if (config.webPushEnabled !== true) fail('Web Push must remain enabled');
if (!String(config.webPushRegisterEndpoint || '').startsWith('https://')) {
  fail('webPushRegisterEndpoint must use HTTPS');
}

const index = read('index.html');
for (const marker of [
  '<base href="./assets/">',
  '../manifest.webmanifest',
  '../platform-adapter.js',
  '../member-auth.js',
  '../pwa-bootstrap.js',
  '../pwa-update-bridge.js'
]) {
  if (!index.includes(marker)) fail(`root index missing ${marker}`);
}
if (index.includes('update-checker.js')) fail('Android APK updater must not run in PWA');

const mappingIndex = read('assets/apps/mapping/index.html');
for (const marker of [
  '../../../platform-adapter.js',
  '../../../pwa-live-price-bridge.js',
  '../../../member-auth.js',
  '../../../pwa-bootstrap.js',
  '../../../pwa-update-bridge.js'
]) {
  if (!mappingIndex.includes(marker)) fail(`Mapping index missing ${marker}`);
}

const bridge = read('pwa-live-price-bridge.js');
for (const marker of [
  "const FALLBACK_ENDPOINT = 'https://amy-fx.vercel.app/api/pwa-live-price'",
  "Accept: 'text/event-stream'",
  'Authorization: `Bearer ${session.access_token}`',
  'response.body.getReader()',
  'TWELVE_DATA_WEBSOCKET_EDGE',
  'amyfx:twelvedata-price',
  "version: 'pwa-websocket-production-relay-3.0.0'"
]) {
  if (!bridge.includes(marker)) fail(`live-price bridge missing ${marker}`);
}
if (bridge.includes('/api/twelvedata')) fail('live price must not poll the REST candle endpoint');
if (bridge.includes('setInterval(poll')) fail('live price must not retain REST polling');
if (/TWELVEDATA_API_KEY|(?:const|let|var)\s+\w*api[_-]?key\s*=/i.test(bridge)) {
  fail('browser bridge must not contain provider credentials');
}

const worker = read('service-worker.js');
for (const eventName of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
  if (!worker.includes(`addEventListener('${eventName}'`)) fail(`service worker missing ${eventName}`);
}
for (const marker of [
  '-pwa-ws-price-v3',
  'function isLivePriceStream(url)',
  "url.pathname.endsWith('/api/pwa-live-price')",
  'event.respondWith(fetch(request))',
  "appUrl('pwa-live-price-bridge.js')",
  "appUrl('pwa-update-bridge.js')"
]) {
  if (!worker.includes(marker)) fail(`service worker missing ${marker}`);
}

const bootstrap = read('pwa-bootstrap.js');
for (const marker of ['pushManager.subscribe', 'webPushRegisterEndpoint', 'enableNotifications']) {
  if (!bootstrap.includes(marker)) fail(`PWA bootstrap missing ${marker}`);
}

const journal = read('assets/apps/journal/app.js');
if (!journal.includes('AmyFXAuth.requireAuth') || !journal.includes('app-core.js')) {
  fail('Journal authentication wrapper is incomplete');
}
const academy = read('assets/apps/academy/assets/js/auth.js');
if (!academy.includes('AmyFXAuth.requireAuth') || academy.includes('window.prompt(')) {
  fail('Academy authentication wrapper is invalid');
}

for (const file of [
  'service-worker.js',
  'platform-adapter.js',
  'member-auth.js',
  'pwa-bootstrap.js',
  'pwa-live-price-bridge.js',
  'pwa-update-bridge.js',
  'pwa-navigation.js',
  'pwa-push-test.js'
]) {
  try {
    new Function(read(file));
  } catch (error) {
    fail(`${file} has invalid JavaScript: ${error.message}`);
  }
}

JSON.parse(read('vercel.json'));

if (!process.exitCode) {
  console.log(`PWA validation passed: ${required.length} files, authenticated production WebSocket relay, offline cache, and Web Push.`);
}
