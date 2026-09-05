# 💼 Money Watch Pro — Production Final Release

Terminal investasi & manajemen kekayaan komprehensif untuk investor pasar modal Indonesia (IDX) dan multi-aset (Saham, Reksa Dana, Obligasi/SBN, Crypto, ETF, Kas RDN). Dilengkapi toolkit analisa kuantitatif, analisis kepemilikan KSEI 5%+, valuasi margin of safety, tracking dividen otomatis dengan regulasi pajak terkini (PMK 18/2021), serta ekspor laporan investasi PDF.

---

## 🚀 Fitur Utama

- **📊 Multi-Asset Portfolio Tracker**: Saham IDX (900+ emiten dengan harga live Yahoo Finance), Crypto (harga live Yahoo Finance, ticker BTC-USD/ETH-USD dst — *bukan Binance/Indodax*), Reksa Dana, ETF AS, Kas RDN, dan Logam Mulia.
- **🏛️ Regulasi Pajak & Komisi Realtime**:
  - PPN Jasa Pialang efektif 11%.
  - PPh Final Transaksi Jual 0.1% (PP 14/1997).
  - PPh Dividen 0% Bebas Pajak Reinvestasi NKRI (PMK 18/2021) dengan opsi override manual.
  - Struktur Fee Sekuritas (Stockbit All-in 0.18% Beli / 0.28% Jual, IPOT, Mirae, Mandiri, Custom).
