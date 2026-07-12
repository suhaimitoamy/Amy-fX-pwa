# Amy FX PWA

Amy FX PWA adalah versi web installable untuk iPhone dan browser modern. Repo ini dipisahkan dari **Amy-fx Android** agar pengembangan PWA tidak mengubah APK yang sudah selesai.

> **Platform:** Progressive Web App  
> **Target utama:** iPhone / iPad / browser modern  
> **Status:** Fondasi PWA aktif  
> **Repo Android:** `suhaimitoamy/Amy-fx` — tidak diubah oleh repo ini

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

| Modul | Status PWA |
|---|---|
| Dashboard | Aktif |
| Mapping XAU/USD | Aktif |
| BSL/SSL dan rules engine | Aktif |
| Market Intel | Aktif |
| News XAU/USD | Aktif saat online |
| Liquidity Heatmap | Aktif saat online |
| Journal Trading | Aktif |
| Amy FX Academy | Aktif |
| Indicator Library | Aktif |
| Offline app shell | Aktif |
| Update otomatis PWA | Aktif melalui Service Worker |
| Background scanner Android | Tidak dipindahkan |
| Web Push background | Belum diaktifkan dan tidak dipaksakan |

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

Setelah deployment HTTPS tersedia:

1. Buka URL Amy FX PWA melalui Safari.
2. Tekan tombol **Share**.
3. Pilih **Add to Home Screen**.
4. Buka ikon **Amy FX** dari Home Screen.

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

Saat ini `authRequired` masih `false` agar aplikasi tidak terkunci sebelum akun pemilik dibuat. Setelah akun Supabase Auth tersedia, nilai tersebut dapat diubah menjadi `true` tanpa mengubah modul lainnya.

---

## Notifikasi

Service Worker memiliki penerima event Push sebagai fondasi teknis, tetapi langganan Web Push dan pengiriman backend sengaja belum diaktifkan.

Alasannya:

- fungsi inti PWA lebih diprioritaskan;
- scanner background Android tidak dipaksakan berjalan di iPhone;
- notifikasi hanya akan diaktifkan setelah alur instalasi dan fungsi utama berhasil diuji pada perangkat iPhone.

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
- seluruh route modul menggunakan HTTPS dari domain deployment.

Project Vercel sebaiknya menggunakan:

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

Repo PWA hanya memakai workflow:

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

## Status Saat Ini

| Komponen | Status |
|---|---|
| PWA entry point | Aktif |
| Manifest installable | Aktif |
| Ikon iPhone | Aktif |
| Service Worker | Aktif |
| Offline fallback | Aktif |
| Platform adapter | Aktif |
| Mapping | Aktif |
| Market Intel | Aktif |
| Journal | Aktif |
| Academy | Aktif |
| Login backend | Aktif |
| Login wajib | Menunggu akun pemilik |
| Web Push | Nonaktif sesuai keputusan |
| Android APK workflow | Dihapus |
| Vercel config | Siap |
