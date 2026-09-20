# 💼 Money Watch Pro — Production Final Release (v6.2.0)

Terminal investasi & manajemen kekayaan komprehensif untuk investor pasar modal Indonesia (IDX) dan multi-aset (Saham, Reksa Dana, Obligasi/SBN, Crypto, ETF, Kas RDN). Dilengkapi toolkit analisa kuantitatif, analisis kepemilikan KSEI 5%+, valuasi margin of safety, tracking dividen otomatis dengan regulasi pajak terkini (PMK 18/2021), AI Copilot & StockChat berbasis Claude dengan tool-calling, Stock Master Terminal 360 terpadu, serta ekspor laporan investasi PDF.

---

## 🧱 Tumpukan Teknologi (Tech Stack)

| Lapisan | Teknologi |
|---|---|
| **Front-end** | Vanilla JavaScript (arsitektur modular tanpa framework bloated) — 48 modul `public/js/*.js` dimuat via `<script>`, di-route client-side (`goPage()`/`renderPage()`, `06-analysis-router.js`) |
| **Styling** | Tailwind CSS (CDN play-mode) + CSS kustom institusional (`main.css`, `wealth.css`), tema gelap/terang berbasis CSS variables |
| **Chart & Visual** | TradingView Lightweight Charts, Chart.js 4.4.1, D3.js v7, SheetJS (`xlsx.js`), `html2pdf.js` untuk laporan PDF |
| **AI/ML Client-Side** | `onnxruntime-web` — menjalankan model XGBoost (dilatih via `ml/train_xgb_signal.py`) langsung di browser untuk sinyal AI Trading otonom |
| **Back-end Server** | Node.js + Express.js (`server.js`) — proxy data pasar, engine kalkulasi finansial kanonikal, endpoint data IDX (`/api/idx/*`), agent AI, dan sinkronisasi user-data |
| **Kecerdasan Buatan (AI Engine)** | **Anthropic Claude** (`@anthropic-ai/sdk`, model `claude-3-5-sonnet-20241022`) dengan tool-calling terstruktur ke data riil bursa + cadangan failover otomatis via **OpenRouter** |
| **Database & Autentikasi** | **Supabase** (PostgreSQL + Auth) — data per-user diisolasi penuh dengan Row Level Security (RLS) & verifikasi identitas server-side, fallback lokal via `localStorage` untuk Mode Demo |
| **Data Broker & Bandarmology** | **Invezgo API** (Paket Advance 30.000 req/bln) — data riil broker summary, foreign flow, top accumulation, & market calendar. Dilengkapi smart cache EOD & fallback simulasi berlabel jelas |
| **Cache Terdistribusi** | **Upstash Redis** (REST API) — menjaga kuota bulanan, rotating cursor cron, dan cache respons Invezgo konsisten lintas serverless invocation di Vercel |
| **Harga Real-Time** | Yahoo Finance (via proxy server `/api/proxy` & fallback rata-rata harga broker Invezgo) — saham IDX, crypto (`*-USD`), IHSG |
| **Deployment** | **Vercel** (Serverless — `api/index.js`, `vercel.json`), file statis di-serve dari `public/` dengan automated headers |
| **Quality Assurance** | 4 suite pengujian native (`test_suite.js`, `test_financial_policy.js`, `test_provider_functions.js`, `test_security_regressions.js`) — **250/250 passing tests** |
| **Linting & Safety** | `eslint` + `node --check` per file kritikal (`npm run lint`) |

---

## 🗺️ Struktur Navigasi & Modul Terpadu

Navigasi sidebar telah disederhanakan dan **bebas duplikasi**:

