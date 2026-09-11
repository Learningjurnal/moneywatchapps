# AI Paper Trading Dataset — Item #4 Groundwork

> **STATUS: PERSIAPAN, BUKAN MODEL.** File ini mendokumentasikan skema
> data yang mulai dikumpulkan sejak 2026-09-11 (lihat `INCIDENT_LOG.md`
> entri tanggal yang sama), supaya *nanti* — ketika AI Paper Trading sudah
> mengumpulkan cukup trade tertutup — sesi training tidak perlu mendesain
> ulang struktur data dari nol. **Tidak ada model yang dilatih dari sini.
> Belum ada jadwal kapan itu akan terjadi.**

## Kenapa file ini ada

Bagian dari roadmap AI Copilot (lihat `INCIDENT_LOG.md`, tiga entri
"Fitur item #1/#2/#3" tanggal 2026-09-11) — pertanyaan user: *"bagaimana
menerapkan ML supaya AI chat bisa jadi copilot trading?"* Jawaban jujurnya
saat itu: butuh data trade historis yang cukup dulu, dan proses training
harus mengulang disiplin yang sama seperti `ml/train_xgb_signal.py`
(lihat `ml/README.md`) — jangan sampai mengulang pola "model kelihatan
canggih tapi ternyata tidak prediktif" yang sudah terjadi di model
XGBoost.

Item #4 sendiri **ditunda** sampai datanya cukup (minggu-bulan, sesuai
perkiraan user sendiri). Yang bisa dikerjakan sekarang, dan sudah selesai:
memastikan data yang terkumpul selama masa tunggu itu sudah dalam bentuk
yang benar-benar bisa dipakai nanti — bukan cuma riwayat harga/PnL, tapi
**breakdown fitur yang sebenarnya mendasari keputusan BUY saat itu**.

## Kenapa ini genuinely perlu disiapkan lebih dulu (bukan basa-basi)

Sebelum perubahan ini, `closedTrades` (`AI_TRADE_STATE.paperAccount`,
`public/js/38-ai-autonomous-trading.js`) mencatat harga entry/exit,
tanggal, PnL, dan narasi lesson/mistake/improvement — tapi **tidak**
mencatat skor teknikal/fundamental yang sebenarnya menghasilkan sinyal
BUY saat itu. Kalau baru dicoba direkonstruksi belakangan (setelah
banyak trade terkumpul), itu rapuh dan bisa menyesatkan:

- RSI/EMA/volume ratio dihitung dari histori harga pada window waktu
  tertentu — kalau dihitung ulang bulan-bulan kemudian, cache harga bisa
  sudah berubah/hilang (lihat insiden `mw_rd_*` eviction,
  `INCIDENT_LOG.md` 2026-09-11), dan hasilnya bisa beda dari yang
  benar-benar dilihat mesin saat itu.
- Regime pasar (`regimeAtEntry`) sudah dicatat real-time, tapi skor
  komposit yang benar-benar mendorong keputusan BUY belum.

Solusinya: catat feature snapshot **pada saat keputusan diambil**
(`aiOpenPositionFromSignal()`), bukan rekonstruksi setelahnya.

## Skema

### `PaperPosition.featureSnapshot` (disimpan saat posisi dibuka)

```js
{
  sourceEngine: 'scanner' | 'confluence_hypothesis',
  hasFullFeatureSet: boolean,   // false kalau posisi dibuka dari Hypothesis
                                 // Lab untuk ticker yang belum pernah di-scan
                                 // Scanner — compositeScore dst kosong
  compositeScore: number | null,    // computeStockSignal(): 65% technical + 35% fundamental
  technicalScore: number | null,
  fundamentalScore: number | null,
  trend: string | null,             // 'UPTREND' | 'DOWNTREND' | ...
  rsi14: number | null,
  volRatio: number | null,
  probability: number | null,       // heuristik dari compositeScore — BUKAN win-rate tervalidasi
  evPerShare: number | null,
  rrRatio: number | null,
  regimeAtEntry: string | null
}
```

Sumber: `sig` (entry `AI_UNIVERSE` dari Scanner, dibangun oleh
`computeStockSignal()` di `lib/idx-data-engine.js`) pada saat
`aiOpenPositionFromSignal()` dipanggil. **Ini feature space yang BERBEDA
dari 10 fitur teknikal model XGBoost** (`XGB_FEATURES`, `11-quant.js` /
`ml/train_xgb_signal.py`) — jangan dicampur. `computeStockSignal()` sudah
disebut sendiri di komentar kodenya belum bisa "menyesuaikan bobotnya
sendiri dari hasil trade" — dataset inilah yang suatu saat bisa dipakai
untuk itu (lihat bagian Opsi di bawah).

