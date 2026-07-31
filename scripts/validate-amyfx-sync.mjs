import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'pwa-live-price-bridge.js',
  'assets/amyfx-source.json',
  'assets/apps/mapping/js/execution-plan-core.js',
  'assets/apps/mapping/js/execution-plan-ui.js',
  'assets/apps/mapping/js/scalper-entry-watch-v1.js',
  'assets/apps/mapping/js/scalper-execution-authority.js',
  'assets/apps/mapping/js/scalper-execution-decision-bridge.js',
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

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const metadata = JSON.parse(read('assets/amyfx-source.json'));
if (metadata.repository !== 'suhaimitoamy/Amy-fx') fail('source repository metadata is incorrect');
if (metadata.branch !== 'main') fail('source branch metadata must be main');

const mappingIndex = read('assets/apps/mapping/index.html');
for (const marker of [
  'platform-adapter.js',
  'pwa-live-price-bridge.js',
  'member-auth.js',
  'pwa-bootstrap.js',
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
if (/TWELVEDATA_API_KEY|api[_-]?key\s*[:=]/i.test(bridge)) fail('PWA bridge must not contain provider credentials');

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
  if (content.includes('Asia/Jakarta')) fail(`WIB timezone remains in ${path.relative(root, file)}`);
  if (/update-checker\.js/i.test(content)) fail(`Android updater remains in ${path.relative(root, file)}`);
}

try {
  new Function(read('pwa-live-price-bridge.js'));
} catch (error) {
  fail(`pwa-live-price-bridge.js has invalid JavaScript: ${error.message}`);
}

if (!process.exitCode) {
  console.log(`Amy FX sync validation passed for source ${String(metadata.commit || 'unknown').slice(0, 12)}.`);
}