```text
├── 1. COMMAND CENTER
│   ├── Market Pulse          → Rangkuman sentimen & agenda makro harian
│   ├── Screener              → Unified Screener (CMF Proxy, Broker Flow Riil, Sektor)
│   ├── Portfolio Snapshot    → Dashboard eksekutif portofolio & alokasi aset
│   └── Alerts                → Peringatan harga otomatis (Price Alerts)
│
├── 2. MARKETS
│   ├── Watchlist             → Daftar pantau emiten pilihan
│   ├── Market Flow           → Arus dana bandarmology & foreign flow pasar bursa agregat
│   └── Sector Insight        → Peta rotasi sektoral & heatmap kinerja industri
│
├── 3. TRADING & ANALYSIS (Pusat Analisis Saham)
│   ├── Stock Master 360      → Terminal Tunggal Analisis Saham Individual 6-Pilar:
│   │                           [1] Chart & Techno-Bandarmology
│   │                           [2] Bandarmology & Flow (Top Broker, Asing)
│   │                           [3] Valuation & Fundamental (PBV Band, PER, DCF, Graham)
│   │                           [4] Stock Dossier & KSEI (Kepemilikan Scriptless 5%+)
│   │                           [5] AI Hypothesis (StockChat rekomendasi emiten)
│   ├── Crypto Technical      → Analisis teknikal & order flow mata uang kripto
│   └── Quant Analysis        → Analisis matriks korelasi, pairs trading, & backtester
│
├── 4. SYSTEMATIC TRADING
│   ├── Trading Engine        → Engine trading kuantitatif otonom (Paper Trading Rp 100 Juta)
│   ├── Copilot               → Asisten AI pemeriksa profil risiko & alokasi portofolio
│   └── Signal History        → Riwayat & track record sinyal trading AI
│
├── 5. PORTFOLIO
│   ├── Portfolio             → Tabel posisi saham, cost basis, & P/L riil
│   ├── Transactions          → Riwayat mutasi beli/jual & import massal Excel
│   ├── Dividend              → Rekap dividen & kalender proyeksi passive income
│   ├── Risk                  → Analisis risiko Value-at-Risk (VaR 95%) & rebalancing
│   ├── Performance           → Pengukuran return TWR, MWR, & Sharpe Ratio
│   └── Investment Thesis     → Pencatat alasan beli, target keluar, & kriteria invalidasi
│
├── 6. WEALTH
│   ├── Net Worth             → Neraca kekayaan bersih keluarga
│   ├── Cash                  → Manajemen kas RDN & dana darurat
│   ├── Assets                → Pelacak aset fisik & perbankan
│   ├── Debt                  → Kalkulator pelunasan hutang (Snowball / Avalanche)
│   └── Passive Income        → Perencana kebebasan finansial (FIRE Calculator)
│
└── 7. ADMIN CENTER
    ├── Stock Universe        → Kelola daftar emiten aktif BEI
    ├── Data Health           → Diagnostik & rekonsiliasi integritas data
    ├── Data Connection       → Pemantau status koneksi & kuota Invezgo live
    └── Settings              → Pengaturan fee broker, pajak, & backup data
```

---

## 📊 Manajemen Kuota API Invezgo (Anti-Jebol)

Sistem menggunakan alokasi kuota paket **Invezgo Advance** (30.000 requests/bulan) dengan pengamanan berlapis:

1. **Anggaran Harian:** $30.000 \div 22\text{ hari bursa} = \mathbf{1.363\text{ request/hari}}$.
2. **Bulk Agregat Pasar:** Fitur scanner pasar (`top/accumulation`, `top/foreign`, `sector/rotation`, `calendar`) menarik seluruh 958 saham sekaligus dalam 1 request. Hanya mengonsumsi **5–10 request/hari** (< 1% kuota bulanan).
3. **Analisis Saham On-Demand:** Setiap emiten yang dianalisis di Stock Master 360 memakan 2–3 request (di-cache 24 jam). Analisis 50 saham berbeda setiap hari hanya mengonsumsi **3.300 request/bulan (11% kuota)**.
4. **Proteksi WAF & Tanggal EOD:**
   - Menyertakan header resmi MCP (`User-Agent: Invezgo Claude MCPB`).
   - Helper `getLatestEodTradingDate()` otomatis mengunci query ke hari penutupan bursa terakhir jika diakses pada akhir pekan atau sebelum pukul 17:30 WIB.
   - Circuit breaker membatasi maksimal 1.000 request/hari untuk mencegah lonjakan tak terduga.

---

