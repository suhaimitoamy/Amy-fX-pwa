# Amy FX PWA

Amy FX PWA adalah versi web installable untuk iPhone, iPad, dan browser modern. Repo ini dipisahkan dari **Amy-fx Android** agar pengembangan PWA tidak mengubah APK Android yang sudah dianggap selesai.

> **Platform:** Progressive Web App  
> **Target utama:** iPhone / iPad / browser modern  
> **Tahap saat ini:** Fondasi dan integrasi kode selesai, menunggu deployment serta pengujian perangkat  
> **Repo Android:** `suhaimitoamy/Amy-fx` — tidak diubah oleh repo ini

## Checkpoint Progres — 12 Juli 2026

### Sudah selesai di repo

- entry point PWA di root repository;
- manifest installable dan ikon iPhone ukuran 180, 192, dan 512 piksel;
- Service Worker untuk cache, offline fallback, dan pembaruan otomatis;
- platform adapter sebagai pengganti fungsi Android bridge;
- Dashboard, Mapping, Market Intel, Journal, Academy, dan Indicator Library terhubung ke fondasi PWA;
- konfigurasi login member melalui Supabase telah disiapkan;
- endpoint login mendukung login, pemeriksaan sesi, refresh token, dan logout;
- pendaftaran akun publik tidak disediakan;
- konfigurasi static deployment Vercel telah dibuat;
- workflow build APK, signing, Android lint, dan release APK telah dihapus;
- GitHub Actions sekarang difokuskan pada validasi PWA;
- Web Push tidak dipaksakan dan tetap nonaktif.

### Belum dilakukan dan sengaja ditunda

- membuat atau menghubungkan project `amy-fx-pwa` di Vercel;
- mendapatkan URL HTTPS produksi;
- membuat akun owner pertama di Supabase Auth;
- mengaktifkan `authRequired` setelah akun owner tersedia;
- pengujian langsung melalui Safari dan **Add to Home Screen** di iPhone;
- pengujian penuh setiap modul pada perangkat iPhone;
- perbaikan bug yang baru dapat terlihat setelah deployment dan tes perangkat;
- penghapusan folder Android lama dari repo PWA;
- Web Push background.

### Posisi progres

Fondasi teknis dan integrasi kode utama telah selesai. Project sudah berada pada tahap **siap dideploy dan diuji**, tetapi belum boleh dianggap selesai produksi sebelum URL HTTPS tersedia dan seluruh fungsi diuji langsung pada iPhone.

Secara praktis, pekerjaan repo berada sekitar **80% menuju versi PWA yang siap digunakan**. Sisa pekerjaan paling penting adalah deployment, pembuatan akun owner, pengaktifan login wajib, dan QA perangkat.

---

## Disclaimer

Amy FX:

- bukan robot trading atau Expert Advisor;
- tidak membuka atau mengelola order secara otomatis;
- tidak menjamin profit;
- bukan penasihat keuangan;
- hanya menjadi alat bantu analisis, pemetaan, jurnal, pemantauan market, dan pembelajaran.

Keputusan dan risiko trading tetap berada di tangan pengguna.

---

## Modul Utama

Keterangan **Aktif** pada tabel berikut berarti implementasinya sudah tersedia di repo PWA. Status tersebut belum berarti seluruh fungsi telah lulus pengujian langsung pada iPhone.

| Modul | Status PWA |
|---|---|
| Dashboard | Aktif di kode |
| Mapping XAU/USD | Aktif di kode |
| BSL/SSL dan rules engine | Aktif di kode |
| Market Intel | Aktif di kode |
| News XAU/USD | Aktif saat online |
| Liquidity Heatmap | Aktif saat online |
| Journal Trading | Aktif di kode |
| Amy FX Academy | Aktif di kode |
| Indicator Library | Aktif di kode |
| Offline app shell | Aktif |
| Update otomatis PWA | Aktif melalui Service Worker |
| Background scanner Android | Tidak dipindahkan |
| Web Push background | Nonaktif dan tidak dipaksakan |

---

## Struktur PWA

```text
index.html               Entry point PWA
manifest.webmanifest     Metadata instalasi
service-worker.js        Cache, offline, dan update
platform-adapter.js      Pengganti Android bridge
member-auth.js           Login member berbasis Supabase
pwa-config.json          Pengaturan runtime PWA
pwa-bootstrap.js         Instalasi dan pembaruan PWA
icons/                   Ikon iPhone dan browser
app/src/main/assets/     Dashboard dan seluruh modul Amy FX
```

Aset WebView dari APK tetap digunakan agar Mapping, Market Intel, Journal, Academy, dan rules engine tidak dirombak besar.

---

## Instalasi di iPhone

Bagian ini dilakukan setelah deployment HTTPS tersedia:

1. Buka URL Amy FX PWA melalui Safari.
2. Tekan tombol **Share**.
3. Pilih **Add to Home Screen**.
4. Buka ikon **Amy FX** dari Home Screen.
5. Uji Dashboard dan setiap modul utama.

Ikon PNG ukuran 180, 192, dan 512 piksel sudah tersedia untuk pemasangan PWA.

