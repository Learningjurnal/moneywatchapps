# Model XGBoost Signal — Training & Update

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
   baris: `1` jika harga naik >3% dalam 10 hari ke depan, `0` jika tidak.
2. XGBoost classifier dilatih dengan split waktu (bukan acak) — 80% data
   awal untuk training, 20% data terbaru untuk test — supaya tidak ada
   "bocoran" informasi masa depan ke training set.
3. Model dikonversi ke format **ONNX** (`onnxmltools`), format model yang
   bisa dijalankan di banyak platform termasuk browser lewat WebAssembly.
4. `js/11-quant.js` memuat file `.onnx` itu dengan `onnxruntime-web`,
   menghitung fitur yang SAMA PERSIS dari data harga live (fungsi
   `xgbComputeFeatures`), lalu menjalankan inferensi langsung di browser
   pengguna — tanpa data terkirim ke server mana pun.

## PENTING — fitur harus sinkron Python ↔ JavaScript

Fitur yang dipakai model (`FEATURE_NAMES` di `train_xgb_signal.py` dan
`XGB_FEATURES` di `js/11-quant.js`) harus **identik urutan dan rumusnya**:

| # | Nama | Rumus |
|---|------|-------|
| 1 | `sma_ratio` | SMA(10)/SMA(30) − 1 |
| 2 | `rsi14` | RSI(14) / 100 |
| 3 | `mom20` | (close[i] − close[i-20]) / close[i-20] |
| 4 | `vol_ratio` | volume[i] / SMA(volume, 20)[i] |
| 5 | `volatility20` | stdev harian return, jendela 20 hari |
| 6 | `dist_high20` | (close[i] − max(high, 20 hari)) / max(high, 20 hari) |

Kalau Anda menambah/mengubah fitur di skrip Python, **ubah juga**
`xgbComputeFeatures()` di `js/11-quant.js` dengan rumus yang sama persis,
kalau tidak, model akan menerima input yang salah dan prediksinya jadi tidak
berarti.

## Keterbatasan & disclaimer

- Akurasi test-set saat model pertama dilatih (lihat `xgb_signal_meta.json`
  untuk angka terbaru): sekitar 70% accuracy / ROC AUC ~0.56 — sedikit di
  atas tebak-tebakan acak untuk masalah prediksi arah harga jangka pendek,
  yang memang secara teori sangat sulit ("efficient market"). Ini murni
  model statistik untuk edukasi/backtesting.
- **Bukan rekomendasi investasi.** Selalu lakukan riset mandiri.
- Model dilatih dari 19-20 saham blue-chip/likuid IDX — sinyal untuk ticker
  di luar itu (atau saham yang baru IPO) kemungkinan kurang akurat karena
  pola harganya tidak terwakili di data training.
