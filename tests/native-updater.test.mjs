import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('MainActivity exposes native updater bridge and resumes pending installation', () => {
  const main = read('app/src/main/java/com/amyelitesuite/MainActivity.kt');
  assert.match(main, /private lateinit var nativeUpdater: NativeAppUpdater/);
  assert.match(main, /fun startAppUpdate\(downloadUrl: String\?, versionName: String\?, versionCode: Int\)/);
  assert.match(main, /nativeUpdater\.start\(downloadUrl\.orEmpty\(\), versionName\.orEmpty\(\), versionCode\)/);
  assert.match(main, /fun cancelAppUpdate\(\)/);
  assert.match(main, /nativeUpdater\.resumePendingInstall\(\)/);
});

test('native updater downloads only HTTPS GitHub APKs into private cache', () => {
  const updater = read('app/src/main/java/com/amyelitesuite/NativeAppUpdater.kt');
  assert.match(updater, /uri\?\.scheme != "https"/);
  assert.match(updater, /host == "github\.com"/);
  assert.match(updater, /File\(activity\.cacheDir, "updates"\)/);
  assert.doesNotMatch(updater, /Environment\.DIRECTORY_DOWNLOADS/);
  assert.doesNotMatch(updater, /DownloadManager/);
  assert.match(updater, /MIN_APK_BYTES/);
  assert.match(updater, /hasZipHeader/);
});

test('downloaded APK must match package, exact version and installed signer', () => {
  const updater = read('app/src/main/java/com/amyelitesuite/NativeAppUpdater.kt');
  assert.match(updater, /archive\.packageName != activity\.packageName/);
  assert.match(updater, /archiveVersionCode != expectedVersionCode\.toLong\(\)/);
  assert.match(updater, /archiveVersionCode <= currentVersionCode\(\)/);
  assert.match(updater, /installedSigners != archiveSigners/);
  assert.match(updater, /MessageDigest\.getInstance\("SHA-256"\)/);
});

test('installer uses FileProvider and requests per-app unknown-source permission', () => {
  const updater = read('app/src/main/java/com/amyelitesuite/NativeAppUpdater.kt');
  const manifest = read('app/src/main/AndroidManifest.xml');
  const paths = read('app/src/main/res/xml/file_paths.xml');
  assert.match(manifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.match(manifest, /\$\{applicationId\}\.fileprovider/);
  assert.match(paths, /<cache-path[^>]*path="updates\/"/);
  assert.match(updater, /Settings\.ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(updater, /FileProvider\.getUriForFile/);
  assert.match(updater, /Intent\.FLAG_GRANT_READ_URI_PERMISSION/);
});

test('update popup displays native progress and keeps browser only as legacy fallback', () => {
  const checker = read('app/src/main/assets/update-checker.js');
  assert.match(checker, /typeof window\.Android\.startAppUpdate === 'function'/);
  assert.match(checker, /window\.Android\.startAppUpdate/);
  assert.match(checker, /window\.Android\.cancelAppUpdate/);
  assert.match(checker, /onProgress\(percent, downloaded, total\)/);
  assert.match(checker, /Memverifikasi/);
  assert.match(checker, /cache Amy FX/);
  assert.match(checker, /window\.location\.href = downloadUrl/);
});
