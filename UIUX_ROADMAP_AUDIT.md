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

### 1.3 — Hasil Konfirmasi Manual (server lokal + Chromium/Playwright, 2026-09-10)

Server aplikasi dijalankan lokal (`node server.js`) dan diperiksa langsung
lewat browser headless: DOM diperiksa untuk elemen `onclick` yang benar-benar
memanggil tiap target, ditelusuri sampai ke file & baris sumbernya. Tidak ada
data pribadi/dummy yang ditulis ke database mana pun — server lokal ini
sepenuhnya terisolasi, tidak pernah connect ke Supabase produksi.

| Halaman | Status | Bukti |
|---|---|---|
| `knowledge` | ✅ **Real** — tombol footer sidebar, selalu terlihat | `index.html:424` |
| `rdn-audit` | ✅ **Real** — tombol "Log Audit Transaksi" di halaman Cash (`rdn`) | `index.html:1123` |
| `pajak` | ✅ **Real** — tombol di panel Settings Hub | `02-storage.js:2448` |
| `flowscan` | ✅ **Real** — link ticker di banyak tempat (`fsQuickLoad()`) + item checklist "Quant Toolkit" di halaman Wealth | `07-flowscan.js:230`, `20-wealth.js:242` |
| `candle` | ✅ **Real** — item checklist "Quant Toolkit" di halaman Wealth (bukan navigasi utama — technical analysis dilink dari Net Worth, agak tidak terduga tapi sengaja) | `20-wealth.js:242` |
| `heatmap` | ✅ **Real** — tombol di dalam Knowledge Base guide (`39-knowledge-master-guide.js`), bukan navigasi utama | `39-knowledge-master-guide.js:519` |
| `sektoral` | ❌ **Kandidat mati terkonfirmasi** — halaman punya konten asli (~2KB, "Memuat visualisasi aliran modal sektoral...") dan fungsi `renderSektoral()` real, TAPI nol referensi `goPage('sektoral'...)` ditemukan di seluruh `public/js/*.js` maupun `index.html`. `sectoral-insight` (di sidebar, sudah kita perbaiki tampilannya awal sesi ini) tampak seperti pengganti modernnya. |
| `stockmaster` | ❌ **Kandidat mati terkonfirmasi, kemungkinan legacy route** — `id="page-stockmaster"` bahkan punya `style="display:none"` inline di HTML-nya sendiri. Router-nya (`case 'stockmaster'`) memanggil `fundInit()` — **fungsi yang sama persis** dipanggil `case 'fundamental'` (yang ADA di sidebar). Sangat mungkin `stockmaster` adalah nama route lama sebelum di-rename jadi `fundamental`, tidak pernah dibersihkan. |
| `copilot` | ❌ **Fitur lengkap tanpa jalan masuk** — `28-decisiontools.js` (`renderCopilotPage()`) membangun UI chat AI penuh (bubble pesan, input bar, tombol kirim `sendCopilotPrompt()`) — bukan stub kosong. Tapi nol tombol/link di manapun yang memanggil `goPage('copilot')`. Ini fitur jadi yang **tidak terlihat sama sekali oleh user saat ini** — perlu keputusan produk: sengaja disembunyikan (belum rilis) atau kelewatan waktu reorganisasi nav. |
| `dataconn` | ❌ **Fitur lengkap tanpa jalan masuk** — sama seperti `copilot`: `renderDataConnPage()` (`26-commandcenter.js`) membangun konten nyata, nol titik akses. |

**Temuan sampingan (di luar cakupan audit UI/UX, tapi ditemukan sebagai efek
langsung dari verifikasi ini — bug navigasi nyata)**: item checklist ke-6
"Manajemen Risiko" di widget "Quant Toolkit" halaman Wealth memanggil
`goPage('risiko')` (`20-wealth.js:242`) — **`page-risiko` tidak ada** di
54 halaman manapun (halaman Risk yang benar adalah `rebalance`). `goPage()`
diam-diam `return` kalau target tidak ditemukan (`06-analysis-router.js:762`,
`if(!pg) return;`) — jadi klik tombol ini **tidak melakukan apa-apa sama
sekali**, tanpa error, tanpa indikasi ke user. Fix-nya trivial (ganti string
`'risiko'` → `'rebalance'`, 1 baris, nol risiko ke logika lain) — dilaporkan
di sini, belum diperbaiki karena di luar scope Tahap 1 (murni audit).

