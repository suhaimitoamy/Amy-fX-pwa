# Amy FX PWA Preview 310 parity

Rilis ini menyelaraskan Amy FX PWA dengan branch `suhaimitoamy/Amy-fx@personal/amyfx-private` minimum build `2.0.0-preview.310`.

Kesetaraan engine dijaga dengan pemeriksaan zero-drift terhadap seluruh `apps/mapping/js`, `apps/mapping/css`, dan `apps/shared` setelah normalisasi WITA. Overlay khusus PWA tetap dipertahankan untuk autentikasi member, Service Worker, Web Push, update web, navigasi browser/iOS, serta relay harga WebSocket server-side.

Fokus Preview 310 yang ikut dipromosikan:

- Ringkasan Market tidak dirender ulang pada setiap tick harga live.
- Hasil closed-candle terakhir tetap terlihat saat candle baru dimuat.
- Satu jalur tampilan harga live digunakan oleh Mapping dan Rencana Eksekusi.
- Dashboard dan Analisis memakai pohon tampilan terpisah.
- Polling dan refresh Mapping duplikat dihapus.
- Listener, observer, timer, dan request Mapping memiliki lifecycle yang aman.
- Structural bias dan dependency refresh Mapping terbaru ikut disalin tanpa drift.
