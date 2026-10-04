/**
 * test_accumulation_backtest.js — inti statistik backtest akumulasi (lib/backtest/accumulation-backtest.js).
 * Fokus: (1) tidak ada look-ahead, (2) pemilihan sinyal benar, (3) VALIDITAS PENGUJINYA SENDIRI: edge yang
 * ditanam harus terdeteksi, noise murni tidak boleh menghasilkan "edge" palsu, edge yang lebih kecil dari
 * biaya tidak boleh lolos, dan kontrol distribusi berperilaku benar.
 */

import assert from 'assert';
import {
  DEFAULT_CONFIG, mulberry32, mean, median, trimmedMean, percentile, blockBootstrapMeanCI,
  buildCalendarIndex, executeTrade, selectSignals, liquidUniverse, runAccumulationBacktest
} from './lib/backtest/accumulation-backtest.js';

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try { fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

// ── data sintetis ──────────────────────────────────────────────────────────
function makeCalendar(n) {
  const out = []; const d = new Date('2025-01-01T00:00:00Z');
  while (out.length < n) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); }
  return out;
}

/**
 * @param {number} seed
 * @param {'none'|'edge'|'negative'} plant  hubungan skor akumulasi dengan return MASA DEPAN (ditanam sengaja)
 * @param {number} edgeStrength  bobot return masa depan pada skor
 */
function makeWorld({ seed, plant = 'none', edgeStrength = 1, nDays = 360, nTickers = 80, horizon = 10, drift = 0 }) {
  const rng = mulberry32(seed);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const calendar = makeCalendar(nDays);
  const codes = Array.from({ length: nTickers }, (_, i) => 'T' + String(i).padStart(2, '0'));
  const prices = {};
  codes.forEach((c) => {
    let px = 1000 + rng() * 1000; const s = {};
    calendar.forEach((d) => {
      const o = px * (1 + gauss() * 0.004);
      px = px * (1 + drift + gauss() * 0.015);
      s[d] = { o: Math.round(o * 100) / 100, c: Math.round(px * 100) / 100 };
    });
    prices[c] = s;
  });
  const indexSeries = {}; let ix = 6000;
  calendar.forEach((d) => { const o = ix; ix *= 1 + gauss() * 0.008; indexSeries[d] = { o, c: ix }; });
  const calIdx = buildCalendarIndex(calendar);
  const days = [];
  for (let i = 3; i < nDays - horizon - 2; i++) {
    const date = calendar[i];
    const rows = codes.map((c) => {
      const t = executeTrade(prices[c], calendar, calIdx, date, horizon);
      const fut = t ? t.gross * 100 : 0;
      let s = gauss();
      if (plant === 'edge') s += edgeStrength * fut;
      if (plant === 'negative') s -= edgeStrength * fut;
      return { c, s, v: 5e9 };
    });
    rows.sort((a, b) => b.s - a.s);
    const half = Math.floor(rows.length / 2);
    days.push({ date, accum: rows.slice(0, half).map((r) => ({ c: r.c, s: Math.abs(r.s) + 0.01, v: r.v })), dist: rows.slice(half).map((r) => ({ c: r.c, s: -Math.abs(r.s) - 0.01, v: r.v })) });
  }
  return { days, ctx: { prices, calendar, calIdx, indexSeries } };
}

const FAST = { topKs: [10], horizons: [10], bootstrapIters: 600, minDates: 100 };

console.log('🧪 BACKTEST AKUMULASI — INTI STATISTIK');

// ── eksekusi trade ─────────────────────────────────────────────────────────
test('executeTrade: entry = BUKA hari berikutnya, exit = TUTUP hari ke-h; harga hari sinyal tidak dipakai (tanpa look-ahead)', () => {
  const cal = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12'];
  const series = {
    '2026-01-05': { o: 100, c: 9999 }, // hari sinyal: close konyol, TIDAK boleh berpengaruh
    '2026-01-06': { o: 100, c: 101 }, '2026-01-07': { o: 101, c: 102 }, '2026-01-08': { o: 102, c: 110 }, '2026-01-09': { o: 110, c: 120 }, '2026-01-12': { o: 120, c: 130 }
  };
  const idx = buildCalendarIndex(cal);
  const t = executeTrade(series, cal, idx, '2026-01-05', 3);
  assert.strictEqual(t.entryDate, '2026-01-06');
  assert.strictEqual(t.exitDate, '2026-01-08');
  assert.strictEqual(t.entry, 100);
  assert.strictEqual(t.exit, 110);
  assert.strictEqual(Math.round(t.gross * 1000) / 1000, 0.1);
  assert(t.entryDate > '2026-01-05', 'entry harus setelah tanggal sinyal');
});

