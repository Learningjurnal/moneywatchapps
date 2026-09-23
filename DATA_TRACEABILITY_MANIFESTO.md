# DATA TRACEABILITY & INTEGRITY MANIFESTO
**MoneyWatch Pro — Canonical Data Lineage, Cross-Module Reconciliation, & Audit Contract**

---

## 1. Prinsip Dasar & Filosofi Sistem

1. **Zero Discrepancy Rule:**
   Data yang sama tidak boleh memiliki nilai, status, atau interpretasi yang berbeda di antara modul-modul aplikasi. Ketika pengguna melihat saham tertentu (misal: `BBRI`), harga terakhir, persentase perubahan hari ini, valuasi, skor Bandarmology, dan arus dana asing harus **100% konsisten** di seluruh permukaan aplikasi (Portfolio, Daily Brief, Stock Master 360, Stock Dossier, Screener, AI StockChat, dan Autonomous Trading).
2. **Single Canonical Financial Engine:**
   Seluruh kalkulasi biaya transaksi, pajak (Levy, PPN, PPh Final), cost basis, PnL terealisasi/belum terealisasi, net worth, risk-reward ratio, dan position sizing mengacu secara ketat ke `FINANCIAL_POLICY.md` dan `lib/idx-data-engine.js`. Tidak ada formula finansial yang boleh dibuat ulang secara mandiri di komponen UI.
3. **Data Provenance & Explicit Status:**
   Setiap data point harus mempertahankan informasi asal usul:
   - Sumber: `BEI (idx.co.id)`, `KSEI`, `Yahoo Finance`, `Invezgo API`, atau `Supabase/Local User Store`.
   - Status: `REAL`, `STALE`, `UNAVAILABLE`, `SIMULATION`, atau `INVALID`.
   - Timestamp perolehan (ISO 8601).
4. **Zero False "Data Tidak Tersedia":**
   Pesan "Data Tidak Tersedia" hanya boleh dimunculkan jika bursa/provider memang tidak menyediakan data tersebut (misal: emiten baru IPO yang belum memiliki laporan historis, bursa libur, atau data EOD bursa yang memang baru dirilis sore hari pk 17:30 WIB). Masalah teknis seperti perbedaan suffix ticker (`.JK`), format huruf besar/kecil, atau keterlambatan async **tidak boleh** menimbulkan status tidak tersedia semu.

---

## 2. Arsitektur Ketertelusuran 5-Tier Dua Arah (Bidirectional Traceability)

