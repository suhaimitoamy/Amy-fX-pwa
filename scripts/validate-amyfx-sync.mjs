import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'pwa-live-price-bridge.js',
  'pwa-update-bridge.js',
  'assets/amyfx-source.json',
  'assets/app-version.js',
  'assets/apps/mapping/js/execution-plan-core.js',
  'assets/apps/mapping/js/execution-plan-ui.js',
  'assets/apps/mapping/js/scalper-entry-watch-v1.js',
  'assets/apps/mapping/js/scalper-execution-authority.js',
  'assets/apps/mapping/js/scalper-execution-decision-bridge.js',
  'assets/apps/mapping/js/scalper-shadow-state.js',
  'assets/apps/mapping/js/mapping-v2.js',
  'assets/apps/mapping/css/execution-plan.css',
  'assets/apps/mapping/css/scalper-entry-watch.css',
  'assets/apps/journal/app-core.js',
  'assets/apps/journal/amy-journal-core.js'
];

function fail(message) {
  console.error(`Amy FX sync validation failed: ${message}`);
  process.exitCode = 1;
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function versionAtLeast(actual, minimum) {
  const left = String(actual || '').split('.').map(value => Number.parseInt(value, 10) || 0);
  const right = String(minimum || '').split('.').map(value => Number.parseInt(value, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const metadata = JSON.parse(read('assets/amyfx-source.json'));
if (metadata.repository !== 'suhaimitoamy/Amy-fx') fail('source repository metadata is incorrect');
if (metadata.branch !== 'main') fail('source branch metadata must be main');
if (!/^[0-9a-f]{40}$/i.test(String(metadata.commit || ''))) fail('source commit metadata must contain a full Git SHA');
if (metadata.strategy !== 'production-assets-with-pwa-runtime-overlay') fail('source synchronization strategy is incorrect');

const appVersion = read('assets/app-version.js');
const versionMatch = appVersion.match(/name:\s*['"]([^'"]+)['"],\s*code:\s*(\d+)/);
if (!versionMatch) fail('Amy FX application version cannot be parsed');
else {
  if (!versionAtLeast(versionMatch[1], '2.2.0')) fail(`PWA still uses Amy FX ${versionMatch[1]}; expected 2.2.0 or newer`);
  if (Number(versionMatch[2]) < 56) fail(`PWA still uses version code ${versionMatch[2]}; expected 56 or newer`);
}

const rootIndex = read('index.html');
if (!rootIndex.includes('pwa-update-bridge.js')) fail('PWA app shell does not load pwa-update-bridge.js');

const mappingIndex = read('assets/apps/mapping/index.html');
for (const marker of [
  'platform-adapter.js',
  'pwa-live-price-bridge.js',
  'member-auth.js',
  'pwa-bootstrap.js',
  'pwa-update-bridge.js',
  'execution-plan.css',
  'scalper-entry-watch.css',
  'scalper-execution-authority.js'
]) {
  if (!mappingIndex.includes(marker)) fail(`Mapping index missing ${marker}`);
}

const bridge = read('pwa-live-price-bridge.js');
for (const marker of [
  'window.AmyLivePrice',
  'amyfx:twelvedata-price',
  'amyfx:twelvedata-status',
  '/api/twelvedata',
  'hasApiKey'
]) {
  if (!bridge.includes(marker)) fail(`PWA live-price bridge missing ${marker}`);
}
const providerCredentialPattern = /TWELVEDATA_API_KEY|(?:const|let|var)\s+\w*api[_-]?key\s*=|["']api[_-]?key["']\s*:/i;
if (providerCredentialPattern.test(bridge)) fail('PWA bridge must not contain provider credentials');

const updateBridge = read('pwa-update-bridge.js');
for (const marker of [
  'navigator.serviceWorker.getRegistration',
  'registration.update()',
  'window.AmyFXUpdateManifestUrl = null',
  'window.AmyFXUpdate = Object.freeze({ checkNow })',
  'amyfx:pwa-update-check'
]) {
  if (!updateBridge.includes(marker)) fail(`PWA update bridge missing ${marker}`);
}

const scalperWatch = read('assets/apps/mapping/js/scalper-entry-watch-v1.js');
for (const marker of [
  '10 driver BT6/BT6.1 + AMD',
  'TP1 +10',
  'TP2 +20',
  'semua setup dipantau independen',
  'Stop Loss tetap pada level awal'
]) {
  if (!scalperWatch.includes(marker)) fail(`Scalper Entry Watch missing final Pattern v3 marker: ${marker}`);
}

const scalperAuthority = read('assets/apps/mapping/js/scalper-execution-authority.js');
for (const marker of [
  "CURRENT_ENGINE_VERSION = 'amyfx-preview-scalper-pattern-v3.0'",
  'SCALPER_ENGINE_EXECUTION_AUTHORITY',
  'TP1_HIT_NO_BE',
  'ENTRY_TRIGGERED'
]) {
  if (!scalperAuthority.includes(marker)) fail(`Scalper authority missing ${marker}`);
}

const forbiddenPreviewIdentity = [
  'com.amyelitesuite.learningpreview',
  'personal/amyfx-private/preview-update.json',
  'AmyFX-Preview-latest.apk',
  'amyfxpreview://'
];

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(path.join(root, 'assets/apps'));
for (const file of files.filter(file => /\.(?:html|js|mjs|css|json)$/i.test(file))) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  if (content.includes('Asia/Jakarta')) fail(`WIB timezone remains in ${relative}`);
  if (/update-checker\.js/i.test(content)) fail(`Android updater remains in ${relative}`);
  for (const marker of forbiddenPreviewIdentity) {
    if (content.includes(marker)) fail(`Preview application identity remains in ${relative}: ${marker}`);
  }
}

for (const file of ['pwa-live-price-bridge.js', 'pwa-update-bridge.js']) {
  try {
    new Function(read(file));
  } catch (error) {
    fail(`${file} has invalid JavaScript: ${error.message}`);
  }
}

if (!process.exitCode) {
  console.log(`Amy FX PWA Pattern v3 sync validation passed for source ${String(metadata.commit || 'unknown').slice(0, 12)} and app ${versionMatch?.[1] || 'unknown'}.`);
}