---

## Cache dan Offline

Service Worker menggunakan beberapa strategi:

- app shell, ikon, dan modul utama disiapkan untuk pembukaan cepat;
- CSS dan JavaScript memakai cache dengan pembaruan di background;
- harga, candle, News, Heatmap, Supabase, dan endpoint API selalu mencoba jaringan terlebih dahulu;
- halaman offline ditampilkan ketika navigasi tidak memiliki koneksi maupun cache;
- update PWA mengganti cache versi lama tanpa proses instal APK.

Data market terbaru tetap memerlukan koneksi internet.

---

## Login Member

Login member telah disiapkan melalui:

```text
https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/pwa-auth
```

Fungsi login mendukung:

- login email dan password;
- validasi sesi;
- refresh token;
- logout;
- tidak menyediakan pendaftaran publik.

Pengaturan berada di:

```text
pwa-config.json
```

Saat ini `authRequired` masih `false` agar aplikasi tidak terkunci sebelum akun pemilik dibuat. Setelah akun Supabase Auth tersedia dan login berhasil diuji, nilai tersebut dapat diubah menjadi `true` tanpa mengubah modul lainnya.

---

## Notifikasi

Service Worker memiliki penerima event Push sebagai fondasi teknis, tetapi langganan Web Push dan pengiriman backend sengaja belum diaktifkan.

Keputusan saat ini:

- fungsi utama PWA lebih diprioritaskan;
- scanner background Android tidak dipaksakan berjalan di iPhone;
- PWA tetap dapat digunakan tanpa Web Push;
- notifikasi hanya akan dipertimbangkan kembali setelah deployment dan pengujian fungsi utama selesai.

Pengaturan saat ini:

```json
{
  "webPushEnabled": false
}
```

---

## Deployment Vercel

Repo telah disiapkan untuk static deployment Vercel:

- `vercel.json` menangani redirect modul dan header PWA;
- `.vercelignore` mencegah Kotlin, Gradle, APK, dan file Android ikut dideploy;
- Service Worker mendapat scope `/`;
- manifest dan Service Worker tidak memakai cache permanen;
- seluruh route modul akan menggunakan HTTPS dari domain deployment.

Project Vercel menggunakan:

```text
Repository: suhaimitoamy/Amy-fX-pwa
Framework Preset: Other
Root Directory: ./
Build Command: kosong
Output Directory: kosong
```

Setelah repo dihubungkan, setiap push ke `main` akan menghasilkan deployment baru.

---

## GitHub Actions

Repo PWA hanya memakai workflow utama:

```text
.github/workflows/pwa-check.yml
```

Pemeriksaan mencakup:

- manifest dan ikon;
- Service Worker;
- entry point dan route modul;
- validitas JavaScript;
- konfigurasi login;
- memastikan Web Push tetap nonaktif sampai dikonfigurasi;
- static smoke test.

Workflow build APK, Android lint, debug build, signing, dan release APK telah dihapus dari repo PWA.

---

## Android Source Lama

Folder Kotlin, Gradle, dan resource Android masih disimpan sementara sebagai referensi migrasi. File tersebut:

- tidak dipakai oleh entry point PWA;
- tidak ikut deployment Vercel;
- tidak membangun atau menerbitkan APK;
- dapat dibersihkan setelah pengujian PWA di iPhone selesai.

---

## Urutan Pekerjaan Saat Dilanjutkan

1. Import repo `suhaimitoamy/Amy-fX-pwa` ke Vercel.
2. Pastikan deployment berhasil dan dapat dibuka melalui HTTPS.
3. Uji manifest, Service Worker, ikon, dan instalasi Home Screen.
4. Buat akun owner di Supabase Auth.
5. Uji login, refresh sesi, dan logout.
6. Ubah `authRequired` menjadi `true`.
7. Uji Dashboard, Mapping, Market Intel, Journal, Academy, dan Indicator Library di iPhone.
8. Perbaiki masalah kompatibilitas Safari yang ditemukan.
9. Bersihkan source Android lama setelah PWA dinyatakan stabil.
10. Pertimbangkan Web Push hanya bila memang diperlukan.

---

## Status Ringkas

| Komponen | Status |
|---|---|
| PWA entry point | Selesai |
| Manifest installable | Selesai |
| Ikon iPhone | Selesai |
| Service Worker | Selesai |
| Offline fallback | Selesai |
| Platform adapter | Selesai |
| Mapping | Terintegrasi, menunggu QA iPhone |
| Market Intel | Terintegrasi, menunggu QA iPhone |
| Journal | Terintegrasi, menunggu QA iPhone |
| Academy | Terintegrasi, menunggu QA iPhone |
| Login backend | Disiapkan dan endpoint terlindungi |
| Akun owner | Belum dibuat |
| Login wajib | Ditunda sampai akun owner tersedia |
| Web Push | Nonaktif sesuai keputusan |
| Android APK workflow | Dihapus |
| Konfigurasi Vercel | Siap |
| Project Vercel | Belum dibuat atau dihubungkan |
| URL HTTPS produksi | Belum tersedia |
| QA iPhone | Belum dilakukan |