```text
[FORWARD PATH: DARI TAMPILAN PENGGUNA MENUJU SUMBER DATA]
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 1: PRESENTATION & UI LAYER                                        │
│ (Tabel Portofolio, Kartu Metrik, Gauge Bandarmology, Chart, AI Chat)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Event / Lifecycle Hook
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 2: CLIENT-SIDE CONTROLLERS & DATA BUS                             │
│ (`public/js/*.js`, `GLOBAL_STOCK_CONTEXT`, `window.prices`)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Request (Bearer / Client Sig)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 3: SERVER CONTROLLERS & API ROUTER                                │
│ (`server.js` REST Endpoints: `/api/idx/*`, `/api/user-data/*`)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Engine Invocation & Cache Lookup
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 4: CANONICAL CORE SERVICES & PROVIDER ADAPTERS                   │
│ (`lib/idx-data-engine.js`, `lib/providers/*.js`, `invezgo-client.js`)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Upstream HTTP / DB Query
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 5: PRIMARY SOURCES OF TRUTH                                       │
│ (Bursa Efek Indonesia, KSEI, Yahoo Finance, Invezgo API, User DB)      │
└────────────────────────────────────────────────────────────────────────┘

[BACKWARD PATH: DARI SUMBER DATA ASLI MENUJU TAMPILAN PENGGUNA]
TIER 5 ──(Raw JSON/CSV)──> TIER 4 ──(Normalized Contract)──> TIER 3 ──(Envelope API)──> TIER 2 ──(Reactive Store)──> TIER 1
```

---

## 3. Matriks Domain Data & Pemetaan Lengkap (Data Dictionary & Lineage)

### Domain A: Harga & Pasar Saham (Quotes & Market Price)
- **Sumber Asli (Tier 5):** Yahoo Finance v8 chart & v10 quote API (`https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}.JK`).
- **Adapter & Sanitasi (Tier 4):** `lib/providers/yahoo-client.js` $\rightarrow$ `fetchYahooQuote(ticker)`.
  - Normalisasi simbol: Menghilangkan suffix `.JK` untuk input, menambahkan `.JK` untuk request Yahoo.
  - Ekstraksi perubahan riil: Mengutamakan `regularMarketChangePercent` dan `fulldayChange` resmi. Pantang memakai `chartPreviousClose` sebagai penutupan kemarin.
  - Aturan fraksi harga: Memvalidasi harga terhadap `getBeiTickSize(price)`.
- **API Server (Tier 3):**
  - Tunggal: `GET /api/idx/quote/:ticker`
  - Batch: `POST /api/idx/quotes` (Kapasitas hingga 100 emiten per batch)
- **Client Bus (Tier 2):**
  - `public/js/03-engine.js` $\rightarrow$ `fhFetchStocks()` & `window.prices[ticker]`, `window.changes[ticker]`.
  - `public/js/24-stockmaster.js` $\rightarrow$ `GLOBAL_STOCK_CONTEXT`.
- **Komponen UI (Tier 1):**
  - Portofolio & Dashboard (`04-render.js`, `05-assets.js`)
  - Evaluasi Komprehensif Seluruh Saham Portofolio (`28-decisiontools.js`)
  - Stock Master 360 Header (`24-stockmaster.js`)
  - Stock Dossier Quote Badge (`46-stock-dossier.js`)
  - Screener & Radar (`45-volume-spike.js`, `48-unified-screener.js`)

---

### Domain B: Smart Money, Arus Broker & Bandarmology
- **Sumber Asli (Tier 5):** Invezgo Feed API (`https://api.invezgo.com/v1/idx/...`).
- **Adapter & Mesin Kalkulasi (Tier 4):**
  - `lib/invezgo-client.js`: `fetchInvezgoBrokerSummary()`, `fetchInvezgoTradeFlow()`, `fetchInvezgoBrokerFlow()`.
  - `lib/idx-data-engine.js`: `computeBandarmologyVerdict()`, `generateBandarMovementData()`.
  - **Skala Kanonikal Mutlak [0 .. 100]:**
    - `0 – 15`: `BIG DISTRIBUTION` (Merah, net delta: `-35 s.d. -50`)
    - `16 – 40`: `NORMAL DISTRIBUTION` (Merah muda, net delta: `-10 s.d. -34`)
    - `41 – 59`: `NEUTRAL` (Abu-abu netral, penanda bar tepat 50%, label `NEUTRAL (Net 0)`)
    - `60 – 84`: `NORMAL ACCUMULATION` (Hijau muda, net delta: `+10 s.d. +34`)
    - `85 – 100`: `BIG ACCUMULATION` (Hijau tebal, net delta: `+35 s.d. +50`)
- **API Server (Tier 3):**
  - `GET /api/idx/bandar-movement/:ticker?timeframe=...&refresh=...`
  - `GET /api/idx/broker-summary/:ticker`
  - `GET /api/idx/trade-flow/:ticker`
  - `GET /api/idx/broker-flow/:ticker`
- **Client Bus (Tier 2):**
  - `public/js/49-bandar-movement.js` (`BM_STATE`, `bmLoadData()`).
  - Terdaftar sebagai subscriber ke `GLOBAL_STOCK_CONTEXT`.
- **Komponen UI (Tier 1):**
  - Tab 6 Bandar Movement Cockpit (Gauge, Top 3 Buyers/Sellers, Sankey Diagram, Haka/Haki Flow).
  - Screener Bandarmology filter (`48-unified-screener.js`).
  - Stock Dossier Smart Money Section (`46-stock-dossier.js`).
  - StockChat AI Bandarmology Context (`41-stockchat-cockpit.js`).

---

### Domain C: Fundamental, Laporan Keuangan & Valuasi
- **Sumber Asli (Tier 5):** Yahoo Finance Fundamentals (`quoteSummary?modules=financialData,defaultKeyStatistics,summaryDetail`).
- **Adapter & Mesin Valuasi (Tier 4):**
  - `lib/providers/yahoo-client.js` $\rightarrow$ `fetchYahooFundamentals(ticker)`:
    - Metrik: `eps`, `bvps`, `per`, `pbv`, `roe`, `roa`, `der`, `npm`, `dividendYield`.
  - `lib/idx-data-engine.js`:
    - Graham Number: $\sqrt{22.5 \times EPS \times BVPS}$
    - DCF Fair Value: Terminal growth 2-4%, discount rate WACC 10-12%.
    - PE / PBV Historical Mean & Standard Deviation Bands ($\pm 1\sigma, \pm 2\sigma$).
- **API Server (Tier 3):**
  - `GET /api/idx/quote/:ticker` (menyertakan objek `fundamentals`)
  - `GET /api/idx/financial-statement/:ticker`
- **Client Bus (Tier 2):**
  - `public/js/10-hargawajar.js`, `public/js/24-stockmaster.js` (Tab 2 Fundamental).
- **Komponen UI (Tier 1):**
  - Stock Master Tab 2: Graham Value Card, DCF Calculator, Valuation Bands.
  - Modul Harga Wajar (`10-hargawajar.js`).
  - Stock Dossier Fundamental Section (`46-stock-dossier.js`).

---

### Domain D: Kepemilikan Saham & Notasi Khusus KSEI/BEI
- **Sumber Asli (Tier 5):**
  - Data KSEI Kepemilikan >5% (`data/ksei-shareholders.json`).
  - IDX Website Feed Notasi Khusus & FCA Watchlist (`https://www.idx.co.id/primary/ListedCompany/GetSpecialNotation`).
- **Adapter & Mesin (Tier 4):**
  - `lib/providers/idx-client.js`: `fetchIdxSpecialNotations()`.
  - `lib/idx-data-engine.js`: Pemetaan kepemilikan pengendali (PSP), institusi asing, dan domestik.
- **API Server (Tier 3):**
  - `GET /api/idx/special-notations`
  - `GET /api/idx/special-notations/:ticker`
  - `GET /api/idx/shareholder-composition/:ticker`
- **Client Bus & UI (Tier 2 & 1):**
  - Stock Master Tab 5 (`34-ksei-shareholders.js`, `24-stockmaster.js`).
  - Special Notation Warning Badges di seluruh kartu saham.

---

### Domain E: Portofolio Pengguna & Perhitungan Finansial
- **Sumber Asli (Tier 5):** Basis Data Transaksi Pengguna (`data/user-stores/{uid}.json` atau Supabase `portfolio_transactions`).
- **Adapter & Kebijakan Finansial (Tier 4):**
  - `FINANCIAL_POLICY.md` & `lib/idx-data-engine.js`:
    - Biaya Beli = Nilai Bruto + (Komisi Broker + PPN Komisi 11% + Levy BEI 0.043%). PPh Final = 0%.
    - Biaya Jual = Nilai Bruto - (Komisi Broker + PPN Komisi 11% + Levy BEI 0.043% + PPh Final 0.1%).
    - PnL Belum Terealisasi = (Harga Terkini - Rata-rata Beli) $\times$ Jumlah Lembar - Estimasi Biaya Jual.
    - Cash Buffer RDN: Minimum 15-20% trading capital.
    - Maksimum Alokasi Saham Tunggal (Big Cap): 10-15%.
    - Minimum Risk-to-Reward: $\ge 1:2$.
- **API Server (Tier 3):**
  - `GET /api/user-data/load` & `POST /api/user-data/save` (Terlindungi validasi `MW-P0-001` per-UID).
- **Client Bus & UI (Tier 2 & 1):**
  - `public/js/02-storage.js`, `public/js/03-engine.js` (`recalculatePortfolio()`, `D_PORTFOLIO`).
  - Dashboard, Asset Table, Performance Analytics (`21-performance.js`).

---

## 4. Standar Operasional Penanganan & Sanitasi Ticker

Untuk menjamin tidak ada kegagalan query semu, semua modul wajib menggunakan fungsi sanitasi seragam:

```javascript
function cleanTicker(rawTicker) {
  if (!rawTicker) return '';
  return String(rawTicker)
    .trim()
    .toUpperCase()
    .replace(/\.JK$/i, '')
    .replace(/\.US$/i, '')
    .replace(/[^A-Z0-9^]/g, '');
}
```

- Ketika mengirim request ke Yahoo Finance untuk saham IDX: `cleanTicker(t) + '.JK'`.
- Ketika mengirim request ke Invezgo atau internal API: `cleanTicker(t)`.
- Ketika menampilkan di UI: `cleanTicker(t)`.

---

## 5. Protokol Verifikasi Integritas Otomatis

Setiap perubahan kode harus diverifikasi melalui 3 lapisan pengujian:
1. **Static Analysis & Linting:** `npm run lint` (ESLint pada `lib/` dan `server.js` dengan rule `no-undef`, serta `node --check`).
2. **Regression & Financial Drift:** `npm test` (254 tests, drift detector `FINANCIAL_POLICY.md`, provider functions, identitas `MW-P0-001`).
3. **End-to-End Traceability Suite:** `node test_code_integrity_audit.js` (Memvalidasi konsistensi harga, skala bandarmology, biaya transaksi, dan ketiadaan false negative).

*Dokumen ini merupakan kontrak resmi integritas arsitektur MoneyWatch Pro dan tidak boleh dilanggar oleh commit mana pun.*
