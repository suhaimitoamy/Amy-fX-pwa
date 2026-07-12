# Amy FX

Amy FX adalah aplikasi Android hybrid untuk pemetaan dan pemantauan market **XAU/USD**. Antarmuka utama berjalan melalui WebView lokal, sedangkan fungsi Android seperti notifikasi, background scanner, penyimpanan aman, download, Firebase Messaging, dan update aplikasi ditangani oleh Kotlin native.

> **Versi terbaru:** `1.3.2`  
> **Version code:** `15`  
> **Minimum Android:** Android 8.0 / API 26  
> **Application ID:** `com.amyelitesuite`

[Download APK resmi Amy FX](https://github.com/suhaimitoamy/Amy-fx/releases/download/amyfx-latest/AmyFX-latest.apk)

## Disclaimer

Amy FX:

- bukan robot trading atau Expert Advisor;
- tidak membuka, menutup, atau mengelola order secara otomatis;
- tidak menjamin profit atau kemenangan trading;
- bukan penasihat keuangan;
- hanya menjadi alat bantu analisis, pemetaan, pemantauan level, jurnal, dan pembelajaran.

Keputusan dan risiko trading tetap berada di tangan pengguna.

---

## Modul Utama

| Modul | Fungsi |
|---|---|
| **Mapping** | Analisis struktur XAU/USD, BSL/SSL, HTF bias, liquidity, FVG, Order Block, setup, dan target |
| **Market Intel** | News XAU/USD, risiko berita, liquidity heatmap, dan ringkasan market |
| **Journal Trading** | Catatan trade, evaluasi, riwayat, dan laporan |
| **Amy Trading Academy** | Materi pembelajaran trading di dalam aplikasi |
| **Indicator Library** | Library indikator dan file Pine Script TradingView |
| **Dashboard** | Akses cepat ke seluruh modul Amy FX |

---

## Update Terbaru — v1.3.2

- BSL dan SSL pada command strip sekarang menampilkan **harga level terbaru**, bukan hanya tanda `--` atau jarak level.
- Data Mapping terbaru diprioritaskan dibanding cache liquidity yang lebih lama.
- BSL/SSL diperbarui setelah Mapping selesai melakukan analisis.
- Harga live dan status market memperbarui tampilan tanpa menjalankan analisis penuh setiap saat.
- Sistem **In-App Update** sudah aktif dan berhasil diuji dari v1.3.1 ke v1.3.2 tanpa uninstall.
- APK resmi menggunakan jalur signing yang sama agar versi berikutnya dapat dipasang dengan tombol **Perbarui**.

### Perbaikan v1.3.1

- Memperbaiki halaman Mapping yang freeze.
- Menghapus loop `MutationObserver` yang terus memicu pembaruan UI.
- Mengembalikan fungsi tombol Dashboard, Analyze, Setup, History, dan Settings.
- Mengurangi proses background yang tidak diperlukan saat aplikasi dibuka.

---

## Mapping XAU/USD

Mapping Amy FX menggunakan **rules engine berbasis konsep ICT**, bukan AI yang menebak arah market.

Alur analisis utama:

1. HTF Narrative dari H4, D1, dan W1.
2. Struktur market dan valid break BOS/CHOCH.
3. Liquidity hierarchy: internal, external, equal highs/lows, dan swept liquidity.
4. Dealing range, equilibrium, premium, dan discount.
5. Kualitas Fair Value Gap dan Order Block.
6. Model entry seperti Sweep → MSS/CHOCH → FVG.
7. Checklist score dan conflict filter.
8. Penyusunan setup, entry area, invalidasi, dan target.

### BSL dan SSL Terbaru

- **BSL** adalah Buy-Side Liquidity aktif di atas harga.
- **SSL** adalah Sell-Side Liquidity aktif di bawah harga.
- Command strip menampilkan harga BSL dan SSL terdekat yang belum tersapu.
- Level dari hasil Mapping terbaru diprioritaskan.
- Bila data Mapping belum tersedia, aplikasi dapat memakai liquidity/heatmap yang masih segar sebagai fallback.

### Timeframe

Mapping menyediakan M15, H1, H4, dan D1 pada tampilan utama. Mesin juga memuat timeframe pendukung M1, M5, M30, H1, H4, D1, dan W1 sesuai kebutuhan analisis.

---

## Background Scanner

File native utama:

```text
app/src/main/java/com/amyelitesuite/ScannerService.kt
```

Scanner dibuat ringan dan tidak hidup terus-menerus tanpa alasan.

- Aktif otomatis hanya ketika Mapping menghasilkan area M15 yang valid.
- Tidak memerlukan tombol ON manual.
- Tidak menghitung ulang seluruh rules engine di background.
- Hanya memeriksa harga terhadap area BUY/SELL aktif.
- Polling harga berjalan sekitar setiap 30 detik ketika target aktif.
- Target berhenti dipantau ketika sudah tidak ada atau berumur lebih dari 24 jam.
- Scanner menampilkan notifikasi foreground berprioritas rendah hanya saat area sedang dipantau.
- Ketika harga menyentuh area, notifikasi target berprioritas tinggi membuka halaman Mapping.

---

## News dan Notifikasi

Amy FX memakai dua jalur notifikasi berita:

1. **Firebase Cloud Messaging** sebagai jalur utama ketika aplikasi ditutup.
2. **WorkManager** sebagai fallback ringan saat perangkat memiliki koneksi internet.

Fallback WorkManager:

- dijadwalkan oleh Android sekitar setiap 15 menit;
- tidak membuka WebView;
- tidak menjalankan foreground service permanen;
- tidak melakukan polling setiap beberapa detik;
- membuka berita terkait ketika notifikasi ditekan.

Endpoint News:

```text
https://amy-fx.vercel.app/api/news
```

Sumber utama berasal dari backend Supabase, dengan Telegram `SM_News_24h` sebagai fallback.

---

## Market Intel

Market Intel menyediakan:

| Panel | Fungsi |
|---|---|
| **News** | Berita relevan untuk XAU/USD dan klasifikasi risiko |
| **Liquidity Heatmap** | Zona swing dan konsentrasi liquidity dari data candle |
| **Command Strip** | Harga XAU/USD, sesi aktif, BSL, SSL, risiko news, dan status data |
| **Market Briefing** | Ringkasan rule-based dari Mapping, liquidity, sesi, dan news |

Backend Vercel:

```text
api/news.js       → News Supabase dengan Telegram fallback
api/twelvedata.js → Proxy data candle dan harga XAU/USD
api/heatmap.js    → Perhitungan liquidity heatmap
```

Environment variable yang dibutuhkan di Vercel:

| Key | Fungsi |
|---|---|
| `TWELVEDATA_API_KEY` | Mengambil harga dan candle XAU/USD dari TwelveData |

---

## Performa, Cache, dan Lazy Loading

Amy FX sudah memakai beberapa mekanisme agar aplikasi tidak berat:

- Asset HTML, CSS, dan JavaScript utama disimpan lokal di APK dan dilayani melalui `WebViewAssetLoader`.
- Modul Mapping, Market Intel, Journal, Academy, dan Library baru dibuka ketika dipilih.
- WebView menggunakan cache bawaan Android dengan mode `LOAD_DEFAULT`.
- DOM storage/localStorage dipakai untuk menyimpan state, jurnal, progres, cache Mapping, dan pengaturan.
- Candle disimpan dalam cache dan hanya dimuat ulang ketika timeframe dianggap kedaluwarsa.
- Harga live pada halaman Mapping diperiksa sekitar setiap 20 detik ketika halaman terlihat.
- Polling dan analisis dihentikan atau dikurangi ketika WebView tidak terlihat.
- Analisis penuh dijadwalkan berdasarkan umur timeframe, bukan setiap perubahan harga.
- Cache WebView dapat dibersihkan otomatis saat Android melaporkan kondisi memori rendah.
- Background scanner hanya berjalan ketika ada target M15 aktif.
- News memakai FCM dan WorkManager, bukan foreground polling terus-menerus.

---

## Sistem Update Tanpa Uninstall

Amy FX memiliki pemeriksaan update di dalam aplikasi.

Alurnya:

1. Aplikasi memeriksa `update.json` secara berkala.
2. Popup **Update Amy FX Tersedia** menampilkan versi dan catatan perubahan.
3. Tombol **Unduh & Perbarui** membuka APK resmi terbaru.
4. Android menampilkan pilihan **Perbarui**.
5. Data jurnal, progres Academy, pengaturan, dan data lokal tetap tersimpan.

Syarat agar update dapat dipasang tanpa uninstall:

- `applicationId` tetap `com.amyelitesuite`;
- `versionCode` selalu meningkat;
- APK dibuat dengan signing key resmi yang sama;
- pengguna memasang `AmyFX-latest.apk`, bukan APK debug atau lint report.

Metadata update berada di:

```text
update.json
```

APK rolling resmi berada di GitHub Release dengan tag:

```text
amyfx-latest
```

---

## Cara Instal

1. Download [AmyFX-latest.apk](https://github.com/suhaimitoamy/Amy-fx/releases/download/amyfx-latest/AmyFX-latest.apk).
2. Izinkan browser atau file manager memasang aplikasi dari sumber tersebut.
3. Instal Amy FX.
4. Buka aplikasi dan izinkan notifikasi.
5. Untuk update berikutnya, jangan uninstall; gunakan popup **Unduh & Perbarui**.

> Hanya gunakan `AmyFX-latest.apk` sebagai aplikasi resmi. File lint report, ZIP source code, dan internal debug build bukan APK pengguna.

---

## Teknologi

- Kotlin / Android SDK 35
- Java 17
- Android WebView + WebViewAssetLoader
- HTML, CSS, dan JavaScript ES Modules
- Firebase Cloud Messaging
- Android WorkManager
- OkHttp
- Vercel Serverless Functions
- Supabase Edge Functions
- TwelveData API
- GitHub Actions

---

## Struktur Penting

```text
app/src/main/java/com/amyelitesuite/
├── MainActivity.kt
├── ScannerService.kt
├── AmyFirebaseMessagingService.kt
├── AmyFxApplication.kt
├── NewsSyncWorker.kt
├── FcmDeviceRegistrar.kt
└── AmyFxNotificationGate.java

app/src/main/assets/
├── index.html
├── app.js
├── update-checker.js
└── apps/
    ├── mapping/
    ├── market-intel/
    ├── journal/
    ├── academy/
    └── shared/

api/
├── news.js
├── twelvedata.js
└── heatmap.js
```

---

## Build dan CI

Build resmi dilakukan melalui GitHub Actions.

### Build and Publish Amy FX APK

File:

```text
.github/workflows/build-apk.yml
```

Workflow ini:

- menjalankan JavaScript regression tests;
- menjalankan Android unit tests;
- menjalankan Android lint;
- membangun signed release APK;
- memverifikasi tanda tangan dengan `apksigner`;
- mengunggah artifact;
- memperbarui GitHub Release `amyfx-latest`.

### Internal Build Validation

File:

```text
.github/workflows/build-debug.yml
```

Workflow debug hanya untuk validasi internal dan tidak menjadi APK resmi pengguna.

### Manual Release Build

File:

```text
.github/workflows/build-release.yml
```

Digunakan untuk build release manual dengan `versionName` dan `versionCode` yang ditentukan.

---

## Status Saat Ini

| Komponen | Status |
|---|---|
| Android app | Aktif |
| Mapping XAU/USD | Aktif |
| Live price | Aktif |
| BSL/SSL terbaru | Aktif |
| Background target scanner | Aktif saat target M15 tersedia |
| News di aplikasi | Aktif |
| FCM news notification | Aktif sebagai jalur utama |
| WorkManager news fallback | Aktif |
| Market Intel / Heatmap | Aktif |
| In-App Update | Aktif dan berhasil diuji |
| Signed rolling APK | Aktif |
| JavaScript tests | Aktif di CI |
| Android unit tests | Aktif di CI |
| Android lint | Aktif di CI |
