# Pemetaan Temuan — "MoneyWatch Pro — Master Review" (basis review 10 Sep 2026)

**Tujuan dokumen ini:** setiap baris "Critical Findings" di laporan audit (`MoneyWatchPro_MASTER_REVIEW_2026.pdf`) dipetakan ke bukti nyata di repo ini — file dan baris spesifik — dan diberi status verifikasi independen. Ini murni dokumentasi (tidak mengubah perilaku kode apa pun) supaya keputusan prioritas berikutnya bisa diambil berdasarkan lokasi konkret, bukan ringkasan laporan saja.

Level keyakinan per temuan mengikuti apa yang benar-benar bisa diverifikasi dengan membaca kode di repo ini pada saat dokumen ini ditulis (10 Sep 2026, cabang `main`). Temuan yang menyinggung sesuatu di luar repo ini (mis. status kontrak komersial provider, atau pipeline training yang mungkin berjalan di luar repo) ditandai eksplisit sebagai tidak dapat diverifikasi dari sini.

---

## MW-P0-001 — Server authentication & authorization (P0)

**Klaim laporan:** endpoint save/load mempercayai `uid`/`email` dari body/query, bukan dari sesi server yang terverifikasi.

**Status: CONFIRMED — dan levelnya lebih parah dari yang tersirat di ringkasan laporan.**

Bukti (`server.js`, cabang `main`):

```
127:  const uid = (body.uid || body.email || '').trim();                              // POST /api/user-data/save
192:    const uid = (req.query.uid || req.query.email || '').trim();                   // GET  /api/user-data/load
279:    const uid = (body.uid || body.email || req.query.uid || req.query.email || ''); // POST /api/user-data/clear
398:  const uid = (req.query.uid || req.query.email || '').trim();                     // (endpoint lain, pola sama)
```

Tidak ada middleware verifikasi JWT/sesi Supabase di jalur mana pun sebelum baris-baris ini dieksekusi — sudah dicek langsung, tidak ada `req.headers.authorization`, `jwt.verify`, atau pemanggilan client Supabase Auth di sekitar keempat endpoint ini.

**Catatan tambahan (tidak ada di ringkasan laporan, tapi penting):** endpoint `/api/user-data/clear` bukan cuma bisa *dibaca* orang lain — ia benar-benar **menghapus** data tersimpan milik `uid` yang diberikan (lihat `server.js:331-332`, `fs.writeFileSync` menimpa dengan record kosong). Ini bukan cuma kebocoran privasi, tapi juga vektor perusakan data pengguna lain, berlaku hari ini di produksi, terlepas dari apakah live trading pernah diaktifkan.

---

## MW-P1-002 — ML auto-promotion (P1)

**Klaim laporan:** proses `train → commit → main` perlu diganti dengan champion/challenger bergerbang.

**Status: TIDAK DAPAT DIKONFIRMASI SEBAGAI PIPELINE AKTIF DI REPO INI.**

Sudah dicari di `server.js` dan seluruh `lib/*.js` — tidak ditemukan proses retraining terjadwal, tidak ada fungsi yang menulis model/commit ke `main`, tidak ada konsep "champion"/"challenger" dalam kode apa pun. Yang ada hanyalah scoring/strategi berbasis aturan (confluence scoring), bukan model ML yang dilatih ulang secara berkala.

**Interpretasi yang paling masuk akal:** temuan ini kemungkinan menggambarkan *risiko yang akan muncul* jika/ketika pipeline retraining otomatis dibangun — bukan bug yang aktif sekarang di kode yang ditinjau. **Perlu konfirmasi dari Anda**: apakah ada proses training/promotion terpisah di luar repo `moneywatchapps` ini (mis. notebook terpisah, repo lain, cron job eksternal) yang dimaksud laporan ini? Kalau tidak ada, temuan ini statusnya "kontrol pencegahan untuk pekerjaan masa depan" (§12 kebijakan sudah saya sahkan sebagai gerbang wajib begitu pipeline itu dibangun — lihat `FINANCIAL_POLICY.md` §12), bukan perbaikan bug mendesak.

---

## MW-P1-003 — Live Invezgo contract unverified (P1)

**Klaim laporan:** integrasi Invezgo belum diuji terhadap API key/skema/timestamp/quota nyata.

