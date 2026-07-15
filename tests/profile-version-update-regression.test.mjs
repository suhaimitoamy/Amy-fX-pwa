import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const versionUrl = new URL('../assets/app-version.js', import.meta.url);
const checkerUrl = new URL('../assets/update-checker.js', import.meta.url);
const indexUrl = new URL('../assets/index.html', import.meta.url);

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

test('profile displays Amy FX version 1.4.7 and supports manual update checks', () => {
  const version = source(versionUrl);
  const index = source(indexUrl);
  assert.match(version, /name: '1\.4\.7'/);
  assert.match(version, /code: 30/);
  assert.match(version, /Versi Aplikasi/);
  assert.match(version, /data-profile-action=\\?"version/);
  assert.match(version, /AmyFXUpdate\?\.checkNow/);
  assert.match(index, /<script src="app-version\.js"><\/script>\s*<script src="app\.js"><\/script>\s*<script src="update-checker\.js"><\/script>/);
});

test('cancel closes update popup temporarily without persisting dismissal', () => {
  const checker = source(checkerUrl);
  assert.match(checker, /cancelBtn\.onclick = closePopup/);
  assert.doesNotMatch(checker, /localStorage\.setItem\(['"]amy_fx_update_dismissed_version/);
  assert.doesNotMatch(checker, /localStorage\.setItem\(['"]amy_fx_update_last_check/);
  assert.match(checker, /localStorage\.removeItem\('amy_fx_update_dismissed_version'\)/);
  assert.match(checker, /visibilitychange/);
  assert.match(checker, /checkUpdate\(\{ force: true \}\)/);
  assert.match(checker, /window\.AmyFXUpdate/);
});
