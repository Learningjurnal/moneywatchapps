import { ROUND_TRIP_COST_PCT } from './costs.js';
/**
 * lib/backtest/accumulation-backtest.js — inti statistik backtest "akumulasi bandar" (murni, tanpa I/O).
 *
 * Pertanyaan yang dijawab (2026-10-04): apakah emiten yang muncul di peringkat top-akumulasi
 * Invezgo pada hari D benar-benar mengungguli pasar sesudahnya, setelah biaya transaksi?
 *
 * Disiplin kejujuran (ditetapkan SEBELUM melihat hasil, supaya tidak ada p-hacking):
 *  - TANPA look-ahead: sinyal dari data EOD hari D; entry = harga BUKA hari bursa berikutnya (D+1),
 *    keluar = harga TUTUP hari ke-h (D+h). Nilai harga D sendiri tidak dipakai untuk apa pun.
 *  - Dua pembanding: IHSG, dan rata-rata SELURUH emiten likuid hari yang sama (equal-weight, entry/exit
 *    identik). Pembanding kedua menghilangkan bias ukuran: IHSG berbobot kapitalisasi, sedangkan
 *    akumulasi cenderung memilih emiten kecil.
 *  - Varian ditetapkan di muka (K x horizon); ambang kepercayaan dikoreksi Bonferroni untuk jumlah varian.
 *  - Kontrol negatif: top-DISTRIBUSI harus berkinerja lebih buruk dari pasar bila sinyalnya bermakna.
 *  - Statistik tahan outlier: median, trimmed mean, interval kepercayaan block-bootstrap per TANGGAL
 *    (sinyal pada tanggal berdekatan berbagi jendela kembalian, bukan sampel independen).
 *  - Verdict "EDGE_TERBUKTI" hanya bila batas bawah CI > 0, median excess > 0, dan kedua paruh periode > 0.
 */

export const DEFAULT_CONFIG = Object.freeze({
  topKs: [10, 30],
  horizons: [5, 10, 20],
  minValueRp: 1e9,          // filter likuiditas: nilai transaksi hari sinyal >= Rp 1 miliar
  roundTripCostPct: ROUND_TRIP_COST_PCT,    // ASUMSI biaya beli+jual (fee broker + pajak jual), dalam persen
  trimPct: 0.05,
  bootstrapIters: 2000,
  seed: 20261004,
  alpha: 0.05,              // sebelum koreksi Bonferroni
  minDates: 100
});

// ── utilitas statistik ────────────────────────────────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(a) {
  return percentile([...a].sort((x, y) => x - y), 0.5);
}

export function trimmedMean(a, pct) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const cut = Math.floor(s.length * pct);
  const kept = s.slice(cut, s.length - cut);
  return mean(kept.length ? kept : s);
}

/** Moving block bootstrap rata-rata seri berurutan (mempertahankan autokorelasi jangka pendek). */
export function blockBootstrapMeanCI(series, blockLen, iters, level, rng) {
  const n = series.length;
  if (n === 0) return { low: null, high: null, level };
  const L = Math.max(1, Math.min(blockLen, n));
  const means = new Array(iters);
  for (let b = 0; b < iters; b++) {
    let sum = 0, count = 0;
    while (count < n) {
      const start = Math.floor(rng() * (n - L + 1));
      for (let j = 0; j < L && count < n; j++) { sum += series[start + j]; count++; }
    }
    means[b] = sum / n;
  }
  means.sort((x, y) => x - y);
  const tail = (1 - level) / 2;
  return { low: percentile(means, tail), high: percentile(means, 1 - tail), level };
}

// ── eksekusi trade (tanpa look-ahead) ──────────────────────────────────────
export function buildCalendarIndex(calendar) {
  const idx = new Map();
  calendar.forEach((d, i) => idx.set(d, i));
  return idx;
}

/**
 * Entry = BUKA hari bursa setelah tanggal sinyal; exit = TUTUP hari ke-`horizon` (hari entry = hari ke-1).
 * @param {Object<string,{o:number,c:number}>} series  bar harga emiten per tanggal
 * @returns {{entryDate:string, exitDate:string, entry:number, exit:number, gross:number}|null}
 *   null bila tidak bisa dieksekusi (tanggal di luar kalender, tanpa bar entry/exit, harga tidak valid).
 */
export function executeTrade(series, calendar, calIdx, signalDate, horizon) {
  if (!series) return null;
  const i = calIdx.get(signalDate);
  if (i === undefined) return null;
  const entryIdx = i + 1;
  const exitIdx = i + horizon;
  if (exitIdx >= calendar.length || entryIdx > exitIdx) return null;
  const entryDate = calendar[entryIdx];
  const exitDate = calendar[exitIdx];
  const e = series[entryDate];
  const x = series[exitDate];
  if (!e || !x || !(e.o > 0) || !(x.c > 0)) return null;
  return { entryDate, exitDate, entry: e.o, exit: x.c, gross: x.c / e.o - 1 };
}

