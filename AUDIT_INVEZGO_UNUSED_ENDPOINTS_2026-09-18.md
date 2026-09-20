# Audit Endpoint Invezgo API — Screener & Fitur Belum Terpakai (18 Sep 2026)

**Tujuan dokumen ini:** memetakan fitur Invezgo (plan Advance) yang belum dipakai MoneyWatch Pro, terutama fitur **screener saham**, supaya jadi acuan konkret untuk pengembangan berikutnya — bukan ringkasan pemasaran Invezgo, tapi hasil verifikasi langsung: baca source code resmi client mereka (`invezgo-mcp.mcpb`, diekstrak dan dibaca — bukan tebakan) + panggilan **live** ke `api.invezgo.com` pakai API key produksi + grep penuh codebase `moneywatchapps` untuk memverifikasi apa yang benar-benar sudah terpakai.

Level keyakinan per temuan ditandai eksplisit: **TERVERIFIKASI LIVE** (sudah dipanggil sungguhan, ada contoh response JSON real), **DIKONFIRMASI DARI SOURCE RESMI** (dari kode client MCP Invezgo, belum dipanggil live oleh saya), atau **BELUM DIVERIFIKASI** (perlu dicek lebih lanjut sebelum dipakai di produksi).

Base URL semua endpoint: `https://api.invezgo.com/`. Auth: header `Authorization: Bearer <INVEZGO_API_KEY>`.

---

## 1. Endpoint SCREENER — TERVERIFIKASI LIVE

```
POST https://api.invezgo.com/screener/screen
Body: { "formula": "<ekspresi string>" }
```

Bukan filter form dengan dropdown — formula bebas. Sesuai deskripsi di homepage invezgo.com: *"Use the screener to find stocks according to your wishes from a variety of basic to custom indicators and thousands of stocks available"*.

### Hasil pengujian live (18 Sep 2026, API key produksi)

| Formula | Hasil | Status |
|---|---|---|
| `{}` (kosong) | `422: "Path formula should be string, but got undefined"` | field `formula` wajib |
| `"PER < 15"` (huruf besar) | 909 saham, SEMUA `matched:true`, `PER` selalu `0` | ⚠️ **nama field SALAH — diam-diam jadi 0, bukan error** |
| `"close > 5000"` | Terfilter benar (MLBI 6875, GEMS 7275, GGRM 17900, RDTX 13100, dst) | ✅ `close` valid |
| `"pbv < 2 AND close > 0"` | Terfilter benar (SURI pbv 1.06, CITA pbv 1.44, PJHB pbv 0.90, dst) | ✅ `pbv` (huruf kecil) valid |
| `"per > 0 AND per < 15 AND roe > 15"` | 4 hasil, lihat di bawah | ✅ `per` + `roe` (huruf kecil) valid |

**Contoh response JSON REAL** (formula gabungan `per`+`roe` di atas):
```json
[{"code":"DKFT","matched":true,"roe":26.3043,"per":8.6736},
 {"code":"VIVA","matched":true,"roe":25.5883,"per":3.9151},
 {"code":"TINS","matched":true,"roe":25.7376,"per":8.9712},
 {"code":"PSAB","matched":true,"per":2.6309,"roe":37.4862}]
```

**Struktur response:** array `{code, matched: true, <tiap field yang disebut di formula>: number}` — hanya baris yang cocok (`matched:true`) yang dikembalikan; formula yang tidak cocok siapa pun akan mengembalikan array kosong (belum diverifikasi, tapi konsisten dengan perilaku filter di atas).

### ⚠️ Bahaya tersembunyi — WAJIB dibaca sebelum implementasi

Nama field yang salah **tidak menghasilkan error HTTP**. Nilainya diam-diam menjadi `0`, sehingga formula seperti `"PER < 15"` (harusnya `per`, huruf kecil) tetap mengembalikan HTTP 200 dan "berhasil" — tapi isinya salah total (mencocokkan SEMUA saham, karena `0 < 15` selalu benar).

