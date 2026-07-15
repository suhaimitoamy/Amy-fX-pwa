import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../assets/apps/mapping/js/main.js', import.meta.url),
  'utf8'
);

test('Mapping navigation does not install a self-triggering Settings observer', () => {
  assert.doesNotMatch(source, /new\s+MutationObserver\s*\(\s*syncAutomaticScannerUi\s*\)/);
});

test('Mapping keeps direct handlers for every bottom navigation button', () => {
  assert.match(source, /querySelectorAll\('\.nav button'\)/);
  assert.match(source, /addEventListener\('click',\s*\(\)\s*=>\s*setTab\(button\.dataset\.tab\)\)/);
});
