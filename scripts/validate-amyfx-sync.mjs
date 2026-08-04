import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'pwa-config.json',
  'pwa-live-price-bridge.js',
  'pwa-update-bridge.js',
  'service-worker.js',
  'assets/amyfx-source.json',
  'assets/app-version.js',
  'assets/apps/mapping/index.html',
  'assets/apps/mapping/js/api-request-coordinator.js',
  'assets/apps/mapping/js/mapping-runtime-repair-v3.js',
  'assets/apps/mapping/js/execution-plan-core.js',
  'assets/apps/mapping/js/execution-plan-ui.js',
  'assets/apps/mapping/js/live-price-display-only-v1.js',
  'assets/apps/mapping/js/scalper-entry-watch-v1.js',
  'assets/apps/mapping/js/scalper-execution-authority.js',
  'assets/apps/mapping/js/scalper-execution-decision-bridge.js',
  'assets/apps/mapping/js/scalper-shadow-state.js',
  'assets/apps/mapping/js/engine/bt71-market-state-reconciliation.js',
  'assets/apps/mapping/js/mapping-v2.js'
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function fail(message) {
  console.error(`Amy FX Preview parity validation failed: ${message}`);
  process.exitCode = 1;
}
function versionAtLeast(actual, minimum) {
  const left = String(actual || '').split('.').map(value => Number.parseInt(value, 10) || 0);
  const right = String(minimum || '').split('.').map(value => Number.parseInt(value, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return true;
}

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const metadata = JSON.parse(read('assets/amyfx-source.json'));
if (metadata.repository !== 'suhaimitoamy/Amy-fx') fail('source repository metadata is incorrect');
if (metadata.branch !== 'personal/amyfx-private') fail('source branch metadata must be personal/amyfx-private');
if (!/^[0-9a-f]{40}$/i.test(String(metadata.commit || ''))) fail('source commit must be a full SHA');
if (metadata.strategy !== 'preview-parity-with-pwa-runtime-overlay') fail('Preview parity sync strategy is incorrect');

const appVersion = read('assets/app-version.js');
const versionMatch = appVersion.match(/name:\s*['"]([^'"]+)['"],\s*code:\s*(\d+)/);
if (!versionMatch) fail('Amy FX PWA application version cannot be parsed');
else {
  if (!versionAtLeast(versionMatch[1], '2.3.0')) fail(`Amy FX PWA ${versionMatch[1]} is older than 2.3.0`);
  if (Number(versionMatch[2]) < 58) fail(`Amy FX PWA code ${versionMatch[2]} is older than 58`);
}

const expectedStream = 'https://amy-fx.vercel.app/api/pwa-live-price';
const config = JSON.parse(read('pwa-config.json'));
if (config.livePriceStreamEndpoint !== expectedStream) fail('PWA live stream is not routed through the authenticated Amy FX backend relay');

const mappingIndex = read('assets/apps/mapping/index.html');
for (const marker of [
  'platform-adapter.js',
  'pwa-live-price-bridge.js',
  'member-auth.js',
  'pwa-bootstrap.js',
  'pwa-update-bridge.js',
  'execution-plan.css',
  'scalper-entry-watch.css',
  'live-price-display-only-v1.js',
  'scalper-execution-authority.js',
  'scalper-execution-decision-bridge.js'
]) {
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
  if (!coordinator.includes(marker)) fail(`PWA market coordinator missing ${marker}`);
}

const freshnessRepair = read('assets/apps/mapping/js/mapping-runtime-repair-v3.js');
for (const marker of [
  "version: '6.0.0'",
  'markCachedSeriesUsable',
  'sourceSignature',
  'latestClosedCandleClose',
  'lastAnalyzedSignature'
]) {
  if (!freshnessRepair.includes(marker)) fail(`PWA Mapping closed-candle runtime missing ${marker}`);
}

const bridge = read('pwa-live-price-bridge.js');
for (const marker of [
  'window.AmyLivePrice',
  'amyfx:twelvedata-price',
  'amyfx:twelvedata-status',
  expectedStream,
  "Accept: 'text/event-stream'",
  'Authorization: `Bearer ${session.access_token}`',
  'response.body.getReader()',
  'TWELVE_DATA_WEBSOCKET_EDGE',
  "version: 'pwa-websocket-backend-relay-4.0.0'",
  'hasApiKey'
]) {
  if (!bridge.includes(marker)) fail(`PWA live-price bridge missing ${marker}`);
}
if (bridge.includes('api.twelvedata.com')) fail('PWA browser must not connect to Twelve Data directly');
if (bridge.includes('setInterval(poll')) fail('PWA live price must not retain legacy polling');
if (/TWELVEDATA_API_KEY|(?:const|let|var)\s+\w*api[_-]?key\s*=/i.test(bridge)) fail('PWA bridge must not contain provider credentials');

const worker = read('service-worker.js');
for (const marker of ['-preview-parity-v1-pwa-ws-price-v4-market-cache-v7', 'function isLivePriceStream(url)', "url.pathname.endsWith('/api/pwa-live-price')", 'event.respondWith(fetch(request))']) {
  if (!worker.includes(marker)) fail(`service worker missing ${marker}`);
}

const updateBridge = read('pwa-update-bridge.js');
for (const marker of ['navigator.serviceWorker.getRegistration', 'registration.update()', "Object.defineProperty(window, 'AmyFXUpdateManifestUrl'", 'window.AmyFXUpdate = Object.freeze({ checkNow })']) {
  if (!updateBridge.includes(marker)) fail(`PWA update bridge missing ${marker}`);
}

const scalperWatch = read('assets/apps/mapping/js/scalper-entry-watch-v1.js');
for (const marker of [
  'SCALPER ENGINE · SHADOW MODE',
  'scalper-setups?limit=50',
  'reconcileScalperPayload',
  'TP1 +10',
  'TP2 +20',
  'Stop Loss tetap pada level awal'
]) {
  if (!scalperWatch.includes(marker)) fail(`Scalper Entry Watch missing ${marker}`);
}
const scalperAuthority = read('assets/apps/mapping/js/scalper-execution-authority.js');
for (const marker of [
  "CURRENT_ENGINE_VERSION = 'amyfx-preview-scalper-pattern-v3.0'",
  'SCALPER_ENGINE_EXECUTION_AUTHORITY',
  'TP1_HIT_NO_BE',
  'ENTRY_TRIGGERED',
  'let applyQueued = false',
  'function scheduleApply()',
  "window.addEventListener('amyfx:scalper-state-change', scheduleApply)"
]) {
  if (!scalperAuthority.includes(marker)) fail(`Scalper authority missing Preview parity marker ${marker}`);
}

const decisionBridge = read('assets/apps/mapping/js/scalper-execution-decision-bridge.js');
for (const marker of ['scalperExecutionAuthority', 'executionDirectionDecision', 'SCALPER_ENGINE_EXECUTION_AUTHORITY']) {
  if (!decisionBridge.includes(marker)) fail(`Scalper decision bridge missing ${marker}`);
}

const forbiddenPreviewIdentity = ['com.amyelitesuite.learningpreview', 'personal/amyfx-private/preview-update.json', 'AmyFX-Preview-latest.apk', 'amyfxpreview://'];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full); else files.push(full);
  }
}
walk(path.join(root, 'assets/apps'));
for (const file of files.filter(file => /\.(?:html|js|mjs|css|json)$/i.test(file))) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  if (content.includes('Asia/Jakarta')) fail(`WIB timezone remains in ${relative}`);
  if (/update-checker\.js/i.test(content)) fail(`Android updater remains in ${relative}`);
  for (const marker of forbiddenPreviewIdentity) {
    if (content.includes(marker)) fail(`Preview identity remains in ${relative}: ${marker}`);
  }
}

for (const file of ['pwa-live-price-bridge.js', 'pwa-update-bridge.js', 'service-worker.js', 'assets/apps/mapping/js/api-request-coordinator.js']) {
  try { new Function(read(file)); } catch (error) { fail(`${file} has invalid JavaScript: ${error.message}`); }
}

if (!process.exitCode) console.log(`Amy FX PWA Preview parity validation passed for ${String(metadata.commit).slice(0, 12)} with the current Scalper Engine, closed-candle Mapping runtime v6, persistent candle cache, cache v7, and authenticated backend WebSocket relay v4.`);
