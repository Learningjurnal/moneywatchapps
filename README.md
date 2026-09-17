# 💼 Money Watch Pro — Production Final Release

Terminal investasi & manajemen kekayaan komprehensif untuk investor pasar modal Indonesia (IDX) dan multi-aset (Saham, Reksa Dana, Obligasi/SBN, Crypto, ETF, Kas RDN). Dilengkapi toolkit analisa kuantitatif, analisis kepemilikan KSEI 5%+, valuasi margin of safety, tracking dividen otomatis dengan regulasi pajak terkini (PMK 18/2021), AI Copilot berbasis Claude, serta ekspor laporan investasi PDF.

---

## 🧱 Tumpukan Teknologi (Tech Stack)

| Lapisan | Teknologi |
|---|---|
| **Front-end** | Vanilla JavaScript (tanpa framework SPA) — 41 modul `public/js/*.js` dimuat langsung via `<script>`, di-route client-side (`goPage()`/`renderPage()`, `06-analysis-router.js`) |
| **Styling** | Tailwind CSS (CDN play-mode) + CSS custom (`main.css`, `wealth.css`), tema gelap/terang berbasis CSS variables |
| **Chart & Visual** | Chart.js 4.4.1, D3.js v7, SheetJS (`xlsx.js`) untuk import/export Excel, `html2pdf.js` untuk laporan PDF |
| **AI/ML client-side** | `onnxruntime-web` — menjalankan model XGBoost (dilatih via `ml/train_xgb_signal.py`) langsung di browser untuk sinyal AI Trading |
| **Back-end** | Node.js + Express.js (`server.js`) — proxy CORS Yahoo Finance, endpoint data IDX (`/api/idx/*`), agent AI, dan penyimpanan user-data |
| **Kecerdasan Buatan (AI Agent)** | **Anthropic Claude** (`@anthropic-ai/sdk`, model `claude-sonnet-5`) dengan tool-calling (cek_harga, cek_fundamental, cek_broker_summary, cek_portofolio_user, dll) untuk StockChat AI & AI Copilot |
| **Database & Auth** | **Supabase** (PostgreSQL + Auth) — data per-user ditulis langsung dari client (`02-storage.js`), fallback lokal via `localStorage` untuk Mode Tamu/Demo |
| **Data Broker/Bandarmology** | **Invezgo API** (real broker summary & foreign flow per saham) — fallback otomatis ke simulasi berlabel jujur (`isSimulated: true`, badge "⚠ Simulasi" di UI) kalau tidak dikonfigurasi |
| **Cache & Rate-Limit** | **Upstash Redis** (REST API) — menjaga kuota bulanan & cache respons Invezgo tetap konsisten lintas serverless invocation |
| **Harga Real-Time** | Yahoo Finance (via proxy server `/api/proxy` & `rdEnsure()`/`yfFetch()` client-side) — saham IDX, crypto (ticker `-USD`, *bukan* Binance/Indodax), IHSG |
| **Deployment** | **Vercel** (serverless — `api/index.js`, lihat `vercel.json`), file statis di-serve dari `public/` |
| **Testing** | 4 suite Node.js native (`test_suite.js`, `test_financial_policy.js`, `test_provider_functions.js`, `test_security_regressions.js`) — 154 test, dijalankan via `npm test` |
| **Lint** | `eslint` + `node --check` per file kritikal (`npm run lint`) |

> ⚠️ **Catatan migrasi**: proyek ini sebelumnya memakai Firebase Firestore (penyimpanan) dan Google Gemini (AI agent) — keduanya **sudah dimigrasikan penuh** ke Supabase dan Anthropic Claude. `.env.example` masih menyisakan variabel Firebase/Gemini lama yang **tidak lagi dibaca oleh kode manapun** — jangan diisi, cukup abaikan sampai dibersihkan.

---

## 🚀 Fitur Utama

- **📊 Multi-Asset Portfolio Tracker**: Saham IDX (900+ emiten dengan harga live Yahoo Finance), Crypto (harga live Yahoo Finance, ticker BTC-USD/ETH-USD dst — *bukan Binance/Indodax*), Reksa Dana, ETF AS, Kas RDN, dan Logam Mulia.
- **🏛️ Regulasi Pajak & Komisi Realtime**:
  - PPN Jasa Pialang efektif 11%.
  - PPh Final Transaksi Jual 0.1% (PP 14/1997).
  - PPh Dividen 0% Bebas Pajak Reinvestasi NKRI (PMK 18/2021) dengan opsi override manual.
  - Struktur Fee Sekuritas (Stockbit All-in 0.18% Beli / 0.28% Jual, IPOT, Mirae, Mandiri, Custom).
