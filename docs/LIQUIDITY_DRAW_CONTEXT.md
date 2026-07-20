# Liquidity Draw Context — Production Specification

## Status

Liquidity Draw dipertahankan sebagai **informasi destination/first-hit**, bukan sinyal entry otomatis.

- Threshold: `97`
- Timeframe produksi: `M15` dan `H1`
- Horizon riset: `72 jam`
- Research lock SHA-256: `693cd685966d4c1845d8c289cc442c4292f4cc5a08ac20cce2804e3ed7aade92`
- Source indicator blob SHA: `c051677aee3b88e4cfdab50deda30d1e1c919654`
- Data riset: 2020–2025
- Data 2026: ditolak dan tidak digunakan

## Output UI

Card Mapping hanya menampilkan:

- destination: `BSL` atau `SSL`;
- nama serta harga target liquidity;
- confidence model;
- jarak target dalam ATR14;
- status `VALID CONTEXT` atau `ABSTAIN`.

Card tidak boleh menyediakan:

- tombol BUY/SELL;
- entry area;
- stop loss;
- take profit;
- eksekusi otomatis;
- klaim bahwa confidence adalah win rate trading.

## Aturan abstain

Sistem tidak memaksa destination ketika:

1. confidence tertinggi di bawah 97;
2. BSL dan SSL aktif belum lengkap;
3. Asia range masih dibangun;
4. rejection guard muncul pada sisi yang diproyeksikan;
5. timeframe bukan M15/H1;
6. data candle closed belum cukup.

## Hasil audit yang menjadi dasar

Pada audit live-realistic threshold-first, cooldown non-overlap 72 jam:

| TF | Total | Benar | Conservative accuracy |
|---|---:|---:|---:|
| M15 | 437 | 389 | 89,02% |
| H1 | 255 | 224 | 87,84% |
| Gabungan | 692 | 613 | 88,58% |

Angka tersebut mengukur target BSL/SSL mana yang disentuh lebih dahulu. Angka tersebut **bukan** win rate entry dan tidak membuktikan profitabilitas.

## Research freeze

Tidak ada perubahan threshold, tuning parameter, backtest baru, atau modul context baru sampai ada keputusan riset baru dari pemilik proyek.
