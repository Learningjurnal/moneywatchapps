# Audit Konektivitas Provider Real & isSimulated — 2026-10-02

**Status: AUDIT SELESAI, PERBAIKAN BELUM DIEKSEKUSI.** Tidak ada commit/push yang
dilakukan selama audit ini. Dokumen ini adalah laporan serah-terima untuk sesi
Claude Code lain — baca dulu sebelum mengulang kerjaan, lanjutkan dari "Tindak
Lanjut yang Dibutuhkan" di bagian bawah.

Pemicu: user mengisi `.env` dengan `GEMINI_API_KEY`, `OPENROUTER_API_KEY`,
`INVEZGO_API_KEY`, `UPSTASH_REDIS_REST_URL`/`TOKEN` dan minta audit menyeluruh
konektivitas real + lanjutan audit `isSimulated` + cakupan whole-market Invezgo
+ `npm test`/`npm run lint`.

---

## 1. TEMUAN KRITIS — salah tempat isi .env (SUDAH DIPERBAIKI di sesi ini)

User sebenarnya mengisi **`.env.example`** (file template yang ter-track git,
BUKAN di `.gitignore` — hanya `.env`/`.env.local`/`.env.*.local` yang ignored),
bukan `.env`. Akibatnya 5 secret real (Gemini, OpenRouter, Invezgo, Upstash
URL+token) sempat ada di working tree sebagai *unstaged changes* di file yang
akan ikut ter-commit kalau ada `git add -A && git commit` naif.

**Sudah diperbaiki (reversibel, tidak ada commit):**
- Isi 5 key dipindah ke `.env` baru (otomatis gitignored).
- `.env.example` di-`git restore` balik ke placeholder kosong.
- `git status` bersih setelah ini.

**Catatan penting untuk sesi lanjutan:** project ini **TIDAK punya dependency
`dotenv`** dan **TIDAK ada `--env-file` di script manapun** di `package.json`
(`dev`/`start`/`test` semuanya `node server.js` / `node test_*.js` polos). Jadi
`.env` TIDAK otomatis terbaca oleh `npm run dev`/`npm test` biasa. Untuk semua
pengujian di bawah, dipakai Node 24's native flag:
```
node --env-file=.env server.js
node --env-file=.env test_suite.js
```
Belum diputuskan apakah ini mau dipermanenkan ke `package.json` scripts (ada
risiko: Vercel production tidak punya file `.env` sama sekali — env var-nya
datang dari Vercel dashboard, langsung ke `process.env` — jadi kalau
`--env-file=.env` dipasang unconditional di script `start`, perlu dicek dulu
apakah Vercel benar-benar menjalankan `npm start`/`node server.js` untuk
deploy-nya atau route lewat mekanisme serverless lain yang tidak peduli
`package.json` scripts sama sekali — **belum diverifikasi, jangan menebak**).

---

## 2. Verifikasi Konektivitas Real — Hasil per Provider

Semua dites dengan live call sungguhan (bukan cuma cek env var ada/tidak),
pakai key yang user isi (lihat §1).

### ✅ Yahoo Finance — REAL, jalan normal
`GET /api/idx/quote/BBCA` (server lokal, `node --env-file=.env server.js`)
mengembalikan quote asli (price 5975, bukan placeholder isSimulated).

### ✅ Upstash Redis — REAL, jalan normal
Test langsung pakai `@upstash/redis`: `set` lalu `get` key uji berhasil
round-trip. Quota counter Invezgo yang sudah ada sebelumnya (`used:224` dari
`GET /api/idx/invezgo-status`) juga terbukti terbaca normal dari Redis asli
(bukan in-memory fallback — `lib/invezgo-client.js:49-51` baru memakai Redis
asli kalau KEDUA env var Upstash terisi, dan memang sekarang terisi).