- **👥 KSEI 5%+ Shareholder Intelligence**: Analisis kepemilikan pemegang saham di atas 5%, deteksi pergerakan konglomerat/asing, dan market scanner kepemilikan (840+ emiten).
- **📡 Broker Summary / Bandarmology**: Sumber data real memakai [Invezgo API](https://docs.invezgo.com/api) (butuh `INVEZGO_API_KEY` + langganan aktif di `.env`). Tanpa API key, otomatis fallback ke simulasi berlabel jelas (badge "⚠ Simulasi" di UI) — tidak pernah ditampilkan sebagai data real tanpa label. Kuota bulanan, cache, dan concurrency ke Invezgo dijaga oleh `lib/invezgo-client.js`, yang butuh `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (Upstash Redis) supaya penghitung kuota konsisten lintas serverless invocation — lihat `.env.example`. Cek status kuota/cache real-time di `GET /api/idx/invezgo-status`.
- **⚡ Volume Spike Scanner**: Deteksi lonjakan volume transaksi per-saham dibanding median 14/30 hari, plus arus dana asing (foreign net buy/sell) terintegrasi dengan verdict Bandarmology — semua tersinkron otomatis lintas halaman lewat `GLOBAL_STOCK_CONTEXT`.
- **🤖 AI Copilot & StockChat**: Asisten investasi percakapan berbasis Claude dengan tool-calling ke data riil aplikasi (harga, fundamental, broker summary, portofolio, saldo RDN, simulasi transaksi, pajak dividen, dll).
- **🧠 AI Autonomous Trading**: Paper trading AI otonom terisolasi (virtual Rp 100 juta, tidak menyentuh portofolio asli), dengan deteksi regime pasar dan model XGBoost (ONNX) untuk sinyal.
- **🔬 Quantitative & Decision Engine**: FlowScan (CMF, RSI, MA, VWAP), Valuasi Harga Wajar (Graham, DCF, Multiples), Backtester LQ45, Pairs Trading, Correlation Matrix, dan Sectoral Rotation Intelligence.
- **🌐 Wealth OS & Net Worth Management**: Neraca kekayaan keluarga, rasio likuiditas/dana darurat, kalkulator FIRE (Financial Independence Retire Early), strategi pelunasan hutang (Snowball/Avalanche), dan tracking piutang.
- **📥 Bulk Excel Import & Export**: Download template dan unggah transaksi beli/jual serta mutasi dividen secara masal via spreadsheet XLSX.
- **📄 PDF Statement Generator**: Ekspor laporan kinerja portofolio resmi berkualitas cetak, terkonsolidasi (portofolio, multi-aset, kas, liabilitas, FIRE).
- **🔒 Cloud Sync & Isolasi Akun**: Data per-user disimpan di Supabase (PostgreSQL + Auth, dilindungi Row Level Security), dengan fallback `localStorage` untuk Mode Tamu/Demo offline.

---

## 📁 Struktur Modul Sistem

Aplikasi dibangun secara modular, terstruktur dalam 41 modul front-end (`public/js/`):

| Modul | Deskripsi |
|---|---|
| `index.html` | Entrypoint utama aplikasi web |
| `server.js` | Server Express.js: proxy Yahoo Finance, agent AI (Claude), endpoint `/api/idx/*` & `/api/user-data/*` |
| `api/index.js` | Wrapper serverless untuk deployment Vercel |
| `css/main.css` | Styling terminal tema dark & light (dengan transisi halus) |
| `css/wealth.css` | Styling visual modul Wealth & Net Worth |
| `js/00-config.js` | Konfigurasi global & `GLOBAL_STOCK_CONTEXT` (sinkronisasi ticker lintas-halaman) |
| `js/01-data.js` | Master data sektor IDX, daftar sekuritas, tarif bursa, histori IHSG |
| `js/02-storage.js` | Engine sinkronisasi data ke Supabase & local storage |
| `js/02b-price-index.js` | Helper murni (pure function) untuk rebuild histori ekuitas harian |
| `js/03-engine.js` | Core financial calculation engine & realtime price feeder |
| `js/04-render.js` | UI renderer untuk Dashboard, RDN, Transaksi, dan Portofolio |
| `js/05-assets.js` | Manajemen aset Crypto, Reksa Dana, ETF, & modal input |
| `js/06-analysis-router.js` | Router navigasi halaman aplikasi & analisis candle |
| `js/07-flowscan.js` | Engine FlowScan legacy (CMF, RSI, VWAP, deteksi Big Money) |
| `js/08-auth.js` | Autentikasi pengguna berbasis Supabase & session management |
| `js/09-divinvest.js` | Dashboard strategi Dividend Growth & Compounder |
| `js/10-hargawajar.js` | Valuasi fundamental & Margin of Safety (MoS) |
| `js/11-quant.js` | QuantTrader: Backtester, Screener, Pairs Trading, Correlation Matrix |
| `js/12-clean.js` | Fresh start initialization & pembersih localStorage lama |
| `js/13-realdata.js` | Cache OHLCV harian riil (Yahoo Finance) — dipakai bersama FlowScan/TradeWave/Screener/Backtester/Volume Spike |
| `js/14-admin.js` | Panel kustomisasi universe saham & master data |
| `js/15-txbulk.js` | Parser & validator bulk import Excel (XLSX) |
| `js/20-wealth.js` | Modul kekayaan pribadi (Net Worth, Bank, Hutang, Piutang, FIRE) |
| `js/21-performance.js` | Analisis kinerja portofolio (TWR, MWR, Sharpe Ratio) |
| `js/22-datahealth.js` | Diagnostik & integritas rekonsiliasi data keuangan |
| `js/23-advisor.js` | Investor Tear Sheet, Traffic Light Consensus, Smart Rebalancing |
| `js/24-stockmaster.js` | Suite Fundamental & Technical PRO (lembar fakta emiten lengkap) |
| `js/25-auditlog.js` | Log audit transaksi & riwayat saldo RDN |
| `js/26-commandcenter.js` | Investment Command Center: KPI eksekutif, Portfolio Health Score, AI Action Center |
| `js/27-stockintel.js` | Universal Stock Intelligence Cockpit (hub analisa per-ticker) |
| `js/28-decisiontools.js` | Morning/Daily Brief, Investment Thesis Tracker, Decision Journal, Scenario Engine |
| `js/29-institutional-ui.js` | Command palette (Ctrl+K), density tabel, sparkline utilities |
| `js/30-price-alerts.js` | Sistem notifikasi & peringatan target harga |
| `js/32-pdf-reports.js` | Generator laporan portofolio konsolidasi berformat PDF |
| `js/34-ksei-shareholders.js` | Pemindai data kepemilikan institusi/asing KSEI 5%+ |
| `js/35-settings.js` | Pengaturan pajak, fee broker, tujuan finansial, & backup |
| `js/36-crypto-technical.js` | Analisis teknikal & whale flow crypto |
| `js/37-tradewave-engine.js` | TradeWave PRO — Elliott Wave & Trend Impulse Detector |
| `js/38-ai-autonomous-trading.js` | Paper trading AI otonom terisolasi (virtual Rp 100M) |
| `js/39-knowledge-master-guide.js` | Panduan pengetahuan & confluence analysis terpusat |
| `js/40-idx-pipeline.js` | Pipeline data IDX & integrasi stock universe |
| `js/41-stockchat-cockpit.js` | StockChat AI (Claude tool-use) & Bandarmology Cockpit |
| `js/42-dividend-calendar.js` | Kalender dividen visual & proyeksi passive income |
| `js/43-ai-chart-intelligence.js` | Layer analisis chart AI (confluence, support/resistance, decision journal) |
| `js/44-sectoral-insight.js` | Rotasi sektoral & intelijen aliran dana (CMF konstituen sektor) |
| `js/45-volume-spike.js` | Volume Spike Scanner (volume vs median 14D/30D + foreign flow) |
| `lib/idx-data-engine.js` | Engine data IDX server-side: broker summary, fundamental, universe |
| `lib/invezgo-client.js` | Client Invezgo API + quota/cache management via Upstash Redis |
| `lib/auth-verify.js` | Verifikasi sesi Supabase server-side |
| `lib/providers/yahoo-client.js` | Client Yahoo Finance server-side |
| `lib/providers/idx-client.js` | Client data resmi IDX (idx.co.id) |
| `ml/train_xgb_signal.py` | Training model XGBoost untuk sinyal AI Trading (di-export ke ONNX, dijalankan client-side via `onnxruntime-web`) |

---

## 🛠️ Cara Menjalankan Aplikasi

```bash
# 1. Clone repository
git clone https://github.com/Learningjurnal/moneywatchapps.git
cd moneywatchapps

# 2. Install dependencies
npm install

# 3. Salin & isi environment variables (lihat .env.example)
cp .env.example .env

# 4. Jalankan server aplikasi
npm start
```

Buka browser di `http://localhost:3000`.

### Menjalankan Test & Lint

```bash
npm test    # 4 suite, 154 test (unit, kebijakan finansial, provider, keamanan)
npm run lint
```

### Deployment

Aplikasi dikonfigurasi untuk **Vercel** (`vercel.json`) — `api/index.js` di-deploy sebagai serverless function, file statis di `public/` di-serve langsung dengan cache header khusus untuk `/api/idx/*` dan `/js/*`.

---

## 🔒 Privasi Data & Keamanan

- **Zero-History Clean Slate**: Repositori ini tidak menyimpan riwayat data pribadi, token rahasia, atau transaksi dummy bawaan.
- **Isolasi Akun**: Setiap pengguna memiliki penyimpanan terisolasi, diproteksi Supabase Auth & Row Level Security.
- **Data Real vs Simulasi Berlabel Jelas**: Fitur yang bergantung pada feed berbayar (broker summary/bandarmology via Invezgo) selalu menampilkan flag `isSimulated`/badge "⚠ Simulasi" saat data real tidak tersedia — tidak pernah menyajikan angka karangan seolah-olah data pasar sungguhan.
- **Export & Backup Mandiri**: Pengguna dapat melakukan ekspor JSON penuh kapan pun melalui menu Pengaturan.

---

**Money Watch Pro — Final Production Release**
