import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const uiUrl = new URL('../app/src/main/assets/apps/mapping/js/market-outlook.js', import.meta.url);
const coreUrl = new URL('../app/src/main/assets/apps/mapping/js/outlook/market-outlook-core.js', import.meta.url);
const baseUrl = new URL('../app/src/main/assets/apps/mapping/js/outlook/v2/base.js', import.meta.url);
const indexUrl = new URL('../app/src/main/assets/apps/mapping/index.html', import.meta.url);

function assertSyntax(url) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('market outlook JavaScript files remain syntactically valid', () => {
  assertSyntax(uiUrl);
  assertSyntax(coreUrl);
  assertSyntax(baseUrl);
});

test('mapping page loads market outlook style and module', () => {
  const html = readFileSync(indexUrl, 'utf8');
  assert.match(html, /css\/market-outlook\.css/);
  assert.match(html, /js\/market-outlook\.js/);
});

test('outlook UI keeps the three prediction horizons and tracker threshold', () => {
  const ui = readFileSync(uiUrl, 'utf8');
  const base = readFileSync(baseUrl, 'utf8');
  assert.match(base, /label: '1–4 Jam'/);
  assert.match(base, /label: 'Sesi Berjalan'/);
  assert.match(base, /label: '24 Jam'/);
  assert.match(ui, /Prediction Tracker/i);
  assert.match(ui, /minimal 20 outlook selesai/);
  assert.match(ui, /bukan rekomendasi entry/);
});
