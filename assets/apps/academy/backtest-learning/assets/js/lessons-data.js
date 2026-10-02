/* Source-backed ICT learning path. Generated from the nine Google Drive documents requested by the project owner. */
(function(root){
  'use strict';
  if(root.AmyBacktestLessons)return;
  root.AmyBacktestLessons=Object.freeze([
  {
    "id": "00",
    "title": "Peta Belajar ICT Berbasis Bukti",
    "sourceDocId": "1To2YBlGIv3umUiE5G52GphmW68CHBH6DaJ-gvlPVkVY",
    "sourceUrl": "https://docs.google.com/document/d/1To2YBlGIv3umUiE5G52GphmW68CHBH6DaJ-gvlPVkVY/edit",
    "paragraphs": [
      {
        "text": "# PETA BELAJAR ICT BERBASIS BUKTI",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Tujuan Modul Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Materi ini mau ngajarin ICT (Inner Circle Trader) bukan sebagai kumpulan \"pola pasti untung\", tapi sebagai **kerangka berpikir probabilistik** — artinya tiap konsep udah dites satu-satu ke data historis XAUUSD, dan kita cuma percaya konsep yang emang kebukti bantu, bukan yang cuma \"katanya begitu\" dari komunitas.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Semua kesimpulan di materi ini datang dari 10 riset backtest (dikasih nama BT01 sampai BT10). Mayoritas riset pakai data 2005–2026. Khusus riset SMT (XAUUSD vs DXY), datanya cuma ada dari 2018–2026 karena data DXY-nya baru tersedia dari situ.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## 5 Prinsip Utama (Ini Inti dari Semua Modul)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Bayangin 5 prinsip ini kayak filter berlapis — harus dilewatin satu-satu, gak boleh loncat:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. **Context** — kamu harus paham dulu: sekarang market lagi dalam kondisi/waktu kayak apa?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. **Selector** — dari semua kemungkinan setup, mana yang secara statistik emang lebih \"worth it\" diperhatikan?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. **Confirmation** — udah ada bukti nyata bahwa arah/struktur market emang berubah (bukan cuma dugaan atau feeling)?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. **Location** — di harga berapa persisnya masuk akal untuk mulai entry?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. **Timing** — jangan buru-buru masuk pas ada sinyal. Tunggu harga balik dulu (retrace) ke lokasi yang udah kamu tentuin.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Peta Bukti — Ringkasan Hasil Tiap Konsep",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ini hasil dari pengujian masing-masing konsep, biar kamu tau mana yang \"lolos ujian\" (PASS) dan buat apa gunanya:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Session / Killzone expansion** → **PASS**, tapi fungsinya cuma sebagai info \"kapan waktunya market biasanya lebih aktif/gerak besar\". **Bukan** alat buat nebak arah harga otomatis.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **SMT XAUUSD–DXY** → **PASS** sebagai selector buat cari kondisi reversal yang lebih menarik. Angkanya: pas kondisi SMT muncul, reversal berhasil di 52,42% kasus, dibanding kondisi kontrol (tanpa SMT) yang cuma 47,90%. Jadi ada peningkatan +4,53 poin persen. Ini konsisten positif di 9 dari 9 tahun yang diuji (2018–2026).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **HTF alignment** (dipakai buat filter di struktur SMR) → **PASS**. Kalau setup-nya searah sama higher timeframe (HTF), hasilnya 51,60% dibanding yang gak searah cuma 49,11% — selisih +2,48 poin persen. Ini juga konsisten positif di 16 dari 18 tahun yang diuji.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **FVG / POI retrace** → paling berguna sebagai alat buat nentuin **timing** dan **lokasi** entry, bukan buat nebak arah. Kalau setup-nya udah HTF-aligned, dan kamu nunggu harga retest ke FVG dulu di timeframe 1H, hasilnya 51,56% — jauh lebih baik dibanding kalau langsung entry pas candle konfirmasi close (MSS-close), yang cuma 36,38%.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **SMR / MMXM** (sequence reversal yang lengkap) → **PASS** sebagai rangkaian kejadian yang lebih lengkap dan lebih diandalkan dibanding cuma ngelihat satu candle MSS doang.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Hal-Hal yang JANGAN Sampai Salah Paham",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ini penting biar kamu gak salah tafsir dari hasil di atas:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Status **\"PASS\"** di sini artinya konsep itu kebukti bisa bantu **memprediksi arah harga (predictive-price)**. Itu **belum berarti** strategi ini udah pasti profit kalau dipraktikkan — karena belum dihitung spread, slippage, SL/TP, ukuran posisi (sizing), dan biaya trading lainnya.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Status **\"FAIL\"** (gagal) buat suatu konsep saat berdiri sendiri, **bukan berarti** konsep itu harus dibuang total. Bisa jadi konsep itu tetap berguna sebagai bagian dari konteks atau alat timing — cuma gak cukup kuat kalau dipakai sendirian.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Riset ini **tidak** kasih dasar buat bilang \"ICT secara umum akurat 60%\" atau klaim generalisasi semacam itu. Yang ada cuma angka spesifik per konsep yang diuji.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Urutan Belajar yang Disarankan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. **01 — Session**: kapan market lagi aktif",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. **02 — SMT**: kapan kondisi reversal lebih menarik buat diperhatikan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. **03 — HTF Alignment**: cara nyaring/filter setup mana yang lebih layak",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. **04 — FVG & POI Retrace**: cara memperbaiki lokasi dan timing entry",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. **05 — SMR & MMXM**: cara bangun rangkaian reversal yang lengkap",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "6. **06 — Anti-Mitos ICT**: konsep-konsep populer yang ternyata gagal kalau dipakai sendirian",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "7. **07 — Playbook Integrasi**: cara nyatuin semua bagian tanpa asal numpuk filter",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "8. **08 — Jembatan ke Indikator**: cara nerjemahin semua materi ini jadi rule/state yang bisa diimplementasi ke indikator",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Target Setelah Selesai Belajar Semua Modul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Setelah selesai baca seri ini, kamu harus bisa:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Menjelaskan fungsi tiap konsep (bukan cuma hafal namanya)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Membedakan mana yang fungsinya sebagai **signal**, mana yang **filter**, dan mana yang cuma alat **timing**",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Berani **menolak** setup yang belum lengkap (belum lewatin semua 5 lapis)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Paham kenapa **konteks itu lebih penting** daripada sekadar nemuin pola visual yang kelihatan bagus di chart",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Buka Guided Practice",
        "href": "../trading-practice/guided-practice.html"
      }
    ]
  },
  {
    "id": "01",
    "title": "Session: Kapan Market Aktif",
    "sourceDocId": "1PUUFabKjM2U0YsQqrbybAX57jYOtMtc-hodb0Mxqbpk",
    "sourceUrl": "https://docs.google.com/document/d/1PUUFabKjM2U0YsQqrbybAX57jYOtMtc-hodb0Mxqbpk/edit",
    "paragraphs": [
      {
        "text": "# SESSION: KAPAN MARKET AKTIF",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Tujuan Modul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Modul ini mau bikin kamu paham bahwa **session** (Asia/London/New York) itu fungsinya cuma sebagai **konteks waktu** — bukan mesin penentu arah harga. Fokus utamanya adalah: kapan XAUUSD biasanya lebih aktif gerak, gimana perilaku harga berubah antar-session, dan kapan peluang market \"ekspansi\" (gerak besar) lebih relevan diperhatikan.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Temuan dari Backtest",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **BT06-A Killzone Expansion** = **PASS**",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **BT06-B Asia/London/New York Session Segmentation** = **PASS**",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Artinya: waktu trading emang bawa informasi soal peluang ekspansi dan karakter market. **TAPI** ini bukan bukti kalau London selalu bullish, New York selalu reversal, atau Killzone otomatis kasih sinyal entry. Session cuma kasih tau \"kapan\", bukan \"ke mana\".",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Fungsi Session (Buat Apa Sebenarnya)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nentuin kapan market cenderung punya \"energi\"/potensi gerak besar lebih tinggi",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Bantu bedain fase market lagi tenang vs lagi aktif",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Jadi konteks tambahan buat selector dan setup lain (bukan berdiri sendiri)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Bantu kamu supaya gak nganggep semua jam itu \"sama kualitasnya\" — padahal enggak",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Cara Membaca Session dengan Benar",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Tandai session mana yang lagi aktif, sesuai definisi backtest yang udah memperhitungkan DST (perubahan waktu musiman, khususnya New York)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. **Jangan** langsung nentuin BUY/SELL cuma dari nama session-nya doang",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Cari selector lain buat mendukung: SMT, HTF alignment, atau sequence SMR (dibahas di modul selanjutnya)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Gunakan session buat jawab pertanyaan ini: \"apakah sekarang waktu yang masuk akal buat nunggu market ekspansi?\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Kalau ada setup yang muncul di luar jam aktif/killzone, jangan langsung dibuang begitu aja — kualitas setup itu dinilai dari model lengkap (semua 5 lapis), bukan cuma dari jam doang",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kesalahan Umum yang Sering Dilakukan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nganggep Killzone = udah pasti nentuin arah",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Maksa buka posisi cuma karena \"udah masuk jam London\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ganti-ganti jam session sesuka hati setelah lihat hasilnya (baru diakalin biar cocok)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Lupa memperhitungkan DST New York (perubahan jam musim panas/dingin)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Pakai session sebagai alasan buat entry padahal belum ada confirmation dan POI (lokasi entry) yang jelas",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Contoh Kasus",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Harga masuk jam London, volatilitas naik. Ini **cuma** kasih konteks \"market lagi aktif\". **Belum ada** alasan buat entry di titik ini. Tapi kalau abis itu muncul SMT divergence, SMR udah terkonfirmasi, HTF-nya aligned (searah), terus harga retrace ke POI (lokasi entry) — baru deh sequence-nya jadi lengkap dan layak dipertimbangkan.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Latihan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Untuk tiap chart yang kamu lihat, coba jawab 5 pertanyaan ini:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Session apa yang lagi aktif sekarang?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. Market-nya lagi ekspansi (gerak besar) atau kompresi (diem/sempit)?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Ada gak selector reversal/continuation lain yang mendukung?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Ada gak confirmation-nya?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Ada gak POI dan udah terjadi retest ke situ?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Inti Pelajaran Modul Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Session itu jawab pertanyaan \"kapan market layak diperhatikan\", bukan \"ke mana harga pasti pergi\".**",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Latih konteks di Candle Replay",
        "href": "../trading-practice/candle-replay.html"
      }
    ]
  },
  {
    "id": "02",
    "title": "SMT XAUUSD–DXY: Selector Reversal",
    "sourceDocId": "1e4_Md1aAtZUFpBfYl1aKzfqBcfSuTETLT5IE_XYHPRQ",
    "sourceUrl": "https://docs.google.com/document/d/1e4_Md1aAtZUFpBfYl1aKzfqBcfSuTETLT5IE_XYHPRQ/edit",
    "paragraphs": [
      {
        "text": "# SMT XAUUSD–DXY: SELECTOR REVERSAL",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Tujuan Modul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Modul ini mau bikin kamu paham SMT (Smart Money Technique/divergence) sebagai **selector** — alat buat milih kondisi reversal yang lebih menarik — bukan sebagai tombol \"entry sekarang juga\".",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Definisi Mekanis yang Diuji (Biar Gak Ambigu)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Backtest ini pakai data XAUUSD dan DXY beneran (bukan proxy/pengganti) di timeframe M15, dengan swing yang ketat — butuh 1 candle kiri dan 1 candle kanan (1L/1R) yang udah dikonfirmasi.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Cara kerjanya: pas XAUUSD nembus titik swing extreme (titik tertinggi/terendah terakhir), harusnya DXY juga melakukan \"penetrasi inverse\" (gerak berlawanan arah yang sepadan) di candle M15 yang sama dan udah selesai (completed bar).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Kalau DXY **gagal** melakukan penetrasi inverse itu → ini diklasifikasikan sebagai **SMT divergence**",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Kalau DXY **berhasil** melakukan penetrasi inverse itu (gerakannya sinkron/sama-sama) → ini disebut **synchronized control** (kondisi kontrol/pembanding)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Hasil Backtest 2018–2026",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **SMT primary reversal**: 52,4244% berhasil reversal",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Control** (kondisi sinkron, tanpa SMT): 47,8952%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Lift** (selisih peningkatan): +4,5291 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Lift-nya **positif di 9 dari 9 tahun** yang eligible/bisa diuji",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Khusus buat **bull reversal**: lift-nya +5,19 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Khusus buat **bear reversal**: lift-nya +3,89 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ada juga diagnostic tambahan pakai \"intended-close\" di timeframe 1H: SMT dapat 55,63% vs control 46,22%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Apa Makna dari Temuan Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "SMT bantu kamu **milih kondisi** di mana reversal XAUUSD secara statistik lebih menarik/berpeluang, dibanding kondisi saat DXY ikut mengonfirmasi gerakan inverse secara sinkron. Jadi sifatnya **selector** (alat penyaring kondisi), **bukan tombol entry**.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Urutan Pemakaian SMT yang Benar",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. XAUUSD mencapai atau menembus titik swing extreme yang valid",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. Bandingkan pergerakan DXY di candle M15 yang sama dan udah selesai (completed bar)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Tentukan: ini SMT divergence atau bukan?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Kalau ada SMT → naikkan perhatian kamu terhadap potensi reversal di titik ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Tapi tetap **harus nunggu confirmation** dulu: sequence SMR/MSS (dibahas modul 05)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "6. Baru cari POI (lokasi entry) dan tunggu harga retrace/retest ke situ",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Yang TIDAK BOLEH Dilakukan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nganggep semua divergence yang \"kelihatan\" secara visual di chart itu otomatis SMT yang valid",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Geser-geser candle DXY maju/mundur sampai kelihatan \"cocok\" (ini namanya nge-cheat data)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Pakai proxy/indeks USD lain kalau definisi risetnya emang pakai DXY asli",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Entry cuma karena SMT-nya muncul, tanpa nunggu apa pun lagi",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Klaim hasil ini berlaku juga buat periode 2005–2017 — soalnya data DXY intraday yang diuji cuma ada dari 2018–2026",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Contoh Kasus Bullish",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "XAUUSD melakukan penetrasi ke bawah (downside) menembus swing low. Seharusnya DXY melakukan penetrasi ke atas (upside) menembus swing high inverse-nya. Kalau DXY **gagal** melakukan itu di candle M15 yang sama dan udah selesai — muncul **SMT divergence bullish candidate**.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ingat: ini **baru candidate**, belum entry. Kamu masih harus nunggu delivery (cara harga bergerak) berubah, confirmation kebentuk, baru cari retest ke POI.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Contoh Kasus Bearish",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "XAUUSD melakukan penetrasi ke atas (upside) menembus swing high. DXY gagal melakukan penetrasi ke bawah (downside) inverse-nya di candle M15 yang sama. Ini jadi **bearish SMT candidate** — proses confirmation dan timing tetap wajib dilewatin sebelum entry.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Latihan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ambil 20 kejadian XAUUSD nembus swing. Untuk tiap kejadian, catat:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Waktunya",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Arah penetrasinya",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Kondisi DXY saat itu",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ini SMT atau control?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ada gak SMR yang muncul setelahnya?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Di mana POI-nya?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Terjadi gak retest-nya?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Tujuan latihan ini: melatih **disiplin klasifikasi** kejadian, bukan buat nebak-nebak arah.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Inti Pelajaran Modul Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**SMT jawab pertanyaan \"apakah kondisi reversal ini lebih menarik dibanding kontrol?\", bukan \"apakah saya harus entry sekarang?\".**",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": []
  },
  {
    "id": "03",
    "title": "HTF Alignment: Filter Context",
    "sourceDocId": "1JVqGvRZ_vTBuMBtzqM-2sAoGP1VA3wO8rb7UZNajaD8",
    "sourceUrl": "https://docs.google.com/document/d/1JVqGvRZ_vTBuMBtzqM-2sAoGP1VA3wO8rb7UZNajaD8/edit",
    "paragraphs": [
      {
        "text": "# HTF ALIGNMENT: FILTER CONTEXT",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Tujuan Modul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Modul ini mau bikin kamu paham bahwa HTF (Higher Time Frame) alignment itu fungsinya sebagai **filter kualitas setup** — bukan sinyal yang berdiri sendiri buat nentuin entry.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Apa yang Diuji",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Di riset BT09-F (soal SMR), setiap kejadian candidate dipisah jadi dua kelompok: **HTF-aligned** (searah sama higher timeframe) dan **HTF-nonaligned** (gak searah). Konteks Daily (harian) yang dipakai buat nentuin ini udah \"dibekukan\" (rule-nya udah fix) **sebelum** hasil performance-nya dijalanin. Jadi rule HTF-nya **tidak diubah-ubah** setelah hasilnya kelihatan — ini penting biar hasilnya jujur, bukan diakalin belakangan.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Hasil Utama 2009–2026",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **HTF-aligned** di timeframe 1H: 51,5971% berhasil",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **HTF-nonaligned** (kontrol) di 1H: 49,1125%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Lift** (selisih): +2,4846 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Lift-nya positif di **16 dari 18 tahun** yang diuji",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Di 4 regime/kondisi market yang fixed diuji, semuanya (4 dari 4) hasilnya positif",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Khusus bull: lift +1,70 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Khusus bear: lift +3,11 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Cara Interpretasi Hasil Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "HTF alignment **bukan sumber edge (keunggulan) yang besar** kalau berdiri sendiri, tapi dia bantu kamu milih subset SMR (bagian dari keseluruhan setup SMR) yang lebih berkualitas. Kekuatan utamanya itu **konsistensi** — hasilnya stabil dari tahun ke tahun dan dari kondisi market ke kondisi market lain — bukan karena angka win rate-nya yang spektakuler/tinggi banget.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Cara Mengajarkan/Menerapkan Konsep Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Tentukan kondisi (state) HTF pakai rule yang tetap/konsisten, jangan berubah-ubah",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. **Jangan** ubah bias HTF cuma karena pengen \"membenarkan\" setup di timeframe lebih kecil (LTF) yang udah kamu incar",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Nilai tiap candidate SMR: apakah dia aligned (searah), nonaligned (gak searah), atau undefined (gak jelas)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Gunakan alignment ini sebagai **filter kualitas** doang",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Tetap butuh komponen lain juga: selector, confirmation, location, dan timing — HTF alignment doang gak cukup",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Bedain Filter vs Signal (Ini Penting Dipahami)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Signal** itu coba jawab: \"apakah harga bakal gerak ke arah tertentu?\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Filter** itu coba jawab: \"di antara semua setup yang ada, mana yang lebih layak diprioritaskan?\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Hasil backtest ini lebih mendukung HTF alignment berfungsi sebagai yang **kedua** (filter), bukan yang pertama (signal).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kesalahan Umum",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nganggep kalau Daily-nya bullish, berarti semua posisi sell dilarang total — padahal itu gak sesuai sama model yang diuji",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Gambar ulang bias HTF secara sembarangan/discretionary setelah tau hasilnya (ini namanya hindsight bias)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Pakai kebanyakan timeframe sampai-sampai bias apapun selalu bisa \"dibenerin\" secara subjektif",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nganggep +2,48 poin persen itu kecil jadi gak penting — padahal selector kecil yang **stabil** itu bisa lebih bernilai daripada filter besar tapi rapuh/gak konsisten",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Latihan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ambil 30 candidate SMR. Klasifikasikan dulu kondisi HTF-nya **sebelum** kamu lihat hasil/outcome-nya. Baru setelah semuanya selesai diklasifikasi, bandingkan hasil yang aligned vs yang nonaligned. Tujuannya: melatih kebiasaan **pre-classification** (klasifikasi dulu baru lihat hasil) supaya kamu gak kena hindsight bias.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Inti Pelajaran Modul Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**HTF alignment jawab pertanyaan \"setup mana yang lebih layak diprioritaskan?\", bukan \"di mana tepatnya saya harus entry?\".**",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Ganti timeframe di Chart Analysis",
        "href": "../trading-practice/chart-analysis.html"
      }
    ]
  },
  {
    "id": "04",
    "title": "FVG & POI Retrace: Timing Entry",
    "sourceDocId": "1A3vrogFaGgGiUkcoF6MAQ14FGrFy_dRT7PWdarhtCXI",
    "sourceUrl": "https://docs.google.com/document/d/1A3vrogFaGgGiUkcoF6MAQ14FGrFy_dRT7PWdarhtCXI/edit",
    "paragraphs": [
      {
        "text": "# FVG & POI RETRACE: TIMING ENTRY",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Tujuan Modul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Modul ini mau bikin kamu paham FVG (Fair Value Gap) dan POI (Point of Interest) sebagai alat buat **lokasi dan timing** — dipakai **setelah** context dan confirmation udah kebentuk. Modul ini sengaja menolak anggapan keliru yang sering beredar: \"ada FVG = harga pasti balik ke situ\". Itu **salah**.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Temuan Backtest",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**BT01-D** (Sweep + MSS + FVG retrace) = **PASS** sebagai peningkatan incremental buat eksekusi/timing, tapi **TIDAK PASS** sebagai edge prediktif yang berdiri sendiri.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Dari **BT09-F** (SMR yang HTF-aligned):",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Entry pas retest di timeframe 1H: 51,5550% berhasil",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Entry langsung pas candle MSS close (tanpa nunggu retest), di kejadian yang sama: cuma 36,3823%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Lift dari timing ini**: +15,1727 poin persen — ini gede banget bedanya!",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- FVG sebagai POI di 1H: 52,5966% (dari 2.561 sampel yang bisa dievaluasi)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- OB (Order Block) sebagai POI di 1H: 51,1845% (dari 6.205 sampel yang bisa dievaluasi)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Apa Makna dari Temuan Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Lokasi masuk (entry) bisa mengubah kualitas hasil secara besar, tanpa perlu mengubah analisis arahnya sama sekali.** Nunggu harga retrace/retest itu jauh lebih berguna dibanding buru-buru ngejar candle MSS/displacement (candle yang gerak besar pas struktur berubah).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Fungsi FVG/POI Sebenarnya",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nyediain area buat kamu nunggu harga balik lagi setelah delivery (cara harga bergerak) berubah",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Misahin antara confirmation (bukti struktur berubah) sama execution (eksekusi entry beneran)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Bantu kamu supaya gak entry kelewat telat, ngejar candle yang udah gerak jauh",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Fungsinya sebagai **lokasi buat mengamati**, **bukan** alasan buat nentuin arah",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Urutan yang BENAR",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Context udah jelas",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. Selector mendukung candidate ini (misal ada SMT)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Confirmation/SMR udah kebentuk",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. POI didefinisikan secara mekanis/pakai rule yang jelas",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Tunggu retrace/retest pertama yang valid, sesuai window waktu di model",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "6. **Baru** dievaluasi buat entry",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Urutan yang SALAH (Sering Terjadi)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "FVG kelihatan → langsung entry → baru cari-cari alasan HTF/SMT **setelah** posisi udah kebuka. Ini kebalik urutannya dan berbahaya karena kamu jadi cari pembenaran, bukan analisis beneran.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kenapa Entry di MSS-Close Itu Bisa Buruk",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Candle konfirmasi (MSS) itu sering muncul **setelah** sebagian besar gerakan harga (displacement) udah kejadian. Kalau kamu entry pas candle itu close, artinya kamu beli/jual **setelah** harga udah gerak jauh — kamu ngejar dari belakang. Sementara kalau kamu nunggu retest, kamu dapet harga yang lebih bagus dan gak perlu ngejar-ngejar candle yang udah impulsif.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kesalahan Umum",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nganggep semua gap 3 candle itu otomatis POI berkualitas, tanpa lihat konteksnya",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Pilih FVG yang \"paling cantik\" **setelah** tau hasilnya (ini curang, hindsight bias)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ganti-ganti definisi proximal/CE (consequent encroachment)/full-fill setelah tau hasil (biar keliatan benar)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nunggu retest tanpa batas waktu, jadi setup lama yang harusnya udah \"mati\" dianggap masih hidup",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Pakai POI buat nentuin arah — padahal urutannya harusnya arah/context dulu, baru POI",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Latihan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Untuk 20 kejadian confirmation, catat dua titik observasi hipotetis: pas MSS-close dan pas first valid POI retest (retest pertama yang valid). Bandingkan apa yang terjadi setelah masing-masing titik itu, **tanpa** mengubah aturan di tengah jalan.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Inti Pelajaran Modul Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**FVG/POI paling berguna buat jawab \"di mana dan kapan saya harus nunggu harga?\", bukan \"arah apa yang pasti terjadi?\".**",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Gambar POI di Chart Analysis",
        "href": "../trading-practice/chart-analysis.html"
      }
    ]
  },
  {
    "id": "05",
    "title": "SMR & MMXM: Struktur Reversal Lengkap",
    "sourceDocId": "1MyEOwF4lyj0LbEvbG5dEUgx-Wy2e23P1lX_jVdJlEng",
    "sourceUrl": "https://docs.google.com/document/d/1MyEOwF4lyj0LbEvbG5dEUgx-Wy2e23P1lX_jVdJlEng/edit",
    "paragraphs": [
      {
        "text": "# SMR & MMXM: STRUKTUR REVERSAL LENGKAP",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Tujuan Modul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Modul ini mau bikin kamu paham kenapa **rangkaian kejadian reversal yang lengkap (sequence)** itu jauh lebih berguna dibanding cuma ngelihat satu candle MSS doang.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Catatan penting: di riset BT09-F, \"Academy SMR\" dipakai sebagai representasi mekanis dari fase MMXM/SMR — soalnya materi Academy (sumber teori ICT) nyebut istilah MMXM, tapi gak ngasih algoritma MMXM terpisah yang cukup mekanis/terukur buat dites. Jadi yang diuji di sini itu representasi SMR-nya.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Gambaran Sequence yang Diuji",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Urutan kejadian yang diuji itu kayak gini:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ada HTF context (konteks dari higher timeframe)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Terjadi qualifying liquidity sweep (sweep likuiditas yang memenuhi syarat)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Terjadi SMR/MSS confirmation yang valid",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- POI (FVG atau OB) didefinisikan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Harga melakukan retest ke POI dalam window waktu yang ditentukan model",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Candidate-nya dipisah lagi berdasarkan apakah HTF-aligned atau enggak",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Hasil Utama BT09-F",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Periode primary 2009–2026:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- HTF-aligned di 1H: 51,5971%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- HTF-nonaligned: 49,1125%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Lift: +2,4846 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Lift positif di 16 dari 18 tahun",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Positive di 4 dari 4 regime/kondisi market yang fixed diuji",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Kesimpulan akhir BT09-F: PASS**",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Timing Retest (Ini yang Bikin Beda Jauh)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Masih dari kejadian yang sama (HTF-aligned):",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Kalau nunggu retest di 1H: 51,5550%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Kalau entry langsung pas MSS-close di 1H: cuma 36,3823%",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Lift: +15,1727 poin persen",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ini nunjukkin: **sequence dan timing eksekusi itu jauh lebih penting** dibanding sekadar \"MSS-nya udah muncul, langsung masuk\".",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kenapa MSS Doang Gak Cukup",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Riset **BT01-B** nunjukkin: MSS displacement yang berdiri sendiri **gak** menghasilkan edge continuation (kelanjutan gerak) yang robust/kuat. Artinya, perubahan struktur itu cuma **satu bagian** dari cerita, bukan keseluruhan model. Butuh komponen lain buat melengkapinya.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Cara Membaca SMR sebagai Sebuah Proses (Bukan Satu Titik)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Market ambil likuiditas / melakukan sweep",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. Delivery (cara harga bergerak) berubah dan confirmation muncul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. **Jangan** ngejar candle confirmation itu",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Tentukan POI yang valid",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Tunggu retest",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "6. Prioritaskan candidate yang HTF-aligned",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "7. Session dan SMT bisa jadi context/selector tambahan, tapi **jangan** ditumpuk sembarangan tanpa aturan yang jelas",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Bedain \"Pola\" vs \"Sequence\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Pola** cara pikirnya: \"lihat MSS → langsung entry\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Sequence** cara pikirnya: \"context → liquidity event → delivery change → POI → retest → baru eksekusi\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Hasil backtest ini **lebih mendukung cara berpikir sequence** yang kedua.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kesalahan Umum",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nganggep semua MSS itu otomatis SMR (padahal beda konsep)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Ngabain urutan kejadian, main loncat-loncat",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Milih liquidity sweep yang mana **setelah** tau hasilnya (curang, hindsight bias)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Pakai POI yang kebentuk jauh **setelah** confirmation, cuma karena pengen dapetin harga entry yang \"bagus\"",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Nyebut hasil riset ini sebagai bukti MMXM discretionary (versi manual/subjektif) secara keseluruhan — padahal yang diuji itu representasi mekanis SMR-nya doang",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Latihan",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Bikin log kondisi (state log) untuk 25 setup, dengan urutan: **CONTEXT → SWEEP → CONFIRMATION → POI_DEFINED → RETESTED → OUTCOME**. Jangan loncatin tahap. Kalau ada satu tahap yang gak kejadian, tandain setup itu sebagai **incomplete** (belum lengkap).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Inti Pelajaran Modul Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Edge (keunggulan) itu gak datang dari satu label \"MSS\" doang. Kualitas itu muncul kalau urutan kejadian, context, dan timing kerja bareng-bareng secara disiplin.**",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Uji urutan di Candle Replay",
        "href": "../trading-practice/candle-replay.html"
      }
    ]
  },
  {
    "id": "06",
    "title": "Anti-Mitos ICT: Konsep yang Gagal Standalone",
    "sourceDocId": "1xtffHKAi4HFeibZ-i6SR1vrwOMD77HCvW0c_eAJPoJ8",
    "sourceUrl": "https://docs.google.com/document/d/1xtffHKAi4HFeibZ-i6SR1vrwOMD77HCvW0c_eAJPoJ8/edit",
    "paragraphs": [
      {
        "text": "ANTI-MITOS ICT: KONSEP YANG GAGAL STANDALONE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "TUJUAN",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Menempatkan setiap konsep ICT sesuai fungsi yang benar. Status FAIL standalone tidak berarti konsep tersebut tidak pernah berguna; artinya hipotesis spesifik yang diuji tidak cukup kuat jika berdiri sendiri.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "LIQUIDITY SWEEP",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BT01-A: reversal 1H 52,97% vs control 50,58%, lift +2,39 pp. Tidak lolos sebagai universal standalone edge.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: sweep lebih tepat dianggap event konteks.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "MSS DISPLACEMENT",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BT01-B: MSS 46,72% vs weak-shift control 46,61%, hanya +0,11 pp.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: MSS sendiri tidak memberi tambahan immediate-continuation edge yang berarti.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "SWEEP + MSS",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BT01-C: 41,97% vs control 46,93%, selisih -4,96 pp.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: menggabungkan dua konsep populer tidak otomatis memperbaiki hasil.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "STRUCTURE RAW",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BOS, CHoCH, MSS, dan CISD pada BT02 gagal sebagai robust standalone immediate-continuation predictor.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: structure break adalah deskripsi perubahan harga, bukan kepastian arah selanjutnya.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "PREMIUM/DISCOUNT & OTE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Keduanya gagal sebagai selector standalone universal. Kedalaman retracement tetap dapat membawa informasi timing pada kondisi tertentu.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "ORDER BLOCK",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pengujian Order Block tidak menghasilkan bukti standalone yang kuat; hasilnya fail atau inconclusive tergantung variasi.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: OB lebih tepat dipahami sebagai candidate POI yang membutuhkan sequence.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "AMD / PO3",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BT07-A Daily AMD/PO3 = FAIL.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: sequence accumulation–manipulation–distribution tidak terbukti sebagai predictor mekanis universal pada definisi yang diuji.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "MACRO TIMING & SILVER BULLET",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Macro timing gagal; Silver Bullet gagal atau inconclusive pada eksperimen terkait.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: window waktu saja tidak cukup untuk menjadi model directional robust.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "A+ COMPOSITE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BT10-A = FAIL.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pelajaran: menumpuk banyak confluence tidak otomatis meningkatkan akurasi. Filter yang tidak memberi incremental value dapat menambah kompleksitas tanpa menambah edge.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "CARA MEMBACA FAIL",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "FAIL berarti hipotesis spesifik tidak memenuhi decision gate yang sudah dikunci. Jangan memperluasnya menjadi klaim bahwa konsep selalu tidak berguna, dan jangan mengubah definisi setelah melihat outcome untuk menyelamatkan hasil.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "PERTANYAAN WAJIB SAAT MENDENGAR KLAIM AKURASI",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Konsep apa tepatnya yang diuji?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. Apa definisi mekanis dan control-nya?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Berapa sample-nya?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Stabilkah lintas tahun dan regime?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Apakah yang dilaporkan predictive accuracy atau profit setelah biaya dan trade management?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "INTI PELAJARAN",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Gunakan konsep sesuai fungsi yang terbukti: context sebagai context, selector sebagai selector, confirmation sebagai confirmation, dan timing tool sebagai timing tool.",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Latih keputusan WAIT",
        "href": "../trading-practice/guided-practice.html"
      }
    ]
  },
  {
    "id": "07",
    "title": "Playbook Integrasi: Context → Selector → Confirmation → Location → Timing",
    "sourceDocId": "1B10-OFbF4wydmDugm4oUBSYPJM33hLYru7bGIFcPTwU",
    "sourceUrl": "https://docs.google.com/document/d/1B10-OFbF4wydmDugm4oUBSYPJM33hLYru7bGIFcPTwU/edit",
    "paragraphs": [
      {
        "text": "PLAYBOOK INTEGRASI: CONTEXT → SELECTOR → CONFIRMATION → LOCATION → TIMING",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "TUJUAN MODUL",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Menyatukan temuan backtest menjadi alur belajar yang koheren tanpa membuat “super-confluence” yang justru overfit.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "KERANGKA 5 LANGKAH",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. CONTEXT",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Tentukan session dan HTF state terlebih dahulu. Session memberi informasi kapan market cenderung lebih aktif; HTF alignment membantu menyaring candidate.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pertanyaan: apakah kondisi waktunya relevan dan apakah candidate searah dengan context HTF yang sudah didefinisikan?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. SELECTOR",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Cari kondisi yang benar-benar menambah probabilitas. Temuan terkuat pada riset ini adalah SMT XAUUSD–DXY sebagai selector reversal.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pertanyaan: apakah XAUUSD menunjukkan divergence terhadap DXY menurut definisi mekanis?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. CONFIRMATION",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Tunggu sequence perubahan delivery yang valid. Jangan menjadikan MSS tunggal sebagai alasan penuh.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pertanyaan: apakah liquidity event dan confirmation SMR/MSS terjadi dalam urutan yang benar?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. LOCATION",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Setelah confirmation, definisikan POI FVG/OB sesuai rule model.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pertanyaan: di area mana harga layak ditunggu bila retrace terjadi?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. TIMING",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Tunggu first valid retest. Jangan mengejar candle confirmation. Backtest SMR menunjukkan retest jauh lebih baik daripada observation dari MSS-close pada event yang sama.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Pertanyaan: apakah harga benar-benar kembali ke POI dalam window yang masih valid?",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "CONTOH ALUR BULLISH",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Session/context memberi kondisi aktif.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- XAUUSD melakukan downside liquidity event.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- DXY tidak mengonfirmasi inverse extreme pada completed M15 yang sama → SMT bullish candidate.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Delivery berubah dan SMR confirmation terbentuk.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Candidate HTF-aligned mendapat prioritas.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- FVG/OB POI didefinisikan.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Harga retrace ke POI → timing candidate selesai.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "CONTOH ALUR BEARISH",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Gunakan logika terbalik: upside liquidity event, bearish SMT candidate, bearish SMR confirmation, HTF alignment, POI, lalu retest.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "KAPAN SETUP DIANGGAP INCOMPLETE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Hanya ada session tanpa selector/confirmation.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Hanya ada SMT tanpa confirmation.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Hanya ada MSS tanpa context dan sequence.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- POI dipilih sebelum arah/context jelas.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Tidak terjadi retest dalam window model.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- HTF state undefined atau data DXY tidak sinkron.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "JANGAN MENUMPUK FILTER TANPA BUKTI",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "BT10-A menunjukkan A+ Composite gagal. Artinya integrasi harus mempertahankan fungsi tiap komponen, bukan sekadar menambah semakin banyak confluence.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "PRINSIP SKOR AJAR",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Context memberi latar.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Selector menaikkan/minimalkan prioritas.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Confirmation mengubah candidate menjadi setup terstruktur.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Location menentukan area observasi.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Timing menentukan kapan setup benar-benar siap dievaluasi.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "CHECKPOINT UNTUK SISWA",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Sebelum menyebut setup lengkap, siswa harus bisa menjawab lima kalimat:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "1. Context saya adalah ...",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "2. Selector saya adalah ...",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "3. Confirmation saya adalah ...",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "4. Location saya adalah ...",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "5. Timing/retest saya adalah ...",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Jika salah satu kosong, setup belum lengkap.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "CATATAN PENTING",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Ini adalah playbook pendidikan yang diturunkan dari predictive-price research. Belum merupakan strategi profit final karena spread, slippage, SL/TP, expectancy, dan position sizing belum menjadi dasar rangkaian BT01–BT10.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "INTI PELAJARAN",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Kualitas datang dari urutan fungsi yang jelas, bukan dari jumlah istilah ICT yang bisa ditemukan di chart.",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Jalankan playbook di Replay",
        "href": "../trading-practice/candle-replay.html"
      }
    ]
  },
  {
    "id": "08",
    "title": "Jembatan ke Indikator: Rule Map Hasil Backtest",
    "sourceDocId": "16ybazZNOtvY7i1dH4zUQYId3cKcG5zbejlzTstbcn9E",
    "sourceUrl": "https://docs.google.com/document/d/16ybazZNOtvY7i1dH4zUQYId3cKcG5zbejlzTstbcn9E/edit",
    "paragraphs": [
      {
        "text": "# JEMBATAN KE INDIKATOR: RULE MAP HASIL BACKTEST",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Status Dokumen Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Dokumen ini **bukan** implementasi indikator beneran. Fungsinya cuma buat jagain supaya tahap bikin indikator berikutnya (nanti, kalau udah waktunya) tetep setia sama temuan backtest — dan gak balik lagi jadi indikator yang nampilin semua konsep ICT sekaligus tanpa filter (kayak yang udah kejadian sebelumnya di riset D-LAB kamu).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Prinsip Desain",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Indikator sebaiknya misahin **5 fungsi** secara jelas: Context, Selector, Confirmation, Location, Timing. Tiap komponen harus punya kondisi (state) yang eksplisit/jelas dan **gak boleh saling nimpa** satu sama lain.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "### 1. SESSION STATE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Tujuan**: ngasih konteks waktu/aktivitas market.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Output kandidat**:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `SESSION` = ASIA / LONDON / NEW_YORK / OFF_SESSION",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `ACTIVE_EXPANSION_WINDOW` = TRUE/FALSE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Larangan**: jangan sampai indikator ini ngasih output BUY/SELL cuma dari session doang.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "### 2. SMT STATE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Tujuan**: sebagai selector reversal.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Input kandidat**:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- XAUUSD M15 confirmed swing penetration",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- DXY M15 inverse penetration di candle yang sama dan udah selesai",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Output kandidat**:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `SMT_BULLISH`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `SMT_BEARISH`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `SYNC_CONFIRM_CONTROL`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `UNAVAILABLE` / `AMBIGUOUS`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Larangan**: jangan geser-geser sinkronisasi candle biar divergence-nya \"keliatan cocok\".",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "### 3. HTF ALIGNMENT STATE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Tujuan**: sebagai filter kualitas candidate SMR.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Output kandidat**:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `HTF_ALIGNED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `HTF_NONALIGNED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `HTF_UNDEFINED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Rule-nya harus ngewarisin definisi HTF yang udah dibekukan (fix) dari riset — **jangan** bikin override yang sifatnya discretionary/subjektif.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "### 4. SMR / DELIVERY STATE MACHINE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Tujuan**: sebagai confirmation sequence.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Contoh urutan kondisi (state):",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `WAITING_CONTEXT`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `WAITING_LIQUIDITY_EVENT`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `SWEEP_DETECTED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `WAITING_CONFIRMATION`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `SMR_CONFIRMED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `POI_DEFINED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `WAITING_RETEST`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `RETEST_CONFIRMED`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `EXPIRED` / `INVALID`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Prinsip**: gak boleh loncat dari sweep langsung jadi \"entry-ready\" tanpa lewat confirmation dan location dulu.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "### 5. POI STATE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Tujuan**: sebagai location (lokasi entry).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Candidate POI**:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- FVG",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- OB, kalau memenuhi definisi model",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Output-nya harus nyimpen POI valid yang pertama kali muncul, dan rule retest-nya harus konsisten.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Larangan**: jangan pilih POI yang beda setelah tau hasilnya duluan.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "### 6. TIMING STATE",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Tujuan**: misahin confirmation dari waktu eksekusi (execution timing).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Output kandidat**:",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `MSS_CLOSE_ONLY`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `WAITING_RETEST`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `VALID_RETEST`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- `RETEST_TIMEOUT`",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Backtest mendukung penggunaan retrace/retest sebagai perbaikan timing dibanding ngejar MSS-close.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Prioritas Informasi di UI (Kalau Nanti Dibikin Indikatornya)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Level 1**: Context — session + HTF",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Level 2**: Selector — SMT",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Level 3**: Confirmation — sequence SMR",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Level 4**: Location — POI FVG/OB",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Level 5**: Timing — status retest",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "UI-nya sebaiknya **gak** nampilin puluhan label mentah sekaligus kalau state-nya belum relevan — biar gak bikin bingung kayak masalah yang sering muncul di riset-riset indikator sebelumnya.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Rule Penting dari Hasil-Hasil yang FAIL",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- MSS standalone **tidak boleh** dipromosikan jadi signal utama",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Sweep standalone **tidak boleh** dipromosikan jadi signal reversal yang pasti",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- Premium/Discount dan OTE **tidak** jadi core directional engine (mesin penentu arah utama)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- AMD/PO3 **tidak** jadi core predictor",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- A+ super-confluence **tidak boleh** dijadiin alasan buat nambahin semua filter sekaligus",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Kandidat Core Engine (Kalau Nanti Diimplementasi)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Context**: Session + frozen HTF state (kondisi HTF yang udah dibekukan)",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Selector**: SMT XAUUSD–DXY",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Confirmation**: SMR sequence",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Location**: FVG/OB POI",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "- **Timing**: retest valid yang pertama muncul",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Validasi Wajib Sebelum Produksi",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Setelah indikatornya jadi dibikin, lakuin backtest ulang sebagai **implementasi-verification** — bukan buat nyari parameter baru. Tujuannya: mastiin kode yang dibikin ngasih hasil kejadian (event) yang **sama persis** kayak definisi di riset ini.",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "Baru setelah identity match (hasilnya cocok), baru dievaluasi apakah perlu tahap terpisah buat SL/TP, biaya trading, expectancy, dan kenyamanan pemakaian di chart (usability).",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "## Inti Dokumen Ini",
        "style": "NORMAL_TEXT",
        "list": false
      },
      {
        "text": "**Indikator berikutnya harus jadi visualisasi dari rule yang udah terbukti dan state yang terukur — bukan kumpulan semua istilah ICT yang pernah kamu pelajari sekaligus ditampilin bareng.**",
        "style": "NORMAL_TEXT",
        "list": false
      }
    ],
    "ctas": [
      {
        "label": "Buka Trading Practice",
        "href": "../trading-practice/index.html"
      }
    ]
  }
]);
})(typeof window!=='undefined'?window:globalThis);
