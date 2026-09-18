# Aturan Wajib — MoneyWatch Pro

## 1. Zero Fabricated Data
Setiap fitur harus pakai data REAL dari sumber yang terverifikasi (Invezgo,
Yahoo Finance, dll). Kalau data real tidak tersedia, LABELI JUJUR sebagai
simulasi/tidak tersedia — jangan pernah karang/tebak nilai atau skema
respons API. Jangan pernah menebak skema respons API eksternal; verifikasi
dari dokumentasi resmi, respons real yang di-upload user, atau source code
resmi vendor sebelum menulis parser.

## 2. JANGAN PERNAH batasi cakupan analisis ke LQ45/IDX30/sampel kecil lain
User sudah berulang kali (dan tegas) meminta: **setiap fitur screening/
analisis pasar harus mencakup SELURUH ~958 emiten BEI**, bukan cuma LQ45
(45 saham), IDX30, atau daftar sampel hardcoded (mis. 42 ticker populer).
Kalau ada keterbatasan teknis (kuota API, durasi function serverless, dll)
yang memaksa cakupan lebih sempit dari seluruh bursa:
- Cari dulu endpoint/metode yang mencakup SELURUH universe dalam sedikit
  panggilan (banyak endpoint Invezgo, mis. `/analysis/top/accumulation`
  dan `/analysis/top/foreign`, sudah mengembalikan SELURUH pasar dalam 1
  panggilan — cek dulu sebelum membangun scan per-ticker/sample).
- Kalau memang tidak ada cara mencakup semua sekaligus, JUJUR labeli
  keterbatasannya di UI (bukan diam-diam pakai sampel kecil seolah itu
  representasi pasar penuh) dan tawarkan opsi eksplisit ke user, jangan
  putuskan sepihak untuk membatasi cakupan.

Insiden yang sudah terjadi karena melanggar ini (lihat `INCIDENT_LOG.md`
untuk detail): Screener LQ45 diam-diam cuma 45 saham padahal ada 950,
Bandarmology market-aggregate view (Foreign Flow, Accumulation,
Distribution, Broker Trail) diam-diam cuma scan ~42 ticker hardcoded
padahal Invezgo API punya endpoint whole-market. Jangan ulangi pola ini.

## 3. Disiplin lain yang sudah mapan di sesi-sesi sebelumnya
- Setiap regresi baru: buktikan fail-without-fix (`git stash`) sebelum
  pass-with-fix.
- `node -c`, `npm test`, `npm run lint` sebelum commit.
- Cache-bust `?v=` di `index.html` untuk file JS/CSS yang berubah.
- Catat setiap insiden/perbaikan di `INCIDENT_LOG.md` (Bahasa Indonesia).
- Semua respons ke user dalam Bahasa Indonesia.
