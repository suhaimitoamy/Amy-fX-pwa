# Amy FX

Amy FX adalah aplikasi Android hybrid untuk pemetaan dan pemantauan market **XAU/USD**. Antarmuka utama berjalan melalui WebView lokal, sedangkan notifikasi, background scanner, penyimpanan, Firebase Messaging, download, dan pembaruan aplikasi ditangani oleh Kotlin native.

> **Versi:** `1.4.6`
>
> **Version code:** `29`
> **Minimum Android:** Android 8.0 / API 26  
> **Target SDK:** Android SDK 35  
> **Application ID:** `com.amyelitesuite`

[Download APK resmi Amy FX](https://github.com/suhaimitoamy/Amy-fx/releases/download/amyfx-latest/AmyFX-latest.apk)

## Disclaimer

Amy FX bukan robot trading, Expert Advisor, atau penasihat keuangan. Aplikasi tidak membuka atau menutup order otomatis dan tidak menjamin profit. Seluruh hasil Mapping, Market Outlook, berita, liquidity, heatmap, dan setup merupakan alat bantu analisis. Keputusan serta risiko tetap berada pada pengguna.

## Modul Utama

| Modul | Fungsi |
|---|---|
| **Mapping** | Struktur market, HTF bias, BSL/SSL, OB, FVG, premium/discount, valid break, setup, dan Market Outlook |
| **Berita** | Berita relevan XAU/USD, risiko berita, Dynamic Heatmap, liquidity, dan market briefing |
| **Jurnal Trading** | Catatan trade, statistik performa, trade plan, evaluasi, filter, autosave, dan export |
| **Tutorial Trading** | Materi belajar trading terstruktur di dalam aplikasi |
| **Indikator TradingView** | Library indikator dan file Pine Script |
| **Dashboard** | Akses cepat ke seluruh modul Amy FX |

## Update v1.4.0 — Dynamic Liquidity Heatmap

- Heatmap diperbarui aktif setiap **20 detik** ketika tab Heatmap terbuka.
- Harga berjalan selalu memiliki baris sendiri dan berpindah mengikuti harga terbaru.
- Zona lama yang sudah ditembus tidak lagi terus dianggap sebagai support atau resistance aktif.
- Mesin membedakan **active zone, sweep + reclaim, close break, polarity flip, broken**, dan historical zone.
- Kekuatan zona memakai bobot usia sehingga swing terbaru lebih berpengaruh daripada level lama.
- Lebar bucket harga menyesuaikan volatilitas **ATR**, bukan selalu dipaksa ke bucket tetap `$2`.
- Normalisasi logaritmik mencegah satu zona ekstrem membuat semua zona lain terlihat sama kecil.
- Perubahan antar-refresh ditandai sebagai **baru, menguat, melemah, berubah, ditembus**, atau stabil.
- Dynamic Heatmap dapat membantu mengisi BSL, SSL, liquidity pressure, dan nearest draw pada Market Briefing.

## Dynamic Liquidity Heatmap

Heatmap dibangun dari candle XAU/USD M15 melalui alur berikut:

1. membersihkan candle OHLC yang tidak valid;
2. menghitung ATR dan menentukan ukuran bucket adaptif;
3. mendeteksi swing high serta swing low;
4. menilai usia swing dengan recency weighting;
5. memeriksa wick sweep, candle close break, reclaim, dan polarity retest;
6. menghitung sentuhan serta rejection terbaru;
7. memilih zona aktif yang paling relevan di atas dan di bawah harga;
8. menghitung liquidity pressure dan draw terdekat.

### Status zona

- `ACTIVE` — level masih aktif dan belum kehilangan perannya.
- `PRICE_INSIDE` — harga berjalan sedang berada di dalam zona.
- `SWEPT_RECLAIMED` — level disapu dengan wick lalu direbut kembali.
- `POLARITY_FLIP` — support yang ditembus berubah menjadi resistance, atau sebaliknya.
- `BROKEN` — level telah ditembus dan tidak lagi dipakai sebagai liquidity aktif.
- `HISTORICAL` — level dipertahankan hanya sebagai memori market dengan tampilan redup.

### File utama

```text
lib/heatmap-core.mjs
api/heatmap.js
app/src/main/assets/apps/market-intel/heatmap-v2.js
app/src/main/assets/apps/market-intel/heatmap-v2.css
```

## Update v1.3.9 — Sinkronisasi Jam dan Zona Mapping

- Jam WIB pada **Dashboard** dan **Session Focus** menggunakan satu timestamp yang sama.
- Seluruh jam diperbarui serentak sehingga tidak lagi berbeda beberapa detik antar-card.
- Mapping menampilkan **Order Block dan Fair Value Gap terdekat**, walaupun harga belum berada di dalam zona.
- Pesan lama “Tidak ada zona aktif di harga sekarang” diganti dengan status zona yang lebih informatif.
- Zona diberi status: **belum retest, sedang diuji, termitigasi, breaker, dilewati live, atau invalid**.
- Deteksi zona tampilan diselaraskan dengan Pine Script **ICT Concepts [amygmgo]** milik pengguna.
- Logika entry lama tidak dihapus. Zona Pine-aligned dipakai sebagai informasi Mapping dan konteks market.

## Mapping XAU/USD

Mapping Amy FX menggunakan rules engine, bukan AI generatif yang menebak harga. Mesin membaca candle closed dan harga live untuk menghasilkan:

1. struktur lokal tiap timeframe;
2. HTF Narrative dari H4, D1, dan W1;
3. valid BOS/CHOCH dan liquidity sweep;
4. hierarchy BSL/SSL;
5. dealing range, premium, discount, dan equilibrium;
6. Order Block dan Fair Value Gap;
7. Market Outlook 1–4 jam, sesi berjalan, dan 24 jam;
8. setup M15 yang lolos filter kualitas.

### Peran Timeframe

- **M1/M5:** microstructure dan konfirmasi.
- **M15:** execution mapping.
- **M30/H1/H4:** konteks struktur.
- **D1/W1:** HTF Narrative.

### Valid Break

- Wick yang melewati level tetapi close kembali ke dalam struktur ditulis sebagai **liquidity sweep**, bukan BOS.
- Displacement kuat tidak mengesahkan BOS tanpa body close yang valid.
- Setup WAIT, INVALID, context-only, stale, konflik fatal, dan RR di bawah 1:2 tidak dihitung sebagai setup aktif.

### BSL dan SSL

- **BSL** hanya dianggap aktif apabila masih berada di atas harga.
- **SSL** hanya dianggap aktif apabila masih berada di bawah harga.
- Level yang sudah disentuh atau tersapu harga live dikeluarkan dari target aktif.

## Order Block Pine-Aligned

Deteksi OB tampilan mengikuti konfigurasi utama indikator `ICT Concepts [amygmgo]`:

- swing lookback default `10`;
- break dikonfirmasi menggunakan candle close;
- batas zona memakai candle body karena `useBody = true`;
- satu OB bullish dan satu OB bearish terbaru dipertahankan;
- zona yang berubah polaritas ditandai **BREAKER**, bukan langsung disembunyikan;
- OB di atas atau di bawah harga tetap ditampilkan sebagai zona yang belum retest.

File utama:

```text
app/src/main/assets/apps/mapping/js/zones/indicator-zones.js
app/src/main/assets/apps/mapping/js/mapping-zone-sync.js
```

## Fair Value Gap Pine-Aligned

FVG tampilan mengikuti aturan Pine Script pengguna:

- pola tiga candle;
- body candle tengah lebih besar dari rata-rata body `5` candle;
- wick atas dan bawah masing-masing kurang dari `36%` body;
- bullish FVG ketika `low` candle ketiga berada di atas `high` candle pertama;
- bearish FVG ketika `high` candle ketiga berada di bawah `low` candle pertama;
- dua FVG terbaru per arah dapat dipertahankan;
- zona tetap aktif sampai sisi terjauh ditembus wick.

Status FVG:

- `FRESH` — belum disentuh;
- `TESTED` — baru disentuh tipis;
- `MITIGATED` — sudah terisi melewati midpoint;
- `BROKEN` — sisi terjauh telah ditembus.

## Sinkronisasi Jam WIB

Semua jam Mapping memakai formatter `Asia/Jakarta` dan satu timestamp per pembaruan. Modul sinkronisasi memperbarui jam Dashboard serta Session Focus secara bersamaan.

```text
app/src/main/assets/apps/mapping/js/clock-sync.js
```

## Amy Market Outlook

Market Outlook membuat proyeksi rule-based untuk:

- **1–4 jam**;
- **sesi berjalan**;
- **24 jam**.

Setiap outlook memiliki arah, probabilitas model, target liquidity, target lanjutan, invalidasi, jalur harga, skenario alternatif, market regime, faktor pendukung, dan faktor risiko.

Probabilitas dibatasi pada rentang konservatif dan diturunkan ketika data stale, risiko berita tinggi, struktur timeframe bertentangan, atau harga telah terlalu premium/discount.

Prediction Tracker menyimpan outlook sebelum market bergerak. Statistik akurasi baru ditampilkan setelah minimal 20 outlook selesai.

## Berita dan Notifikasi

Sumber utama berita berasal dari Supabase dengan Telegram sebagai fallback. Filter relevansi mencakup:

- gold, XAU/USD, USD, DXY, Fed, FOMC, CPI, PCE, NFP, dan yield;
- perang, konflik, serangan, rudal, drone, invasi, nuklir, serta sanksi;
- Iran, Amerika Serikat, Israel, Gaza, Rusia, Ukraina, China, Taiwan, NATO, dan Middle East;
- perdamaian, ceasefire, diplomasi, negosiasi, mediasi, dan normalisasi;
- minyak, OPEC, Red Sea, Hormuz, resesi, default, banking crisis, dan safe haven.

Google Gemini tidak digunakan untuk memuat halaman News.

## Jurnal Trading

Jurnal Trading menyediakan:

- tambah, edit, hapus, buka, dan salin jurnal;
- statistik win rate, net P/L, profit factor, streak, dan drawdown;
- trade plan: arah, sesi, timeframe, risk, entry, SL, TP, dan RR;
- pencarian, filter, pengurutan, autosave, dan pemulihan draft;
- export CSV serta JSON.

## Struktur Repository

```text
app/src/main/assets/                    WebView assets
app/src/main/assets/apps/mapping        Mapping dan Market Outlook
app/src/main/assets/apps/market-intel   News, Dynamic Heatmap, dan liquidity
app/src/main/assets/apps/journal        Jurnal Trading
app/src/main/assets/apps/academy        Tutorial Trading
app/src/main/java/                      Android native Kotlin
api/                                    Vercel serverless functions
lib/                                    Shared backend logic
tests/                                  JavaScript regression tests
.github/workflows/                      CI dan build APK
```

## Backend

Endpoint utama:

```text
/api/twelvedata  Harga dan candle XAU/USD
/api/news        News Supabase dengan Telegram fallback
/api/heatmap     Dynamic Liquidity Heatmap
/api/liquidity   Active BSL/SSL swing tracker
```

Environment variable utama:

```text
TWELVEDATA_API_KEY
```

Secret backend dan credential Firebase tidak disimpan di repository.

## Build dan Pengujian

Prasyarat:

- JDK 17;
- Android SDK 35;
- Node.js 20.

Perintah utama:

```bash
node --test tests/*.test.mjs
./gradlew testReleaseUnitTest --no-configuration-cache
./gradlew lintRelease --no-configuration-cache
./gradlew assembleRelease --no-configuration-cache
```

GitHub Actions menjalankan regression test JavaScript, Android unit test, Android lint, debug validation, build APK release bertanda tangan, dan publikasi rolling update.

## Pembaruan Tanpa Uninstall

Aplikasi memeriksa `update.json`. Setelah APK baru selesai dibangun dan dipublikasikan, metadata update diaktifkan otomatis. Pengguna dapat memasang versi baru di atas versi lama tanpa menghapus jurnal, progres belajar, pengaturan, atau data lokal.