**Wajib**: sebelum formula apa pun dipakai di produksi, validasi dulu dengan satu saham yang nilai aslinya sudah diketahui (mis. BBCA, PER ≈ 11-53 tergantung kuartal — lihat §2) untuk memastikan field dikenali dan nilainya bukan `0` secara mencurigakan di semua baris.

### Field yang BELUM diverifikasi

Field yang confirmed bekerja: `close`, `pbv`, `per`, `roe` (semua huruf kecil). Field lain yang kemungkinan besar valid (berdasarkan pola nama di `analysis/keystat`, lihat §2) tapi **belum saya coba**: `der`, `roa`, `eps`, `bvps`, market cap, dividend yield. Operator yang belum diverifikasi: `OR`, `>=`, `<=`, kurung, urutan/`sort`, `limit`/`page` (schema resmi `screenSchema` cuma `{formula: string}` — tidak ada parameter lain, jadi sorting/limit kemungkinan harus ditangani di sisi client setelah fetch, atau dimasukkan ke dalam string formula — **perlu dicoba langsung**).

### Rate limit — catatan penting

Saat pengujian, `screener/screen` kena `429 ThrottlerException` berulang kali walau sudah dijeda 5-8 detik antar panggilan — tampaknya throttle lebih ketat dari budget bulanan 30k yang sudah ditangani `lib/invezgo-client.js`. **Kalau screener diintegrasikan, butuh rate-limiter/backoff terpisah khusus endpoint ini**, jangan asumsikan budget yang sama dengan endpoint lain sudah cukup.

---

## 2. Field fundamental (PER/PBV/ROE/dst) — TERVERIFIKASI LIVE via `analysis/keystat/{code}`

```
GET https://api.invezgo.com/analysis/keystat/{code}?type=Q&limit=15
```
Parameter: `type` (`Q`/`FY`/`Q1`-`Q4`), `limit` (1-100, default 15). Per-ticker (bukan bulk) — kemungkinan sumber data yang sama dipakai `screener/screen`, jadi berguna untuk validasi silang.

**Contoh response JSON REAL (BBCA, 18 Sep 2026)** — dipotong ke beberapa baris representatif dari 24 metrik yang tersedia:
```json
{"rows":[
  {"name":"PER","values":[{"col":"Q2 2026","amount":0},{"col":"Q1 2026","amount":53.5863}]},
  {"name":"PBV","values":[{"col":"Q2 2026","amount":2.5046},{"col":"Q1 2026","amount":3.0351}]},
  {"name":"ROE","values":[{"col":"Q2 2026","amount":21.4055},{"col":"Q1 2026","amount":5.6639}]},
  {"name":"ROA","values":[{"col":"Q2 2026","amount":4.49},{"col":"Q1 2026","amount":0.8953}]},
  {"name":"DER","values":[{"col":"Q2 2026","amount":0},{"col":"Q1 2026","amount":5.2836}]},
  {"name":"Kapitalisasi Pasar","values":[{"col":"Q2 2026","amount":677334762225000},{"col":"Q1 2026","amount":787172831775000}]}
], "columns":[{"year":2026,"label":"Q2 2026","period":"Q2"},{"year":2026,"label":"Q1 2026","period":"Q1"}]}
```

**24 metrik lengkap ditemukan di respons real ini** (nama field seperti apa adanya, ada yang mengandung spasi/slash — perlu normalisasi kalau dipetakan ke nama field screener):
`BVPS, CFO/Net Profit, CFPS, DER, EBITDA, EPS, EPS (Annualised), EPS (Recomputed), EV/EBITDA, Harga, Kapitalisasi Pasar, Net Profit, Net Profit (Quarter), Net Profit (TTM), Net Profit Growth QoQ, Net Profit Growth YoY (YTD), P/CF, PBV, PER, PER (Annualised YTD), Revenue, ROA, ROA (Bank/OJK Analytical), ROE, RPS, Saham`