Field ini ikut dibawa ke `closedTrades` saat posisi ditutup
(`aiClosePosition()`), jadi setiap trade tertutup punya feature snapshot
DAN outcome riil dalam satu record — sepasang (X, y) yang lengkap.

### Dataset export (`aiBuildTrainingDataset()` / `aiExportTrainingDataset()`)

```js
{
  schemaVersion: 1,
  generatedAt: "2026-09-11T...",
  source: "MoneyWatch Pro — AI Paper Trading (modal virtual terisolasi, bukan trading nyata)",
  featureSpace: "composite_signal_v1",
  totalClosedTrades: number,
  totalSamplesWithFeatures: number,   // trade lama tanpa featureSnapshot dilewati, BUKAN diisi 0
  skippedNoFeatureSnapshot: number,
  samples: [
    {
      ticker: string,
      entryDate: string,
      exitDate: string,
      label: 0 | 1,          // 1 = WIN, 0 = LOSS (netPnL >= 0 ? WIN : LOSS)
      netPnL: number,
      rMultiple: number,
      exitReason: string,
      errorClassification: string,
      features: { ...featureSnapshot... }
    }
  ]
}
```

Tombol **"⬇️ Export Dataset ML (JSON)"** ada di halaman AI Trading →
Journal (Post-Mortem), di sebelah export CSV Audit Trail yang sudah ada.
File yang diunduh (`ai-paper-trading-dataset-YYYY-MM-DD.json`) tidak
tersimpan di server — murni ekspor lokal dari `localStorage`/Supabase
sisi user, sama seperti export CSV yang sudah ada.

## Yang BELUM dikerjakan (sengaja, di luar cakupan persiapan ini)

- **Tidak ada model yang dilatih.** File ini cuma memastikan data yang
  terkumpul bisa dipakai nanti.
- **Tidak ada estimasi kapan N cukup.** Belum ada aturan pasti — patokan
  kasar dari `ml/train_xgb_signal.py`, model itu dilatih dari puluhan
  ribu baris (candle-level, bukan trade-level) di 20 saham; dataset
  trade-level ini jauh lebih jarang (1 sampel per posisi yang benar-benar
  ditutup), jadi realistis butuh JAUH lebih lama untuk N yang memadai
  secara statistik — bulan, bukan minggu, kalau AI hanya membuka beberapa
  posisi per minggu.
- **Belum ada keputusan arsitektur ML** untuk item #4 — beberapa opsi
  yang pernah disebut ke user (belum dipilih, belum dikerjakan):
  1. Model baru (mis. logistic regression sederhana) yang memprediksi
     WIN/LOSS dari `featureSnapshot` — feature space JAUH lebih kecil
     (9 field) dibanding 10 fitur candle-level XGBoost, cocok untuk N
     kecil di awal.
  2. Kalibrasi ulang bobot 65%/35% (`compositeScore = tech*0.65 +
     fund*0.35` di `computeStockSignal()`) dari hasil trade riil, alih-alih
     angka tetap yang dipilih di muka.
  3. Feedback loop yang lebih ambisius: `lesson`/`mistake`/`improvement`
     (teks, sudah ada dari mesin Post-Mortem) sebagai training signal
     untuk sesuatu yang lebih canggih dari klasifikasi biner.
- **Tidak dijamin fitur ini "cukup".** Kalau nanti setelah N besar
  ternyata `featureSnapshot` yang ada tidak cukup kaya untuk melatih apa
  pun yang berguna, itu temuan yang sah — sama seperti XGBoost, lebih
  baik ketahuan lewat data nyata daripada diasumsikan di muka.

## Verifikasi

- `test_suite.js` TEST 88-90 membuktikan: `featureSnapshot` benar-benar
  tersimpan saat posisi dibuka (baik dari Scanner maupun Hypothesis Lab),
  terbawa utuh ke `closedTrades` saat ditutup, dan
  `aiBuildTrainingDataset()` menghasilkan label/fitur yang benar serta
  melewati (bukan meng-nol-kan) trade lama tanpa `featureSnapshot`.
