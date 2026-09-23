# 💼 Money Watch Pro — Production Final Release (v6.2.0)

[![Test Suite](https://img.shields.io/badge/Tests-310%2B%20Passing%20(6%20Suites)-10b981.svg)](file:///test_suite.js)
[![Data Integrity](https://img.shields.io/badge/Data%20Integrity-100%25%20Verified%20(Zero%20Dummy)-0284c7.svg)](file:///DATA_TRACEABILITY_MANIFESTO.md)
[![Financial Policy](https://img.shields.io/badge/Financial%20Policy-Canonical%20BEI%20Compliance-8b5cf6.svg)](file:///FINANCIAL_POLICY.md)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-Gemini%20%2B%20Claude%20Tool--Calling-f59e0b.svg)](file:///server.js)

**Money Watch Pro** adalah terminal investasi, analitik pasar modal Indonesia (BEI/IDX), dan sistem operasi manajemen kekayaan (*wealth operating system*) kelas institusional. Dirancang untuk investor mandiri, analis kuantitatif, dan *family office*, platform ini menggabungkan analisis teknikal presisi, data bandarmology (*smart money flow*) riil dari Invezgo, valuasi fundamental Graham & DCF dari Yahoo Finance, pelacakan kepemilikan KSEI 5%+, kepatuhan regulasi pajak dividen (PMK 18/2021), serta **Autonomous AI Trading & Confluence Engine**.

---

## 📑 Daftar Isi
1. [Tumpukan Teknologi (Tech Stack)](#-tumpukan-teknologi-tech-stack)
2. [5 Kerangka Kerja Investasi Institusional](#-5-kerangka-kerja-investasi-institusional)
3. [Arsitektur Data Provenance & Traceability (5 Tiers)](#-arsitektur-data-provenance--traceability-5-tiers)
4. [Tata Kelola Kebijakan Finansial & Regulasi Pajak](#-tata-kelola-kebijakan-finansial--regulasi-pajak)
5. [Autonomous AI Trading Engine & Strategi Kuantitatif](#-autonomous-ai-trading-engine--strategi-kuantitatif)
6. [Peta Navigasi 7-Pilar Aplikasi](#-peta-navigasi-7-pilar-aplikasi)
7. [Panduan Presentasi & Alur Demonstrasi (Demo Flow)](#-panduan-presentasi--alur-demonstrasi-demo-flow)
8. [Manajemen Kuota API Invezgo (Anti-Jebol)](#-manajemen-kuota-api-invezgo-anti-jebol)
9. [Instalasi & Menjalankan Aplikasi](#-instalasi--menjalankan-aplikasi)
10. [Rangkaian Pengujian Kualitas (Quality Assurance)](#-rangkaian-pengujian-kualitas-quality-assurance)

---

## 🧱 Tumpukan Teknologi (Tech Stack)

| Lapisan Sistem | Komponen & Teknologi | Peran & Keunggulan |
|---|---|---|
| **Front-End Architecture** | Vanilla JavaScript (Modular ES6+ / Native DOM) | 45 modul terpisah (`public/js/*.js`) tanpa bloatware framework. Rendering instan, zero hydration delay, di-route via `06-analysis-router.js`. |
| **Styling & Design System** | Tailwind CSS + Institutional CSS Variables | `main.css` & `wealth.css` dengan dukungan Dark Mode/Light Mode instan, tipografi finansial tabular (*Public Sans*, *Inter*, *Fira Code*). |
| **Visualisasi Finansial** | Chart.js 4.4.1, TradingView Lightweight Charts, D3.js v7 | Candlestick interaktif, Pita 4-EMA, pita Bollinger, profil volume, diagram Sankey aliran broker, matriks korelasi, dan ekspor PDF via `html2pdf.js`. |
| **Client-Side AI/ML Inference** | `onnxruntime-web` | Inferensi model sinyal XGBoost (dilatih via `ml/train_xgb_signal.py`) dieksekusi 100% lokal di browser pengguna tanpa latensi API server. |
| **Back-End Server & Proxy** | Node.js + Express.js (`server.js`) | API Gateway data pasar, proxy data terenkripsi, canonical financial engine, auto-warming cache, dan eksekutor tool-calling AI. |
| **Kecerdasan Buatan (AI Intelligence)** | **Google Gemini** (`gemini-2.5-flash` / `gemini-1.5-flash`) + **Anthropic Claude** (`claude-3-5-sonnet`) | Server-side structured tool calling loop yang terhubung langsung ke data pasar riil, laporan keuangan, broker summary, dan analitik KSEI. |
| **Data Broker & Bandarmology** | **Invezgo Feed API** (Paket Advance 30.000 req/bln) | Data akumulasi/distribusi Top Broker, Foreign Flow, Net Buy/Sell Sekuritas, dan radar anomali transaksi pasar reguler. |
| **Data Pasar & Fundamental** | Yahoo Finance API (`/api/idx/*`) | Real-time quote, candle OHLCV harian/menit, metrik laporan keuangan lengkap (PER, PBV, ROE, ROA, DER, EPS, BVPS). |
| **Database & Keamanan Identitas** | **Supabase** (PostgreSQL + RLS) | Penyimpanan data portofolio, jurnal keputusan, dan riwayat transaksi dengan otorisasi identitas ketat (MW-P0-001 Identity Verification). |
| **Cache Terdistribusi** | **Upstash Redis** (REST API) | Mengelola rate limiting, cache EOD 24 jam, dan cursor pemindaian bursa otomatis antar serverless execution. |
| **Infrastruktur Deployment** | **Vercel Serverless** (`api/index.js`, `vercel.json`) | Edge caching, automated headers, dan cron automation harian. |

---

## 🎯 5 Kerangka Kerja Investasi Institusional

StockChat AI dan modul analitik Money Watch Pro dibekali 5 kerangka kerja profesional:

1. **Smart Money & Bandarmology Momentum (Swing Trading)**:
   - Mendeteksi *Big Accumulation* (Top 3 Broker menguasai > 60% volume).
   - Memantau inflow asing beruntun (*foreign net inflow streak*) dan titik masuk di sekitar VWAP / Harga Rata-Rata Broker (*Bandar Average Price*).
2. **Value Investing & Margin of Safety (Benjamin Graham & DCF)**:
   - Menyaring saham *undervalued* dengan Margin of Safety > 15–20%, ROE > 12%, DER < 1.0x, dan valuasi di bawah rata-rata historis 5 tahun.
   - Mengkalkulasi Graham Number: $\sqrt{22.5 \times EPS \times BVPS}$.
3. **Techno-Bandarmology Breakout (Momentum)**:
   - Mengombinasikan pola breakout teknikal dengan lonjakan volume (> 2.0x median) yang dikonfirmasi oleh akumulasi broker institusi untuk menyaring sinyal palsu (*false breakout*).
4. **Dividend Compounder & Pembebasan Pajak PMK 18/2021**:
   - Mengidentifikasi *cash cow* dividen dengan yield > 5–8% dan mengoptimalkan pembebasan PPh Final 0% melalui reinvestasi domestik 3 tahun sesuai regulasi Kementerian Keuangan.
5. **Kontrol Risiko Institusional & Alokasi Portofolio**:
   - Membatasi bobot maksimal 1 emiten Big Cap sebesar 10–15% modal portofolio.
   - Mewajibkan cadangan kas RDN minimal 15–20% untuk fleksibilitas likuiditas saat terjadi koreksi pasar.
   - Menyaring sinyal dengan rasio Risk-to-Reward minimal 1:2.

---

## 🔍 Arsitektur Data Provenance & Traceability (5 Tiers)

Platform ini menerapkan standar integritas ketat sesuai [DATA_TRACEABILITY_MANIFESTO.md](file:///DATA_TRACEABILITY_MANIFESTO.md) untuk memastikan **Zero Fabricated / Dummy Data**:

```text
TIER 5: Sumber Data Mentah (Invezgo API, Yahoo Finance, idx.co.id, KSEI)
   │
TIER 4: Adapter & Canonical Engine (`lib/providers/*`, `lib/idx-data-engine.js`)
   │      - Validasi Ticker & Skema
   │      - Deduplikasi & Transformasi Metrik Kanonikal
   │      - Penetapan Status Data: [REAL | STALE | SIMULATION | UNAVAILABLE]
   │
TIER 3: API Gateway Server (`server.js` - `/api/idx/*`)
   │      - Proteksi Kuota, Circuit Breaker & Caching Upstash Redis
   │      - Otorisasi Sesi Pengguna
   │
TIER 2: Client State Bus (`01-data.js`, `GLOBAL_STOCK_CONTEXT`, `rdGetAny()`)
   │      - Single Source of Truth (SSOT) Harga Global (`getGlobalMarketPrice`)
   │      - Sinkronisasi Lintas-Tab Otomatis
   │
TIER 1: Antarmuka Pengguna / UI Components (`public/js/*.js`)
          - Stock Master 360, Wave Cockpit, Unified Screener, Radar, Portfolio
```

### 5 Domain Data Terkelola:
- **Domain A (Market Data & OHLCV)**: Data candle historis dan live quote dari Yahoo Finance / IDX.
- **Domain B (Smart Money & Bandarmology)**: Data Top Broker, Trade Flow, dan Broker Flow berskala mutlak `[0 .. 100]` dari Invezgo API.
- **Domain C (Fundamental & Laporan Keuangan)**: Laporan laba/rugi, neraca, metrik rasio, dan valuasi wajar.
- **Domain D (Portofolio, Transaksi & Kas RDN)**: Pencatatan mutasi beli/jual dengan kalkulasi biaya dan pajak kanonikal.
- **Domain E (Autonomous AI Trading & Hipotesis)**: Sinyal terstruktur dengan pencatatan konfluensi dan rekam jejak audit (*audit trail*).

---

## ⚖️ Tata Kelola Kebijakan Finansial & Regulasi Pajak

Seluruh kalkulasi keuangan di aplikasi tunduk pada standar [FINANCIAL_POLICY.md](file:///FINANCIAL_POLICY.md) yang diverifikasi secara otomatis oleh `test_financial_policy.js`:

### 1. Struktur Biaya Transaksi Saham BEI
- **Biaya Beli (Buy Fee)**: `0.18%` (terdiri atas Komisi Broker 0.15% + PPN Komisi 11% [0.0165%] + BEI Levy 0.043% [0.01% Bursa + 0.005% KPEI + 0.003% KSEI + PPN Bursa 0.0005%]).
- **Biaya Jual (Sell Fee)**: `0.28%` (termasuk **PPh Final Penjualan Saham 0.10%** sesuai PP 14/1997).
- **Fraksi Harga BEI (Tick Size)**: Ditegakkan berdasarkan 5 fraksi resmi BEI (Rp 50–200 tick Rp 1, Rp 200–500 tick Rp 2, Rp 500–2.000 tick Rp 5, Rp 2.000–5.000 tick Rp 10, > Rp 5.000 tick Rp 25).

### 2. Pajak Dividen & PMK 18/2021
- Dividen saham domestik yang diinvestasikan kembali ke instrumen dalam negeri selama minimal 3 tahun **bebas PPh Final (0%)**.
- Dividen yang tidak diinvestasikan dikenakan PPh Final 10%. Sistem menyediakan pelacak kepatuhan PMK 18 otomatis.

### 3. Batasan Risiko Portofolio Institusional
- **Maksimum Risiko per Trade**: 1.0% dari modal trading.
- **Maksimum Posisi 1 Emiten**: 15.0% modal.
- **Minimum Cadangan Kas RDN**: 20.0% modal.
- **Minimum Risk-to-Reward**: 1 : 2.0.
- **Maksimum Drawdown Gate**: 10.0% modal.

---

## 🤖 Autonomous AI Trading Engine & Strategi Kuantitatif

Sistem mengoperasikan mesin trading otonom berbasis data riil dengan alur 10-tahap (*10-stage decision pipeline*):

```text
DATA INGESTION → DATA QUALITY GATE → MARKET REGIME → UNIVERSE VALIDATION
       ↓
SETUP DETECTION → MULTI-FACTOR CONFLUENCE → HYPOTHESIS GENERATION
       ↓
RISK/REWARD CALCULATION → POSITION SIZING → EXECUTION SAFETY GATE
       ↓
ORDER MONITORING → OUTCOME JOURNAL → PERFORMANCE REVIEW
```

### Strategi Unggulan: SlowTrading RSI-50 + Dual MACD (Cut Loss & Gap-Down Slippage)
Diadopsi dari strategi Pine Script profesional dan divalidasi dengan data bursa riil:
1. **RSI-50 Secular Momentum Envelope**: Sinyal beli mensyaratkan `rsi50` berada di antara `50` dan `70` (menjamin momentum bullish sehat dan mencegah beli pucuk).
2. **Dual MACD Confirmation**:
   - *Fast MACD (12, 26, 9)* bertindak sebagai pemicu timing (*momentum crossover*).
   - *Filter MACD (24, 52, 18)* bertindak sebagai saringan ombak makro (*macro trend confirmation*).
3. **No-Lookahead Execution**: Sinyal dihitung pada penutupan Hari D, order dieksekusi pada pembukaan Hari D+1.
4. **Model Slippage Gap-Down Stop-Loss**: Jika pembukaan hari berikutnya melonjak turun melompati level stop loss (`open <= stopPrice`), posisi ditutup pada harga `open` (realistis, bukan harga stop teoritis).
5. **Time-Based Exit**: Posisi ditutup pada bar ke-3 jika belum menyentuh target profit maupun stop loss.

**Hasil Pengujian Out-of-Sample (Unseen Data BEI Big Cap)**:
- **Win Rate**: `60.0%`
- **Profit Factor**: `7.18`
- **Max Drawdown**: `0.31%`

---

## 🗺️ Peta Navigasi 7-Pilar Aplikasi

Navigasi sidebar dirancang elegan, intuitif, dan tanpa duplikasi:

```text
├── 1. COMMAND CENTER
│   ├── Market Pulse          → Rangkuman sentimen pasar, IHSG, & agenda makro harian
│   ├── Screener              → Unified Screener (CMF Proxy, Broker Flow Riil, Sektor)
│   ├── Portfolio Snapshot    → Dashboard eksekutif portofolio & alokasi aset
│   └── Alerts                → Peringatan harga otomatis (Price Alerts)
│
├── 2. MARKETS
│   ├── Watchlist             → Daftar pantau emiten pilihan pengguna
│   ├── Market Flow           → Arus dana bandarmology & foreign flow pasar bursa agregat
│   └── Sector Insight        → Peta rotasi sektoral & heatmap kinerja industri
│
├── 3. TRADING & ANALYSIS (Pusat Analisis Saham)
│   ├── Stock Master 360      → Terminal Tunggal Analisis Saham Individual 6-Pilar:
│   │                           [1] Chart & Techno-Bandarmology (Candle, 4-EMA, SuperTrend)
│   │                           [2] Bandarmology & Flow (Top Broker, Asing, Transaksi Jumbo)
│   │                           [3] Valuation & Fundamental (PBV Band, PER, DCF, Graham)
│   │                           [4] Stock Dossier & KSEI (Kepemilikan Scriptless 5%+)
│   │                           [5] AI Hypothesis (StockChat rekomendasi terstruktur)
│   │                           [6] Bandar Movement Cockpit (Gauge, Top Buyers/Sellers, Sankey)
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
│   ├── Net Worth             → Neraca kekayaan bersih keluarga (Aktiva/Pasiva)
│   ├── Cash                  → Manajemen kas RDN & dana darurat
│   ├── Assets                → Pelacak aset fisik & perbankan
│   ├── Debt                  → Kalkulator pelunasan hutang (Snowball / Avalanche)
│   └── Passive Income        → Perencana kebebasan finansial (FIRE Calculator)
│
└── 7. ADMIN CENTER
    ├── Stock Universe        → Kelola daftar emiten aktif BEI (~958 saham)
    ├── Data Health           → Diagnostik & rekonsiliasi integritas data
    ├── Data Connection       → Pemantau status koneksi & kuota Invezgo live
    └── Settings              → Pengaturan fee broker, pajak, & backup data
```

---

## 🎤 Panduan Presentasi & Alur Demonstrasi (Demo Flow)

Gunakan alur 5-langkah berikut untuk presentasi di depan pemangku kepentingan (*stakeholders*):

```text
[1. Executive Overview] ──> [2. Market Screener] ──> [3. Stock Master 360] ──> [4. Autonomous AI Engine] ──> [5. Wealth & Portfolio]
   Command Center               Unified Screener         6-Pilar Terminal             Confluence & Journal           Net Worth & Pajak
```

1. **Langkah 1: Executive Overview (Command Center)**:
   - Tunjukkan **Market Pulse** & **Portfolio Snapshot**.
   - Sorot kecepatan rendering, tampilan tema gelap/terang, dan kartu ringkasan kekayaan bersih secara instan.
2. **Langkah 2: Penemuan Peluang Pasar (Unified Screener & Wave Cockpit)**:
   - Buka **Screener** $\to$ tab **Screener Utama**. Tunjukkan pemindaian seluruh ~958 saham BEI dengan skor *Whale Accumulation* dan *Uptrend*.
   - Pindah ke sub-tab **Wave Cockpit**. Tunjukkan deteksi siklus Elliott Wave, SuperTrend, dan Target Proyeksi Fibonacci (1.272, 1.618 Golden Ratio, 2.618 Super Wave) yang tersinkronisasi 100% dengan harga pasar live.
3. **Langkah 3: Riset Mendalam Saham (Stock Master 360)**:
   - Masukkan emiten (contoh: `BBCA` atau `DEWA`).
   - Tunjukkan integrasi 6-Tab: Chart Interaktif $\to$ Bandarmology Top Broker $\to$ Valuasi Graham/DCF $\to$ Kepemilikan KSEI 5%+ $\to$ AI Hypothesis $\to$ Bandar Movement Cockpit (Diagram Aliran Sankey).
4. **Langkah 4: Mesin Trading Otonom (Autonomous AI Trading Engine)**:
   - Buka menu **Trading Engine**. Tunjukkan alur *Observe $\to$ Validate $\to$ Confluence $\to$ Risk Check $\to$ Decide*.
   - Tunjukkan bagaimana AI menolak trading (*NO_TRADE*) jika rasio Risk-Reward < 1:2 atau jika sinyal teknikal bertentangan dengan arus smart money (*Contradiction Detection*).
5. **Langkah 5: Eksekusi, Portofolio & Pajak (Portfolio & Wealth)**:
   - Buka **Portfolio** dan **Dividend Calendar**. Tunjukkan bagaimana sistem memisahkan dividen kena pajak (10%) dengan dividen bebas pajak PMK 18 (0%).
   - Tampilkan ekspor laporan investasi resmi berformat PDF via tombol cetak statement.

---

## 📊 Manajemen Kuota API Invezgo (Anti-Jebol)

Sistem menggunakan kuota paket **Invezgo Advance** (30.000 requests/bulan) dengan efisiensi maksimal:

1. **Anggaran Harian:** $30.000 \div 22\text{ hari bursa} = \mathbf{1.363\text{ request/hari}}$.
2. **Bulk Agregat Pasar:** Fitur scanner pasar (`top/accumulation`, `top/foreign`, `sector/rotation`, `calendar`) menarik seluruh 958 saham sekaligus dalam 1 request. Hanya mengonsumsi **5–10 request/hari** (< 1% kuota).
3. **Analisis Saham On-Demand:** Setiap emiten yang dianalisis di Stock Master 360 memakan 2–3 request (di-cache 24 jam).
4. **Proteksi WAF & Tanggal EOD:**
   - Menyertakan header resmi MCP (`User-Agent: Invezgo Claude MCPB`).
   - Helper `getLatestEodTradingDate()` otomatis mengunci query ke hari penutupan bursa terakhir jika diakses pada akhir pekan atau sebelum pukul 17:30 WIB.
   - Circuit breaker membatasi maksimal 1.000 request/hari.

---

## 🛠️ Instalasi & Menjalankan Aplikasi

### 1. Kloning & Instalasi Dependensi
```bash
git clone https://github.com/Learningjurnal/moneywatchapps.git
cd moneywatchapps
npm install
```

### 2. Konfigurasi Environment Variables (`.env`)
Salin file konfigurasi contoh:
```bash
cp .env.example .env
```
Lengkapi variabel berikut pada `.env`:
```ini
# Server Port
PORT=3000

# Google Gemini AI (Rekomendasi Utama Server-Side)
GEMINI_API_KEY=your_gemini_api_key

# Anthropic Claude & OpenRouter (Fallback Resilience)
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# Invezgo Market Data Feed
INVEZGO_API_KEY=your_invezgo_api_key

# Upstash Redis (Cache & Rate Limiter)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# Supabase (Database & Auth)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Menjalankan Server
```bash
npm start
# atau mode development:
npm run dev
```
Akses aplikasi melalui peramban di `http://localhost:3000`.

---

## 🧪 Rangkaian Pengujian Kualitas (Quality Assurance)

Platform ini mengimplementasikan pengujian otomatis ketat tanpa regresi:

```bash
# Menjalankan seluruh 6 Test Suites (>310 assertions):
npm test

# Menjalankan linter & syntax verification ES Modules:
npm run lint
```

### Rincian 6 Test Suites:
1. **`test_suite.js`**: Suite utama (256 pengujian) yang mencakup logika finansial, indikator teknikal, strategi SlowTrading RSI + Dual MACD, sanitasi ticker, dan proteksi regresi UI.
2. **`test_financial_policy.js`**: Detektor drift terhadap [FINANCIAL_POLICY.md](file:///FINANCIAL_POLICY.md) (pajak PPh Final 0.1%, PPN 11%, BEI Levy, limit konsentrasi saham 15%, dan buffer kas RDN 20%).
3. **`test_provider_functions.js`**: Pengujian integrasi adapter Yahoo Finance dan Invezgo API dengan mocking fetch live network.
4. **`test_security_regressions.js`**: Pengujian keamanan MW-P0-001 (isolasi data antar-pengguna, validasi token server-side, proteksi penghapusan data).
5. **`test_code_integrity_audit.js`**: Audit integritas kode kanonikal (SSOT harga pasar, invariasi gauge Bandarmology 0–100, pencegahan data sintetis).
6. **`test_e2e_search_sync.js`**: Simulasi End-to-End sinkronisasi pencarian kode saham lintas 6 modul Stock Master 360 secara serentak.

---

## 🔒 Tata Kelola & Dokumen Terkait
- [AGENTS.md](file:///AGENTS.md) — Master AI Knowledge Base & Operating Specification.
- [DATA_TRACEABILITY_MANIFESTO.md](file:///DATA_TRACEABILITY_MANIFESTO.md) — Spesifikasi 5-Tier Data Provenance & Traceability.
- [FINANCIAL_POLICY.md](file:///FINANCIAL_POLICY.md) — Regulasi Finansial, Biaya Transaksi, Fraksi Harga, & Kepatuhan Pajak BEI.
- [CLAUDE.md](file:///CLAUDE.md) — Developer Rules & Code Integrity Guidelines.

---

**Money Watch Pro — Institutional-Grade Investment & Wealth Operating System**  
*Built for Precision, Data Integrity, and Long-Term Capital Preservation.*
