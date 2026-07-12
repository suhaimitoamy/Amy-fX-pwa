# Status Migrasi Amy FX PWA

Tanggal: 12 Juli 2026

## Selesai

- Entry point PWA dan manifest instalasi.
- Ikon iPhone 180 px serta ikon PWA 192/512 px.
- Service Worker, offline fallback, cache, dan update.
- Platform adapter pengganti Android bridge.
- Dashboard, Mapping, Market Intel, Journal, dan Academy memakai fondasi PWA.
- Backend login member Supabase tanpa pendaftaran publik.
- Konfigurasi login dibuat terpisah agar aplikasi tidak terkunci sebelum akun pemilik tersedia.
- Web Push tidak diaktifkan dan tidak dipaksakan.
- Workflow APK, Android debug, Android lint, dan release APK dihapus dari repo PWA.
- Konfigurasi Vercel dan pengecualian source Android dari deployment.
- README diganti agar sesuai dengan kondisi PWA.

## Menunggu tindakan pemilik

- Menghubungkan repo `suhaimitoamy/Amy-fX-pwa` sebagai project baru di Vercel.
- Membuat akun pemilik di Supabase Auth.
- Setelah akun berhasil diuji, mengubah `authRequired` menjadi `true` pada `pwa-config.json`.
- Menguji Add to Home Screen melalui Safari pada iPhone.