**Status: CONFIRMED, berdasarkan riwayat kerja saya sendiri di repo ini.** `lib/invezgo-client.js` dan jalur broker-summary di `lib/idx-data-engine.js` dibangun dengan asumsi skema respons Invezgo (lihat komentar `isSimulated`/`isInvalid` di sekitar `generateBrokerSummary`), tapi belum pernah dijalankan sungguhan terhadap API key produksi Invezgo dalam sesi kerja mana pun di repo ini — semua verifikasi sejauh ini adalah `npm test` dengan fixture buatan, bukan panggilan API nyata. Lingkungan kerja saya saat ini juga tidak punya akses jaringan keluar ke `invezgo.com` untuk mengujinya langsung (sudah dicoba, diblokir allowlist jaringan sandbox).

---

## MW-P1-004 — Synthetic quote can reach consumers (P1)

**Klaim laporan:** kuota sintetis/fabrikasi bisa mengalir ke konsumen; status kualitas data harus ditegakkan di SETIAP konsumen, bukan cuma diberi label.

**Status: SEBAGIAN SUDAH DIMITIGASI — perlu verifikasi lanjut per titik konsumsi, bukan diasumsikan menyeluruh.**

Bukti mitigasi yang sudah ada (`lib/idx-data-engine.js`):
- `computeStockSignal` menolak menghasilkan sinyal pada quote yang `isSimulated` (baris ~944, 959) — ini pemblokiran nyata di titik keputusan, bukan cuma label.
- `assessDataQuality()` (baris ~1060-1118) memetakan `isSimulated` → status `SIMULATION` secara konsisten, dan `passesGate` selalu `false` untuk status itu (diverifikasi lewat `test_financial_policy.js` yang saya buat sebelumnya).

**Yang belum saya verifikasi:** apakah SEMUA titik konsumsi lain (mis. layar fundamental, kalkulator dividen, tampilan portofolio) memanggil `assessDataQuality()`/mengecek `isSimulated` sebelum menampilkan angka sebagai fakta, atau ada jalur yang melewatinya. Laporan audit benar bahwa pendekatan berbasis label saja tidak cukup — klaim "sudah ditegakkan di mana-mana" butuh audit titik-konsumsi satu per satu, bukan diasumsikan dari dua contoh di atas.

---

## MW-P2-005 — Provider logic coupled to engine (P2)

**Klaim laporan:** logika provider (Yahoo/IDX/Invezgo) menyatu dengan mesin analisis; perlu dipisah lewat adapter.

**Status: CONFIRMED.** `lib/idx-data-engine.js` adalah satu file 2.949 baris yang berisi baik fungsi fetch provider (`fetchYahooQuote`, `fetchInvezgoBrokerSummary` dst.) maupun logika skor/strategi (`computeConfluence`, `generateTradingHypothesis`, `runStrategyBacktest`) — 28 titik silang referensi antar keduanya di file yang sama. Tidak ada lapisan `providers/yahoo`, `providers/idx`, `providers/invezgo` terpisah seperti yang direkomendasikan.

---

## MW-P2-006 — CI/CD quality gate incomplete (P2)

**Klaim laporan:** pipeline `install→syntax→lint→unit→financial→security→data-contract→build→model validation` belum lengkap; build harus memblokir rilis pada kegagalan kritis.

**Status: CONFIRMED.** `package.json`:
```json
"build": "echo 'Build complete'",
"lint": "node --check server.js && node --check lib/idx-data-engine.js && node --check public/js/03-engine.js && node --check public/js/21-performance.js && node --check public/js/02b-price-index.js"
```
`build` murni placeholder (tidak melakukan apa-apa). `lint` hanya `node --check` (cek sintaks) pada 5 file yang dipilih tangan — bukan linting aturan gaya/kualitas kode, dan tidak mencakup sebagian besar `public/js/*.js` lainnya. Tidak ada tahap security scan, data-contract test (di luar `test_financial_policy.js` yang baru saya tambahkan), atau model validation di pipeline mana pun yang saya temukan (tidak ada file CI seperti `.github/workflows/*` di repo ini).

---

## Ringkasan status verifikasi

| ID | Status | Tingkat keyakinan |
|---|---|---|
| MW-P0-001 | Confirmed, lebih parah dari ringkasan laporan (bisa hapus data, bukan cuma baca) | Tinggi — dibaca langsung dari kode |
| MW-P1-002 | Tidak ditemukan pipeline aktif di repo ini — perlu konfirmasi Anda | Sedang — pencarian menyeluruh tidak menemukan bukti, tapi bisa saja ada di luar repo |
| MW-P1-003 | Confirmed dari riwayat kerja sendiri di repo ini | Tinggi |
| MW-P1-004 | Sebagian dimitigasi di 2 titik yang diverifikasi; cakupan penuh belum diaudit | Sedang — butuh audit titik-konsumsi lanjutan |
| MW-P2-005 | Confirmed | Tinggi |
| MW-P2-006 | Confirmed | Tinggi |
