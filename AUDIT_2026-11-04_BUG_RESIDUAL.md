# Audit Bug Residual — MoneyWatch Pro

**Tanggal:** 2026-11-04 (WIB)
**Commit yang diaudit:** `3e4d289` (`fix: resolve same-day transaction merge data loss, disclosure historical link inversion, and WIB snapshot timezone`)
**Working tree:** bersih saat audit dimulai (`git status` hanya `?? .audit-tmp/`, folder bukti audit)
**Sifat audit:** READ-ONLY — tidak ada satu pun file produk (`lib/**`, `server.js`, `public/**`, test) yang diubah.

## Status pemeriksaan otomatis saat audit

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` (node --check + eslint lib server.js) | ✅ PASS (exit 0) |
| `npm test` (30 file test) | ✅ PASS (exit 0) |
| `npm run check:invariants` (screener, harga wajar, AI paper, portofolio) | ✅ 0 ERROR, 0 WARN |

Artinya: **semua bug di bawah ini berada di luar cakupan test/invariant yang ada sekarang.** Tidak ada yang tertangkap oleh CI.

## Metode

Enam auditor independen (read-only) memeriksa 6 area terpisah, lalu Lead memverifikasi ulang temuan berisiko tinggi dengan membaca kode sumber langsung:

| Area | Cakupan |
|---|---|
| A — Provider/data layer | `lib/providers/**`, `lib/invezgo-client.js`, `lib/regulatory-gate.js`, `lib/economic-data-engine.js`, `lib/universe.js` |
| B — Mesin finansial | `lib/backtest/**`, `public/js/03-engine.js`, `21-performance.js`, `20-wealth.js`, `02-storage.js`, `02b-price-index.js`, `09-divinvest.js` |
| C — Trading engine | `lib/engine/**`, `public/js/38-ai-autonomous-trading.js`, `49-strategy-engine.js` |
| D — Frontend | `public/js/**`, `public/index.html` |
| E — Server/API | `server.js` (97 route), `api/`, `lib/auth-verify.js`, `vercel.json` |
| F — Screener engine | `lib/idx-data-engine.js` (5.145 baris) + konsumennya di `server.js` & UI |

Skrip reproduksi tersimpan di `.audit-tmp/{provider,financial,trading,frontend,server,screener}/` (tidak di-commit; bisa dihapus kapan saja setelah dibaca).

**Legenda verifikasi:**
- ✅ **Lead** — Lead membaca langsung kode yang dimaksud dan mengonfirmasi klaim.
- 📄 **Repro** — auditor menjalankan fungsi/modul ASLI dengan provider di-mock, bukti berupa skrip + output.
- 🧾 **Statis** — rantai kode dibaca, tidak dieksekusi (mis. butuh browser/network live).

## Ringkasan jumlah

| Severity | Jumlah |
|---|---|
| **P0** — kebocoran/korupsi lintas pengguna, bisa dieksploitasi | 1 |
| **P1** — data loss, kontrol risiko/regulasi bocor, angka menyesatkan berat | 11 |
| **P2** — angka salah/atribusi data salah, fitur diam-diam rusak | 26 |
| **P3** — inkonsistensi, dead code, provenance/plumbing | 12 |
| **Total** | **50** |

---

# P0 (1)

### SEC-01 · Bus SSE multi-device tidak terautentikasi → bocor portofolio lintas pengguna + injeksi snapshot
- **Lokasi:** `server.js:487-536` (`GET /api/sync/stream`), `server.js:444-484` (`broadcastSyncUpdate`), `server.js:178-258` (`POST /api/user-data/save`).
- **Akar masalah:** `uid` diambil mentah dari query string dan dipakai sebagai identitas langganan SSE. Tidak ada verifikasi token/sesi sama sekali di route ini (berbeda dari route lain yang punya `enforceIdentityStage2`), dan `save` mem-broadcast berdasarkan `body.uid` yang juga tidak terverifikasi.
- **Skenario:** penyerang yang mengetahui (atau menebak) uid/Supabase UUID korban membuka `GET /api/sync/stream?uid=<uid-korban>`; setiap kali korban menyimpan data, snapshot portofolio penuh (transaksi, saldo RDN, wealth, watchlist) dikirim ke penyerang. Sebaliknya, penyerang bisa `POST /api/user-data/save` dengan `uid` korban sehingga snapshot palsu muncul di tab korban yang sedang terbuka.
- **Bukti:** reproduksi live oleh auditor: `handshake:true`, `receivedVictimState:true`, 599 byte payload korban diterima (`.audit-tmp/server/repro-result.json`).
- **Fix minimal:** tiket stream bertanda tangan (HMAC `uid|exp|deviceId`, TTL pendek) yang diverifikasi server sebelum `syncClients.set()`; `save` wajib memakai uid dari sesi terverifikasi, bukan `body.uid`.
- **Verifikasi:** ✅ Lead (kode route tidak memanggil verifikasi apa pun) + 📄 live repro.
- **Catatan:** tidak bergantung filesystem → tetap hidup di Vercel. `AUTH_ENFORCE_STAGE2` pun tidak menutup lubang ini karena route stream tidak memanggilnya.

---

# P1 (11)

### SEC-02 · Auth Stage-2 mati secara default → `GET /api/user-data/load?uid=…` mengembalikan data pengguna lain tanpa login
- **Lokasi:** `lib/auth-verify.js:151-156` (`STAGE2_ENFORCE`), `server.js:201`, `server.js:277`, `server.js:374`.
- **Akar masalah:** `AUTH_ENFORCE_STAGE2` harus di-set eksplisit; default kosong = telemetry-only. Ketiga endpoint (`save`, `load`, `clear`) baru menolak identitas palsu bila flag itu `true`.
- **Skenario:** tanpa token sama sekali, `GET /api/user-data/load?uid=<uid-korban>` mengembalikan record penuh (transaksi + saldo). Sudah dibuktikan auditor (HTTP 200 + data korban).
- **Fix minimal:** aktifkan Stage-2 secara default (`!== 'false'`), atau wajibkan token Supabase pada ketiga route dan hanya izinkan mirror disk untuk uid yang cocok.
- **Verifikasi:** ✅ Lead (komentar kode sendiri menyatakan "MW-P0-001 Stage 1 … does not check or block anything") + 📄 live repro.
- **Catatan:** ini rollout bertahap yang didokumentasikan, tetapi AGENTS.md §25 menjadikannya release-blocking selama masih default-mati.

### SEC-03 · `POST /api/user-data/clear` menghapus file berdasarkan substring nama file
- **Lokasi:** `server.js:379-393` (`file.includes(safeKey) || file.includes(altKey)`), lalu `latest_backup.json` dihapus tanpa syarat.
- **Akar masalah:** pencocokan substring, bukan kesamaan key persis.
- **Skenario:** `uid="user"` (atau `uid="a"`, `uid="mail"`) cocok dengan SEMUA `user_*.json` → seluruh mirror pengguna lain terhapus. Sudah dibuktikan: file Alice dan Bob sama-sama terhapus, menyisakan `user_user.json`.
- **Fix minimal:** cocokkan `file === 'user_' + safeKey + '.json'` (atau set key yang tepat); hapus `latest_backup.json` hanya bila memang milik uid tersebut.
- **Verifikasi:** ✅ Lead (kode) + 📄 live repro pada store yang writable.

### DATA-01 · `_mergeDatasets()` cabang "new device" membuang SETOR/TARIK & dividen lokal
- **Lokasi:** `public/js/02-storage.js:826-843`.
- **Akar masalah:** bila `local.transactions` kosong dan cloud punya transaksi, fungsi langsung `return` dengan `transactions: cloud.transactions, dividends: cloud.dividends || [], rdnMutations: cloud.rdnMutations || []` — array sisi lokal tidak di-union sama sekali, padahal kode di bawahnya sudah punya helper union `_mergeByIdOrSig()` (`:963`).
- **Skenario:** perangkat offline (transaksi lokal kosong) mencatat SETOR 10 jt + dividen 250 rb; cloud punya SETOR 5 jt → hasil merge = 5.000.000 (seharusnya 15.000.000); net worth kurang 10 jt dan saldo RDN terlihat lebih kecil.
- **Bukti:** repro memanggil fungsi asli via `getStorageMergeContext()` (`.audit-tmp/financial/merge-repro.mjs`).
- **Fix minimal:** pakai `_mergeByIdOrSig()` di cabang tersebut untuk `dividends`, `rdnMutations`, `cryptoTx`, `rdTx`, `etfTx`.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.
- **Catatan:** ini kelas bug yang sama dengan yang diklaim diperbaiki commit `3e4d289`, tetapi hanya jalur merge utama yang diperbaiki, bukan early-return ini.

### DATA-02 · Merge transaksi per-id: edit lokal selalu kalah, dan id per-device bisa bertabrakan → transaksi hilang
- **Lokasi:** `public/js/02-storage.js:854-911` (index cloud dulu; cabang same-id hanya mengisi `sekuritas/fee/net/gross` yang kosong), `:1362`/`:1464` (id = counter per perangkat).
- **Akar masalah:** untuk id yang sama, objek cloud dipertahankan apa adanya — `type/lot/price/date` versi lokal diabaikan, tanpa pembanding timestamp (blok ">10 detik lebih baru menang" dihapus di `3e4d289`). Selain itu `id` dihasilkan dari counter lokal (`max+1`), sehingga dua perangkat yang menambah transaksi saat offline bisa menghasilkan id yang sama.
- **Skenario A (edit hilang):** user edit 10 lot @4500 → 25 lot @4700 di perangkat A; payload cloud lama (10 lot) di-merge setelahnya → edit kembali ke 10 lot, lalu disimpan ke cloud.
- **Skenario B (data hilang):** perangkat A offline mencatat SELL id 7; perangkat B offline mencatat BUY id 7; merge mempertahankan BUY cloud dan membuang SELL lokal → posisi fantom 10 lot, hasil penjualan Rp 4.790.400 dan realized P&L hilang.
- **Fix minimal:** (1) hormati timestamp per item (`updatedAt` per transaksi) atau timestamp dataset untuk memilih sumber, (2) id transaksi harus benar-benar unik (uuid) — jangan counter per perangkat.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.
- **Catatan:** risiko ini timbul justru karena fix `3e4d289` menjadikan `id` otoritatif tanpa mengganti skema id-nya.

### TRD-01 · Exit Safety Override dilanggar: quote STALE/hilang dipakai seolah live, harga exit "dikarang" dari `entryPrice`
- **Lokasi:** `lib/engine/autonomous-runner.js:720-747`.
- **Akar masalah:** `const currentPrice = (quote && !quote.isSimulated && quote.price > 0) ? quote.price : pos.entryPrice;` — status `STALE` tidak diperiksa, dan saat quote gagal, `entryPrice` disubstitusi sebagai harga pasar. Tidak ada `RISK_MANAGEMENT_DEGRADED`/`EXECUTION_RISK` di seluruh runner.
- **Skenario:** posisi terbuka 11 hari, quote provider gagal → `holdingBars` menembus time barrier → `TIME_STOP` menutup posisi pada harga entry (bukan pasar), P&L dan statistik jadi fiktif; selama quote tetap gagal posisi "HOLD" diam-diam.
- **Fix minimal:** bedakan `REAL` vs `STALE` (cek `quality.status`), jangan pernah memakai `entryPrice` sebagai harga pasar; saat data tak tersedia set `mode='RISK_MANAGEMENT_DEGRADED'`, `executionRisk=true`, dan tulis alert — sesuai AGENTS.md §5/§12.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.

### TRD-02 · Data-quality gate dihitung tetapi tidak ditegakkan pada entry autonomous
- **Lokasi:** `lib/engine/autonomous-runner.js:826-828` (filter hanya `signal.includes('BUY')`), `lib/idx-data-engine.js:826-834` + `:929` (`DATA_QUALITY_ENFORCE_STAGE2` default `false`).
- **Akar masalah:** gate Stage-2 berada di balik env flag yang default mati; runner tidak memeriksa `gateStatus`/`dataQuality` sama sekali sebelum membuka posisi.
- **Skenario:** histori harga STALE/INVALID/SIMULATION tetap menghasilkan sinyal BUY → entry. Reproduksi kontrol: `STALE`, `INVALID`, `SIMULATION` semuanya `passesGate:false` tetapi tetap lolos ke jalur eksekusi.
- **Fix minimal:** blokir entry bila `dataQuality.status !== 'REAL'` (fail-closed), minimal untuk PAPER-ke-LIVE promotion; atau nyalakan Stage-2 default dan tambahkan pengecekan eksplisit di runner.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.

### TRD-03 · Setiap entry autonomous melanggar syarat Risk:Reward 1:2 (target nyata = TP1, R:R 1.667)
- **Lokasi:** `lib/idx-data-engine.js:839-843` (SL = 1.5×ATR, TP1 = 2.5×ATR, TP2 = 4×ATR), `lib/engine/autonomous-runner.js:899-902` (`takeProfit = cand.tp1 || …`).
- **Akar masalah:** runner memakai TP1 sebagai target exit, sehingga R:R = 2.5/1.5 = **1.667:1**, di bawah minimum 1:2 (AGENTS.md §10.8/§11). Field `rr` (1.67) sudah dihitung di engine tetapi tidak pernah dipakai sebagai gate; `calculatePositionSizing()` tidak punya parameter/pengecekan R:R.
- **Skenario:** semua trade yang lolos dapat dieksekusi dengan rasio teoretis di bawah kebijakan; backtest/win-rate yang diklaim "sesuai kebijakan" tidak memenuhi aturan.
- **Fix minimal:** pakai TP2 (atau minimal TP1 ≥ 2× risk) sebagai target exit, atau tolak entry bila `(tp1-entry)/(entry-sl) < 2`.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro (`rrToTp1 = 1.6667`).

### FAB-01 · Katalog "Institutional Quantitative Hypotheses" yang tampil di UI adalah angka karangan; endpoint ujinya tidak terautentikasi
- **Lokasi:** `lib/engine/hypothesis-lab.js:22-91` (`INITIAL_HYPOTHESES`), `:96-109` (fallback ke data karangan bila `data/hypotheses_catalog.json` tidak ada — file itu memang tidak ada), `server.js:5326-5373`, `public/js/38-ai-autonomous-trading.js:1120-1136` + `:2668-2714`.
- **Akar masalah:** 4 hipotesis berstatus `ACCEPTED` dengan `sampleSize`, `winRatePct`, `lower/upperConfidenceInterval`, `pValue`, dan `testedAt` yang ditulis manual di kode — tidak pernah dihitung dari data. Klien sendiri sudah dikosongkan dengan komentar "This used to ship with 4 permanently fixed fake hypothesis tests (invented win rates, sample sizes, p-values)", tetapi **server tetap menyajikannya** dan UI merender sebagai "Pengujian hipotesis berbasis data historis riil dengan bootstrap 90% CI & potongan biaya 0.40%" beserta N/win-rate/CI/p-value.
- **Skenario:** user membuka tab Hypothesis Lab → melihat 4 "edge terbukti" dengan angka presisi yang 100% fiktif. Menekan "⚡ Uji Bootstrap" mem-POST ke endpoint tanpa autentikasi, yang menerima `returnSamples` dari klien dan menyimpannya sebagai `ACCEPTED`/`EDGE TERBUKTI` ke katalog bersama (evidence poisoning), serta memetakan closed trade autonomous memakai field yang tidak ada (`realizedPnLPct`/`returnPct`; yang tersimpan `realizedPnL` rupiah) → semua sampel jadi 0%.
- **Bukti:** `GET /api/ai/hypotheses` mengembalikan 4 entri fiktif; `POST /api/ai/hypotheses/test` dengan sampel buatan → status `ACCEPTED` dipersist (auditor lalu membersihkan file yang terbentuk). Lead memverifikasi UI benar-benar merender angka tersebut.
- **Fix minimal:** hapus `INITIAL_HYPOTHESES` (kembalikan `[]` + status `DATA_INSUFFICIENT` jujur), perbaiki mapping field closed trade, dan lindungi endpoint `test` (auth + validasi sampel server-side).
- **Verifikasi:** ✅ Lead (kode UI + katalog + route + file data absen) + 📄 dua auditor independen.

### SCR-01 · Backtest "Uji Win Rate Formula" memakai entry di close hari sinyal (look-ahead)
- **Lokasi:** `lib/idx-data-engine.js:4235-4265`.
- **Akar masalah:** `pastPoints = points.slice(0, idx + 1)` (benar untuk sinyal), tetapi `entryPrice = pastPoints[last].c` = **close hari D**, sementara data akumulasi broker untuk hari D baru terbit setelah bursa tutup (~17:30 WIB). Exit di `points[idx+forwardDays].c`.
- **Skenario:** hasil backtest memakai harga yang tidak bisa dibeli. Repro: entry 1056 (close D) vs open D+1 1267 → return tercatat **+20,19%** padahal executable **+0,16%**, win rate 100%. Backtest ini yang melegitimasi threshold live `tech.score>=80`.
- **Fix minimal:** entry = `points[idx+1].o` (open hari berikutnya), exit = close/open pada horizon yang sama; atau geser sinyal satu bar.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.

### SCR-02 · Screener menyajikan Chg%(1D)/Vol Ratio/Trend/`confirmedUptrendWhale` dari cache teknikal ber-TTL 10 hari tanpa as-of
- **Lokasi:** `lib/idx-data-engine.js:598`, `:3737`, `:3816-3846`; konsumen `public/js/48-unified-screener.js:405`, `:424`.
- **Akar masalah:** cache teknikal diisi cron dan dipakai sebagai "hari ini", tetapi tidak membawa `asOf`/age dan tidak ada gate staleness sebelum dipakai untuk label "Confirmed Uptrend + Whale".
- **Skenario:** baris menampilkan `chg1d +0,19%`, `confirmed=true`, padahal quote live hari itu **−23,81%** — label "Confirmed" pada saham yang sedang anjlok, persis kelas bug yang pernah diperbaiki untuk kasus lain (SBMA).
- **Fix minimal:** bawa `asOf` di row + tolak/labeli `STALE` bila umur > 1 hari bursa; turunkan `confirmed` menjadi false saat usia cache melewati batas.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.
- **Catatan:** invariant `scripts/invariants/screener.mjs` lulus karena tidak memeriksa umur data.

### REG-01 · Regulatory Gate FAIL-OPEN saat Invezgo `/analysis/notation` mengembalikan array kosong/terpotong
- **Lokasi:** `lib/invezgo-client.js:1399-1402`, `lib/regulatory-gate.js:115-126` + `:154-184`.
- **Akar masalah:** `if (!Array.isArray(raw))` hanya memeriksa tipe; array kosong (atau sebagian pasar) tetap ditandai `status:'REAL'` → `available:true`, `byTicker={}` → SEMUA ticker diklasifikasi `CLEAR/eligible`. Fallback `idx.co.id` sudah dikeraskan untuk kasus ini (empty ≠ available), primary tidak.
- **Skenario:** outage parsial Invezgo mengembalikan `[]` (atau sebagian baris) → seluruh universe 958 emiten lolos gate regulasi; saham notasi khusus/suspensi tampil "Confirmed/BUY ZONE". Melanggar AGENTS.md §30.2 ("API failure ≠ CLEAR", "STALE ≠ CLEAR").
- **Fix minimal:** tolak `rows.length === 0` sebagai `UNAVAILABLE`; bandingkan jumlah baris dengan baseline/`total` bila tersedia, dan perlakukan cakupan jauh di bawah normal sebagai `DATA_ERROR`.
- **Verifikasi:** ✅ Lead (kode) + 📄 repro.
- **Catatan:** probabilitas trigger bergantung perilaku live Invezgo (belum bisa diuji tanpa key/egress), tetapi fail-open-nya terbukti dari kode.

---

# P2 (26)

### DATA-03 · `etfTx` & `divInvestData` masih "all-or-nothing" saat merge
- `public/js/02-storage.js:1008-1010`: `etfTx: local.length ? local : cloud` — transaksi ETF/dividend-investing dari sisi lain dibuang. Skenario: lokal `[{id:2}]` + cloud `[{id:1}]` → merged hanya `[{id:2}]`; holding ETF (mis. SPY) hilang dari AUM/P&L lalu tersimpan ke cloud. Fix: pakai `_mergeByIdOrSig`. Verifikasi: 📄 repro. ✅ Lead.

### PERF-01 · Kartu XIRR memakai terminal value yang tidak sebanding dengan arus kasnya
- `public/js/21-performance.js:1417-1422`: arus SETOR/TARIK mencakup SEMUA akun (saham, crypto, reksadana) tapi `terminalValue = stockMV + rdn` (saham saja). Skenario: setor 200 jt saham + 100 jt crypto → kartu XIRR **−26,8%** sementara `computeCurrentAUM()` benar **+39,9%**. Fix: `terminalValue = computeCurrentAUM()`. Verifikasi: ✅ Lead (kode) + 📄 repro.

### TAX-01 · Pajak dividen 10% di-hardcode di beberapa modul, mengabaikan `TAX_SETTINGS` (pelanggaran canonical engine)
- `public/js/09-divinvest.js:649` (`expNet = expGross * 0.90`); `public/js/42-dividend-calendar.js:147`, `:803` (`0.10`); `server.js:606` (`gross * 0.1`, tanpa `pphRate`). Padahal engine transaksi memakai `d.pphRate`/`TAX_SETTINGS` (`02-storage.js:419`). Skenario: profil PMK-18 bebas pajak (0%) tetap dipotong 10% → proyeksi pendapatan dividen understated Rp 970.000 pada gross 9,7 jt; dengan `pphDividen=5%` formulir mencatat Rp 950.000 vs tombol kalender Rp 900.000 untuk dividen yang sama. Fix: satu helper pajak kanonik. Verifikasi: 📄 repro. ✅ Lead (02-storage:419 vs 09-divinvest:649).

### DIV-01 · DPS CAGR dibagi jumlah baris payout, bukan jumlah tahun
- `public/js/09-divinvest.js:550-559`: DPS 100 (2021) → 121 (2025) = 4 tahun, tetapi dibagi jumlah baris. Hasil **21,00%/tahun** vs benar **4,88%/tahun**; ikut menggeser `scoreG`, rating, dan proyeksi DPS. Fix: `years = (endYear-startYear) || 1`, atau waktu pecahan berbasis tanggal. Verifikasi: 📄 repro.

### BT-01 · Backtest membandingkan return NET sinyal dengan benchmark GROSS
- `lib/backtest/accumulation-backtest.js:164-166`: `net = gross*100 - cost` dibandingkan `uMean*100` (gross) dan `idxTrade.gross*100`. Akibat: setiap `excessVsUniversePct`/`excessVsIndexPct` bergeser −0,40 pp; excess sejati 0,00 tampil −0,40 → verdict bisa berubah jadi NEGATIF. Fix: benchmark dikurangi biaya yang sama (atau bandingkan gross-vs-gross + net-vs-net). Verifikasi: ✅ Lead (kode) + 📄 repro.

### TRD-04 · Hukuman regime bisa "berkalibrasi" menjadi bonus; cap regime ScoreEngine tidak pernah terpakai
- `lib/engine/autonomous-runner.js:342-350`, `:482-502`, `:831-843`; `lib/engine/scoring/ScoreEngine.js:102-111`, `:166-172` (dead code, pemanggil `server.js:5002`/`:5229` hanya mengirim `{date}`). Skenario: `UNKNOWN` mulai 0,90, naik +0,02 tiap WIN hingga clamp 1,40; `rawScore 55` → 77 ≥ `MIN_SCORE_TO_BUY=70` → entry di regime UNKNOWN. `RISK_OFF` 0,60 → 1,20 juga bisa terbalik. Fix: regime multiplier hanya boleh ≤ batas atas untuk regime non-bull, dan jangan pernah > 1,0 untuk UNKNOWN/RISK_OFF. Verifikasi: 📄 repro.

### TRD-05 · Meta-labeler meloloskan vektor fitur kosong/malformed, dan pemanggilnya mengirim konstanta
- `lib/engine/meta-labeler.js:63-85`; `lib/engine/autonomous-runner.js:859-866`. `evaluateMetaLabelFilter(undefined)` → probabilitas 59,3% → `PROCEED`; input `spreadPct:0.4`, `atrPct:2.2` di-hardcode, `volumeSurge`/`foreignStreak` memakai default karena field itu tidak ada di kandidat. Fix: wajibkan fitur (tolak bila missing), dan ambil nilai riil dari kandidat. Verifikasi: ✅ Lead (`der: typeof ... : 0.8` dkk.) + 📄 repro.

### TRD-06 · Exit stop/TP/trailing dibukukan di harga barrier, bukan harga pasar saat gap
- `lib/engine/autonomous-runner.js:609-617`, `:619-628`, `:631-639`, `:741-747`. Skenario: gap 10% menembus stop 970: dibukukan 970 (−30 rb) padahal harga pasar 900 (−100 rb) → Rp 70 rb loss tersembunyi per 1.000 lembar; kinerja paper overstated. (Jalur klien `38-ai-autonomous-trading.js:1818-1822` sudah benar.) Fix: `exitPrice = min(stop, currentPrice)` untuk SL, `max(tp, currentPrice)` untuk TP. Verifikasi: ✅ Lead (kode) + 📄 repro.

### TRD-07 · Audit trail keputusan autonomous tidak lengkap (§21)
- `lib/engine/autonomous-runner.js:325-357` (`decisionLog` dideklarasikan tapi tidak pernah ditulis), `:754-777`, `:789-796`, `:907-948`. Tidak ada `decisionId`, `dataSnapshotId`, `strategyVersion`, `modelVersion`, `executionMode`, `evidence`, `contradictions`, `dataQuality` yang dipersist. Skenario: keputusan tidak bisa direproduksi dari snapshot seperti diwajibkan §21. Fix: persist objek keputusan lengkap per siklus. Verifikasi: 🧾 statis.

### TRD-08 · Jalur exit paper di klien: quote gagal → HOLD diam-diam + toast menyesatkan
- `public/js/38-ai-autonomous-trading.js:1796-1844`, `:1372`. Saat fetch harga gagal hanya `console.warn`; tidak ada mode degraded/`EXECUTION_RISK`; saat semua fetch gagal muncul toast "Harga posisi virtual sudah sesuai dengan feed pasar real-time"; close memakai `pos.currentPrice` terakhir yang tidak tervalidasi. Fix: tandai `EXECUTION_RISK`, tampilkan status degraded, jangan klaim "sesuai feed". Verifikasi: 🧾 statis.

### TRD-09 · Confluence menghitung bukti se-kelompok sebagai independen
- `lib/idx-data-engine.js:1215-1242`, `:1302-1317`, `:1345-1363`. Bobot TREND sampai 1,9 dan MOMENTUM 1,3 dengan beberapa indikator yang saling berkorelasi; `confidenceScore` berbasis jumlah item; pengecekan kontradiksi hanya melihat bukti pertama per grup. Melanggar §8. Fix: dedupe per grup sebelum skor; hitung kontradiksi di seluruh grup. Verifikasi: 🧾 statis.

### MD-01 · Provenance quote Yahoo menyatakan REAL/fresh dari jam dinding, bukan `regularMarketTime`
- `lib/providers/yahoo-client.js:486-491` (`updatedAt`/`dataTimestamp` = now, `freshnessSeconds: 0`), `:444` (`open: meta.regularMarketOpen || prevClose` — komponen candle bisa "dikarang"). Skenario: harga halted/10 hari lama tetap berlabel REAL + fresh; gate freshness & peringatan LLM tidak pernah mendeteksi. Fix: `dataTimestamp = meta.regularMarketTime*1000`, `freshnessSeconds` dihitung nyata, tandai STALE bila lewat ambang. Verifikasi: ✅ Lead (kode) + 📄 repro.

### MD-02 · Quote REAL menyisipkan fundamental karangan; screener hanya memeriksa `isSimulated`
- `lib/providers/yahoo-client.js:425-432`, `:475` (BVPS/EPS/DER/dividendYield hardcode per ticker, mis. `BBCA?2450`, `der: BB*?5.2`, `BBRI?6.2`), `:482-483` (`isReal`/`fieldIsReal` per field); konsumen `server.js:4617-4622` hanya menggate `isSimulated`. Skenario: PER/PBV/ROE/DER "presisi" yang 100% tebakan disajikan & difilter seolah real. Fix: konsumen wajib memeriksa `fundamentals.isReal`/`fieldIsReal`, atau jangan isi field fundamental saat tidak ada coverage. Verifikasi: ✅ Lead (kode) + 📄 repro.

### MD-03 · Batch EOD kosong dari Invezgo ditandai REAL → breadth "0 naik / 0 turun / 958 stagnan" palsu
- `lib/invezgo-client.js:654-669`, `:719-734`; dampak `lib/idx-data-engine.js:2109-2141`. `{gain:[],loss:[]}`/`{accum:[],dist:[]}` → `ok:true`, `status:'REAL'`, `freshnessSeconds:0`; UI menampilkan 958 unchanged sebagai fakta `REAL`, kontras dengan penanganan NO_DATA yang sudah benar di sector rotation (`:1840-1845`). Fix: empty ⇒ `UNAVAILABLE`/`NO_DATA`. Verifikasi: 📄 repro.

### MD-04 · `getLatestEodTradingDate()` mengabaikan hari libur BEI
- `lib/invezgo-client.js:295-321`: hanya menghitung jam (mis. setelah 17:30) dan mundur 1 hari, tanpa `IDX_HOLIDAYS`/`isIdxTradingDay` yang sudah ada di repo. Skenario: 17 Agustus (libur) → semua fitur EOD meminta tanggal 2026-08-17 yang tidak punya data; repro mengembalikan `2026-08-17` padahal EOD terakhir `2026-08-14`. Fix: pakai kalender bursa yang sudah ada. Verifikasi: 📄 repro.

### MD-05 · Koersi `Number()` BPS tanpa `isFinite` → status VERIFIED dengan nilai 0/NaN
- `lib/providers/bps-client.js:208`, `lib/economic-data-engine.js:110`, `:38`: `'' → 0`, `'1.234,56'`/`'N/A'` → `NaN` (ter-serialisasi JSON jadi `null`) tetapi `status` tetap `VERIFIED`. Fix: `Number.isFinite` → `UNAVAILABLE`/`INVALID` + nilai `null`. Verifikasi: 📄 repro.

### FE-01 · Candle mingguan dipakai sebagai OHLCV harian (Chg%/RSI/CMF/VolRatio salah skala)
- `public/js/13-realdata.js:93-114` memanggil `/api/idx/history?tf=1Y` yang di `lib/providers/yahoo-client.js:628` dipetakan ke `interval:'1wk'`, lalu hasilnya `rdSave()` ke cache yang dibaca sebagai harian; fallback proxy justru `interval=1d` (`13-realdata.js:128`). Dampak: FlowScan/Watchlist/Heatmap menghitung Chg% = selisih dua candle mingguan, RSI14 = 14 minggu, CMF/VolRatio skala mingguan; cache bisa mencampur granularitas. Fix: tambahkan bucket `SCAN`/`DAILY_MAX` (1d) untuk konsumen ini + key cache terpisah. Verifikasi: ✅ Lead (`HISTORY_TF_MAP['1Y']` = 1wk) + 📄 repro.

### FE-02 · "Hari ini" versi UTC dipakai sebagai tanggal WIB (00:00-06:59 WIB mundur sehari)
- Lokasi terverifikasi: `public/js/02-storage.js:2741` (`today()`), `21-performance.js:107`+`:126`, `20-wealth.js:891/899/932/940`, `07-flowscan.js:1000`, `13-realdata.js:10`+`:554`. Dampak: tanggal default transaksi/dividen/RDN/pembayaran wealth yang tersimpan = kemarin; halaman Performance menandai baris ekuitas kemarin sebagai LIVE dan menimpa P&L historis dengan day gain hari ini; cache/label RD dan `max` date-picker EOD salah sampai sesi ditutup. Helper `getWibDateString()` sudah tersedia (`02b-price-index.js:201`) — `03-engine.js:449/752/813` sudah memakainya. Fix: ganti idiom `toISOString().slice(0,10)` dengan helper tersebut. Verifikasi: ✅ Lead (grep + helper) + 📄 repro (drift 2026-11-04 03:00 WIB).
- **Catatan:** 2 idiom UTC lain diverifikasi BENAR (bukan bug): `02b-price-index.js:11` (aritmetika date-string) dan `41-stockchat-cockpit.js` dateKey cache (hanya refetch berlebih).

### FE-03 · `userExtras` memakai key localStorage global; logout tidak membersihkannya
- `public/js/02c-user-extras.js:4-12` + `:37-103`; wiring `02-storage.js:1351`/`:1457`; tidak dibersihkan `08-auth.js:370-381`/`02-storage.js:69-115`. Dampak: user A logout → user B login di browser yang sama: B mewarisi watchlist A, pengaturan fee/tax broker A (P&L B jadi salah), bobot dossier, histori net worth; aturan "timestamp lebih baru menang" lalu mendorong nilai A ke baris Supabase B. Fix: scope key dengan `getUserStorageKey()` dan/atau bersihkan saat logout. Verifikasi: 📄 (dua user butuh satu profil browser) + 🧾 statis.

### SEC-04 · Normalisasi identitas menabrakkan user berbeda (`.`/`_`/`_40` → `_`) dan melewati Stage-2
- `lib/auth-verify.js:127-149`; pemakai `server.js:162-165`. `a.b@mail.com` dan `a_b@mail.com` → key yang sama (`a_b_mail_com`) → satu file/uid untuk dua user berbeda, dan token milik salah satunya memenuhi `claimedIdentityMatches` untuk uid user lain (diekseskusi langsung dari export asli: `true`). Fix: key harus reversible/berbasis hash dengan pemisah aman (mis. `encodeURIComponent` tanpa penggantian `_40`), bukan normalisasi lossy. Verifikasi: ✅ Lead (kode) + 📄 exec.

### SYNC-01 · Restore dari server-mirror tidak pernah jalan saat Supabase down (kontrak `{record:{data}}` vs `srvJson.data`)
- `server.js:340-344` mengembalikan `{record:{data}}`; `public/js/02-storage.js:1531` dan `:1661` membaca `srvJson.data`; hanya `:1924` yang membaca `record.data`. Dampak: saat Supabase timeout, fallback ke `GET /api/user-data/load` tidak pernah menemukan data → user melihat portofolio kosong padahal server punya mirror. Fix: baca `srvJson.record && srvJson.record.data` di kedua tempat. Verifikasi: ✅ Lead (kode) + 📄 repro.

### SCR-03 · Track D "Konsensus forward validation" tidak pernah mencatat apa pun
- `lib/idx-data-engine.js:4677` membaca `consensus.rows`, sedangkan `generateScreenerConsensus()` mengembalikan `results` (`:4145`). Akibat: `newEntries` selalu kosong; log dan ringkasan selalu n=0 (repro: `count=1 → added:0`). Fix: `consensus.results`. Verifikasi: ✅ Lead (kode) + 📄 repro.

### SCR-04 · `excludeContradictions=true` → `Assignment to constant variable` → HTTP 500
- `lib/idx-data-engine.js:4001` (`const rows = []`) dan `:4136` (`rows = rows.filter(...)`). Endpoint `GET /api/idx/screener-consensus?excludeContradictions=true` melempar TypeError. Fix: pakai array baru (`const filtered = rows.filter(...)`) dan kembalikan itu. Verifikasi: ✅ Lead (kode) + 📄 repro (`repro-a.mjs`).

### SCR-05 · Harga consensus jatuh ke `tech.ema20` (rata-rata bergerak) dan diperlakukan sebagai "entry price riil"
- `lib/idx-data-engine.js:4030`; konsumen `:4678-4683`. Repro: `BBRI price=1055.62` = `ema20` unified, sementara close terakhir 1061; logger menerimanya sebagai entry "real, verifiable". Fix: `price` hanya dari quote/close riil, `null` bila tidak ada. Verifikasi: ✅ Lead + 📄 repro.

### SCR-06 · Track B mencatat entry price dari cache fundamentals 14 hari, bukan quote live
- `lib/idx-data-engine.js:3835`, `:4430-4438`; sumber `lib/providers/yahoo-client.js:130` (cache 14 hari). Repro: `entryPrice 1000` sedangkan harga pasar 800 → `getScreenerSignalLogSummary()`/`getScreenerCalibrationReport()` (UI mengklaim "harga entry real") terkontaminasi. Fix: ambil quote live saat mencatat (seperti jalur consensus). Verifikasi: ✅ Lead (kode) + 📄 repro.

### MODEL-01 · Workflow retrain bulanan auto-commit model tanpa gate kualitas; metrik yang diiklankan menyesatkan
- `.github/workflows/retrain-model.yml:34-49` (commit+push otomatis jika file berubah, pesan commit memakai `test_accuracy` saja); `public/models/xgb_signal_meta.json` versi `20261101`: `test_roc_auc = 0.5115` (≈ acak), `base_rate = 0.3186`, `buy_precision_at_threshold = 0.3188` (tidak ada lift), dan `test_accuracy 63,6%` justru **di bawah** baseline mayoritas 68,1% (selalu prediksi negatif). Melanggar AGENTS.md §19 ("model tidak boleh dipromosikan hanya berdasarkan akurasi") — di sini bahkan tidak ada gate sama sekali. Fix: tolak commit bila `roc_auc`/lift di bawah ambang atau bila akurasi ≤ baseline; laporkan AUC+lift di commit message. Verifikasi: ✅ Lead (JSON meta + workflow + hitung baseline).

---

# P3 (12)

### MD-06 · Cache stock-screener IDX mengembalikan map polos & menyajikan cache kedaluwarsa setelah refresh gagal
- `lib/providers/idx-client.js:96-146` (return stale di `:112`, `:114`, `:144`) + `server.js:1756-1767`: tidak ada `available/isStale/fetchedAt`, caller memberi label `idx_screener_real`. Fix: envelope + `isStale` seperti notasi khusus. Verifikasi: 📄 repro.

### CALC-01 · Preview "Avg Beli Baru" di modal BUY memakai cost kotor fee-inclusive
- `public/js/05-assets.js:1516`: `(curCost + gross)/newShares` sedangkan `curCost` = net fee-inclusive per kontrak `getPortfolio()` → preview 1000,90 vs engine 1001,80 (Rp 3.600 per 4.000 lembar). Fix: pakai `c.net`. Verifikasi: 📄 repro.

### DIV-02 · Hak dividen pada ex-date salah batas (`date <= exDate`)
- `public/js/09-divinvest.js:87`: IDX memakai cum-date close; beli 10 lot di ex-date → 2.000 lbr (seharusnya 1.000), jual 5 lot di ex-date → 500 lbr (seharusnya 1.000); angka ini langsung masuk `addDiv()`/RDN. Fix: `date < exDate` (cum date) dan uji dengan skenario beli/jual di ex-date. Verifikasi: 📄 repro.

### FE-04 · Stock Dossier tidak punya request-generation guard (respons ticker lama menimpa ticker baru)
- `public/js/46-stock-dossier.js:1383-1421`, `:1686-1693`, `:3043-3047`; trigger `24-stockmaster.js:226-227`. Ganti ticker saat harvest berjalan → data ticker lama dirender di bawah ticker baru DAN `prices[newTicker] = harga ticker lama`. Fix: simpan token request, buang respons basi; tulis `prices[harvested.ticker]`. Verifikasi: 🧾 statis.

### FE-05 · Kontrak respons `/api/idx/quote/:ticker` salah dibaca di 2 file → sinkronisasi harga live mati
- `public/js/24-stockmaster.js:1635`, `public/js/37-tradewave-engine.js:487` membaca `q.price`, padahal `server.js:3913-3916` mengembalikan `{success, quote:{...}}` (konsumen benar: `27-stockintel.js:468`, `40-idx-pipeline.js:262`). Fix: unwrap `.quote`. Verifikasi: ✅ Lead (route) + 🧾 statis.

### FE-06 · Cache-bust `?v=` basi di 37 file; commit HEAD mengubah 2 file JS tanpa bump
- `public/index.html:4591` (`02-storage.js?v=20261003a`) & `:4594` (`03-engine.js?v=20261003d`) padahal `3e4d289` (3 Nov) mengubah keduanya; 37 dari 51 script di belakang tanggal commit terakhirnya. `vercel.json:31-35` menyajikan `/js` dengan `max-age=3600, must-revalidate` sementara `index.html` `max-age=0` → setelah deploy, browser bisa memakai JS lama hingga 1 jam terhadap HTML baru (termasuk fix data-loss HEAD). Fix: bump versi file yang berubah (atau content-hash otomatis). Verifikasi: ✅ Lead (git log vs index.html + vercel.json) + 📄 skrip.

### SCR-07 · Provenance regulatory di response screener di-hardcode `'BEI (idx.co.id)'`
- `lib/idx-data-engine.js:3948`, `:3092`: `dataSources.regulatory.source` selalu `'BEI (idx.co.id)'` walau gate dijawab Invezgo, dan tetap string itu saat TIDAK ada provider yang menjawab (harusnya `null`/tidak tersedia). Melanggar AGENTS.md §30.1.1/§30.3. Fix: teruskan `dataSources.regulatory.source` dari gate apa adanya. Verifikasi: 🧾 statis.

### SCR-08 · Resolusi horizon Track D memakai hari kalender → Jumat d1/d2/d3 jatuh di close Senin yang sama
- `lib/idx-data-engine.js:4722`, `:4731-4732`; `|| points[last]` juga bisa melabeli window lebih pendek sebagai dN. Repro: ketiga harga exit 1517, tanggal 2026-11-02. Fix: hitung horizon dalam hari bursa memakai kalender IDX. Verifikasi: 📄 repro.

### SCR-09 · Bar volume 0 di ujung dibuang filter → "Volume spike ≥2x" palsu
- `lib/idx-data-engine.js:278-282` (+ bonus whale `:3766`): `vols` difilter `v>0` lalu `vols[last]` dianggap "hari ini". Repro: `volRatio 2,73` padahal volume bar terakhir 0 → label "Volume spike ≥2x + UPTREND" / "Akumulasi Lemah", sementara `computeVolumeSpikeSignal()` sendiri benar (`isSpike:false`). Fix: pertahankan posisi bar terakhir (0 tetap 0) atau tandai NO_DATA. Verifikasi: 📄 repro.

### SEC-05 · Respons `/api/user-data/save` membocorkan `err.message` mentah (termasuk path absolut)
- `server.js:230`, `:251`: `diskError = err.message` lalu dikirim ke klien (repro: `EISDIR: ... C:\...\data\user-stores\...`). Lolos dari guard `publicErrorMessage`/`test_error_leak.js`. Fix: `publicErrorMessage(err)` untuk field itu (detail lengkap tetap di log). Verifikasi: 📄 live repro.

### SEC-06 · Catch backtest mengembalikan `err.message` mentah dengan HTTP 400
- `server.js:4161`: kegagalan internal dilabeli 400 (client error) dan pesan internal diteruskan; `test_error_leak.js` me-whitelist `res.status(400)` sehingga guard-nya tidak menangkap. Fix: bedakan 400 (input) vs 500 (internal) + `publicErrorMessage`. Verifikasi: 🧾 statis.

### DUP-01 · Dua implementasi rekonsiliasi RDN (klien vs server) yang harus sinkron tapi sudah berbeda; id mutasi dinomori ulang setiap sinkronisasi
- `public/js/02-storage.js:335-572` (`reconcileRdnWithTransactions`) vs `server.js:539-732` (`reconcileRdnPayload`): keduanya menghitung daftar mutasi + saldo dari transaksi. Perbedaan: server selalu `gross * 0.1` (klien memakai `d.pphRate`), server tidak punya dedupe "Setoran Awal", `account` handling, dan **keduanya menimpa `id` mutasi secara berurutan** (`client :506-508`, `server :695-696`), sehingga id berubah ketika ada baris baru disisipkan lebih awal — referensi/audit trail berbasis id tidak stabil dan `_mergeByIdOrSig()` (yang menganggap id otoritatif) bisa menggandakan mutasi manual. Melanggar AGENTS.md §17 (satu mesin finansial kanonik). Fix: satu implementasi kanonik di `lib/` yang dipakai klien & server; jangan renumber id; hormati `pphRate`. Verifikasi: ✅ Lead (kedua sumber dibaca) + 🧾 statis.

---

# Yang DIPERIKSA dan TIDAK ditemukan bug (penting agar tidak diaudit ulang)

- **SSRF proxy**: allowlist host/protokol menolak IP privat, metadata cloud, IPv6-mapped, localhost, kredensial URL — tidak ada bypass yang ditemukan (`test_proxy_ssrf.js` sesuai kode).
- **Cron/CRON_SECRET**: semua endpoint cron fail-closed tanpa secret.
- **Regulatory gate default**: `excludeFlagged` default mengecualikan non-CLEAR; `confirmedUptrendWhale` memakai nilai gate-aware (bukan `confirmed` mentah) — kecuali kasus fail-open di REG-01.
- **Mesin biaya/pajak kanonik**: `calcTxComponents()` (fee beli 0,15%/jual 0,25%), kontrak `cost` net fee-inclusive, partial sell avg-cost, TWR sub-period, solver XIRR (null handling), idempotensi rekalkulasi — semua konsisten dengan invariant & test.
- **`lib/backtest/accumulation-backtest.js`**: entry D+1 open / exit D+h close, block-bootstrap per tanggal + koreksi Bonferroni, kontrol negatif — tidak ada look-ahead (berbeda dari SCR-01).
- **MTF veto** (`sizeMultiplier=0`) dan urutan Regulatory Gate sebelum sinyal kandidat — benar.
- **Screener/radar**: estimasi fundamental tidak masuk skor (fundamentals estimator sudah `null`), tidak ada mutasi array bersama oleh `sort()`, tidak ada skor NaN/Infinity, cakupan tidak terpotong di bawah 958 emiten.
- **Auth route lain**: route order, rate limiter, CORS, prototype pollution/body type confusion, unhandled rejection, kebocoran env/API key, `vercel.json` — bersih (di luar 3 temuan auth di atas).

# Saran urutan perbaikan (tanpa mengubah kode pada audit ini)

1. **Segera (P0):** SEC-01 (tiket stream bertanda tangan + save memakai uid terverifikasi).
2. **P1 keamanan:** SEC-02 (Stage-2 default aktif), SEC-03 (hapus substring match).
3. **P1 integritas data:** DATA-01 & DATA-02 (satu patch merge), FAB-01 (hapus/ganti katalog karangan), REG-01 (fail-closed).
4. **P1 trading:** TRD-01, TRD-02, TRD-03 (satu patch `autonomous-runner.js`, ada test harness di `test_autonomous_runner.js`).
5. **P1 metodologi:** SCR-01, SCR-02 (patch terpisah, tambahkan aturan ke `scripts/invariants/screener.mjs`).
6. **P2:** kelompokkan per file agar patch tidak tercampur severity (AGENTS.md §27): `02-storage.js`, `21-performance.js`+`09-divinvest.js`+`42-dividend-calendar.js` (TAX-01), `yahoo-client.js`+`invezgo-client.js`, `idx-data-engine.js` (SCR-03..06), `auth-verify.js`, dsb.
7. Setiap fix sebaiknya menambah regression fixture di test yang sesuai (rule 5 CLAUDE.md: fail-without-fix → pass-with-fix), dan bump `?v=` untuk setiap file `public/js` yang berubah.