// ── pemilihan sinyal ───────────────────────────────────────────────────────
/**
 * @param {{accum:Array<{c:string,s:number,v:number}>, dist:Array<{c:string,s:number,v:number}>}} day
 * kind 'accum': skor terbesar dulu; 'dist': skor terkecil (paling negatif) dulu.
 */
export function selectSignals(day, kind, topK, minValueRp) {
  const rows = (kind === 'dist' ? day.dist : day.accum).filter((r) => r.v >= minValueRp && Number.isFinite(r.s));
  rows.sort((a, b) => (kind === 'dist' ? a.s - b.s : b.s - a.s));
  return rows.slice(0, topK);
}

/** Semua emiten likuid yang muncul pada hari itu (akumulasi atau distribusi) = pembanding "pasar". */
export function liquidUniverse(day, minValueRp) {
  const seen = new Set();
  const out = [];
  day.accum.concat(day.dist).forEach((r) => {
    if (r.v >= minValueRp && !seen.has(r.c)) { seen.add(r.c); out.push(r.c); }
  });
  return out;
}

// ── evaluasi satu varian ───────────────────────────────────────────────────
/**
 * @param {Array<{date:string, accum:Array, dist:Array}>} days
 * @param {{prices:Object, calendar:string[], calIdx:Map, indexSeries:Object<string,{o:number,c:number}>}} ctx
 */
export function evaluateVariant(days, ctx, { kind, topK, horizon }, config, universeCache) {
  const cost = config.roundTripCostPct;
  const signals = [];
  const perDate = [];
  let skipped = 0;

  days.forEach((day) => {
    const uKey = day.date + '|' + horizon;
    let uMean = universeCache.get(uKey);
    if (uMean === undefined) {
      const rets = [];
      liquidUniverse(day, config.minValueRp).forEach((code) => {
        const t = executeTrade(ctx.prices[code], ctx.calendar, ctx.calIdx, day.date, horizon);
        if (t) rets.push(t.gross);
      });
      uMean = rets.length >= 20 ? mean(rets) : null; // pembanding butuh minimal 20 emiten
      universeCache.set(uKey, uMean);
    }
    if (uMean === null) return;

    const idxTrade = executeTrade(ctx.indexSeries, ctx.calendar, ctx.calIdx, day.date, horizon);
    const dayRows = [];
    selectSignals(day, kind, topK, config.minValueRp).forEach((r) => {
      const t = executeTrade(ctx.prices[r.c], ctx.calendar, ctx.calIdx, day.date, horizon);
      if (!t) { skipped++; return; }
      const net = t.gross * 100 - cost;
      const excess = net - uMean * 100;
      const row = { date: day.date, code: r.c, grossPct: t.gross * 100, netPct: net, excessPct: excess, excessVsIndexPct: idxTrade ? net - idxTrade.gross * 100 : null };
      signals.push(row);
      dayRows.push(row);
    });
    if (dayRows.length) {
      perDate.push({ date: day.date, n: dayRows.length, meanNetPct: mean(dayRows.map((x) => x.netPct)), meanExcessPct: mean(dayRows.map((x) => x.excessPct)) });
    }
  });
  return { signals, perDate, skipped };
}

