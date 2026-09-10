# MoneyWatchApps — UI/UX Roadmap: Tahap 1 Discovery & Audit Teknis

Dokumen kerja untuk eksekusi `MoneyWatchApps Master UI/UX Review & Improvement
Roadmap 2026` (PDF, September 2026) — mengikuti metodologi Tahap 1 dokumen
tersebut ("Discovery & Audit Teknis") sebelum satu baris kode UI diubah.

**Status: hasil audit, belum ada kode yang diubah.** Ini adalah peta, bukan
rencana eksekusi — potongan P0 mana yang dikerjakan lebih dulu diputuskan
setelah dokumen ini di-review.

**Metode verifikasi**: setiap baris di bawah berasal dari `grep`/pembacaan
langsung source code saat ini (2026-09-10), bukan ingatan/asumsi. Baris yang
ditandai `[BELUM DIKONFIRMASI]` berarti saya menemukan referensinya di router
tapi belum menemukan titik akses (tombol/link) yang memicunya — ini butuh
konfirmasi manual di browser sebelum diasumsikan mati/orphan.

---

## 1. Inventarisasi Route/Halaman (54 total)

Diambil dari `id="page-*"` di `public/index.html`, disilangkan dengan
`goPage()`/`goBandarmology()` di sidebar (`public/index.html`), Command
Palette (`public/js/29-institutional-ui.js`), dan `case` di router
(`public/js/06-analysis-router.js`).

### 1.1 — 29 halaman di sidebar utama (akses langsung)

| Grup Sidebar Saat Ini | Halaman (`goPage` target) | Label UI |
|---|---|---|
| HOME | `daily-brief` | Market Pulse |
| HOME | `radar` | Opportunity Radar |
| HOME | `dashboard` | Portfolio Snapshot (default landing) |
| HOME | `alerts` | Alerts |
| INTELLIGENCE | `stock-intel` | Stock Intel |
| INTELLIGENCE | `sectoral-insight` | Sector Insight |
| INTELLIGENCE | `tradewave` | Research |
| INTELLIGENCE | `fundamental` | Fundamental |
| INTELLIGENCE | `technical` | Technical |
| INTELLIGENCE | `hargawajar` | Valuation |
| INTELLIGENCE | `ranking` | Market Radar |
| INTELLIGENCE | `watchlist` | Watchlist |
| AI-ENGINE | `ai-trading` | AI Trading |
| AI-ENGINE | `stockchat` | StockChat AI |
| BANDARMOLOGY | `bandarmology` | Bandarmology (via `goBandarmology()`, fungsi routing terpisah — lihat temuan 3.2) |
| PORTFOLIO | `portofolio` | Portfolio |
| PORTFOLIO | `transaksi` | Transactions |
| PORTFOLIO | `dividen` | Dividend |
| PORTFOLIO | `rebalance` | Risk |
| PORTFOLIO | `performance` | Performance |
| WEALTH | `wealth` | Net Worth |
| WEALTH | `rdn` | Cash |
| WEALTH | `wbank` | Assets |
| WEALTH | `wdebt` | Debt |
| WEALTH | `divinvest` | Passive Income |
| MORE | `correlation` | Quant Lab |
| MORE | `datahealth` | Data Health |
| MORE | `admin` | Admin |
| MORE | `settings` | Settings |

### 1.2 — 25 halaman TIDAK di sidebar utama

Diverifikasi lewat 3 jalur akses berbeda yang ditemukan di kode:

**a) Command Palette (Ctrl+K)** — `29-institutional-ui.js` punya daftar
sendiri, sebagian TIDAK ada di sidebar sama sekali:
`screener`, `scenario`, `backtester`, `market-regime` (plus beberapa yang
juga ada di sidebar: `dashboard`, `stock-intel`, `portofolio`, `fundamental`,
`bandarmology`, `technical`, `hargawajar`, `radar`, `transaksi`, `dividen`,
`rebalance`, `wealth`, `rdn`).

**b) Sub-tab di dalam halaman lain** (dikonfirmasi via variabel/array
internal di source):
- `QL_TABS` (`11-quant.js`): `pairs`, `screener`, `scenario`, `backtester`
  adalah sub-tab di dalam halaman **Quant Lab** (`correlation`), bukan
  halaman berdiri sendiri.
