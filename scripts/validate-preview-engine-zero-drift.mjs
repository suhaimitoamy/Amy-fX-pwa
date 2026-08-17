import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceAssetsRoot = path.resolve(
  process.env.AMYFX_SOURCE_ROOT || process.argv[2] || '../amyfx-source/app/src/main/assets'
);
const targetAssetsRoot = path.join(root, 'assets');
const textExtensions = new Set(['.js', '.mjs', '.json', '.css']);
const FINAL_PRO_SHA = '50c80c9ceb0c34dccc91d9d4da48e26d22455ba2';

function fail(message) {
  console.error(`Amy FX production zero-drift validation failed: ${message}`);
  process.exitCode = 1;
}

function exists(file) {
  return fs.existsSync(file);
}

function normalizeText(content) {
  return `${String(content)
    .replaceAll('Asia/Jakarta', 'Asia/Makassar')
    .replace(/\bWIB\b/g, 'WITA')
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '')}\n`;
}

function walk(directory, base = directory, output = []) {
  if (!exists(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, output);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    output.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return output.sort();
}

function compareTree(sourceRelative, targetRelative) {
  const sourceRoot = path.join(sourceAssetsRoot, sourceRelative);
  const targetRoot = path.join(root, targetRelative);
  if (!exists(sourceRoot)) {
    fail(`source tree is missing: ${sourceRelative}`);
    return 0;
  }
  if (!exists(targetRoot)) {
    fail(`PWA tree is missing: ${targetRelative}`);
    return 0;
  }

  const sourceFiles = walk(sourceRoot);
  const targetFiles = walk(targetRoot);
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);

  for (const relative of sourceFiles) {
    if (!targetSet.has(relative)) {
      fail(`PWA is missing Amy FX main file ${targetRelative}/${relative}`);
      continue;
    }
    const sourceContent = normalizeText(fs.readFileSync(path.join(sourceRoot, relative), 'utf8'));
    const targetContent = normalizeText(fs.readFileSync(path.join(targetRoot, relative), 'utf8'));
    if (sourceContent !== targetContent) fail(`engine drift detected in ${targetRelative}/${relative}`);
  }

  for (const relative of targetFiles) {
    if (!sourceSet.has(relative)) fail(`unexpected PWA-only engine file found in synchronized tree: ${targetRelative}/${relative}`);
  }

  return sourceFiles.length;
}

if (!exists(sourceAssetsRoot)) {
  fail(`Amy FX main assets checkout is unavailable: ${sourceAssetsRoot}`);
  process.exit(process.exitCode || 1);
}

const metadataPath = path.join(targetAssetsRoot, 'amyfx-source.json');
if (!exists(metadataPath)) {
  fail('assets/amyfx-source.json is missing');
  process.exit(process.exitCode || 1);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
if (metadata.repository !== 'suhaimitoamy/Amy-fx') fail('source repository metadata is incorrect');
if (metadata.branch !== 'main') fail('source branch metadata is not Amy FX main');
if (metadata.strategy !== 'production-main-parity-with-pwa-runtime-overlay') fail('source strategy is not production-main parity');
if (metadata.source_version !== '2.4.0' || Number(metadata.source_version_code) !== 60) fail('source release metadata must be Amy FX 2.4.0 code 60');
if (metadata.pro_source_commit !== FINAL_PRO_SHA) fail('final Amy FX Pro 326 source SHA is missing from metadata');
if (!/^[0-9a-f]{40}$/i.test(String(metadata.commit || ''))) fail('source metadata does not contain a full commit SHA');
if (process.env.AMYFX_SOURCE_SHA && metadata.commit !== process.env.AMYFX_SOURCE_SHA) {
  fail(`source metadata ${metadata.commit} does not match checked-out Amy FX main ${process.env.AMYFX_SOURCE_SHA}`);
}

const sourceVersion = fs.readFileSync(path.join(sourceAssetsRoot, 'app-version.js'), 'utf8');
if (!/name:\s*['"]2\.4\.0['"],\s*code:\s*60/.test(sourceVersion)) fail('Amy FX main checkout is not version 2.4.0 code 60');
if (!sourceVersion.includes('suhaimitoamy/Amy-fx/main/update.json')) fail('Amy FX main checkout does not use the production update channel');

const pwaVersion = fs.readFileSync(path.join(targetAssetsRoot, 'app-version.js'), 'utf8');
if (!/name:\s*['"]2\.4\.0['"],\s*code:\s*60/.test(pwaVersion)) fail('Amy FX PWA release identity must be 2.4.0 code 60');

const requiredLatestModules = [
  'apps/mapping/js/api/closed-candle-response-sanitizer.js',
  'apps/mapping/js/analysis-ui-stability-v4.js',
  'apps/mapping/js/engine/mapping-refresh-dependencies.js',
  'apps/mapping/js/engine/structural-bias.js',
  'apps/mapping/js/live-price-display-only-v1.js',
  'apps/mapping/js/mapping-live-consistency-v1.js',
  'apps/mapping/js/mapping-runtime-repair-v3.js',
  'apps/mapping/js/market-intent-ui.js',
  'apps/mapping/js/scalper-entry-watch-v1.js',
  'apps/mapping/js/scalper-shadow-state.js',
  'apps/mapping/js/ui/dom-stable-render.js',
  'apps/academy/trading-practice/assets/js/chart-engine.js',
  'apps/academy/trading-practice/assets/js/replay-engine.js',
  'apps/academy/trading-practice/assets/js/zip-reader.js'
];
for (const relative of requiredLatestModules) {
  if (!exists(path.join(targetAssetsRoot, relative))) fail(`Amy FX 2.4.0 module is missing: ${relative}`);
}

const structuralBias = fs.readFileSync(path.join(targetAssetsRoot, 'apps/mapping/js/engine/structural-bias.js'), 'utf8');
for (const marker of ['classifySwingSequence', 'resolveMappingBias', 'existingMappingBias', 'BULLISH_HL_INVALIDATED', 'BEARISH_LH_INVALIDATED']) {
  if (!structuralBias.includes(marker)) fail(`structural bias module is missing ${marker}`);
}

const refreshDependencies = fs.readFileSync(path.join(targetAssetsRoot, 'apps/mapping/js/engine/mapping-refresh-dependencies.js'), 'utf8');
for (const marker of ['mappingRefreshDependencies', 'MAPPING_REFRESH_DEPENDENCIES']) {
  if (!refreshDependencies.includes(marker)) fail(`Mapping refresh dependency module is missing ${marker}`);
}

let compared = 0;
compared += compareTree('apps/mapping/js', 'assets/apps/mapping/js');
compared += compareTree('apps/mapping/css', 'assets/apps/mapping/css');
compared += compareTree('apps/shared', 'assets/apps/shared');

if (!process.exitCode) {
  console.log(`Amy FX PWA has zero drift across ${compared} synchronized Mapping/shared runtime files from Amy FX main ${String(metadata.commit).slice(0, 12)} / Pro 326.`);
}