**Catatan**: nilai bisa `0` untuk kuartal tertentu bukan karena data hilang, tapi karena beberapa metrik hanya dilaporkan di kuartal tertentu (pola terlihat di respons — Q2 dan Q1 saling melengkapi field yang berbeda). **Belum diverifikasi**: apakah ini bug di sisi Invezgo atau representasi resmi "belum terbit".

---

## 3. Website invezgo.com — konfirmasi fitur Screener ada di UI mereka juga

Kutipan langsung dari homepage: *"Use the screener to find stocks according to your wishes from a variety of basic to custom indicators and thousands of stocks available"*. Tidak merinci daftar field di halaman marketing — konsisten dengan pendekatan formula bebas, bukan form filter tetap dengan daftar field terpampang.

---

## 4. ⚠️ KLARIFIKASI PENTING — daftar "endpoint sudah dipakai" perlu dikoreksi

Grep penuh codebase `moneywatchapps` (bukan cuma `lib/invezgo-client.js`) menunjukkan daftar yang berbeda dari yang tercatat sebelumnya.

### Benar-benar dipakai (7 endpoint, ada panggilan HTTP nyata — `lib/invezgo-client.js`)
- `analysis/summary/stock/{code}` — ⚠️ **BUKAN** `analysis/summary/broker` seperti yang tercatat sebelumnya. Kode yang jalan pakai `summary/stock` (broker summary BY kode saham). `summary/broker` (by kode broker, endpoint berbeda) cuma disebut di `INCIDENT_LOG.md`, **tidak pernah dipanggil sungguhan**.
- `analysis/top/accumulation`, `analysis/top/foreign`
- `analysis/shareholder/number/{code}`, `shareholder/ksei/{code}`, `shareholder/classify-table/{code}`
- `analysis/shareholder/classification/{code}` — **tidak tercatat di daftar sebelumnya**, padahal sudah diimplementasikan (`fetchInvezgoShareholderClassification`, `lib/invezgo-client.js:649`)

### TIDAK ditemukan sama sekali di kode (3 endpoint yang dikira sudah dipakai)

**`analysis/calendar`** — nihil di seluruh codebase. Fitur kalender dividen (`public/js/42-dividend-calendar.js`) memanggil `/api/idx/calendar?type=DIVIDEN` (route internal), yang di-backend oleh `getIdxCalendarData()` di `lib/providers/idx-client.js` — **sumbernya idx.co.id langsung, bukan Invezgo**.

**`analysis/financial-statement/{code}`** — nihil di kode manapun. Hanya disebut sebagai catatan di `INCIDENT_LOG.md`, tidak pernah diimplementasikan.

**`analysis/sector-rotation`** — nihil. Fitur "Sectoral Insight" (`public/js/44-sectoral-insight.js`) cuma memanggil `/api/sectoral-news` (berita), bukan analisis rotasi sektor Invezgo. Catatan tambahan: path resmi di source Invezgo adalah **`analysis/sector/rotation`** (dengan slash, bukan strip `sector-rotation`) — kalau pernah dicoba dan gagal sebelumnya, ini kemungkinan penyebabnya.

**Perlu konfirmasi dari Anda**: apakah 3 endpoint ini pernah diimplementasikan di repo/branch lain yang tidak ikut di-scan di sini? Kalau tidak, status ketiganya adalah "belum pernah diintegrasikan", bukan "sudah terpakai".

---

## 5. Endpoint lain yang tersedia tapi belum dipakai — DIKONFIRMASI DARI SOURCE RESMI

Sumber: `dist/tools/stock/handler.js` (33 tools), `dist/tools/personal/handler.js` (9 tools), `dist/tools/batch/handler.js` (3 tools) di dalam `invezgo-mcp.mcpb` — source code JS/TS client resmi Invezgo sendiri. **Belum saya panggil live** kecuali disebut khusus di §1/§2 di atas.