- `WPAGES` (`20-wealth.js`): `wfire`, `wpiutang` adalah sub-tab di dalam
  **Net Worth** (`wealth`).
- `crypto`, `etf`, `reksadana` — direferensikan luas di `03-engine.js` &
  `05-assets.js` (fungsi `submitCryptoModal`/`submitEtfModal`/`submitRdModal`
  yang sudah kita sentuh sesi ini) — pola ini konsisten dengan sub-tab
  jenis-aset di dalam **Portfolio**/**Wealth**, bukan halaman sendiri.
- `journal` — direferensikan di `38-ai-autonomous-trading.js` (AI Trading
  Journal, tab ke-10 dari 12 kapabilitas file itu) — sub-tab **AI Trading**.
- `candle`, `heatmap` — direferensikan di `13-realdata.js` sebagai bagian
  `RD_BANNER_PAGES` bersama `ranking`/`scanner`/`watchlist`/`screener` — pola
  konsisten dengan sub-view Technical/Screener, bukan halaman berdiri
  sendiri, tapi titik-klik pastinya `[BELUM DIKONFIRMASI]`.
- `monthly-returns`, `pairs` — sub-tab **Quant Lab** (`11-quant.js`).
- `flowscan` — punya file besar sendiri (`07-flowscan.js`) tapi hanya
  direferensikan dari router + file itu sendiri; kemungkinan diakses dari
  dalam **Bandarmology**/**Technical**. `[BELUM DIKONFIRMASI]`.
- `pajak`, `rdn-audit` — direferensikan di `02-storage.js` (util
  rekonsiliasi), kemungkinan sub-view **Cash (rdn)** atau **Settings**.
  `[BELUM DIKONFIRMASI]`.

**c) Tidak ditemukan titik akses sama sekali** (hanya ada `case` di router,
tidak ada tombol/tab/command-palette yang memicunya di manapun yang saya
temukan) — `[BELUM DIKONFIRMASI, KANDIDAT ORPHAN]`:
`copilot`, `dataconn`, `stockmaster`, `sektoral`, `knowledge`.

> **Catatan penting untuk kandidat orphan**: saya baru men-grep pola
> `goPage('<nama>'` dan `'<nama>'` literal di `public/js/*.js` — bukan
> menelusuri setiap kemungkinan (mis. link dinamis yang dibangun dari
> variabel, bukan string literal). Sebelum halaman-halaman ini dianggap mati
> dan dihapus dari IA baru, **wajib dicek manual di browser** (klik-klik
> langsung atau ketik URL/hash-nya kalau app mendukung deep link) — ini
> persis item checklist di roadmap §17 Tahap 1: *"Identifikasi duplicate
> component dan duplicate capability"* sebelum refactor, bukan tebak-tebakan.

---

## 2. Temuan Duplikasi/Overlap (roadmap §5.2, §17)

1. **`sektoral` vs `sectoral-insight`** — dua route TERPISAH dengan nama
   nyaris identik. `sectoral-insight` ada di sidebar (Intelligence → Sector
   Insight, file `44-sectoral-insight.js`, ini yang kita perbaiki tampilan
   labelnya awal sesi ini). `sektoral` memanggil fungsi `renderSektoral()`
   yang berbeda, tidak ada di sidebar, titik aksesnya `[BELUM DIKONFIRMASI]`.
   **Ini kandidat duplikasi paling jelas** — perlu dikonfirmasi apakah
   `sektoral` legacy/dead code yang aman dihapus, atau masih dipakai dari
   suatu tempat sebelum diputuskan.
2. **Analisis satu saham tersebar di 6+ halaman terpisah** — `stock-intel`,
   `fundamental`, `technical`, `hargawajar`, `bandarmology`, dan bagian AI
   di `stockchat`/`ai-trading` semuanya menganalisis saham yang sama dari
   sudut berbeda, tapi sebagai 6 halaman/route terpisah dengan ticker
   selector masing-masing (bukan satu konteks ticker yang dibagi). Ini
   **persis** masalah yang diangkat roadmap §8 (Stock Cockpit) — bukan bug,
   tapi confirmed sebagai fragmentasi IA nyata di kode, bukan cuma opini
   desain.