- **👥 KSEI 5%+ Shareholder Intelligence**: Analisis kepemilikan pemegang saham di atas 5%, deteksi pergerakan konglomerat/asing, dan market scanner kepemilikan.
- **📡 Broker Summary / Bandarmology**: Sumber data real memakai [Invezgo API](https://docs.invezgo.com/api) (butuh `INVEZGO_API_KEY` + langganan aktif di `.env`). Tanpa API key, otomatis fallback ke simulasi berlabel jelas (badge "⚠ Simulasi" di UI) — tidak pernah ditampilkan sebagai data real tanpa label.
- **🔬 Quantitative & Decision Engine**: FlowScan (CMF, RSI, MA, VWAP), Valuasi Harga Wajar (Graham, DCF, Multiples), Backtester LQ45, Pairs Trading, dan Correlation Matrix.
- **🌐 Wealth OS & Net Worth Management**: Neraca kekayaan keluarga, rasio likuiditas/dana darurat, kalkulator FIRE (Financial Independence Retire Early), strategi pelunasan hutang (Snowball/Avalanche).
- **📥 Bulk Excel Import & Export**: Download template dan unggah transaksi beli/jual serta mutasi dividen secara masal via spreadsheet XLSX.
- **📄 PDF Statement Generator**: Ekspor laporan kinerja portofolio resmi berkualitas cetak.
- **🔒 Zero-Leak Architecture & Cloud Sync**: Data historis bawaan bersih 100% (fresh start). Sinkronisasi multi-perangkat melalui Firebase Firestore & fallback storage lokal terisolasi.

---

## 📁 Struktur Modul Sistem

Aplikasi dibangun secara modular, terstruktur dalam 43 modul fungsional:

| Modul | Deskripsi |
|---|---|
| `index.html` | Entrypoint utama aplikasi web |
| `server.js` | Server proxy Express.js & integrasi Google Gemini AI |
| `css/main.css` | Styling terminal tema dark & light (dengan transisi halus) |
| `css/wealth.css` | Styling visual modul Wealth & Net Worth |
| `js/00-config.js` | Konfigurasi global & Firebase credentials |
| `js/01-data.js` | Master data sektor IDX, daftar sekuritas, tarif bursa |
| `js/02-storage.js` | Engine sinkronisasi cloud Firestore, IndexedDB, & local storage |
| `js/03-engine.js` | Core financial calculation engine & realtime price feeder |
| `js/04-render.js` | UI renderer untuk Dashboard, RDN, Transaksi, dan Portofolio |
| `js/05-assets.js` | Manajemen aset Crypto, Reksa Dana, ETF, & modal input |
| `js/06-analysis-router.js` | Router pilar navigasi aplikasi & analisis candle |
| `js/07-flowscan.js` | Engine FlowScan (CMF, RSI, VWAP, deteksi Big Money) |
| `js/08-auth.js` | Autentikasi pengguna & session management |
| `js/09-divinvest.js` | Dashboard strategi Dividend Growth & Compounder |
| `js/10-hargawajar.js` | Valuasi fundamental & Margin of Safety (MoS) |
| `js/11-quant.js` | QuantTrader, Backtesting, LQ45 Screener, & Correlation |
| `js/12-clean.js` | Fresh start initialization & zoom scaling controller |
| `js/13-realdata.js` | Cache & agregator data historis pasar saham |
| `js/14-admin.js` | Panel kustomisasi universe saham & master data |
| `js/15-txbulk.js` | Parser & validator bulk import Excel (XLSX) |
| `js/20-wealth.js` | Modul kekayaan pribadi (Net Worth, Bank, Hutang, FIRE) |
| `js/21-performance.js` | Analisis kinerja portofolio (TWR, MWR, Sharpe Ratio) |
| `js/22-datahealth.js` | Diagnostik & integritas rekonsiliasi data keuangan |
| `js/23-advisor.js` | AI Financial Copilot (berbasis Google Gemini API) |
| `js/24-stockmaster.js` | Lembar fakta emiten (fundamental & teknikal lengkap) |
| `js/25-auditlog.js` | Log audit transaksi & riwayat modifikasi akun |
| `js/26-commandcenter.js` | Command palette interaktif (Ctrl+K / Cmd+K) |
| `js/27-stockintel.js` | Intelligence feed & anotasi riset emiten |
| `js/28-decisiontools.js` | Risk sizing calculator & pre-trade checklists |
| `js/29-institutional-ui.js` | Tampilan orderbook & matriks institusi |
| `js/30-price-alerts.js` | Sistem notifikasi & peringatan target harga |
| `js/31-d3-networth.js` | Visualisasi interaktif alokasi aset berbasis D3.js |
| `js/32-pdf-reports.js` | Generator laporan portofolio berformat PDF |
| `js/33-trending-news.js` | Kurasi sentimen & berita pasar keuangan |
| `js/34-ksei-shareholders.js` | Pemindai data kepemilikan institusi/asing KSEI 5%+ |
| `js/35-settings.js` | Pengaturan preferensi, tarif pajak, & backup |
| `js/36-crypto-technical.js` | Analisis teknikal & indikator pasar crypto |
| `js/37-tradewave-engine.js` | TradeWave PRO & Wave Flow Intelligence Engine |
| `js/38-ai-autonomous-trading.js` | Paper trading AI otonom terisolasi (virtual Rp 100M, tidak menyentuh portofolio asli) |
| `js/39-knowledge-master-guide.js` | Panduan pengetahuan & confluence analysis terpusat |
| `js/40-idx-pipeline.js` | Pipeline data IDX & integrasi stock universe (harga real Yahoo Finance, backend `/api/idx/*`) |
| `js/41-stockchat-cockpit.js` | Cockpit StockChat AI & Bandarmology Broker Flow |
| `js/42-dividend-calendar.js` | Kalender dividen visual & proyeksi passive income |
| `js/43-ai-chart-intelligence.js` | Layer analisis chart AI (confluence, support/resistance, decision journal) |

---

## 🛠️ Cara Menjalankan Aplikasi

### Opsi 1: Menjalankan dengan Node.js (Rekomendasi)

```bash
# 1. Clone repository
git clone https://github.com/your-username/moneywatchpro.git
cd moneywatchpro

# 2. Install dependencies
npm install

# 3. Jalankan server aplikasi
npm run dev
```

Buka browser di `http://localhost:3000`.

### Opsi 2: Static Server / GitHub Pages

Aplikasi dapat dijalankan langsung menggunakan static web server (misalnya Nginx, Apache, atau `npx serve .`) dengan membuka `index.html`.

---

## 🔒 Privasi Data & Keamanan

- **Zero-History Clean Slate**: Repositori ini tidak menyimpan riwayat data pribadi, token rahasia, atau transaksi dummy bawaan.
- **Isolasi Akun**: Setiap pengguna memiliki penyimpanan terisolasi yang dienkripsi dan diproteksi oleh Firebase Auth & Firestore Security Rules.
- **Export & Backup Mandiri**: Pengguna dapat melakukan ekspor JSON penuh kapan pun melalui menu Pengaturan.

---

**Money Watch Pro — Final Production Release**