### ⚠️ Google Gemini — KEY VALID, tapi BUG KODE (model default sudah dipensiunkan)
- Key **berhasil autentikasi**: panggilan langsung ke
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=...`
  sukses, model membalas normal.
- TAPI `getGeminiConfig()` di `server.js:834` (dan sekitarnya, dipakai juga di
  `server.js:938` & `server.js:2446`) hardcode default
  `process.env.GEMINI_MODEL || 'gemini-1.5-flash'`.
- Dicoba 3 nama model lama — **semua 404**:
  - `gemini-1.5-flash` → `"is not found for API version v1beta, or is not supported for generateContent"`
  - `gemini-2.5-flash` → `"This model ... is no longer available to new users. ... use models/gemini-3.8-flash"`
  - `gemini-2.0-flash` → `"This model ... is no longer available. ... use models/gemini-3.8-flash"`
  - `gemini-3.8-flash` → **SUKSES**
- **Dampak: AI Engine primer (StockChat, Bandarmology AI narrative, Market
  Radar insight) kemungkinan besar GAGAL DIAM-DIAM juga di production**, tidak
  cuma lokal — fallback otomatis ke Anthropic (kosong, `ANTHROPIC_API_KEY=`)
  lalu ke OpenRouter (lihat §2 di bawah, juga gagal). Perlu dicek apakah
  fallback terakhir (deterministic engine) yang selama ini sebenarnya aktif
  diam-diam di production tanpa disclosure sejak model lama dipensiunkan
  Google — **belum diverifikasi kapan tepatnya Google mematikan model-model
  ini**, jadi belum tahu sejak kapan bug ini aktif di production.
- **Fix yang BELUM dieksekusi** (perlu izin user dulu): ganti default di
  `getGeminiConfig()` ke `'gemini-3.8-flash'`, atau — lebih aman jangka
  panjang — tambah daftar fallback model (coba beberapa nama, pakai yang
  pertama sukses) supaya tidak rapuh lagi tiap kali Google pensiunkan model.

### 🔴 OpenRouter — GAGAL, kemungkinan key salah/format tidak cocok
- Live call (`POST https://openrouter.ai/api/v1/chat/completions`) ke
  model `anthropic/claude-3.5-sonnet` → **401**
  `{"error":{"message":"Missing Authentication header","code":401}}`.
- Dicek 2 jalur independen (curl manual & Node `fetch` langsung baca
  `process.env.OPENROUTER_API_KEY`) — hasil identik, jadi bukan masalah
  quoting shell.
- Dikonfirmasi header **memang terkirim** dan env var **terbaca** (`typeof
  'string'`, length 35, prefix `'sk-'`).
- Key yang diisi user: `sk-d405eff73ebac5b6-0t2wnr-1a69d979` (35 karakter).
  Format key OpenRouter asli biasanya `sk-or-v1-` + ~64 karakter hex —
  **TIDAK match**. Kemungkinan besar key salah-copy, dari service lain, atau
  sudah di-revoke dan OpenRouter membalas pesan generik ini untuk key yang
  tidak dikenali sama sekali.
- **Belum bisa diperbaiki tanpa key baru dari user.**

### 🔴 Invezgo — GAGAL, token sesi kedaluwarsa (BUKAN masalah format key)
- Dites di 2 endpoint berbeda, hasil konsisten:
  - `GET https://api.invezgo.com/usage/api` → 401
  - `GET https://api.invezgo.com/analysis/summary/stock/BBCA?...` → 401
  - Body keduanya: `{"message":"Session expired","error":"Unauthorized","statusCode":401,...}`
- Format key (`invz_live_...`) sendiri **sudah benar/plausible** — ini beda
  kelas masalah dari OpenRouter. Pesan `"Session expired"` secara spesifik
  menunjukkan token ini **berumur pendek dan sudah kedaluwarsa**, bukan salah
  copy.
- **Perlu token baru** dari https://invezgo.com/id/setting/api sebelum bisa
  lanjut verifikasi tier/paket langganan (yang diminta user di task awal) dan
  endpoint mana yang terkunci — **belum bisa dilakukan sama sekali** sampai
  token diperbarui.

---

## 3. `npm run lint` & `npm test`

### `npm run lint` — ✅ bersih (exit code 0)

### `npm test` — 371/377 lolos, 6 gagal
Dijalankan dengan `node --env-file=.env test_suite.js` (lalu file test lain
lewat script `npm test` biasa — belum rerun semuanya dengan env-file, baru
`test_suite.js` yang representatif). Catatan: banner penutup script sendiri
("🎉 ALL 371/377 TESTS PASSED... ZERO ERRORS!") **salah/menyesatkan** — ada 6
`❌ [FAIL]` tercetak sebelumnya di output yang sama. `npm test` tetap exit
code 0 walau ada failure — ini konvensi lama project (bukan perubahan sesi
ini), lihat commit `b00d9dd`/`3101724` yang juga melaporkan beberapa test
gagal "pra-eksisting" tanpa membuat `npm test` merah.