3. **`goBandarmology()` sebagai fungsi routing terpisah dari `goPage()`** —
   satu-satunya item sidebar yang tidak pakai router generik. Konsolidasi ke
   `goPage()` (atau sebaliknya, mendokumentasikan kenapa ia berbeda) adalah
   pembersihan kecil-tapi-nyata sebelum IA baru dibangun di atasnya.

---

## 3. Financial Calculation Engine — TIDAK BOLEH DIUBAH tanpa audit terpisah

Sesuai roadmap §17 Tahap 1 ("Dokumentasikan financial calculation engine
yang tidak boleh berubah") dan Acceptance Criteria §18 ("Financial
calculations Tidak berubah tanpa audit/validasi"). Daftar ini sudah
established sepanjang sesi kerja sebelumnya (bukan temuan baru hari ini),
dikonfirmasi ulang jumlah baris saat ini:

| File | Baris | Isi |
|---|---:|---|
| `public/js/03-engine.js` | 2.202 | `calcTxComponents()` (pajak/fee), `getPortfolio()`, `getCryptoPortfolio()`, `computeCurrentAUM()`, `rebuildEquityHistoryFromTransactions()` |
| `public/js/01-data.js` | 1.529 | `TAX_SETTINGS`, `SEKURITAS` (tarif broker), `IDX_SECTORS`, universe dasar |
| `lib/idx-data-engine.js` | 2.055 | `computeStockSignal()`, `assessDataQuality()`, `generateTradingHypothesis()`, Risk Engine (`assessRiskGate()` ada di `public/js/38-ai-autonomous-trading.js`, bukan di sini) |
| `lib/providers/yahoo-client.js` | 589 | Fetch harga/fundamental real-time Yahoo Finance |
| `lib/providers/idx-client.js` | 292 | Fetch broker summary/tick-size IDX |
| `lib/universe.js` | 139 | `loadBaseUniverse()` — data referensi ~900+ saham IDX |
| `server.js` | 3.299 | Semua endpoint `/api/idx/*`, `/api/user-data/*` |

**Yang menjaga daftar ini sudah ada dan aktif** (dibangun sepanjang sesi
kerja sebelumnya, bukan usulan baru): `FINANCIAL_POLICY.md` (drift detector
otomatis via `test_financial_policy.js`), `eslint.config.js` (`no-undef`
scoped ke `lib/**` + `server.js`), `test_suite.js` + `test_provider_functions.js`
(65 test regresi total per commit terakhir). **Redesign UI tidak perlu —
dan tidak boleh — menyentuh 7 file di atas.** Kalau P0/P1 nanti butuh data
baru dari sini, itu artinya menambah fungsi baru, bukan mengubah yang lama.

---

## 4. Pemetaan API/Data Source per Kelompok Fitur

Pola arsitektur (sudah established, dikonfirmasi ulang):

- **Data pasar/saham real-time** → `GET /api/idx/*` (quote, history,
  broker-summary, ai-scan, stocks, regime, hypothesis, dll) → `server.js` →
  `lib/idx-data-engine.js` + `lib/providers/{yahoo,idx}-client.js`. Tidak
  ada mock/fabricated data — kalau fetch gagal, response mengembalikan
  status eksplisit (`isSimulated`/`gateStatus`), bukan angka karangan (lihat
  `AGENTS.md` untuk kebijakan "no fake data").
- **Data portofolio/transaksi pribadi user** → disimpan di `localStorage`
  browser + disinkron ke Supabase lewat `/api/user-data/*` (ini yang sedang
  diamati telemetrinya oleh MW-P0-001 Stage 1). Dihitung ulang secara lokal
  di browser oleh `03-engine.js`, bukan dihitung di server.
- **AI Trading paper account** → isolated, `localStorage`-only, tidak pernah
  masuk payload Supabase (lihat komentar di `38-ai-autonomous-trading.js`
  soal isolasi ini).

Implikasi untuk redesign: **Command Center baru bisa murni menjadi
"agregator tampilan"** dari endpoint-endpoint yang sudah ada — tidak perlu
endpoint API baru untuk P0, kecuali AI Insight layer (Tahap 6 roadmap) yang
memang secara eksplisit direncanakan belakangan (P1), bukan P0.

---

## 5. Halaman Paling Kritis (traffic/kompleksitas tertinggi)

Berdasarkan ukuran file JS (proxy kasar untuk kompleksitas) dan posisi di
sidebar (proxy untuk kepentingan produk):

1. `dashboard` (Portfolio Snapshot) — landing page default, disentuh oleh
   hampir semua alur render (`renderPage(currentPage)` dipanggil dari 8+
   fungsi submit modal yang kita perbaiki sesi ini).
2. `ai-trading` — file terbesar kedua di `public/js/` (`38-ai-autonomous-trading.js`,
   >2.700 baris), 12 kapabilitas dalam 1 halaman.
3. `stock-intel`, `fundamental`, `technical`, `hargawajar`, `bandarmology` —
   5 halaman analisis-saham terpisah yang jadi kandidat utama Stock Cockpit
   (roadmap §8).
4. `portofolio`, `transaksi` — jalur data-tervalidasi-berat (8 titik
   double-submit guard yang baru kita pasang ada di sini).

---

## 6. Pemetaan ke 6 Domain Usulan Roadmap (draf awal, belum final)

| Domain Usulan | Halaman existing yang masuk (draf) |
|---|---|
| COMMAND CENTER | `dashboard`, `daily-brief`, `radar`, `alerts`, `market-regime` |
| MARKETS | `ranking`, `watchlist`, `screener`, `scanner`, `heatmap`, `sectoral-insight` (vs `sektoral` — putuskan setelah dikonfirmasi) |
| RESEARCH | `stock-intel`, `fundamental`, `technical`, `hargawajar`, `bandarmology`, `tradewave`, `candle`, `flowscan` |
| AI TRADING | `ai-trading`, `stockchat`, `journal`, `scenario`, `backtester`, `copilot` (`[BELUM DIKONFIRMASI]`), `market-regime`* |
| PORTFOLIO | `portofolio`, `transaksi`, `dividen`, `rebalance`, `performance`, `crypto`, `etf`, `reksadana` |
| WEALTH | `wealth`, `rdn`, `wbank`, `wdebt`, `divinvest`, `wfire`, `wpiutang`, `rdn-audit`, `pajak` |
| *(luar 6 domain — util/admin)* | `settings`, `admin`, `datahealth`, `dataconn`, `knowledge`, `correlation` (Quant Lab — masuk Research atau AI Trading, perlu keputusan produk) |

\* `market-regime` muncul dua kali secara sengaja di draf ini — dia relevan
baik sebagai konteks Command Center (ringkas) maupun detail AI Trading
(lengkap). Bukan duplikasi bug, tapi keputusan desain yang perlu disetujui.

**Ini draf, bukan keputusan final** — sesuai roadmap §7 sendiri: *"pengelompokan
ini adalah usulan UX; tidak berarti fitur existing dihapus. Routing dan
komponen harus dipetakan kembali sebelum refactor."*

---

## 7. Rekomendasi Langkah Berikutnya

1. **Konfirmasi manual** 5 kandidat orphan (`copilot`, `dataconn`,
   `stockmaster`, `sektoral`, `knowledge`) dan 6 halaman `[BELUM
   DIKONFIRMASI]` lain di atas — klik langsung di browser (dev/staging),
   bukan ditebak dari kode. Saya bisa jalankan aplikasi ini secara lokal
   (server + Playwright/Chromium) untuk membantu menelusuri ini secara
   visual kalau diinginkan.
2. **Putuskan status `sektoral` vs `sectoral-insight`** sebelum IA baru
   dibangun di atas salah satunya.
3. Setelah dua hal di atas beres, dokumen §6 (pemetaan domain) di atas siap
   dijadikan dasar keputusan **P0 mana yang dieksekusi lebih dulu** —
   sesuai mitigasi risiko roadmap sendiri (§20: *"Refactor terlalu besar →
   Lakukan P0 → review → P1 → review"*).
4. Potongan P0 paling kecil & paling aman untuk dicoba lebih dulu (usulan,
   belum dieksekusi): restrukturisasi **markup sidebar saja** (grouping
   visual ke 6 domain) **tanpa** memindahkan konten/JS satu pun — ini
   murni perubahan `index.html` + CSS, risiko sangat rendah, dan langsung
   memberi gambaran nyata "rasanya seperti apa" sebelum Command Center
   sungguhan dibangun.