## ⏳ Status Fungsi & Pending Background Tasks

Seluruh modul utama aplikasi telah aktif dan beroperasi. Terdapat mekanisme latar belakang (*background jobs*) yang berjalan secara periodik:

### 1. Warming Cache Screener 958 Saham (Pending Via Cron)
* **Jadwal Cron Vercel (`vercel.json`):**
  - `/api/cron/warm-radar-fundamentals` (Pukul 22:00 UTC / 05:00 WIB)
  - `/api/cron/warm-technical-indicators` (Pukul 22:30 UTC / 05:30 WIB)
* **Status Kerja (Rotating Cursor):**
  Mengingat batas eksekusi komputasi Vercel Hobby (30 detik per pemanggilan) dan batas 1x eksekusi cron per hari, sistem menggunakan mekanisme **Rotating Cursor** (~250 saham per siklus).
  - Seluruh 958 saham di BEI terisi penuh ke dalam Upstash Redis secara progresif dalam **~3–4 hari bursa pertama** setelah deployment, dan setelahnya otomatis diperbarui secara kontinu.
  - **Dampak Bagi Pengguna:** Saham yang statusnya masih *pending warming* pada tampilan tabel screener tetap **dapat dianalisis langsung secara real-time** melalui menu **Stock Master 360** (sistem otomatis melakukan on-demand live fetch).

### 2. Forward Win-Rate Validation (Track B)
* Sinyal konfirmasi harian dari Unified Screener dicatat secara otomatis oleh cron malam hari ke database untuk pengujian out-of-sample forward paper-trading tanpa intervensi manual.

---

## 🛠️ Cara Menjalankan Aplikasi

### 1. Kloning & Instalasi
```bash
git clone https://github.com/Learningjurnal/moneywatchapps.git
cd moneywatchapps
npm install
```

### 2. Konfigurasi Lingkungan (.env)
Salin contoh file konfigurasi:
```bash
cp .env.example .env
```
Isi variabel lingkungan yang dibutuhkan:
- `ANTHROPIC_API_KEY`: Kunci API Claude untuk StockChat & Copilot.
- `OPENROUTER_API_KEY`: Cadangan otomatis jika Anthropic mengalami kendala.
- `INVEZGO_API_KEY`: Akses data broker summary & bandarmology riil.
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Penyimpanan cache & kuota terdistribusi.
- `SUPABASE_URL` & `SUPABASE_ANON_KEY`: Database transaksi & autentikasi portofolio.
- `CRON_SECRET`: Kunci otorisasi pengamanan endpoint Vercel Cron.

### 3. Menjalankan Server Lokal
```bash
npm start
```
Akses aplikasi melalui peramban di `http://localhost:3000`.

### 4. Menjalankan Pengujian Kualitas & Kebijakan Finansial
```bash
# Menjalankan seluruh 250 unit tests & verifikasi drift kebijakan finansial:
npm test

# Menjalankan linting dan pengecekan sintaksis ES Modules:
npm run lint
```

---

## 🔒 Tata Kelola Finansial & Keamanan Data (Mandat AGENTS.md)

1. **Zero Synthetic Signals:** Sinyal trading dan metrik valuasi wajib bersumber dari data pasar riil atau dilabeli secara transparan (`SIMULATION` / `DATA_UNAVAILABLE`).
2. **Canonical Financial Engine:** Seluruh kalkulasi fee transaksi (0.18% beli / 0.28% jual), PPh Final (0.1%), PPN (11%), dividen (PMK 18), dan net worth dihitung dari single source of truth `lib/canonical-financial-engine.js` dan `public/js/03-engine.js`.
3. **Isolasi Akun Pengguna:** Tidak ada data portofolio, saldo RDN, atau riwayat transaksi yang bocor lintas pengguna. Validasi token identitas Supabase diverifikasi langsung di tingkat server (`lib/auth-verify.js`).
4. **Data Portability:** Pengguna dapat melakukan ekspor cadangan penuh dalam format JSON dan spreadsheet Excel (XLSX) kapan saja.

---

**Money Watch Pro — Institutional Grade Investment & Wealth Operating System**