### Screener & Fundamental (paling relevan untuk MoneyWatch Pro)
- `POST screener/screen` — ✅ §1
- `GET analysis/keystat/{code}` — ✅ §2
- `GET analysis/financial-statement/{code}?statement=BS|IS|CF|EQ&type=Q|FY|Q1-4&limit` — laporan keuangan lengkap, belum diverifikasi live
- `GET analysis/information/{code}` — profil perusahaan (contoh real BBCA sudah tersimpan di `Company Information.json` milik Anda — komisaris, direksi, anak usaha, dst)

### Chart & Teknikal
`analysis/chart/stock/{code}?from&to`, `analysis/chart/stock/{indicator}/{code}?from&to` (indicator: bdm/ritel/ratio/value/volume/foreign/accumulation/freq), `analysis/chart/index/{code}`, `analysis/chart/multi-time/{code}?timeframe` (1/5/15/30/60/D/W/M), `analysis/intraday/{code}?market`, `analysis/intraday-data/{code}`, `analysis/intraday-index/{code}`, `analysis/order-book/{code}`, `analysis/queue/{code}?price&side` (order queue tracking), `analysis/running-trade/{code}` (tick-by-tick, filter date/type/orderby/volume/price/time)

### Bandarmology tambahan
`analysis/summary/broker/{code}` (kebalikan dari yang dipakai — by kode broker), `analysis/inventory-chart/stock|broker/{code}`, `analysis/momentum-chart/{code}`, `analysis/intraday-inventory-chart/{code}`, `analysis/sankey-chart/{code}` (visualisasi aliran dana), `analysis/stalker/broker/{broker}/{stock}`, `analysis/stalker/list/{code}`, `analysis/stalker/sector?from&to&base&limit&filter`, `analysis/sector/rotation?from&to` (yang sesungguhnya, lihat §4)

### Shareholder tambahan
`analysis/shareholder/{code}`, `shareholder-detail/{code}`, `shareholder-detail-one?code|name`, `shareholder/relation?code|name&depth&max_nodes&neighbors&min_percentage` (**graf jaringan relasi pemegang saham** — kandidat fitur baru menarik), `shareholder/high` (konsentrasi kepemilikan tinggi, semua emiten sekaligus — screener-like), `shareholder-insider`, `shareholder-above` (>5%), `shareholder-one` (>1%)

### Kalender resmi
`analysis/calendar?limit&page&code&type` (type: IPO/PUBLIC_EXPOSE/REVERSE/RIGHT/RUPS_RESULT/RUPS_SCHEDULE/SPLIT/WARRANT/BONUS/CONVERTION) — endpoint yang sesungguhnya untuk §4

### Harga historis
`analysis/price-diary/{code}`, `analysis/price-seasonality/{code}?range`, `analysis/price-table/{code}`, `analysis/time-table/{code}`

### List & Search
`analysis/list/stock|broker|index`, `search/stock?query&cursor`

### Berita & Disclosure
`posts/space/category/{code}/NEWS?page&limit`, `posts/space/category/{code}/REPORT?page&limit` (disclosure)

### Batch (hemat kuota, multi-kode sekaligus)
`batch/order-book/{code}`, `batch/intraday-data/{code}`, `batch/intraday-index/{code}` — ⚠️ deskripsi resmi menyebut "maks 3 kode plan MAX / 10 kode plan ELITE", nama plan ini **tidak cocok dengan "Advance"**. **Belum diverifikasi** apakah batch tersedia untuk plan Advance — perlu dicek langsung atau tanya support Invezgo sebelum dibangun fiturnya.

### Personal (data akun Invezgo pribadi, bukan data pasar)
`watchlists?group=null`, `watchlists/{id}`, `journals?from&to`, `journals/summary`, `portfolios`, `portfolios/summary`, `trades?from&to`, `trades/summary`, `trades/summary-chart` — hanya relevan kalau MoneyWatch Pro mau fitur "hubungkan akun Invezgo Anda" untuk sinkron watchlist/portfolio pribadi pengguna, bukan untuk data screener pasar publik.

