# Amy FX PWA Migration

Dokumen ini mencatat perubahan repo Android hasil salinan menjadi PWA untuk pengguna iPhone dan browser modern.

## Tujuan

Mempertahankan fungsi utama Amy FX:

- Dashboard dan navigasi modul;
- Mapping XAU/USD;
- BSL/SSL dan rules engine Mapping;
- Market Intel, News, Liquidity, dan Heatmap;
- Journal Trading dan library;
- Amy FX Academy;
- Indicator Library;
- penyimpanan data lokal dan cache;
- update aplikasi melalui Service Worker.

## Fondasi PWA

- Entry point web berada di `/index.html`.
- Manifest instalasi berada di `/manifest.webmanifest`.
- Service Worker berada di `/service-worker.js` dengan scope `/`.
- Adapter pengganti fungsi Android native berada di `/platform-adapter.js`.
- Alur instalasi dan update PWA berada di `/pwa-bootstrap.js`.
- Aset WebView lama tetap digunakan dari `app/src/main/assets` agar rules engine dan UI tidak dirombak besar.

## Strategi Cache

- App shell dan halaman modul utama dipersiapkan untuk penggunaan offline.
- CSS, JavaScript, ikon, dan konten statis memakai stale-while-revalidate.
- API, News, harga, candle, dan data market memakai network-first dengan cache sebagai fallback.
- Data market terbaru tetap memerlukan internet.

## Kompatibilitas Android Bridge

`platform-adapter.js` menyediakan pengganti berbasis Web API untuk:

- toast;
- haptic bila browser mendukung;
- copy dan share;
- download file;
- membuka tautan eksternal;
- notifikasi lokal yang sudah mendapat izin;
- storage lokal;
- pembersihan runtime cache.

Kode yang masih memanggil `window.Android` tidak langsung rusak karena adapter menyediakan compatibility bridge.

## Background dan Notifikasi

PWA tidak memaksa scanner Android berjalan terus-menerus di background. Mapping tetap berjalan saat aplikasi dibuka. Service Worker sudah memiliki handler Web Push, tetapi langganan perangkat dan pengiriman backend akan diaktifkan sebagai tahap terpisah setelah fungsi utama PWA stabil.

## Android Source

Folder Android masih dipertahankan sementara sebagai referensi migrasi. Setelah PWA berhasil diuji di iPhone, file Kotlin, Gradle, APK workflow, dan konfigurasi Android dapat dibersihkan dari repo PWA tanpa memengaruhi repo `Amy-fx` Android.
