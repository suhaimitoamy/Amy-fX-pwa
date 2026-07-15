import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const uiUrl = new URL('../assets/apps/mapping/js/session/asia-range-ui.js', import.meta.url);

function source() {
  return readFileSync(uiUrl, 'utf8');
}

test('Asia range UI module remains syntactically valid', () => {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(uiUrl)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('MutationObserver does not call the renderer directly', () => {
  const code = source();
  assert.match(code, /new MutationObserver\(scheduleAsiaRangeSync\)/);
  assert.doesNotMatch(code, /new MutationObserver\(\(\) => syncAsiaRangeUi\(\)\)/);
  assert.match(code, /if \(syncQueued\) return;/);
});

test('Asia range markup is only written when content changes', () => {
  const code = source();
  assert.match(code, /const renderedMarkup = new WeakMap\(\)/);
  assert.match(code, /renderedMarkup\.get\(element\) === markup/);
  assert.match(code, /setMarkupIfChanged\(block, dashboardMarkup\(range\)\)/);
  assert.match(code, /setMarkupIfChanged\(strip, analyzeMarkup\(range\)\)/);
  assert.doesNotMatch(code, /block\.innerHTML = dashboardMarkup\(range\)/);
  assert.doesNotMatch(code, /strip\.innerHTML = analyzeMarkup\(range\)/);
});