### Catatan kecil — path top-movers
Source resmi MCP memanggil top-movers via `users/top/change|foreign|accumulation` (prefix `users/`), sedangkan `lib/invezgo-client.js` yang sudah terbukti jalan pakai `analysis/top/accumulation|foreign` (prefix `analysis/`). Kemungkinan dua-duanya valid alias di sisi server Invezgo. **Jangan diubah** — kode yang ada sudah terverifikasi bekerja lewat "Test Request" resmi di docs Invezgo (lihat `INCIDENT_LOG.md` 2026-09-17).

---

## 6. Rekomendasi Prioritas untuk Perbaikan Aplikasi

Urutan berdasarkan nilai tambah vs risiko, bukan keputusan final — perlu persetujuan Anda sebelum implementasi:

1. **Screener (§1)** — nilai tambah tertinggi, fitur yang secara eksplisit diminta user MoneyWatch Pro biasanya cari ("cari saham PER < 15 & ROE > 15"). Sebelum dibangun: (a) validasi nama field lengkap satu-satu terhadap `analysis/keystat` sebagai referensi silang (§2), (b) bangun rate-limiter khusus karena throttle-nya lebih ketat dari endpoint lain, (c) JANGAN percaya field yang belum tervalidasi — risiko "matched:true palsu" (lihat kotak bahaya di §1) bisa membuat hasil screener salah total tanpa terlihat error.
2. **`analysis/financial-statement/{code}`** — sudah dicatat sebagai "terpakai" tapi ternyata belum. Kalau memang dibutuhkan (mis. untuk halaman detail saham), perlu diimplementasikan dari nol, bukan cuma diperbaiki.
3. **`analysis/calendar`** resmi — kalau tujuannya benar-benar data dari Invezgo (bukan idx.co.id), fitur kalender dividen saat ini perlu diganti sumbernya. Kalau idx.co.id sudah cukup, biarkan seperti sekarang dan cukup luruskan dokumentasi/catatan internal supaya tidak dikira "pakai Invezgo".
4. **`analysis/sector/rotation`** (path benar, dengan slash) — kalau fitur "Sectoral Insight" memang dimaksudkan pakai data rotasi sektor Invezgo, ini endpoint yang perlu dipanggil, bukan `/api/sectoral-news`.
5. **`shareholder/high`** dan **`shareholder/relation`** — dua endpoint screener-like/graph yang belum tereksplorasi, berpotensi jadi fitur baru "saham dengan konsentrasi kepemilikan tinggi" dan "peta jaringan pemegang saham" tanpa perlu scan manual 958 ticker.
6. **Batch endpoints** — cek dulu ketersediaan di plan Advance sebelum dibangun; kalau tersedia, bisa menghemat kuota signifikan untuk fitur yang butuh data banyak saham sekaligus (order book, intraday) dibanding pola "1 ticker = 1 quota unit" yang sudah dioptimalkan `lib/invezgo-client.js` untuk broker summary.

---

## Lampiran — Bukti Mentah

Raw output curl dari sesi verifikasi live (18 Sep 2026) ada di folder scratchpad sesi Claude Code (`...\tasks\be43aflc9.output`, `...\tasks\b2i72xjwg.output`, `...\tool-results\bm5jiq0if.txt`) — **folder ini sementara dan bisa hilang**, jangan diandalkan sebagai arsip; semua contoh JSON penting sudah disalin apa adanya ke §1 dan §2 di atas. Source code lengkap client MCP resmi (hasil extract `invezgo-mcp.mcpb`) ada di `%TEMP%\claude-invezgo-mcp\dist\` selama sesi ini berjalan — kalau perlu dirujuk ulang nanti, extract ulang dari file `Downloads\invezgo-mcp.mcpb` yang sudah Anda simpan.
