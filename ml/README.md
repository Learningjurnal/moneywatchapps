# Model XGBoost Signal — Training & Update

> **STATUS: EKSPERIMEN EDUKASI, bukan alat prediksi yang terbukti bekerja.**
> Setelah 3 iterasi perbaikan berturut-turut (label SL/TP-aware → kalibrasi
> threshold persentil → 10 fitur teknikal termasuk ATR/EMA), model ini
> **tidak pernah menunjukkan sinyal prediktif yang jelas di atas
> tebak-tebakan acak** — lift-nya justru turun dari 1,09x ke 0,98x setelah
> fitur ditambah. Keputusan sadar (2026-09-11): **berhenti mengiterasi**
> fitur/threshold lebih lanjut. Lihat bagian "Kesimpulan" di bawah untuk
> rinciannya sebelum menganggap angka akurasi apa pun di sini berarti
> model ini bisa dipakai untuk keputusan trading nyata.

Strategi **"XGBoost"** di halaman Backtester berjalan di browser lewat model
ONNX yang sudah dilatih (`public/models/xgb_signal.onnx`) — bukan simulasi
lagi. Tidak ada server Python yang perlu menyala; browser cukup memuat file
model statis lewat `onnxruntime-web`, persis seperti memuat file gambar/JSON.

Yang **butuh Python** hanyalah proses **training** model itu sendiri, dan itu
cukup dijalankan sesekali — baik manual di komputer Anda, atau otomatis lewat
GitHub Actions terjadwal (lihat bagian "Retrain otomatis" di bawah).

## Melatih ulang / update model secara manual

```bash
cd ml
python -m venv .mlvenv
# Windows:
.mlvenv\Scripts\activate
# Mac/Linux:
source .mlvenv/bin/activate

pip install -r requirements.txt
python train_xgb_signal.py
```

Skrip ini menghitung path output-nya relatif terhadap lokasi filenya sendiri
(bukan direktori kerja saat ini), jadi aman dijalankan dari `ml/` maupun dari
root repo. Output:
- `public/models/xgb_signal.onnx` — model terlatih (di-load browser)
- `public/models/xgb_signal_meta.json` — urutan fitur, threshold sinyal, metrik akurasi

Commit kedua file itu ke repo lalu push — Backtester akan otomatis memakai
model terbaru saat aplikasi di-reload (tidak perlu ubah kode JS apa pun,
kecuali Anda mengubah daftar fitur — lihat di bawah).

## Retrain otomatis (GitHub Actions)

Workflow terjadwal `.github/workflows/retrain-model.yml` menjalankan skrip
ini otomatis **tiap tanggal 1 setiap bulan** (dan bisa dipicu manual kapan
saja lewat tab Actions → "Retrain XGBoost Signal Model" → "Run workflow").
Kalau hasil retrain menghasilkan file yang berbeda dari sebelumnya, workflow
langsung meng-commit & push `public/models/xgb_signal.onnx` dan
`public/models/xgb_signal_meta.json` ke `main` — tidak perlu approval manual.
Kalau tidak ada perubahan berarti (mis. gagal ambil data), workflow tidak
melakukan commit apa pun.

## Bagaimana cara kerjanya

1. `train_xgb_signal.py` mengambil data harga historis 20 saham IDX (5 tahun,
   via `yfinance`), menghitung 6 fitur teknikal harian, lalu melabeli tiap
   baris berdasarkan **hasil trade SL/TP**, bukan sekadar arah harga (lihat
   "Definisi label" di bawah).
2. XGBoost classifier dilatih dengan split waktu (bukan acak) — 80% data
   awal untuk training, 20% data terbaru untuk test — supaya tidak ada
   "bocoran" informasi masa depan ke training set.
3. Model dikonversi ke format **ONNX** (`onnxmltools`), format model yang
   bisa dijalankan di banyak platform termasuk browser lewat WebAssembly.
4. `js/11-quant.js` memuat file `.onnx` itu dengan `onnxruntime-web`,
   menghitung fitur yang SAMA PERSIS dari data harga live (fungsi
   `xgbComputeFeatures`), lalu menjalankan inferensi langsung di browser
   pengguna — tanpa data terkirim ke server mana pun.

## Definisi label (2026-09-11 — diperbaiki)

Sebelumnya label training adalah "harga naik >3% dalam 10 hari ke depan" —
sederhana, tapi **sama sekali tidak peduli risiko**: model bisa saja "benar"
soal arah harga naik, padahal di dunia nyata posisi itu sudah kena Stop Loss
duluan sebelum sempat naik. Model jadi belajar memprediksi sesuatu yang
berbeda dari apa yang benar-benar akan terjadi kalau sinyalnya dieksekusi.

Label sekarang disinkronkan dengan formula SL/TP **riil** yang dipakai
`computeStockSignal()` di `lib/idx-data-engine.js` untuk setiap sinyal yang
ditampilkan di aplikasi:

