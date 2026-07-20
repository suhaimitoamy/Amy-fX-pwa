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
  'assets/styles.css',
  'assets/app.js',
  'assets/apps/mapping/index.html',
  'assets/apps/market-intel/index.html',
  'assets/apps/journal/index.html',
  'assets/apps/journal/app.js',
  'assets/apps/journal/app-core.js',
  'assets/apps/journal/amy-journal-final-fix.js',
  'assets/apps/journal/amy-journal-core.js',
  'assets/apps/academy/index.html',
  'assets/apps/academy/assets/js/auth.js'
];

function fail(message) {
  console.error(`PWA validation failed: ${message}`);
  process.exitCode = 1;
}

function absolute(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

for (const file of required) {
  if (!fs.existsSync(absolute(file))) fail(`missing ${file}`);
}

if (process.exitCode) process.exit(process.exitCode);

const manifest = JSON.parse(read('manifest.webmanifest'));
const config = JSON.parse(read('pwa-config.json'));

if (manifest.id !== './') fail('manifest id must be relative');
if (manifest.start_url !== './') fail('manifest start_url must be ./');
if (manifest.scope !== './') fail('manifest scope must be ./');
if (manifest.display !== 'standalone') fail('manifest display must be standalone');
if (!Array.isArray(manifest.icons) || manifest.icons.length < 3) fail('manifest needs regular and maskable icons');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '192x192')) fail('manifest needs a 192x192 PNG icon');
if (!(manifest.icons || []).some(icon => icon.type === 'image/png' && icon.sizes === '512x512')) fail('manifest needs a 512x512 PNG icon');
if (!(manifest.icons || []).some(icon => String(icon.purpose || '').includes('maskable'))) fail('manifest needs a maskable icon');
if ((manifest.icons || []).some(icon => String(icon.src || '').startsWith('/'))) fail('manifest icons must not use domain-root paths');

if (config.authRequired !== true) fail('member authentication must be enabled for production');
if (!String(config.authEndpoint || '').startsWith('https://')) fail('authEndpoint must use HTTPS');
if (!String(config.apiBaseUrl || '').startsWith('https://')) fail('apiBaseUrl must use HTTPS');
if (config.webPushEnabled !== true) fail('Web Push must be enabled for production');
if (!String(config.webPushRegisterEndpoint || '').startsWith('https://')) fail('webPushRegisterEndpoint must use HTTPS');
if (!/^[A-Za-z0-9_-]{80,100}$/.test(String(config.webPushVapidPublicKey || ''))) fail('webPushVapidPublicKey is invalid');

