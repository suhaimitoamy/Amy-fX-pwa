# Topic-Aware Learning Live Example API

Endpoint:

```text
GET /api/learning-live-example?category=<category>&topic=<topic>
```

Contoh:

```text
/api/learning-live-example?category=basics&topic=lot-pip-point-dan-spread
/api/learning-live-example?category=structural&topic=liquidity-sweep
/api/learning-live-example?category=management&topic=trade-management-advanced
```

## Alur

1. `market-learning-map.json` menentukan `category` dan `topic` untuk halaman HTML.
2. `market-learning-bridge.js` mengirim keduanya ke endpoint.
3. `lib/learning-topic-router.js` memilih kelompok aturan berdasarkan topic dengan prioritas konsep spesifik.
4. Endpoint mengambil candle XAU/USD hanya untuk timeframe yang diperlukan kelompok tersebut.
5. `lib/learning-live-engine.js` menghitung konteks seperti OHLC, ATR, range, trend, FVG, dan sweep.
6. API mengembalikan teks edukasi rule-based yang disisipkan ke artikel oleh bridge.

## Contoh respons

```json
{
  "status": "ok",
  "topic": "liquidity-sweep",
  "category": "structural",
  "route": {
    "group": "liquidity",
    "intervals": ["15min", "1h", "1day"]
  },
  "market": {
    "symbol": "XAU/USD",
    "price": 3341.25,
    "session": "London",
    "generatedAt": "2026-07-18T05:00:00.000Z"
  },
  "content": {
    "title": "Live Market Example — Liquidity Sweep",
    "message": "...",
    "facts": ["XAU/USD 3341.25", "Sesi London", "D1 bullish (+0.35%)"],
    "disclaimer": "Contoh edukasi rule-based, bukan sinyal Buy/Sell dan bukan keluaran AI."
  }
}
```

## Menambah aturan

Tambahkan pattern baru di `lib/learning-topic-router.js`. Letakkan konsep yang lebih spesifik di atas kata yang lebih umum. Contoh: `stop-loss` harus diproses sebelum kata `loss`, dan `xauusd-session` harus diproses sebelum kata `xauusd`.

Setelah itu tambahkan atau sesuaikan template kelompok di `lib/learning-live-engine.js` dan regression di `tests/learning-live-engine.test.mjs`.

## Sumber data market

Urutan sumber data backend:

1. Jika tersedia, endpoint memakai `TWELVEDATA_API_KEY` langsung pada server Vercel.
2. Jika secret tidak tersedia pada Preview Deployment, endpoint memakai proxy Amy FX melalui `AMYFX_MARKET_PROXY_URL`.
3. Nilai default proxy adalah endpoint produksi `https://amy-fx.vercel.app/api/twelvedata`.

Dengan pola ini, API key tidak dikirim ke WebView atau browser.

API hanya menerima metode `GET` dan `OPTIONS`, hanya memakai simbol XAU/USD, memvalidasi category/topic, dan tidak memanggil model AI.