**2 test Regulatory Health Gate yang user tanya spesifik** (sebelumnya gagal
karena idx.co.id *tidak* bisa diakses dari sandbox lama):
- `generateUnifiedScreener() default ... hides every row when Regulatory
  Health Gate data source is entirely unavailable` → **masih gagal**, tapi
  SEKARANG dengan alasan TERBALIK: dapat 844 baris, bukan 0. Artinya idx.co.id
  **BISA diakses** dari environment nyata ini. Test ini ditulis dengan asumsi
  eksplisit "sandbox ini tidak punya akses idx.co.id" di komentarnya (lihat
  `test_suite.js` baris ~7049-7060) — asumsi itu tidak berlaku lagi begitu
  dijalankan dengan internet asli. **Ini BUKAN regresi kode** — ini test yang
  perlu di-mock secara eksplisit (paksa idx.co.id unreachable) kalau mau tetap
  menguji fail-closed behavior-nya, terlepas dari lingkungan menjalankannya.
- `getUniverseOpportunityRadar() default ...` → sama persis, 844 !== 0, sebab
  yang sama (`test_suite.js` baris ~7064-7076).

**4 kegagalan lain (baru, BELUM di-root-cause, jangan ditebak):**
1. `generateUnifiedScreener()` end-to-end tanpa Invezgo/Redis config — ticker
   **PORT** klaim `isRealTechnical:true` padahal test mengasumsikan tidak ada
   Yahoo/Redis config di environment test ini. Baru kelihatan sekarang karena
   baru kali ini test jalan dengan akses internet asli. **Berpotensi bug real**
   di gating `isRealTechnical` — perlu trace kode `generateUnifiedScreener()`
   khusus ticker PORT.
2. & 3. `runUnifiedScreenerBacktest()` (polos & `?variants=true`) — status
   `terminated` (proses mati, kemungkinan timeout). Kemungkinan besar karena
   Invezgo key expired (§2) menyebabkan retry/network delay melebihi timeout
   test. **Coba ulang setelah token Invezgo diperbarui** sebelum menyimpulkan
   ini bug kode.
4. `getBpsStrategicIndicators()` — dapat `'UNEXPECTED_RESPONSE_SHAPE'`, bukan
   `'NOT_CONFIGURED'` yang diharapkan, padahal `BPS_API_KEY` kosong di `.env`.
   Seharusnya short-circuit SEBELUM ada network call sama sekali kalau key
   kosong — kalau ini terjadi, ada kemungkinan ada jalur kode yang tidak
   mengecek `BPS_API_KEY` dengan benar sebelum memanggil network, ATAU ini
   pre-existing failure yang tidak terkait env baru sama sekali. **Belum
   dibaca kodenya** — jangan tebak, baca `lib/providers/bps-client.js` dan
   `getBpsStrategicIndicators()` dulu sebelum menyimpulkan.

---

## 4. Cakupan Whole-Market Invezgo (Rule #2 CLAUDE.md) — audit parsial

Endpoint yang **SUDAH** dipakai di `lib/invezgo-client.js` (whole-market,
1 panggilan untuk seluruh bursa): `/analysis/top/accumulation`,
`/analysis/top/foreign`, `/analysis/notation`, `/analysis/calendar`,
`/analysis/sector/rotation`, `/screener/screen` (POST, terbatas 4 field:
`close`/`pbv`/`per`/`roe`). Semua sudah terintegrasi ke
`lib/idx-data-engine.js` sesuai prinsip Rule #2.

