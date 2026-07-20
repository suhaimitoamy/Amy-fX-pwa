# Amy FX PWA

Amy FX PWA adalah versi web yang dapat dipasang untuk pengguna iPhone, iPad, Android, dan browser desktop. Repo ini terpisah dari aplikasi Android `suhaimitoamy/Amy-fx`.

## Situs

GitHub Pages:

```text
https://suhaimitoamy.github.io/Amy-fX-pwa/
```

Pada iPhone atau iPad, buka situs melalui Safari, tekan **Bagikan**, lalu pilih **Tambahkan ke Layar Utama**.

## Modul

- Mapping XAU/USD
- Market Intel, News, Liquidity, dan Dynamic Heatmap
- Jurnal Trading dan Trading Library
- Amy FX Academy
- Library indikator TradingView

## Akses member

Akses production memakai login member bersama melalui Supabase Edge Function:

```text
https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/pwa-auth
```

Pendaftaran umum tidak dibuka. Akun dibuat oleh pengelola Amy FX.

## Backend market

GitHub Pages hanya melayani file PWA statis. Request `/api/*` diteruskan oleh platform adapter ke backend Amy FX:

```text
https://amy-fx.vercel.app
```

Endpoint utama:

```text
/api/twelvedata
/api/news
/api/heatmap
/api/liquidity
/api/learning-live-example
```

Backend membutuhkan environment variable `TWELVEDATA_API_KEY` pada project Vercel Amy FX.

## Struktur repo

```text
index.html                         Entry point PWA
manifest.webmanifest               Metadata instalasi
service-worker.js                  Cache, offline, update, dan notification handler
platform-adapter.js                Kompatibilitas web/iOS dan bridge API
member-auth.js                     Login member
pwa-bootstrap.js                   Instalasi dan pembaruan PWA
pwa-config.json                    Konfigurasi production
assets/                            Seluruh UI dan modul Amy FX
api/                               Vercel Functions
lib/                               Shared backend logic
scripts/validate-pwa.mjs           Validator production
.github/workflows/pwa-check.yml    CI PWA
```

## Pengujian

```bash
npm test
```

Validator memeriksa:

- file PWA wajib;
- manifest dan ikon;
- kompatibilitas GitHub Pages project path;
- service worker;
- login member pada Mapping, Market Intel, Journal, dan Academy;
- JavaScript inti;
- sisa workflow atau file build Android.

## Pemisahan platform

- `suhaimitoamy/Amy-fx` adalah aplikasi Android dan jalur build APK.
- `suhaimitoamy/Amy-fX-pwa` adalah PWA untuk iOS dan browser.

Repo PWA tidak menjalankan Gradle, Android SDK, build APK, signing APK, atau updater APK.
