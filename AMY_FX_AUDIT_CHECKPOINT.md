# CHECKPOINT AMY FX — Tahap 5

Tanggal: 2026-07-14

## Status

- Branch kerja: `agent/amyfx-stage5-release`
- Target rilis: Amy FX `1.4.6`
- Version code: `29`
- Application ID: `com.amyelitesuite` (tidak berubah)
- Target merge: `main`, hanya setelah seluruh validasi lulus
- Metadata update publik tetap menunjuk `1.4.5` / `28` sampai APK `1.4.6` benar-benar selesai dipublikasikan

## Temuan dan perbaikan tahap 5

1. Credential TwelveData lama masih dapat tersimpan di WebView dan preference Android.
   - Penyimpanan lokal dihapus.
   - Mapping dan scanner memakai proxy Amy FX tanpa meminta API key pengguna.
   - Credential hanya dibaca dari environment server.

2. Endpoint market masih menerima metode dan parameter terlalu luas.
   - Dibatasi ke `GET` dan `OPTIONS`.
   - Symbol dikunci ke `XAU/USD`.
   - Interval memakai daftar izin.
   - Output size dibatasi.
   - Ditambahkan timeout upstream dan respons error yang tidak membocorkan detail internal.

3. URL notifikasi native dapat berasal dari input yang belum dinormalisasi.
   - Semua URL notifikasi dinormalisasi ke aset lokal Amy FX.
   - URL yang tidak dipercaya dialihkan ke route internal yang aman.
   - Ikon notifikasi memakai `ic_stat_amy_fx`.

4. Jalur rilis belum mengunci identitas sertifikat secara eksplisit.
   - Fingerprint SHA-256 sertifikat update lama dipasang sebagai invariant CI.
   - Build dihentikan bila fingerprint berubah.
   - APK diverifikasi ulang dengan `aapt` dan `apksigner` sebelum publikasi.

5. Aktivasi `update.json` dapat bertabrakan dengan perubahan baru pada `main`.
   - Build rilis memakai concurrency tunggal.
   - Metadata dibuat dari `origin/main` terbaru setelah APK berhasil diunggah.
   - Push metadata memakai fetch, rebase, dan retry terbatas.

6. Versi rilis sebelumnya masih `1.4.5` / `28` pada workflow.
   - Build otomatis dan manual disiapkan untuk `1.4.6` / `29`.

## Validasi yang telah berhasil

Pada release candidate yang berisi perubahan aplikasi:

- JavaScript regression tests: lulus
- Android release unit tests: lulus
- Android release lint: lulus
- Signed release APK build: lulus
- Package name `com.amyelitesuite`: terverifikasi
- Version name `1.4.6`: terverifikasi
- Version code `29`: terverifikasi
- APK signature verification: lulus
- Fingerprint signer cocok dengan APK lama: lulus
- `git diff --check`: lulus

Validasi final dijalankan ulang setelah pembersihan workflow sementara dan hardening workflow publikasi.

## File utama yang berubah

- `.github/workflows/build-apk.yml`
- `.github/workflows/build-release.yml`
- `.github/workflows/stage5-apply.yml`
- `README.md`
- `api/twelvedata.js`
- `app/build.gradle.kts`
- `app/src/main/assets/app-version.js`
- `app/src/main/assets/update-checker.js`
- `app/src/main/assets/apps/mapping/js/main.js`
- `app/src/main/assets/apps/mapping/js/bridge/android-bridge.js`
- `app/src/main/java/com/amyelitesuite/MainActivity.kt`
- `tests/notification-route-regression.test.mjs`
- `tests/profile-version-update-regression.test.mjs`
- `tests/stage5-hardening.test.mjs`
- `update.json`

## Masalah yang tidak dapat diselesaikan hanya dari repository

- Pembatasan Firebase API key harus diverifikasi langsung di Firebase / Google Cloud Console.
- Smoke test endpoint produksi dilakukan setelah sumber terbaru ter-deploy.
- Tautan Academy yang belum memiliki canonical content map tidak boleh diperbaiki dengan tebakan massal.

## Urutan penyelesaian

1. Pastikan validasi final branch lulus seluruhnya.
2. Ubah PR dari draft menjadi siap merge.
3. Merge ke `main`.
4. Biarkan workflow `Build and Publish Amy FX APK` membangun serta memublikasikan APK `1.4.6` / `29`.
5. Pastikan release `amyfx-latest` berisi APK baru.
6. Pastikan `update.json` baru berubah menjadi `1.4.6` / `29` setelah publikasi berhasil.
7. Uji pemasangan APK di atas versi lama tanpa uninstall dan pastikan data lokal tetap tersedia.
