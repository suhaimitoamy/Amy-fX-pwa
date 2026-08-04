# Amy FX PWA

Amy FX PWA adalah versi web Amy FX yang dapat dipasang pada iPhone, iPad, Android, serta browser desktop. Repo ini tetap terpisah dari aplikasi Android `suhaimitoamy/Amy-fx`, sedangkan engine dan modul webnya diselaraskan secara terkontrol dari branch `personal/amyfx-private` agar setara dengan Amy FX Preview.

## Situs

GitHub Pages:

```text
https://suhaimitoamy.github.io/Amy-fX-pwa/
```

Pada iPhone atau iPad, buka situs melalui Safari, tekan **Bagikan**, lalu pilih **Tambahkan ke Layar Utama**.

## Sumber aplikasi

```text
suhaimitoamy/Amy-fx · branch personal/amyfx-private
        ↓ sinkronisasi engine dan aset Preview
suhaimitoamy/Amy-fX-pwa · branch main
        ↓ overlay web/iOS
GitHub Pages PWA
```

Aset yang diselaraskan mencakup Mapping, Rencana Eksekusi, Entry Watch, Amy FX Scalper Engine, Scalper Entry Watch, Scalper Execution Authority, Market Intelligence, Journal, Academy, dan modul bersama Amy FX.

Komponen berikut tetap khusus PWA dan tidak ditimpa oleh Android:

- identitas dan versi PWA;
- member authentication;
- service worker, cache, dan pembaruan web;
- Web Push;
- manifest dan ikon instalasi;
- platform adapter untuk browser dan iOS;
- bridge harga server-side tanpa API key provider di browser;
- wrapper autentikasi Journal dan Academy.

Metadata commit Amy FX Preview yang sedang dipakai tersimpan pada:

```text
assets/amyfx-source.json
```

Sinkronisasi bersifat deterministik: bila commit sumber tidak berubah, pipeline tidak membuat commit baru hanya karena waktu pemeriksaan berbeda.

## Modul

- Mapping XAU/USD dan Mapping V2
- Rencana Eksekusi
- Entry Watch
- Amy FX Scalper Engine dan Scalper Entry Watch
- Scalper Execution Authority dan decision bridge
- Market Intel, News, Liquidity, dan Dynamic Heatmap
- Journal Trading dan Trading Library
- Amy FX Academy
- Library indikator TradingView

Seluruh tampilan waktu aplikasi menggunakan `Asia/Makassar` atau WITA.

## Akses member

Akses produksi memakai login member bersama melalui Supabase Edge Function. Pendaftaran umum tidak dibuka; akun dibuat oleh pengelola Amy FX.

## Backend market

GitHub Pages hanya melayani file PWA statis. Request `/api/*` diteruskan oleh platform adapter ke backend Amy FX di Vercel.

Harga pada browser menggunakan `pwa-live-price-bridge.js`. Bridge membaca endpoint server Amy FX dan mengirim event yang sama dengan bridge native Android, tanpa menaruh kredensial Twelve Data pada JavaScript publik.

Candle analisis, data Mapping, dan snapshot Scalper tetap melalui gateway serta penyimpanan market terpusat Amy FX.

## Struktur repo

```text
index.html                              Entry point PWA
manifest.webmanifest                    Metadata instalasi
service-worker.js                       Cache, offline, update, dan Web Push
platform-adapter.js                     Kompatibilitas web/iOS dan routing API
pwa-live-price-bridge.js                Bridge harga aman untuk browser
member-auth.js                          Login member
pwa-bootstrap.js                        Instalasi dan pembaruan PWA
pwa-config.json                         Konfigurasi produksi
assets/                                 UI dan modul hasil sinkronisasi
scripts/sync-from-amyfx-main.mjs        Mesin sinkronisasi Amy FX Preview
scripts/normalize-amyfx-export.mjs      Normalisasi hasil ekspor
scripts/validate-pwa.mjs                Validator platform PWA
scripts/validate-amyfx-sync.mjs         Validator kesetaraan engine Preview
.github/workflows/pwa-check.yml         Pemeriksaan PWA
.github/workflows/sync-amyfx-main.yml   Pipeline sinkronisasi Preview
```

## Pengujian

```bash
npm test
npm run test:sync
```

Pipeline memeriksa:

- file PWA wajib, manifest, ikon, dan GitHub Pages project path;
- login member, service worker, dan Web Push;
- Rencana Eksekusi, Entry Watch, Mapping V2, serta Amy FX Scalper Engine;
- kesetaraan Scalper Execution Authority dan decision bridge dengan Preview;
- overlay browser pada halaman hasil sinkronisasi;
- tidak adanya Android updater, Gradle, APK, signing, identitas Preview, atau kredensial provider;
- tidak adanya sisa zona waktu WIB pada modul PWA.

## Pemisahan platform

- `suhaimitoamy/Amy-fx` branch `personal/amyfx-private` adalah sumber engine dan modul web yang setara dengan Amy FX Preview.
- `suhaimitoamy/Amy-fX-pwa` adalah adaptasi untuk iOS dan browser dengan autentikasi, Web Push, cache, dan update channel PWA sendiri.

Repo PWA tidak menjalankan Gradle, Android SDK, build APK, signing APK, atau updater APK.
