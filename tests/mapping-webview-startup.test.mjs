import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/src/main/assets/apps/mapping/index.html', import.meta.url), 'utf8');
const entrySync = readFileSync(new URL('../app/src/main/assets/apps/mapping/js/entry-map-ui-sync.js', import.meta.url), 'utf8');

test('Mapping provides an ICU-safe fallback for Asia/Makassar', () => {
  assert.match(html, /options\.timeZone === 'Asia\/Makassar'/);
  assert.match(html, /fallback\.timeZone = 'Asia\/Singapore'/);
  assert.match(html, /Intl\.DateTimeFormat = AmyDateTimeFormat/);
});

test('Mapping never leaves an empty screen when startup rendering throws', () => {
  assert.match(html, /window\.__amyMappingStartupError/);
  assert.match(html, /MAPPING RECOVERY/);
  assert.match(html, /location\.reload\(\)/);
});

test('Entry Map UI follows the 1.4.7 lightweight render model without a global mutation loop', () => {
  assert.doesNotMatch(entrySync, /observe\(document\.documentElement/);
  assert.doesNotMatch(entrySync, /setInterval\(sync/);
  assert.match(entrySync, /observer\.observe\(app, \{ childList: true \}\)/);
  assert.match(entrySync, /if \(element && element\.textContent !== text\)/);
  assert.match(entrySync, /requestAnimationFrame/);
});
