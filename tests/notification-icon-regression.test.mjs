import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const manifest = fs.readFileSync(
  new URL('../app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8'
);
const icon = fs.readFileSync(
  new URL('../app/src/main/res/drawable/ic_stat_amy_fx.xml', import.meta.url),
  'utf8'
);
const firebaseService = fs.readFileSync(
  new URL('../app/src/main/java/com/amyelitesuite/AmyFirebaseMessagingService.kt', import.meta.url),
  'utf8'
);
const scannerService = fs.readFileSync(
  new URL('../app/src/main/java/com/amyelitesuite/ScannerService.kt', import.meta.url),
  'utf8'
);

test('Firebase and native notifications use the AMY status icon', () => {
  assert.match(
    manifest,
    /com\.google\.firebase\.messaging\.default_notification_icon[\s\S]*@drawable\/ic_stat_amy_fx/
  );
  assert.match(firebaseService, /setSmallIcon\(R\.drawable\.ic_stat_amy_fx\)/);
  assert.match(scannerService, /setSmallIcon\(R\.drawable\.ic_stat_amy_fx\)/);
});

test('status icon is a monochrome AMY circle instead of the old chart arrow', () => {
  assert.match(icon, /Monochrome AMY badge/);
  assert.match(icon, /<!-- A -->/);
  assert.match(icon, /<!-- M -->/);
  assert.match(icon, /<!-- Y -->/);
  assert.match(icon, /strokeColor="#FFFFFFFF"/);
  assert.doesNotMatch(icon, /M16,6l2\.29,2\.29/);
});