- `SL = harga_entry − ATR(14) × 1.5`
- `TP1 = harga_entry + ATR(14) × 2.5`
- ATR(14) dihitung sebagai rata-rata sederhana True Range 14 hari (bukan
  Wilder's smoothing) — lihat `compute_atr()` di `train_xgb_signal.py`,
  harus sama persis dengan `computeATR()` di JS.
- Label `1` = TP1 tersentuh **sebelum** SL dalam `MAX_HOLD_DAYS` (20 hari
  bursa) ke depan. Label `0` = SL tersentuh duluan (atau di hari yang sama
  dengan TP — diasumsikan SL duluan, skenario konservatif). Baris di mana
  **keduanya belum tersentuh** sampai akhir horizon **dibuang**, bukan
  diam-diam dianggap `0` (lihat komentar `INV-011` di `build_dataset()`).

Kalau Anda mengubah pengali SL/TP di `computeStockSignal()` (JS), **ubah
juga** `SL_ATR_MULT`/`TP_ATR_MULT`/`MAX_HOLD_DAYS` di `train_xgb_signal.py`
supaya model tetap belajar dari trade yang benar-benar akan dieksekusi
sistem — sama seperti aturan sinkronisasi fitur di bawah.

Retrain pertama dengan label ini (2026-09-11, lewat GitHub Actions manual)
sudah jalan — `public/models/xgb_signal.onnx` sekarang memakai label baru
ini (cek `trained_at`/`label_definition` di `xgb_signal_meta.json` untuk
konfirmasi versi terbaru).

## Kalibrasi threshold BUY/SELL (2026-09-11 — "Opsi A")

Retrain pertama dengan label SL/TP di atas ternyata menghasilkan model
dengan **recall kelas BUY cuma 3,1%** pada threshold default 0,5 — artinya
probabilitas prediksi model nyaris tidak pernah menembus `BUY_THRESHOLD`
lama (0,60), dan Backtester menghasilkan **0 sinyal** sepanjang 2 tahun
untuk BBCA. Target SL/TP-aware jauh lebih sulit ditebak daripada target
arah-harga lama, jadi skala probabilitas mentah model tidak lagi berarti
"60% = yakin" seperti asumsi threshold absolut sebelumnya.

**Threshold sekarang dikalibrasi dari PERSENTIL keluaran model itu sendiri
di test set**, bukan angka absolut tetap:
- `BUY_PERCENTILE = 80` — top 20% probabilitas tertinggi versi model →
  sinyal BUY.
- `SELL_PERCENTILE = 20` — bottom 20% probabilitas terendah → sinyal
  AVOID/SELL.

Ini menjamin model **selalu** memberi sinyal pada kasus paling meyakinkan
menurut dirinya sendiri — tapi **tidak menjamin sinyal itu akurat**. Skrip
mencetak diagnostik jujur setiap kali training (dan menyimpannya ke
`xgb_signal_meta.json` sebagai `buy_precision_at_threshold`/`base_rate`):
kalau precision di titik threshold itu tidak jauh dari base rate (lift
<1.15x), itu tanda model **memang tidak punya sinyal nyata** di titik
operasi itu — akar masalahnya di fitur/model, bukan angka threshold, dan
Opsi A saja tidak cukup (perlu evaluasi fitur tambahan atau penanganan
class-imbalance saat training).

## Fitur tambahan (2026-09-11 — "Opsi C")

Retrain dengan kalibrasi threshold persentil (Opsi A) mengatasi masalah
"0 sinyal", tapi diagnostik jujur di titik itu menunjukkan **lift cuma
1,09x** vs base rate (AUC 0,522, nyaris tebak acak) — 6 fitur lama semuanya
soal ARAH/MOMENTUM harga, tidak ada yang menangkap REZIM VOLATILITAS
terhadap target SL/TP yang justru ATR-scaled. Ditambahkan 4 fitur baru
yang relevan ke path-dependency itu:

| # | Nama | Rumus | Alasan |
|---|------|-------|--------|
| 7 | `atr_pct` | ATR(14) / close[i] | Volatilitas relatif — SL/TP dihitung ATR×1.5/2.5, jadi seberapa besar ATR dibanding harga langsung mempengaruhi jarak target secara persentase |
| 8 | `ema20_slope5` | (EMA20[i] − EMA20[i-5]) / EMA20[i-5] | Percepatan tren jangka pendek, lebih halus dari `mom20` mentah |
| 9 | `dist_ema20` | (close[i] − EMA20[i]) / EMA20[i] | Seberapa jauh harga "meregang" dari rata-rata — sinyal mean-reversion vs trend-continuation |
| 10 | `atr_ratio_20` | ATR(14)[i] / ATR(14)[i-20] − 1 | Rezim volatilitas melebar/menyempit — mempengaruhi kecepatan harga menyentuh TP/SL |

**Catatan desain kritis — EMA pakai jendela TETAP, bukan histori penuh:**
EMA20 di atas dihitung dari `EMA_LOOKBACK=60` candle terakhir saja (dihitung
ulang per baris), BUKAN direkursi dari seluruh histori yang tersedia —
meniru persis pola `computeEMA(closes.slice(-40), 20)` yang sudah dipakai
di `lib/idx-data-engine.js`. Kalau EMA direkursi dari histori penuh,
nilainya akan berbeda antara training (histori 5 tahun) dan inferensi live
di browser (mungkin cuma dapat histori 1 tahun untuk rentang backtest
pendek) untuk TANGGAL YANG SAMA — **train/serve skew** yang tidak pernah
muncul sebagai error, cuma diam-diam merusak akurasi model.

Karena jendela EMA butuh 60 hari pemanasan, `xgbComputeFeatures()` di JS
sekarang mulai loop-nya dari baris ke-60 (dulu ke-30).

## PENTING — fitur harus sinkron Python ↔ JavaScript

Fitur yang dipakai model (`FEATURE_NAMES` di `train_xgb_signal.py` dan
`XGB_FEATURES` di `js/11-quant.js`) harus **identik urutan dan rumusnya**
— sekarang 10 fitur (6 lama + 4 di atas). Verifikasi kesamaan ini bukan
cuma dibaca sekilas: kedua sisi sudah diuji numerik memakai data OHLCV
sintetis identik (di-generate sekali di Python, dimuat ulang di kedua
sisi) — **seluruh 10 fitur di 240 baris cocok persis (diff 0.0)**.

Kalau Anda menambah/mengubah fitur di skrip Python, **ubah juga**
`xgbComputeFeatures()` di `js/11-quant.js` dengan rumus yang sama persis
(termasuk `EMA_LOOKBACK`/`XGB_EMA_LOOKBACK` kalau itu yang diubah), kalau
tidak, model akan menerima input yang salah dan prediksinya jadi tidak
berarti — lakukan verifikasi numerik silang seperti di atas, bukan cuma
baca kode, sebelum mempercayai hasilnya.

## Kesimpulan (2026-09-11) — kenapa iterasi dihentikan

Tiga perbaikan berturut-turut dicoba, masing-masing diukur dengan
diagnostik precision-vs-base-rate yang sama (bukan cuma accuracy mentah,
yang gampang tinggi kalau model cuma menebak kelas mayoritas):

| Iterasi | Perubahan | Lift vs base rate |
|---|---|---|
| 1 | Label diganti dari "naik >3%/10 hari" ke SL/TP-aware (ATR-based) | Recall kelas BUY 3,1% pada threshold tetap 0,60 → **0 sinyal** di backtest |
| 2 (Opsi A) | Threshold dikalibrasi dari persentil keluaran model sendiri | **1,09x** (di bawah ambang 1,15x yang ditetapkan sebagai "ada sinyal nyata") |
| 3 (Opsi C) | +4 fitur teknikal baru (ATR relatif, slope EMA, jarak EMA, rasio ATR) | **0,98x** — turun, bukan naik |

Trennya **menurun**, bukan mendekati ambang yang diharapkan. Ini bukti
empiris (bukan cuma disclaimer template "efficient market") bahwa 10 fitur
teknikal harian yang ada memang tidak menyimpan sinyal yang cukup untuk
menebak "TP tersentuh sebelum SL dalam 20 hari" dari data harga OHLCV
harian saja. Menambah fitur teknikal turunan lagi kemungkinan besar punya
ROI yang sama (menurun/nol), bukan solusi.

**Kalau suatu saat ingin melanjutkan**, jalan yang tersisa berbeda scope-nya
secara fundamental, bukan lagi "tambah 1-2 fitur":
1. Ubah dari klasifikasi biner (TP vs SL) ke regresi (prediksi R-multiple).
2. Perbanyak data secara drastis — ratusan saham dan/atau data intraday,
   bukan 20 saham harian.
3. Terima sebagai batas metode ini dan biarkan strategi ini murni untuk
   pembelajaran cara kerja pipeline ML end-to-end (fitur → label → training
   → ONNX → inferensi browser), bukan untuk mengejar akurasi prediksi.

## Keterbatasan & disclaimer

- **Ini eksperimen edukasi, sudah terbukti (bukan diasumsikan) tidak
  punya sinyal prediktif yang jelas** — lihat tabel "Kesimpulan" di atas.
  Akurasi test-set (lihat `xgb_signal_meta.json` untuk angka terbaru,
  ~59-61%) TIDAK berarti model ini berguna — precision-nya pada threshold
  operasional nyaris sama atau lebih buruk dari base rate.
- **Bukan rekomendasi investasi.** Selalu lakukan riset mandiri.
- Model dilatih dari 19-20 saham blue-chip/likuid IDX — sinyal untuk ticker
  di luar itu (atau saham yang baru IPO) kemungkinan kurang akurat karena
  pola harganya tidak terwakili di data training.
