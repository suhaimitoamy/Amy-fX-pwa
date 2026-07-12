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
  'offline.html',
  'icons/amy-fx.svg',
  'icons/amy-fx-maskable.svg',
  'icons/amy-fx-180.png',
  'icons/amy-fx-192.png',
  'icons/amy-fx-512.png',
  'vercel.json',
  'app/src/main/assets/styles.css',
  'app/src/main/assets/app.js',
  'app/src/main/assets/apps/mapping/index.html',
  'app/src/main/assets/apps/market-intel/index.html',
  'app/src/main/assets/apps/journal/index.html',
  'app/src/main/assets/apps/journal/amy-journal-final-fix.js',
  'app/src/main/assets/apps/academy/index.html',
  'app/src/main/assets/apps/academy/assets/js/auth.js'
];

function fail(message) {
  console.error(`PWA validation failed: ${message}`);
  process.exitCode = 1;
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing ${file}`);
}

if (process.exitCode) process.exit(process.exitCode);

const manifest = JSON.parse(read('manifest.webmanifest'));
const config = JSON.parse(read('pwa-config.json'));
if (manifest.start_url !== '/') fail('manifest start_url must be /');
if (manifest.scope !== '/') fail('manifest scope must be /');
if (manifest.display !== 'standalone') fail('manifest display must be standalone');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail('manifest needs regular and maskable icons');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '192x192')) fail('manifest needs a 192x192 PNG icon');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '512x512')) fail('manifest needs a 512x512 PNG icon');
if (!(manifest.icons || []).some(icon => String(icon.purpose || '').includes('maskable'))) fail('manifest needs a maskable icon');
if (typeof config.authRequired !== 'boolean') fail('pwa config authRequired must be boolean');
if (!String(config.authEndpoint || '').startsWith('https://')) fail('pwa config authEndpoint must use HTTPS');
if (config.webPushEnabled !== false) fail('background Web Push must remain disabled until explicitly configured');

for (const icon of manifest.icons || []) {
  const localPath = String(icon.src || '').replace(/^\//, '');
  if (!localPath || !fs.existsSync(path.join(root, localPath))) fail(`manifest icon not found: ${icon.src}`);
}

for (const shortcut of manifest.shortcuts || []) {
  const localPath = String(shortcut.url || '').replace(/^\//, '');
  if (!localPath || !fs.existsSync(path.join(root, localPath))) fail(`shortcut target not found: ${shortcut.url}`);
}

const index = read('index.html');
if (!index.includes('rel="manifest"')) fail('root index does not link the manifest');
if (!index.includes('/icons/amy-fx-180.png')) fail('root index does not use the iPhone touch icon');
if (!index.includes('/platform-adapter.js')) fail('root index does not load platform adapter');
if (!index.includes('/member-auth.js')) fail('root index does not load member auth');
if (!index.includes('/pwa-bootstrap.js')) fail('root index does not load PWA bootstrap');
if (index.includes('update-checker.js')) fail('Android APK updater must not run in the PWA entry point');

const legacyIndex = read('app/src/main/assets/index.html');
if (legacyIndex.includes('update-checker.js')) fail('legacy web entry still loads Android APK updater');

for (const modulePage of [
  'app/src/main/assets/apps/mapping/index.html',
  'app/src/main/assets/apps/market-intel/index.html'
]) {
  const html = read(modulePage);
  if (!html.includes('/member-auth.js')) fail(`${modulePage} does not load member auth`);
  if (!html.includes('/pwa-bootstrap.js')) fail(`${modulePage} does not load PWA bootstrap`);
}

const journalBootstrap = read('app/src/main/assets/apps/journal/amy-journal-final-fix.js');
if (!journalBootstrap.includes("loadScript('/member-auth.js')")) fail('Journal does not bootstrap member auth');
const academyAuth = read('app/src/main/assets/apps/academy/assets/js/auth.js');
if (!academyAuth.includes("loadScript('/member-auth.js')")) fail('Academy does not bootstrap member auth');
if (academyAuth.includes('window.prompt(')) fail('Academy still uses device-local prompt authentication');

const worker = read('service-worker.js');
for (const eventName of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
  if (!worker.includes(`addEventListener('${eventName}'`)) fail(`service worker missing ${eventName} handler`);
}

for (const file of [
  'service-worker.js',
  'platform-adapter.js',
  'member-auth.js',
  'pwa-bootstrap.js',
  'app/src/main/assets/apps/journal/amy-journal-final-fix.js',
  'app/src/main/assets/apps/academy/assets/js/auth.js'
]) {
  try {
    new Function(read(file));
  } catch (error) {
    fail(`${file} has invalid JavaScript: ${error.message}`);
  }
}

JSON.parse(read('vercel.json'));

if (!process.exitCode) {
  console.log(`PWA validation passed: ${required.length} required files, ${manifest.shortcuts?.length || 0} shortcuts.`);
}
