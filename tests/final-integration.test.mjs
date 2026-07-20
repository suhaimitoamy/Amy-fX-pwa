import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const path = relative => new URL(relative, root);
const source = relative => readFileSync(path(relative), 'utf8');

const criticalModules = [
  'app/src/main/assets/apps/mapping/js/main.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-analyze.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-engine.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-structure.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-liquidity.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-reference-levels.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-fvg.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-ob.js',
  'app/src/main/assets/apps/mapping/js/engine/concept-entry-map.js',
  'app/src/main/assets/apps/mapping/js/ui/entry-map-status.js',
  'app/src/main/assets/apps/mapping/js/entry-map-ui-sync.js'
];

test('all critical Mapping modules pass JavaScript syntax validation', () => {
  for (const module of criticalModules) {
    execFileSync(process.execPath, ['--check', path(module).pathname], { stdio: 'pipe' });
  }
});

test('M15 analysis uses the deterministic Entry Map as the execution setup', () => {
  const analyze = source('app/src/main/assets/apps/mapping/js/engine/concept-analyze.js');
  assert.match(analyze, /const useEntryMap = tf === 'M15'/);
  assert.match(analyze, /bestSetup = useEntryMap \? entryMap\.activeSetup/);
  assert.match(analyze, /entryMap,/);
});

test('Mapping UI loads Entry Map sync and displays WITA rule-based labels', () => {
  const html = source('app/src/main/assets/apps/mapping/index.html');
  const main = source('app/src/main/assets/apps/mapping/js/main.js');
  const sync = source('app/src/main/assets/apps/mapping/js/entry-map-ui-sync.js');

  assert.match(html, /entry-map-ui-sync\.js/);
  assert.match(main, /Asia\/Makassar/);
  assert.doesNotMatch(main, /Asia\/Jakarta/);
  assert.match(sync, /Mode Eksekusi/);
  assert.match(sync, /RULE-BASED/);
  assert.match(sync, /WITA/);
});
