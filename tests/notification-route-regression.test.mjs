import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate = fs.readFileSync(new URL('../app/src/main/java/com/amyelitesuite/AmyFxNotificationGate.java', import.meta.url), 'utf8');
const activity = fs.readFileSync(new URL('../app/src/main/java/com/amyelitesuite/MainActivity.kt', import.meta.url), 'utf8');

test('native notification gate memiliki tujuan eksplisit untuk setiap modul utama', () => {
  assert.match(gate, /return "News"/);
  assert.match(gate, /apps\/market-intel\/index\.html/);
  assert.match(gate, /apps\/journal\/index\.html/);
  assert.match(gate, /apps\/academy\/index\.html/);
});

test('notifikasi tanpa URL memakai tujuan modul hasil routing', () => {
  assert.match(activity, /normalizeLocalUrl\(url\)[\s\S]*\?: AmyFxNotificationGate\.routeUrl\(route\)/);
  assert.match(activity, /putExtra\("target_url", routedUrl\)/);
});
