import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const uiUrl = new URL('../assets/apps/market-intel/heatmap-v2.js', import.meta.url);
const indexUrl = new URL('../assets/apps/market-intel/index.html', import.meta.url);
const sharedUrl = new URL('../assets/apps/shared/market-intelligence.js', import.meta.url);
const apiUrl = new URL('../api/heatmap.js', import.meta.url);

function assertSyntax(url) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('browser heatmap scripts remain syntactically valid', () => {
  assertSyntax(uiUrl);
  assertSyntax(sharedUrl);
});

test('market intel page loads dynamic heatmap assets after legacy app script', () => {
  const html = readFileSync(indexUrl, 'utf8');
  assert.match(html, /heatmap-v2\.css/);
  assert.match(html, /<script src="app\.js"><\/script>\s*<script src="heatmap-v2\.js"><\/script>/);
  assert.match(html, /M15 · Dynamic/);
});

test('dynamic heatmap refreshes independently and tracks strength changes', () => {
  const ui = readFileSync(uiUrl, 'utf8');
  assert.match(ui, /REFRESH_MS = 20 \* 1000/);
  assert.match(ui, /MENGUAT/);
  assert.match(ui, /MELEMAH/);
  assert.match(ui, /POLARITY FLIP/);
  assert.match(ui, /HARGA BERJALAN/);
  assert.match(ui, /window\.loadHeatmap = loadDynamicHeatmap/);
});

test('heatmap API uses dynamic lifecycle engine and short CDN cache', () => {
  const api = readFileSync(apiUrl, 'utf8');
  assert.match(api, /computeDynamicHeatmap/);
  assert.match(api, /await import\('\.\.\/lib\/heatmap-core\.mjs'\)/);
  assert.match(api, /s-maxage=15, stale-while-revalidate=20/);
  assert.match(api, /sourceCandleTime/);
  assert.doesNotMatch(api, /const BUCKET_SIZE = 2\.0/);
});

test('shared briefing accepts heatmap BSL SSL and freshest price', () => {
  const shared = readFileSync(sharedUrl, 'utf8');
  assert.match(shared, /function bestCurrentPrice/);
  assert.match(shared, /normalizedHeatmapLevels/);
  assert.match(shared, /heatmapBsl/);
  assert.match(shared, /heatmapSsl/);
  assert.match(shared, /state\.heatmap\?\.summary\?\.pressure/);
});
