import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'platform-adapter.js',
  'pwa-bootstrap.js',
  'offline.html',
  'icons/amy-fx.svg',
  'icons/amy-fx-maskable.svg',
  'vercel.json',
  'app/src/main/assets/styles.css',
  'app/src/main/assets/app.js',
  'app/src/main/assets/apps/mapping/index.html',
  'app/src/main/assets/apps/market-intel/index.html',
  'app/src/main/assets/apps/journal/index.html',
  'app/src/main/assets/apps/academy/index.html'
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
if (manifest.start_url !== '/') fail('manifest start_url must be /');
if (manifest.scope !== '/') fail('manifest scope must be /');
if (manifest.display !== 'standalone') fail('manifest display must be standalone');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail('manifest needs regular and maskable icons');

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
if (!index.includes('/platform-adapter.js')) fail('root index does not load platform adapter');
if (!index.includes('/pwa-bootstrap.js')) fail('root index does not load PWA bootstrap');
if (index.includes('update-checker.js')) fail('Android APK updater must not run in the PWA entry point');

const legacyIndex = read('app/src/main/assets/index.html');
if (legacyIndex.includes('update-checker.js')) fail('legacy web entry still loads Android APK updater');

const worker = read('service-worker.js');
for (const eventName of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
  if (!worker.includes(`addEventListener('${eventName}'`)) fail(`service worker missing ${eventName} handler`);
}

for (const file of ['service-worker.js', 'platform-adapter.js', 'pwa-bootstrap.js']) {
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