// ── ringkasan + verdict ────────────────────────────────────────────────────
export function summarizeVariant({ signals, perDate, skipped }, horizon, config, numPrimaryVariants) {
  const net = signals.map((s) => s.netPct);
  const exc = signals.map((s) => s.excessPct);
  const sortedNet = [...net].sort((a, b) => a - b);
  const dateExcess = perDate.map((d) => d.meanExcessPct);
  const level = 1 - config.alpha / Math.max(1, numPrimaryVariants); // koreksi Bonferroni
  const rng = mulberry32(config.seed + horizon);
  const ci = blockBootstrapMeanCI(dateExcess, horizon, config.bootstrapIters, level, rng);

  const half = Math.floor(dateExcess.length / 2);
  const firstHalf = mean(dateExcess.slice(0, half));
  const secondHalf = mean(dateExcess.slice(half));
  const positives = net.filter((x) => x > 0).sort((a, b) => b - a);
  const posSum = positives.reduce((a, b) => a + b, 0);
  const top5Share = posSum > 0 ? positives.slice(0, 5).reduce((a, b) => a + b, 0) / posSum * 100 : null;
  const vsIdx = signals.map((s) => s.excessVsIndexPct).filter(Number.isFinite);

  const medExcess = median(exc);
  let verdict, reason;
  if (perDate.length < config.minDates) {
    verdict = 'DATA_KURANG';
    reason = `Hanya ${perDate.length} tanggal bersinyal (< ${config.minDates}).`;
  } else if (ci.low > 0 && medExcess > 0 && firstHalf > 0 && secondHalf > 0) {
    verdict = 'EDGE_TERBUKTI';
    reason = `Batas bawah CI ${ (level * 100).toFixed(1) }% = ${ci.low.toFixed(2)}% > 0, median excess ${medExcess.toFixed(2)}% > 0, dan kedua paruh periode positif.`;
  } else if (ci.high < 0) {
    verdict = 'NEGATIF';
    reason = `Batas atas CI = ${ci.high.toFixed(2)}% < 0: sinyal berkinerja LEBIH BURUK dari rata-rata pasar likuid.`;
  } else {
    verdict = 'TIDAK_TERBUKTI';
    const fails = [];
    if (!(ci.low > 0)) fails.push(`CI ${(level * 100).toFixed(1)}% mencakup 0 (${ci.low.toFixed(2)}% s/d ${ci.high.toFixed(2)}%)`);
    if (!(medExcess > 0)) fails.push(`median excess ${medExcess.toFixed(2)}% <= 0`);
    if (!(firstHalf > 0 && secondHalf > 0)) fails.push(`paruh periode tidak konsisten (${firstHalf.toFixed(2)}% / ${secondHalf.toFixed(2)}%)`);
    reason = fails.join('; ') + '.';
  }

  const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
  return {
    nSignals: signals.length,
    nDates: perDate.length,
    skippedNotExecutable: skipped,
    meanNetPct: r2(mean(net)),
    medianNetPct: r2(median(net)),
    trimmedMeanNetPct: r2(trimmedMean(net, config.trimPct)),
    winRatePct: net.length ? r2(net.filter((x) => x > 0).length / net.length * 100) : null,
    p10NetPct: r2(percentile(sortedNet, 0.1)),
    p90NetPct: r2(percentile(sortedNet, 0.9)),
    meanExcessVsUniversePct: r2(mean(exc)),
    medianExcessVsUniversePct: r2(medExcess),
    pctSignalsBeatUniverse: exc.length ? r2(exc.filter((x) => x > 0).length / exc.length * 100) : null,
    meanExcessVsIndexPct: r2(mean(vsIdx)),
    medianExcessVsIndexPct: r2(median(vsIdx)),
    dateMeanExcessPct: r2(mean(dateExcess)),
    ci: { low: r2(ci.low), high: r2(ci.high), level: r2(level * 100) },
    halves: { first: r2(firstHalf), second: r2(secondHalf) },
    top5SharePositivePct: r2(top5Share),
    verdict,
    reason
  };
}

/** Jalankan seluruh varian primer (akumulasi) + kontrol negatif (distribusi). */
export function runAccumulationBacktest(days, ctx, userConfig) {
  const config = { ...DEFAULT_CONFIG, ...(userConfig || {}) };
  const universeCache = new Map();
  const primary = [];
  const control = [];
  config.topKs.forEach((k) => config.horizons.forEach((h) => primary.push({ kind: 'accum', topK: k, horizon: h })));
  config.topKs.forEach((k) => config.horizons.forEach((h) => control.push({ kind: 'dist', topK: k, horizon: h })));

  const run = (v, m) => ({ variant: v, ...summarizeVariant(evaluateVariant(days, ctx, v, config, universeCache), v.horizon, config, m) });
  const primaryResults = primary.map((v) => run(v, primary.length));
  const controlResults = control.map((v) => run(v, primary.length));

  const anyEdge = primaryResults.some((r) => r.verdict === 'EDGE_TERBUKTI');
  const anyNegative = primaryResults.some((r) => r.verdict === 'NEGATIF');
  let overall;
  if (anyEdge) overall = 'ADA_INDIKASI_EDGE';
  else if (primaryResults.every((r) => r.verdict === 'DATA_KURANG')) overall = 'DATA_KURANG';
  else if (anyNegative && !primaryResults.some((r) => r.verdict === 'TIDAK_TERBUKTI')) overall = 'NEGATIF';
  else overall = 'TIDAK_TERBUKTI';

  // Sanity check kontrol: bila akumulasi tampak punya edge, distribusi seharusnya TIDAK ikut unggul.
  const controlOutperforms = controlResults.filter((r) => r.verdict === 'EDGE_TERBUKTI').length;
  return { config, overall, primary: primaryResults, control: controlResults, controlOutperformsCount: controlOutperforms };
}