---

## 2. Temuan Duplikasi/Overlap (roadmap §5.2, §17)

1. **`sektoral` vs `sectoral-insight`** — dua route TERPISAH dengan nama
   nyaris identik. `sectoral-insight` ada di sidebar (Intelligence → Sector
   Insight, file `44-sectoral-insight.js`, ini yang kita perbaiki tampilan
   labelnya awal sesi ini). `sektoral` memanggil fungsi `renderSektoral()`
   yang berbeda. **[Terkonfirmasi lewat browser, lihat §1.3]**: `sektoral`
   tidak punya titik akses navigasi manapun — kandidat legacy/dead code kuat,
   `sectoral-insight` tampak seperti pengganti modernnya. Keputusan
   menghapus tetap perlu persetujuan eksplisit sebelum dieksekusi (bukan
   otomatis dari audit ini).
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

**Update 2026-09-10**: konfirmasi manual (§1.3) sudah selesai dijalankan via
server lokal + Chromium/Playwright. 8 dari 11 halaman yang tadinya "belum
dikonfirmasi" ternyata **real** (punya jalan masuk navigasi yang sah, hanya
tidak lewat sidebar utama). 4 halaman (`sektoral`, `stockmaster`, `copilot`,
`dataconn`) **terkonfirmasi tidak punya jalan masuk navigasi apa pun** dan
butuh keputusan produk eksplisit.

1. **Putuskan nasib 4 halaman tanpa jalan masuk** (bukan dihapus otomatis
   dari audit ini — ini keputusan Anda):
   - `sektoral` — kemungkinan besar aman dihapus (`sectoral-insight` adalah
     penggantinya).
   - `stockmaster` — kemungkinan besar aman dihapus (route legacy, mesinnya
     [`fundInit()`] sudah dipakai `fundamental`).
   - `copilot`, `dataconn` — **ini beda kasus**: fitur sudah jadi penuh (UI
     chat AI lengkap untuk `copilot`), cuma tidak ada tombol yang
     mengaktifkannya. Perlu diputuskan: aktifkan (tambah 1 tombol nav) atau
     memang sengaja belum dirilis.
2. **Perbaiki dead-link `goPage('risiko')`** (§1.3, ditemukan sebagai efek
   samping audit) — 1 baris, `'risiko'` → `'rebalance'`, nol risiko. Bisa
   dikerjakan kapan saja, tidak terkait roadmap UI/UX ini.