for (const icon of manifest.icons || []) {
  const localPath = String(icon.src || '').replace(/^\.\//, '');
  if (!localPath || !fs.existsSync(absolute(localPath))) fail(`manifest icon not found: ${icon.src}`);
}

for (const shortcut of manifest.shortcuts || []) {
  const localPath = String(shortcut.url || '').replace(/^\.\//, '');
  if (!localPath || !fs.existsSync(absolute(localPath))) fail(`shortcut target not found: ${shortcut.url}`);
  if (String(shortcut.url || '').startsWith('/')) fail(`shortcut must be relative: ${shortcut.url}`);
}

const index = read('index.html');
if (!index.includes('<base href="./assets/">')) fail('root index must use a portable assets base');
if (!index.includes('rel="manifest" href="../manifest.webmanifest"')) fail('root index does not link the portable manifest path');
if (!index.includes('../icons/amy-fx-180.png')) fail('root index does not use the iPhone touch icon');
if (!index.includes('../platform-adapter.js')) fail('root index does not load platform adapter');
if (!index.includes('../member-auth.js')) fail('root index does not load member auth');
if (!index.includes('../pwa-bootstrap.js')) fail('root index does not load PWA bootstrap');
if (index.includes('update-checker.js')) fail('Android APK updater must not run in the PWA entry point');

for (const modulePage of [
  'assets/apps/mapping/index.html',
  'assets/apps/market-intel/index.html'
]) {
  const html = read(modulePage);
  if (!html.includes('../../../platform-adapter.js')) fail(`${modulePage} does not load platform adapter`);
  if (!html.includes('../../../member-auth.js')) fail(`${modulePage} does not load member auth`);
  if (!html.includes('../../../pwa-bootstrap.js')) fail(`${modulePage} does not load PWA bootstrap`);
}

const journalBaseEntry = read('assets/apps/journal/app.js');
if (!journalBaseEntry.includes('AmyFXAuth.requireAuth')) fail('Journal base app does not enforce member authentication');
if (!journalBaseEntry.includes('app-core.js')) fail('Journal base wrapper does not load the preserved app core');

const journalEnhancementEntry = read('assets/apps/journal/amy-journal-final-fix.js');
if (!journalEnhancementEntry.includes('AmyFXAuth.requireAuth')) fail('Journal enhancement does not enforce member authentication');
if (!journalEnhancementEntry.includes('amy-journal-core.js')) fail('Journal enhancement wrapper does not load the preserved enhancement core');

const academyAuth = read('assets/apps/academy/assets/js/auth.js');
if (!academyAuth.includes('AmyFXAuth.requireAuth')) fail('Academy does not enforce member authentication');
if (academyAuth.includes('window.prompt(')) fail('Academy still uses device-local prompt authentication');
if (academyAuth.includes('amy_academy_access_hash')) fail('Academy still stores a local access code');

const bootstrap = read('pwa-bootstrap.js');
for (const marker of [
  'Notification.requestPermission',
  'pushManager.subscribe',
  'webPushRegisterEndpoint',
  'webPushVapidPublicKey',
  'Authorization: `Bearer ${session.access_token}`',
  'enableNotifications',
  'disableNotifications'
]) {
  if (!bootstrap.includes(marker)) fail(`PWA bootstrap missing Web Push marker: ${marker}`);
}

const worker = read('service-worker.js');
for (const eventName of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
  if (!worker.includes(`addEventListener('${eventName}'`) && !worker.includes(`addEventListener("${eventName}"`)) {
    fail(`service worker missing ${eventName} handler`);
  }
}
if (!worker.includes("new URL('./', self.location.href)")) fail('service worker must derive its deployment base');
if (!worker.includes('showNotification')) fail('service worker does not display Web Push notifications');
if (!worker.includes('amyfx-news-')) fail('service worker does not deduplicate news notifications');
if (!worker.includes('assets/apps/market-intel/index.html')) fail('service worker notification target is missing Market Intel');

for (const file of [
  'service-worker.js',
  'platform-adapter.js',
  'member-auth.js',
  'pwa-bootstrap.js',
  'assets/apps/journal/app.js',
  'assets/apps/journal/amy-journal-final-fix.js',
  'assets/apps/academy/assets/js/auth.js'
]) {
  try {
    new Function(read(file));
  } catch (error) {
    fail(`${file} has invalid JavaScript: ${error.message}`);
  }
}

const workflowDir = absolute('.github/workflows');
if (fs.existsSync(workflowDir)) {
  for (const filename of fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/i.test(name))) {
    const workflow = read(`.github/workflows/${filename}`);
    if (/gradlew|assembleDebug|assembleRelease|Android SDK|app\/src\/main\/java/i.test(workflow)) {
      fail(`obsolete Android build command remains in ${filename}`);
    }
  }
}

for (const obsolete of [
  'app/build.gradle.kts',
  'app/src/main/AndroidManifest.xml',
  'gradlew',
  'gradlew.bat'
]) {
  if (fs.existsSync(absolute(obsolete))) fail(`obsolete Android file remains: ${obsolete}`);
}

JSON.parse(read('vercel.json'));

if (!process.exitCode) {
  console.log(`PWA validation passed: ${required.length} required files, ${manifest.shortcuts?.length || 0} shortcuts, member auth and Web Push enabled.`);
}
