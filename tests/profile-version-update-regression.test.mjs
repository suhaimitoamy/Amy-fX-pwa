import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const versionUrl = new URL('../app/src/main/assets/app-version.js', import.meta.url);
const checkerUrl = new URL('../app/src/main/assets/update-checker.js', import.meta.url);
const indexUrl = new URL('../app/src/main/assets/index.html', import.meta.url);

function source(url) {
  return readFileSync(url, 'utf8');
}

function assertSyntax(url) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('version and update scripts remain syntactically valid', () => {
  assertSyntax(versionUrl);
  assertSyntax(checkerUrl);
});

test('profile displays Amy FX version 1.4.13 and supports manual update checks', () => {
  const version = source(versionUrl);
  const index = source(indexUrl);
  assert.match(version, /name: '1\.4\.13'/);
  assert.match(version, /code: 36/);
  assert.match(version, /Versi Aplikasi/);
  assert.match(version, /data-profile-action=\\?"version/);
  assert.match(version, /AmyFXUpdate\?\.checkNow/);
  assert.match(index, /<script src="app-version\.js"><\/script>\s*<script src="app\.js"><\/script>\s*<script src="update-checker\.js"><\/script>/);
});

test('native updater owns download progress while browser remains a legacy fallback', () => {
  const checker = source(checkerUrl);
  assert.match(checker, /window\.Android\.startAppUpdate/);
  assert.match(checker, /window\.Android\.cancelAppUpdate/);
  assert.match(checker, /window\.AmyFXUpdateNative/);
  assert.match(checker, /onProgress\(percent, downloaded, total\)/);
  assert.match(checker, /File tidak menumpuk di folder Download/);
  assert.match(checker, /window\.location\.href = downloadUrl/);
  assert.match(checker, /hasNativeUpdater\(\)/);
});

test('cancel never persists dismissal of a newer version', () => {
  const checker = source(checkerUrl);
  assert.doesNotMatch(checker, /localStorage\.setItem\(['"]amy_fx_update_dismissed_version/);
  assert.doesNotMatch(checker, /localStorage\.setItem\(['"]amy_fx_update_last_check/);
  assert.match(checker, /localStorage\.removeItem\('amy_fx_update_dismissed_version'\)/);
  assert.match(checker, /visibilitychange/);
  assert.match(checker, /checkUpdate\(\{ force: true \}\)/);
  assert.match(checker, /window\.AmyFXUpdate/);
});