3. Setelah keputusan §1 di atas, dokumen §6 (pemetaan domain) siap dijadikan
   dasar keputusan **P0 mana yang dieksekusi lebih dulu** — sesuai mitigasi
   risiko roadmap sendiri (§20: *"Refactor terlalu besar → Lakukan P0 →
   review → P1 → review"*).
4. Potongan P0 paling kecil & paling aman untuk dicoba lebih dulu (usulan,
   belum dieksekusi): restrukturisasi **markup sidebar saja** (grouping
   visual ke 6 domain) **tanpa** memindahkan konten/JS satu pun — ini
   murni perubahan `index.html` + CSS, risiko sangat rendah, dan langsung
   memberi gambaran nyata "rasanya seperti apa" sebelum Command Center
   sungguhan dibangun. Bisa diverifikasi visual dengan cara yang sama
   seperti §1.3 (server lokal + Playwright) sebelum di-push.

**Update 2026-09-10 — P0 slice 1 EXECUTED**: sidebar dirombak dari 7 grup
lama (Home/Intelligence/AI Trading/Bandarmology/Portfolio/Wealth/More) ke
struktur 6-domain roadmap: **Command Center** (Market Pulse, Opportunity
Radar, Portfolio Snapshot, Alerts) · **Markets** (Market Radar, Watchlist,
Sector Insight) · **Research** (Stock Intel, Fundamental, Technical,
Valuation, Bandarmology, Research — Bandarmology dilebur ke sini dari grup
standalone-nya) · **AI Trading** (tidak berubah) · **Portfolio** (tidak
berubah) · **Wealth** (tidak berubah), plus grup **More** (util/admin, di
luar 6 domain, sesuai §6) tetap ada. Sengaja dibatasi HANYA meregroup 32
tombol yang sudah ada di sidebar sebelum perubahan ini — nol halaman
dipindah, nol target `goPage()` diubah, nol dari 25 halaman non-sidebar
(§1.2) ditambahkan (itu keputusan terpisah untuk slice lain). Diverifikasi
lewat server lokal + Playwright: 6 header grup benar & berurutan, isi tiap
grup cocok 100% dengan mapping di atas, jumlah tombol sidebar tidak
berubah (39), klik nyata ke item yang paling banyak berpindah (Sector
Insight, Bandarmology) tetap berfungsi, nol error JS baru.

**Update 2026-09-10 — P0 slice 2 EXECUTED**: dua zona Command Center
ditambahkan ke halaman Dashboard — sebelumnya nol zona market-wide/AI ada
di sana sama sekali, hanya "Portfolio Snapshot" (yang sudah sangat
lengkap: ringkasan aset, gauge volatilitas & risiko, grafik vs IHSG,
donut alokasi — tidak disentuh).
- **Market Regime** (roadmap §6, menjawab pertanyaan #1 "bagaimana
  kondisi market") — kartu baru di atas Ringkasan Aset, fetch langsung ke
  `/api/idx/regime` (endpoint nyata yang sudah dipakai tab Market Regime
  di AI Trading), independen dari state AI Trading supaya kunjungan ke
  Dashboard tidak memicu re-render halaman lain yang tidak terkait.
- **AI Opportunity Radar preview** (roadmap §6, menjawab pertanyaan #3
  "apa peluang terbaik") — kartu baru menampilkan top 5 saham BUY ZONE,
  memakai ULANG `loadOpportunityRadarUniverse()`/`RADAR_STATE` yang sama
  persis dengan halaman Radar penuh (bukan fetch/skoring terpisah) —
  sesuai prinsip "agregator tampilan" di §4 dokumen ini. Kunjungan ke
  Dashboard bahkan menghangatkan cache untuk saat user buka halaman Radar
  penuh berikutnya.

Diverifikasi lewat server lokal + Playwright: kedua kartu ada di DOM,
tombol "Lihat Detail"/"Lihat Semua" masing-masing benar menuju halaman
`market-regime`/`radar`, konten Dashboard lama (Ringkasan Aset dkk) tidak
rusak, nol error JS baru — termasuk diuji dalam kondisi Yahoo Finance
tidak terjangkau dari sandbox ini (network egress terblokir): kedua kartu
mendegradasi jujur (regime "BELUM DIKETAHUI" + alasan nyata dari
`assessDataQuality()`, radar "Belum ada saham di BUY ZONE" + link ke
halaman lengkap) — bukan crash, bukan data karangan. Di produksi
(Vercel, Yahoo Finance terjangkau) kedua kartu akan menampilkan
klasifikasi regime & top picks nyata.

**Update 2026-09-10 — Investigasi Heatmap/Smart Money Flow, P0 slice 3
EXECUTED (Alerts & Actions)**: sebelum melanjutkan ke 2 zona berikutnya
(Market Heatmap, Smart Money Flow), ditemukan keduanya bergantung pada
data yang **bisa jadi karangan tanpa disclosure** — dicatat sebagai
`KNOWN_ISSUES.md` #2 (`fsGenData()`/`FS_RD`, dipakai Market Heatmap &
alert "Akumulasi kuat" di halaman `alerts`) dan #3
(`generateClientSideBrokerSummary()`, dipakai mode "Analisis Full
Market" Bandarmology/Smart Money Flow — volume transaksinya dihitung
dari hash nama ticker, bukan data broker riil). **Keduanya sengaja
TIDAK dijadikan dasar kartu Command Center** — membuat preview di
homepage akan memperbesar paparan ke sinyal yang berpotensi karangan,
bukan menguranginya. Kedua zona ini ditunda sampai masalah datanya
diperbaiki di sumbernya.

Sebagai gantinya, **Alerts & Actions** (menjawab pertanyaan #5 "apa
tindakan yang relevan") dibangun memakai sistem yang bersih:
`window.mwGetPriceAlerts()` (`30-price-alerts.js`) — target harga yang
di-set user sendiri, dicek ke harga live nyata setiap 10 detik oleh
modul itu sendiri, sinkron (tidak perlu fetch tambahan dari dashboard).
Kartu baru `#card-dash-alerts` menampilkan alert yang TERPICU (perlu
ditinjau) di atas, plus ringkasan jumlah alert aktif dipantau. Diverifikasi
end-to-end lewat server lokal + Playwright — termasuk skenario alert
sungguhan terpicu (bukan cuma mock statis): dibuat 1 alert BBCA yang
target-nya sudah terlampaui via fungsi asli `mwAddPriceAlert()`, kartu
benar menampilkan badge "TERPICU" dan detail yang sesuai, klik kartu
membawa ke halaman `alerts`, data test dibersihkan lagi di akhir. Nol
error JS baru.

Dengan ini, **3 dari 5 zona Command Center** yang aman untuk dibangun
sekarang sudah selesai (Market Regime, AI Opportunity Radar, Alerts &
Actions). Sisa 2 (Market Heatmap, Smart Money Flow) menunggu perbaikan
data di `KNOWN_ISSUES.md` #2/#3. **AI Insight** (zona ke-6, sintesis
"apa yang penting sekarang") belum dikerjakan — bukan soal data
karangan, tapi memang logika baru yang belum ada bentuknya sama sekali.

**Update 2026-09-10 — P0 slice 4 EXECUTED (AI Insight)**: zona terakhir
yang bisa dibangun tanpa menunggu perbaikan data karangan di
`KNOWN_ISSUES.md` #2/#3. Berbeda dari 3 zona sebelumnya, **AI Insight
bukan reuse data mentah dari satu sumber** — ini sintesis berbasis
ATURAN (bukan panggilan LLM/AI langsung) dari 3 zona yang sudah
dibangun: Market Regime, Portfolio Snapshot (gauge risiko yang sudah
ada), dan AI Opportunity Radar, ditambah Alerts & Actions. Sengaja
BUKAN panggilan AI per-request — fungsi ini jalan tiap kali Dashboard
dirender, jadi panggilan LLM sungguhan di sini akan lambat & mahal
untuk sesuatu yang sesering itu dipanggil. Setiap baris diberi label
sumber datanya secara eksplisit (mis. "(Market Regime)",
"(Portfolio Snapshot + Alerts)") — sesuai panduan roadmap §10 sendiri:
*"Bedakan fakta, model output, dan opini/hipotesis AI"* — supaya tidak
ada satu pun klaim yang terlihat seperti keputusan AI langsung padahal
sebenarnya agregasi aturan dari data yang sudah ditampilkan di tempat
lain.

Kartu baru `#card-dash-insight` menampilkan 3 baris: **Kondisi Market**
(dari regime), **Risiko Utama** (dari profil risiko portofolio + jumlah
alert terpicu), **Tindakan Direkomendasikan** (dari top pick radar,
atau saran umum berbasis regime kalau belum ada BUY ZONE). Diverifikasi
end-to-end lewat server lokal + Playwright: kartu ter-update otomatis
begitu Market Regime & AI Radar selesai fetch (bukan cuma sekali saat
load awal dengan data kosong), dan begitu 1 alert BBCA sungguhan
dibuat lewat `mwAddPriceAlert()` sampai terpicu, baris "Risiko Utama"
langsung mencerminkannya ("1 price alert sedang terpicu, perlu
ditinjau") tanpa refresh manual. Nol error JS baru.

**Command Center sekarang punya 4 dari 6 zona roadmap** (Market Regime,
Portfolio Snapshot [sudah ada sejak awal], AI Opportunity Radar,
Alerts & Actions, plus AI Insight sebagai lapisan sintesis di atas
semuanya). 2 zona sisa (Market Heatmap, Smart Money Flow) menunggu
perbaikan data di `KNOWN_ISSUES.md` #2/#3 sebelum bisa dibangun dengan
aman.
