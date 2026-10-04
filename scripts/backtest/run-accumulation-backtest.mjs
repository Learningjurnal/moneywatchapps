/**
 * scripts/backtest/run-accumulation-backtest.mjs
 *
 * Backtest 2 tahun: apakah emiten top-akumulasi Invezgo (per hari) mengungguli pasar setelah biaya?
 * Statistik ada di lib/backtest/accumulation-backtest.js (diuji di test_accumulation_backtest.js).
 *
 * Jalankan (butuh INVEZGO_API_KEY; memakai ±1 unit kuota Invezgo per tanggal, sekali jalan, di-cache di disk):
 *   node --env-file=.env scripts/backtest/run-accumulation-backtest.mjs [--days 500] [--out data/backtests/accumulation-backtest.json]
 *
 * Sengaja TIDAK memakai Redis produksi (cache disk lokal di .cache/backtest/, di-gitignore) supaya tidak
 * menulis ke data produksi. Konsekuensi: pemakaian kuota tidak tercatat di quota manager produksi.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const NUM_DAYS = Number(arg('days', 500));
const OUT = path.resolve(ROOT, arg('out', 'data/backtests/accumulation-backtest.json'));
const CACHE = path.join(ROOT, '.cache', 'backtest');
const MAX_HORIZON = 20;

const { runAccumulationBacktest, buildCalendarIndex, DEFAULT_CONFIG } = await import(new URL('../../lib/backtest/accumulation-backtest.js', import.meta.url));
const inv = await import(new URL('../../lib/invezgo-client.js', import.meta.url));

fs.mkdirSync(path.join(CACHE, 'accum'), { recursive: true });
fs.mkdirSync(path.join(CACHE, 'px'), { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function pool(items, concurrency, worker) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; results[i] = await worker(items[i], i); }
  }));
  return results;
}

// ── Yahoo: harian 3 tahun ───────────────────────────────────────────────────
async function yahooDaily(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3y`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36' }, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return { ok: false, reason: 'NOT_FOUND' };
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      if (!r.ok) return { ok: false, reason: 'HTTP_' + r.status };
      const j = await r.json();
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp) return { ok: false, reason: 'NO_DATA' };
      const q = res.indicators.quote[0];
      const bars = [];
      res.timestamp.forEach((t, i) => {
        if (q.close[i] == null) return;
        bars.push([new Date(t * 1000).toISOString().slice(0, 10), q.open[i] == null ? null : q.open[i], q.close[i]]);
      });
      return { ok: true, bars };
    } catch (e) { await sleep(1000 * (attempt + 1)); }
  }
  return { ok: false, reason: 'RETRIES_EXHAUSTED' };
}

const toSeries = (bars) => { const s = {}; bars.forEach(([d, o, c]) => { s[d] = { o, c }; }); return s; };

// 1) kalender bursa + deret IHSG
log('Mengambil kalender bursa (^JKSE 3 tahun)…');
const ihsg = await yahooDaily('^JKSE');
if (!ihsg.ok) { console.error('Gagal mengambil ^JKSE:', ihsg.reason); process.exit(1); }
const calendar = ihsg.bars.map((b) => b[0]);
const indexSeries = toSeries(ihsg.bars.map(([d, o, c]) => [d, o == null ? c : o, c]));
const calIdx = buildCalendarIndex(calendar);
const signalDates = calendar.slice(Math.max(0, calendar.length - MAX_HORIZON - NUM_DAYS), calendar.length - MAX_HORIZON);
log(`Kalender ${calendar.length} hari bursa; tanggal sinyal ${signalDates.length} (${signalDates[0]} .. ${signalDates[signalDates.length - 1]}).`);

// 2) peringkat akumulasi Invezgo per tanggal (cache disk)
async function loadDay(date) {
  const f = path.join(CACHE, 'accum', date + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await inv.fetchInvezgoTopMovers('accumulation', date);
    if (res.ok || res.reason === 'HTTP_422') break;
    await sleep(2000 * (attempt + 1));
  }
  const compact = res.ok
    ? { date, ok: true, accum: res.accum.map((r) => ({ c: String(r.code).toUpperCase(), s: Number(r.calculated_value), v: Number(r.value) })), dist: res.dist.map((r) => ({ c: String(r.code).toUpperCase(), s: Number(r.calculated_value), v: Number(r.value) })) }
    : { date, ok: false, reason: res.reason };
  if (res.ok || res.reason === 'HTTP_422') fs.writeFileSync(f, JSON.stringify(compact)); // kegagalan sementara tidak di-cache
  return compact;
}

log('Mengambil peringkat akumulasi Invezgo per tanggal (cache disk; ±1 unit kuota per tanggal baru)…');
let done = 0;
const dayResults = await pool(signalDates, 4, async (date) => {
  const d = await loadDay(date);
  if (++done % 50 === 0) log(`  ${done}/${signalDates.length} tanggal`);
  return d;
});
const okDays = dayResults.filter((d) => d.ok);
const transientFail = dayResults.filter((d) => !d.ok && d.reason !== 'HTTP_422');
log(`Tanggal berdata: ${okDays.length}; tanpa data (422/libur): ${dayResults.length - okDays.length - transientFail.length}; gagal sementara: ${transientFail.length}`);
if (transientFail.length > signalDates.length * 0.1) { console.error('Terlalu banyak kegagalan sementara; jalankan ulang (cache menyimpan yang sudah berhasil).'); process.exit(1); }

// 3) riwayat harga seluruh emiten yang pernah muncul
const codes = [...new Set(okDays.flatMap((d) => d.accum.concat(d.dist).map((r) => r.c)))].filter((c) => /^[A-Z0-9]{4}$/.test(c));
log(`Mengambil riwayat harga ${codes.length} emiten dari Yahoo…`);
let pxDone = 0;
const prices = {};
const noPrice = [];
await pool(codes, 6, async (code) => {
  const f = path.join(CACHE, 'px', code + '.json');
  let rec;
  if (fs.existsSync(f)) rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  else {
    rec = await yahooDaily(code + '.JK');
    if (rec.ok || rec.reason === 'NOT_FOUND') fs.writeFileSync(f, JSON.stringify(rec));
  }
  if (rec.ok) prices[code] = toSeries(rec.bars); else noPrice.push(code);
  if (++pxDone % 100 === 0) log(`  ${pxDone}/${codes.length} emiten`);
});
log(`Riwayat harga tersedia untuk ${Object.keys(prices).length}/${codes.length} emiten (${noPrice.length} tanpa riwayat, mis. sudah delisting).`);

// 4) backtest
log('Menjalankan backtest…');
const days = okDays.map((d) => ({ date: d.date, accum: d.accum, dist: d.dist })).sort((a, b) => (a.date < b.date ? -1 : 1));
const result = runAccumulationBacktest(days, { prices, calendar, calIdx, indexSeries }, {});

const universeSizes = days.map((d) => new Set(d.accum.concat(d.dist).map((r) => r.c)).size);
const output = {
  computedAt: new Date().toISOString(),
  question: 'Apakah emiten top-akumulasi Invezgo pada hari D mengungguli rata-rata emiten likuid sesudahnya, setelah biaya transaksi?',
  dataRange: { from: days[0].date, to: days[days.length - 1].date },
  coverage: {
    signalDatesRequested: signalDates.length,
    datesWithData: okDays.length,
    datesWithoutData: dayResults.length - okDays.length,
    tickersSeen: codes.length,
    tickersWithPriceHistory: Object.keys(prices).length,
    tickersWithoutPriceHistory: noPrice.length,
    avgUniverseSizePerDate: Math.round(universeSizes.reduce((a, b) => a + b, 0) / universeSizes.length)
  },
  config: result.config,
  overall: result.overall,
  primary: result.primary,
  control: result.control,
  controlOutperformsCount: result.controlOutperformsCount,
  methodology: [
    'Sinyal: emiten masuk top-K peringkat akumulasi Invezgo (urut calculated_value) pada hari D, nilai transaksi hari D >= Rp 1 miliar.',
    'Entry: harga BUKA hari bursa berikutnya (D+1). Exit: harga TUTUP hari ke-h (h = 5, 10, 20; hari entry = hari ke-1). Tidak ada data hari D+1 atau sesudahnya yang dipakai untuk memilih sinyal.',
    'Pembanding 1: rata-rata return emiten likuid yang muncul di daftar Invezgo pada hari yang sama (equal-weight, entry/exit identik). Pembanding 2: IHSG.',
    'Statistik: median, trimmed mean 5%, interval kepercayaan block-bootstrap per tanggal (blok = horizon), koreksi Bonferroni untuk 6 varian primer.',
    'Kontrol negatif: top-distribusi seharusnya berkinerja lebih buruk dari pasar bila peringkat Invezgo bermakna.',
    'Verdict EDGE_TERBUKTI hanya bila batas bawah CI > 0, median excess > 0, dan kedua paruh periode positif (aturan ditetapkan sebelum melihat hasil).'
  ],
  assumptions: [
    `Biaya transaksi bolak-balik ${DEFAULT_CONFIG.roundTripCostPct}% (ASUMSI fee beli + fee jual + pajak jual); slippage dan dampak harga TIDAK dimodelkan.`,
    'Harga dari Yahoo Finance (close disesuaikan split, tanpa dividen). Entry di harga buka dianggap bisa terisi penuh.',
    'Makna calculated_value Invezgo tidak terverifikasi dari dokumentasi; dipakai hanya sebagai urutan peringkat.'
  ],
  limitations: [
    'Bias penyintas: emiten yang sudah delisting tidak punya riwayat Yahoo, sehingga dikeluarkan — hasil cenderung terlalu optimistis, bukan sebaliknya.',
    'Akumulasi cenderung memilih emiten kecil/tidak likuid; filter Rp 1 miliar/hari mengurangi tetapi tidak menghapus risiko eksekusi.',
    'Satu rezim pasar (±2 tahun terakhir); hasil belum tentu berlaku di rezim lain.',
    'Retensi riwayat Invezgo terverifikasi sampai ±2 tahun (3 tahun menjawab 422).'
  ]
};
fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
log('Selesai. Hasil ditulis ke', path.relative(ROOT, OUT));
console.log('\nVERDICT KESELURUHAN:', output.overall, '| kontrol distribusi unggul pada', output.controlOutperformsCount, 'varian');
output.primary.forEach((r) => console.log(`  akum top${r.variant.topK} h${r.variant.horizon}: n=${r.nSignals} tgl=${r.nDates} | net rata ${r.meanNetPct}% median ${r.medianNetPct}% | excess vs pasar rata ${r.meanExcessVsUniversePct}% median ${r.medianExcessVsUniversePct}% | CI[${r.ci.low}, ${r.ci.high}] | ${r.verdict}`));
output.control.forEach((r) => console.log(`  DIST top${r.variant.topK} h${r.variant.horizon}: excess rata ${r.meanExcessVsUniversePct}% | CI[${r.ci.low}, ${r.ci.high}] | ${r.verdict}`));
