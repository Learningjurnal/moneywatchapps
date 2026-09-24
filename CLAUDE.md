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

## 3. Label "SIMULASI" tidak menghapuskan kewajiban jujur — JANGAN mengarang angka spesifik
Ditemukan berulang kali (audit menyeluruh 2026-09-18): kode yang SUDAH diberi
label "SIMULASI"/`isSimulated:true` tetap bisa melanggar prinsip #1 kalau
angka yang ditampilkan terlihat presisi & meyakinkan (nama broker asli,
bobot volume, harga rata-rata sampai satuan Rupiah) — padahal 100% hasil
formula/tebakan (mis. widget "Matriks Rata-Rata Harga Beli Broker 1 Tahun",
`generateBrokerSummaryTemplate()`/`generateClientSideBrokerSummary()`).
Label jujur mengurangi risiko, tapi TIDAK menghapuskannya — pengguna tetap
bisa salah ambil keputusan dari angka yang terlihat presisi.
- Kalau API real (Invezgo/Yahoo) yang relevan SUDAH terbukti bisa memberi
  data itu (baik untuk ticker ini maupun ticker lain) tapi gagal/tidak
  dikonfigurasi untuk kasus ini: tampilkan **kosong/jujur** ("Data tidak
  tersedia"), JANGAN hitung angka pengganti dari formula/pola/random-seed.
- Fallback simulasi HANYA boleh menghasilkan angka spesifik kalau memang
  TIDAK ADA cara mendapatkan data itu sama sekali dari API manapun yang
  terintegrasi (mis. `fsGenData()`'s random-walk OHLCV placeholder —
  dipakai HANYA sebelum fetch real selesai, self-healing, bukan pengganti
  permanen) — dan bahkan itu harus jelas berlabel & idealnya sementara.
- Kalau skema respons API eksternal (termasuk struktur nested seperti
  `payload` yang beda-beda per `type`) belum terverifikasi dari contoh
  respons real, JANGAN petakan ke field spesifik yang ditebak — tampilkan
  data mentah/generik, atau nonaktifkan fitur itu dulu (dikonfirmasi ke
  user dulu kalau menonaktifkan berarti fitur besar berhenti berfungsi).

## 4. Disiplin lain yang sudah mapan di sesi-sesi sebelumnya
- Setiap regresi baru: buktikan fail-without-fix (`git stash`) sebelum
  pass-with-fix.
- `node -c`, `npm test`, `npm run lint` sebelum commit.
- Cache-bust `?v=` di `index.html` untuk file JS/CSS yang berubah.
- Semua respons ke user dalam Bahasa Indonesia.
- **`INCIDENT_LOG.md` SUDAH DIHAPUS** (dibersihkan sengaja oleh user,
  commit `30cd06e` "clean repo docs") — JANGAN dibuat ulang atau ditulisi
  lagi. Dokumentasi arsitektur/kebijakan sekarang hidup di `AGENTS.md`
  (Master AI Knowledge Base) dan `DATA_TRACEABILITY_MANIFESTO.md` (5-Tier
  Data Provenance) — catatan insiden/fix spesifik cukup di pesan commit
  git yang deskriptif, bukan file log terpisah lagi. Referensi
  `INCIDENT_LOG.md` yang masih tersisa di komentar kode lama (banyak file
  `public/js/*.js`) adalah jejak historis, bukan instruksi aktif — tidak
  perlu diburu dan dihapus satu-satu.