test('executeTrade: null bila di luar kalender, melewati akhir data, bar hilang, atau harga tidak valid', () => {
  const cal = ['2026-01-05', '2026-01-06', '2026-01-07'];
  const idx = buildCalendarIndex(cal);
  const ok = { '2026-01-05': { o: 1, c: 1 }, '2026-01-06': { o: 1, c: 1 }, '2026-01-07': { o: 1, c: 1 } };
  assert.strictEqual(executeTrade(ok, cal, idx, '2099-01-01', 1), null, 'tanggal tak dikenal');
  assert.strictEqual(executeTrade(ok, cal, idx, '2026-01-06', 5), null, 'exit melewati akhir data');
  assert.strictEqual(executeTrade({ '2026-01-05': { o: 1, c: 1 }, '2026-01-07': { o: 1, c: 1 } }, cal, idx, '2026-01-05', 2), null, 'bar entry hilang (emiten tidak diperdagangkan)');
  assert.strictEqual(executeTrade({ '2026-01-06': { o: 0, c: 1 }, '2026-01-07': { o: 1, c: 1 } }, cal, idx, '2026-01-05', 2), null, 'harga entry 0');
  assert.strictEqual(executeTrade(null, cal, idx, '2026-01-05', 1), null);
});

// ── pemilihan sinyal ───────────────────────────────────────────────────────
test('selectSignals: filter likuiditas, urutan skor (akumulasi desc, distribusi paling negatif dulu), batas top-K', () => {
  const day = {
    accum: [{ c: 'A', s: 5, v: 5e9 }, { c: 'B', s: 9, v: 2e8 }, { c: 'C', s: 7, v: 3e9 }, { c: 'D', s: 1, v: 2e9 }],
    dist: [{ c: 'X', s: -2, v: 5e9 }, { c: 'Y', s: -9, v: 5e9 }, { c: 'Z', s: -5, v: 1e8 }]
  };
  assert.deepStrictEqual(selectSignals(day, 'accum', 2, 1e9).map((r) => r.c), ['C', 'A'], 'B (likuiditas rendah) dibuang, urut skor desc');
  assert.deepStrictEqual(selectSignals(day, 'dist', 5, 1e9).map((r) => r.c), ['Y', 'X'], 'Z dibuang; paling negatif dulu');
  assert.deepStrictEqual(liquidUniverse(day, 1e9).sort(), ['A', 'C', 'D', 'X', 'Y']);
});

// ── statistik dasar ────────────────────────────────────────────────────────
test('statistik: median, trimmed mean, percentile, RNG deterministik', () => {
  assert.strictEqual(median([5, 1, 3]), 3);
  assert.strictEqual(median([1, 2, 3, 4]), 2.5);
  assert.strictEqual(percentile([0, 10], 0.5), 5);
  assert.strictEqual(trimmedMean([1, 2, 3, 4, 100], 0.2), 3, 'outlier 100 dibuang');
  assert.strictEqual(mean([]), null);
  const a = mulberry32(42), b = mulberry32(42);
  assert.deepStrictEqual([a(), a(), a()], [b(), b(), b()]);
});

test('block bootstrap: CI deterministik, mencakup rata-rata sebenarnya, dan lebar untuk sampel kecil', () => {
  const rng1 = mulberry32(7), rng2 = mulberry32(7);
  const gen = mulberry32(99);
  const series = Array.from({ length: 300 }, () => (gen() - 0.5) * 4 + 1); // rata-rata sebenarnya +1
  const ci1 = blockBootstrapMeanCI(series, 5, 800, 0.99, rng1);
  const ci2 = blockBootstrapMeanCI(series, 5, 800, 0.99, rng2);
  assert.deepStrictEqual(ci1, ci2, 'seed sama => CI sama');
  assert(ci1.low < 1 && ci1.high > 1, `CI [${ci1.low}, ${ci1.high}] harus mencakup 1`);
  const small = blockBootstrapMeanCI(series.slice(0, 15), 5, 800, 0.99, mulberry32(7));
  assert((small.high - small.low) > (ci1.high - ci1.low), 'sampel lebih kecil => CI lebih lebar');
});

// ── validitas penguji ──────────────────────────────────────────────────────
test('VALIDITAS: edge yang SENGAJA DITANAM terdeteksi (EDGE_TERBUKTI) dan kontrol distribusi tidak ikut unggul', () => {
  const { days, ctx } = makeWorld({ seed: 11, plant: 'edge', edgeStrength: 0.8 });
  const r = runAccumulationBacktest(days, ctx, FAST);
  assert.strictEqual(r.primary[0].verdict, 'EDGE_TERBUKTI', r.primary[0].reason);
  assert.strictEqual(r.overall, 'ADA_INDIKASI_EDGE');
  assert(r.primary[0].meanExcessVsUniversePct > 1, 'excess ditanam harus terukur positif: ' + r.primary[0].meanExcessVsUniversePct);
  assert.strictEqual(r.controlOutperformsCount, 0, 'distribusi (skor terendah) tidak boleh terbukti unggul');
  assert(r.control[0].meanExcessVsUniversePct < 0, 'kontrol distribusi harus berkinerja di bawah pasar');
});

