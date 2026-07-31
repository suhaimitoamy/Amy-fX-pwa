import fs from 'node:fs';
import path from 'node:path';

const sourceAssetsRoot = path.resolve(process.argv[2] || '../amyfx-source/app/src/main/assets');
const targetRoot = path.resolve(process.argv[3] || process.cwd());
const targetAssetsRoot = path.join(targetRoot, 'assets');
const sourceAppsRoot = path.join(sourceAssetsRoot, 'apps');
const targetAppsRoot = path.join(targetAssetsRoot, 'apps');

function fail(message) {
  throw new Error(`[sync-from-amyfx-main] ${message}`);
}

function exists(file) {
  return fs.existsSync(file);
}

function read(file) {
  if (!exists(file)) fail(`missing required file: ${path.relative(targetRoot, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyEntry(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true, force: true });
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function walk(directory, output = []) {
  if (!exists(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else output.push(fullPath);
  }
  return output;
}

function posixRelative(from, to) {
  const value = path.relative(from, to).split(path.sep).join('/');
  return value || '.';
}

function injectPwaRuntime(html, file) {
  const directory = path.dirname(file);
  const rootPath = posixRelative(directory, targetRoot);
  const prefix = rootPath === '.' ? './' : `${rootPath}/`;
  const scripts = [
    'platform-adapter.js',
    'pwa-live-price-bridge.js',
    'member-auth.js',
    'pwa-bootstrap.js'
  ];

  const missing = scripts.filter(name => !html.includes(name));
  if (!missing.length) return html;

  const block = [
    '<!-- Amy FX PWA runtime overlay -->',
    ...missing.map(name => `<script src="${prefix}${name}"></script>`),
    '<!-- /Amy FX PWA runtime overlay -->'
  ].join('\n');

  if (html.includes('</head>')) return html.replace('</head>', `${block}\n</head>`);
  return `${block}\n${html}`;
}

function normalizeWebText(content) {
  return content
    .replaceAll('Asia/Jakarta', 'Asia/Makassar')
    .replace(/\bWIB\b/g, 'WITA');
}

if (!exists(sourceAppsRoot)) fail(`Amy FX source apps not found: ${sourceAppsRoot}`);
if (!exists(targetAssetsRoot)) fail(`PWA assets root not found: ${targetAssetsRoot}`);

const pwaJournalLoader = read(path.join(targetAppsRoot, 'journal/app.js'));
const pwaJournalEnhancementLoader = read(path.join(targetAppsRoot, 'journal/amy-journal-final-fix.js'));
const pwaAcademyAuth = read(path.join(targetAppsRoot, 'academy/assets/js/auth.js'));

const sourceJournalApp = read(path.join(sourceAppsRoot, 'journal/app.js'));
const sourceJournalEnhancementPath = path.join(sourceAppsRoot, 'journal/amy-journal-final-fix.js');
const sourceJournalEnhancement = exists(sourceJournalEnhancementPath)
  ? read(sourceJournalEnhancementPath)
  : '';

fs.rmSync(targetAppsRoot, { recursive: true, force: true });
copyEntry(sourceAppsRoot, targetAppsRoot);

const protectedTargetAssetEntries = new Set([
  'app.js',
  'styles.css',
  'apps'
]);
const skippedNativeEntries = new Set([
  'index.html',
  'update-checker.js'
]);

for (const entry of fs.readdirSync(sourceAssetsRoot, { withFileTypes: true })) {
  if (protectedTargetAssetEntries.has(entry.name) || skippedNativeEntries.has(entry.name)) continue;
  copyEntry(path.join(sourceAssetsRoot, entry.name), path.join(targetAssetsRoot, entry.name));
}

write(path.join(targetAppsRoot, 'journal/app-core.js'), normalizeWebText(sourceJournalApp));
write(path.join(targetAppsRoot, 'journal/app.js'), pwaJournalLoader);
if (sourceJournalEnhancement) {
  write(path.join(targetAppsRoot, 'journal/amy-journal-core.js'), normalizeWebText(sourceJournalEnhancement));
}
write(path.join(targetAppsRoot, 'journal/amy-journal-final-fix.js'), pwaJournalEnhancementLoader);
write(path.join(targetAppsRoot, 'academy/assets/js/auth.js'), pwaAcademyAuth);

const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.md']);
for (const file of walk(targetAppsRoot)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  let content = normalizeWebText(fs.readFileSync(file, 'utf8'));
  if (path.extname(file).toLowerCase() === '.html') {
    content = content.replace(/<script[^>]+update-checker\.js[^>]*><\/script>/gi, '');
    content = injectPwaRuntime(content, file);
  }
  fs.writeFileSync(file, content);
}

const serviceWorkerPath = path.join(targetRoot, 'service-worker.js');
if (exists(serviceWorkerPath)) {
  const sourceSha = String(process.env.AMYFX_SOURCE_SHA || 'manual').slice(0, 12);
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
  const version = `${date}.amyfx-${sourceSha}`;
  const worker = read(serviceWorkerPath).replace(
    /const VERSION = ['"][^'"]+['"];?/,
    `const VERSION = '${version}';`
  );
  write(serviceWorkerPath, worker);
}

const sourceSha = String(process.env.AMYFX_SOURCE_SHA || 'unknown');
write(path.join(targetAssetsRoot, 'amyfx-source.json'), `${JSON.stringify({
  repository: 'suhaimitoamy/Amy-fx',
  branch: 'main',
  commit: sourceSha,
  syncedAt: new Date().toISOString(),
  strategy: 'production-assets-with-pwa-runtime-overlay'
}, null, 2)}\n`);

const requiredProductionFiles = [
  'apps/mapping/js/execution-plan-core.js',
  'apps/mapping/js/execution-plan-ui.js',
  'apps/mapping/js/scalper-entry-watch-v1.js',
  'apps/mapping/js/scalper-execution-authority.js',
  'apps/mapping/js/mapping-v2.js',
  'apps/mapping/css/execution-plan.css',
  'apps/mapping/css/scalper-entry-watch.css'
];
for (const relative of requiredProductionFiles) {
  if (!exists(path.join(targetAssetsRoot, relative))) fail(`production module was not copied: ${relative}`);
}

for (const file of walk(targetAppsRoot)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('Asia/Jakarta')) fail(`WIB timezone remains in ${path.relative(targetRoot, file)}`);
  if (/update-checker\.js/i.test(content)) fail(`Android updater remains in ${path.relative(targetRoot, file)}`);
}

console.log(`Amy FX production assets synchronized from ${sourceSha.slice(0, 12) || 'unknown'} with PWA overlays preserved.`);