`docs.invezgo.com/api` adalah SPA JS-rendered — tidak bisa di-scrape biasa
(sudah dikonfirmasi komentar lama di kode). File spec resmi `api-1.yaml` yang
pernah user upload di sesi lalu **TIDAK ada di repo** (sudah dicek, bukan
tebakan). Sesi ini berhasil ambil **`https://docs.invezgo.com/llms-full.txt`**
(dump teks resmi vendor, format llms.txt) untuk daftar endpoint — **belum
pernah di-cross-check manual ke respons real** seperti endpoint lain yang
sudah dipakai, jadi **verifikasi live dulu sebelum menulis parser baru**
begitu token Invezgo diperbarui (Rule #1 CLAUDE.md).

**Endpoint whole-market yang BELUM dimanfaatkan** (dari `llms-full.txt`,
paling relevan ke insiden lama sampling bellwether/42-ticker):
- **`GET /analysis/top/change`** — gainers/losers whole-market resmi vendor.
  Kandidat kuat untuk MENGGANTI pendekatan 20-bellwether-Yahoo di
  `getIdxMarketSummary()` (`lib/idx-data-engine.js` ~baris 1956-1971), yang
  sekarang cuma jujur melabeli `simulatedExcluded` saat bellwether gagal,
  bukan benar-benar whole-market breadth/gainers/losers.
- **`GET /analysis/list/stock`** — daftar lengkap seluruh emiten BEI resmi
  dari vendor. Bisa untuk validasi/cross-check `loadBaseUniverse()` yang
  sekarang statis (sudah ada riwayat "7 ticker ketinggalan dari universe
  statis" di commit lama — endpoint ini bisa jadi sumber verifikasi
  berkelanjutan, bukan one-off manual fix).
- **`GET /analysis/news`**, **`GET /analysis/disclosure`** — market-wide,
  belum dipakai sama sekali.
- **`GET /analysis/stalker/sector`** — broker flow lintas sektor market-wide,
  belum dipakai (potensi perkuat Sectoral Insight).
- Beberapa endpoint shareholder market-wide (`shareholder/relation`,
  `shareholder/high`, `shareholder-insider`, `shareholder-above`,
  `shareholder-one`) — belum satupun diintegrasikan.

**Belum sempat diaudit tuntas:** apakah `generateUnifiedScreener()` (bukan
`getUniverseOpportunityRadar()` yang sudah dicek sekilas dan terbukti iterasi
seluruh ~958 universe dengan label jujur "DATA TERBATAS" di luar LQ45/IDX30)
SELALU konsisten whole-market di semua filter/mode-nya — belum di-trace
baris-per-baris.

---

## 5. Audit `isSimulated` tanpa digerbang — lanjutan dari commit `b00d9dd`

Baseline dari git log (supaya tidak mengulang): `b00d9dd`, `3abe5ec`,
`d1757ce`, `eea0aed` sudah menutup `46-stock-dossier.js`,
`41-stockchat-cockpit.js`, `server.js` (endpoint screener),
`lib/idx-data-engine.js` (generateBrokerSummary + bellwether breadth),
`26-commandcenter.js`, `27-stockintel.js`.

File yang di-grep ulang & ditrace titik bacanya di sesi ini (11 file yang
BELUM disebut di commit-commit di atas), **plus** re-scan penuh 29 titik
`isSimulated` di `server.js` dan 43 titik di `lib/idx-data-engine.js`
(termasuk yang di luar bagian yang sudah di-fix sebelumnya):
`public/js/04-render.js`, `07-flowscan.js`, `11-quant.js`,
`36-crypto-technical.js`, `43-ai-chart-intelligence.js`,
`44-sectoral-insight.js`, `45-volume-spike.js`, `48-unified-screener.js`,
`51-market-report.js`, `lib/providers/idx-client.js`,
`lib/providers/yahoo-client.js`.

**→ Dicek sudah aman.** Tidak ada temuan baru — semua titik yang diperiksa
sudah menggerbang numeric/status field di belakang cek
`isSimulated`/`isInvalid` sebelum ditampilkan sebagai data real.

---

## Tindak Lanjut yang Dibutuhkan (urutan prioritas)

1. **User**: regenerate token Invezgo (expired) dan cek ulang/ganti key
   OpenRouter (format tidak cocok) — tanpa ini, §2/§4 tidak bisa dilanjutkan.
2. **Keputusan user**: izinkan fix default model Gemini di `server.js`
   (`gemini-1.5-flash` → model yang masih aktif, misal `gemini-3.8-flash`,
   idealnya dengan daftar fallback bukan 1 nama hardcoded) — ini **bug nyata
   yang sudah terverifikasi**, bukan tebakan.
3. Trace akar sebab 4 kegagalan test baru di §3 (PORT `isRealTechnical`,
   2x backtest `terminated`, BPS `UNEXPECTED_RESPONSE_SHAPE`) — jangan ditebak,
   baca kode terkait dulu.
4. Setelah token Invezgo diperbarui: verifikasi tier/paket langganan +
   endpoint yang terkunci (bagian dari task asli yang belum bisa dilakukan).
5. Kalau mau kejar cakupan whole-market lebih jauh (§4): verifikasi live
   `/analysis/top/change` dan `/analysis/list/stock` dulu sebelum menulis
   parser — jangan percaya skema dari `llms-full.txt` begitu saja.
6. Pertimbangkan apakah `package.json` scripts perlu `--env-file=.env`
   permanen — cek dulu bagaimana Vercel sebenarnya menjalankan `server.js` di
   production sebelum berasumsi aman menambahkannya ke `start`/`dev`.

Tidak ada commit/push dari audit ini. Semua perbaikan di atas menunggu
keputusan/izin eksplisit user.