test('VALIDITAS: noise murni TIDAK menghasilkan "edge" palsu (10 dunia acak, 0 positif palsu)', () => {
  let falsePositives = 0;
  for (let seed = 101; seed <= 110; seed++) {
    const { days, ctx } = makeWorld({ seed, plant: 'none' });
    const r = runAccumulationBacktest(days, ctx, FAST);
    if (r.primary[0].verdict === 'EDGE_TERBUKTI') falsePositives++;
    assert(r.primary[0].verdict !== 'DATA_KURANG', 'sampel harus cukup');
  }
  assert.strictEqual(falsePositives, 0, `${falsePositives} dari 10 dunia acak keliru dinyatakan punya edge`);
});

test('VALIDITAS: sinyal yang berkebalikan (skor berlawanan dengan return) => NEGATIF, kontrol distribusi justru unggul', () => {
  const { days, ctx } = makeWorld({ seed: 21, plant: 'negative', edgeStrength: 0.8 });
  const r = runAccumulationBacktest(days, ctx, FAST);
  assert.strictEqual(r.primary[0].verdict, 'NEGATIF', r.primary[0].reason);
  assert.strictEqual(r.overall, 'NEGATIF');
  assert(r.controlOutperformsCount >= 1, 'distribusi harus tampak unggul pada dunia berkebalikan');
});

test('VALIDITAS: edge kecil (±0,8%) terdeteksi tanpa biaya, tetapi TIDAK lolos bila biaya transaksi melebihinya', () => {
  const { days, ctx } = makeWorld({ seed: 31, plant: 'edge', edgeStrength: 0.02 }); // ditanam: excess kotor ±0,8%
  const free = runAccumulationBacktest(days, ctx, { ...FAST, roundTripCostPct: 0 }).primary[0];
  const costly = runAccumulationBacktest(days, ctx, { ...FAST, roundTripCostPct: 1.5 }).primary[0];
  assert(free.meanExcessVsUniversePct > 0.5 && free.meanExcessVsUniversePct < 1.2, 'excess kotor ditanam ±0,8%: ' + free.meanExcessVsUniversePct);
  assert.strictEqual(free.verdict, 'EDGE_TERBUKTI', 'penguji harus cukup sensitif untuk edge ±0,8% tanpa biaya');
  assert(Math.abs((free.meanNetPct - costly.meanNetPct) - 1.5) < 0.01, 'biaya 1,5 poin harus mengurangi return bersih tepat 1,5 poin');
  assert.notStrictEqual(costly.verdict, 'EDGE_TERBUKTI', 'edge yang habis oleh biaya tidak boleh dinyatakan terbukti');
});

test('VALIDITAS: sampel terlalu sedikit => DATA_KURANG (bukan kesimpulan)', () => {
  const { days, ctx } = makeWorld({ seed: 41, plant: 'edge', edgeStrength: 0.8, nDays: 140 });
  const r = runAccumulationBacktest(days.slice(0, 50), ctx, FAST);
  assert.strictEqual(r.primary[0].verdict, 'DATA_KURANG');
  assert.strictEqual(r.overall, 'DATA_KURANG');
});

test('pembanding & statistik: excess = net - rata-rata pasar; sinyal tak bisa dieksekusi dihitung terpisah; Bonferroni memperlebar CI', () => {
  const { days, ctx } = makeWorld({ seed: 51, plant: 'none' });
  delete ctx.prices['T03']; // emiten tanpa riwayat harga => tidak dapat dieksekusi
  const r1 = runAccumulationBacktest(days, ctx, { ...FAST, topKs: [30] });
  assert(r1.primary[0].skippedNotExecutable > 0, 'T03 harus dihitung sebagai tidak dapat dieksekusi');
  const one = runAccumulationBacktest(days, ctx, { ...FAST, topKs: [10], horizons: [10] }).primary[0];
  const six = runAccumulationBacktest(days, ctx, { ...FAST, topKs: [10, 30], horizons: [5, 10, 20] }).primary.find((v) => v.variant.topK === 10 && v.variant.horizon === 10);
  assert(six.ci.level > one.ci.level, 'koreksi Bonferroni (6 varian) harus menaikkan tingkat kepercayaan CI');
  assert.strictEqual(DEFAULT_CONFIG.topKs.length * DEFAULT_CONFIG.horizons.length, 6);
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} ACCUMULATION BACKTEST TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
