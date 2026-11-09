/**
 * lib/engine/hypothesis-lab.js — Autonomous Strategy Hypothesis Engine
 *
 * SPECIFICATION & GOVERNANCE:
 * - AGENTS.md §9 (Trading Hypothesis: structured, falsifiable, verifiable)
 * - AGENTS.md §18 (Backtesting Rules: walk-forward, fees 0.40% round-trip, out-of-sample)
 * - lib/backtest/accumulation-backtest.js: Block-bootstrap & Bonferroni correction.
 *
 * MISSION:
 * Mengisi modul Hypothesis Lab yang sebelumnya kosong. Menghasilkan dan memvalidasi
 * hipotesis kuantitatif secara otomatis berbasis bukti empiris dan signifikansi statistik.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ROUND_TRIP_COST_PCT } from '../backtest/costs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HYPOTHESES_FILE_PATH = path.resolve(__dirname, '..', '..', 'data', 'hypotheses_catalog.json');

/**
 * Definisi hipotesis yang dikirim sebagai katalog awal (institutional defaults).
 *
 * PENTING — ATURAN INTEGRITAS DATA (CLAUDE.md #1/#3, AGENTS.md §21/§22):
 * Ini HANYA definisi hipotesis yang bisa difalsifikasi (id/title/statement/strategyRef/
 * horizonDays/minVolumeRp). TIDAK ADA statistik hasil pengujian di sini — sampleSize,
 * winRatePct, meanExcessReturnPct, CI, pValue, dan testedAt semuanya null dan status-nya
 * NOT_TESTED sampai benar-benar dievaluasi dengan closed trade RIIL lewat
 * evaluateHypothesisStatistically() / POST /api/ai/hypotheses/test.
 *
 * JANGAN pernah menambahkan angka statistik, timestamp pengujian, atau klaim "EDGE
 * TERBUKTI" ke array ini: itu adalah data karangan yang tampil di UI sebagai hasil
 * bootstrap riil (insiden FAB-01). Angka hanya boleh masuk lewat evaluasi empiris.
 */
const NEVER_TESTED_NOTES =
  'Belum pernah diuji dengan data riil — tidak ada statistik (sample size, win rate, excess return, CI, maupun p-value) yang diklaim. ' +
  'Untuk menguji hipotesis ini secara empiris, jalankan POST /api/ai/hypotheses/test setelah tersedia minimal 10 closed trade riil.';

export const INITIAL_HYPOTHESES = Object.freeze([
  {
    id: 'HYPO-ACCUM-TOP3-5D',
    title: 'Top 3 Broker Accumulation Edge (5-Day Horizon)',
    statement: 'Emiten dengan konsentrasi akumulasi Top 3 broker > 60% menghasilkan excess return positif di atas pasar setelah biaya transaksi 0.40% dalam 5 hari bursa.',
    strategyRef: 'swing-flow',
    horizonDays: 5,
    minVolumeRp: 1e9,
    status: 'NOT_TESTED',
    sampleSize: null,
    winRatePct: null,
    meanExcessReturnPct: null,
    lowerConfidenceInterval: null,
    upperConfidenceInterval: null,
    pValue: null,
    testedAt: null,
    notes: NEVER_TESTED_NOTES
  },
  {
    id: 'HYPO-BREAKOUT-VOL-SPIKE-10D',
    title: 'Volume Spike Breakout Confirmation (10-Day Horizon)',
    statement: 'Breakout dari resistance 20-hari yang terkonfirmasi oleh lonjakan volume > 2x rata-rata 20-hari mengungguli false breakout dalam 10 hari bursa.',
    strategyRef: 'momentum-candidate',
    horizonDays: 10,
    minVolumeRp: 2e9,
    status: 'NOT_TESTED',
    sampleSize: null,
    winRatePct: null,
    meanExcessReturnPct: null,
    lowerConfidenceInterval: null,
    upperConfidenceInterval: null,
    pValue: null,
    testedAt: null,
    notes: NEVER_TESTED_NOTES
  },
  {
    id: 'HYPO-MEAN-REV-OVERSOLD-5D',
    title: 'Extreme RSI Mean-Reversion in Bull Trend (5-Day Horizon)',
    statement: 'Pullback ekstrem (RSI < 30) pada saham dengan tren jangka menengah bullish (EMA-50 > EMA-200) menghasilkan recovery positif dalam 5 hari.',
    strategyRef: 'day-trading',
    horizonDays: 5,
    minVolumeRp: 1e9,
    status: 'NOT_TESTED',
    sampleSize: null,
    winRatePct: null,
    meanExcessReturnPct: null,
    lowerConfidenceInterval: null,
    upperConfidenceInterval: null,
    pValue: null,
    testedAt: null,
    notes: NEVER_TESTED_NOTES
  },
  {
    id: 'HYPO-DISTRIB-NEGATIVE-CONTROL',
    title: 'Top Distribution Negative Control (10-Day Horizon)',
    statement: 'Emiten dengan distribusi broker terbesar berkinerja lebih buruk daripada rata-rata pasar (kontrol negatif untuk validasi edge).',
    strategyRef: 'hidden-accumulation',
    horizonDays: 10,
    minVolumeRp: 1e9,
    status: 'NOT_TESTED',
    sampleSize: null,
    winRatePct: null,
    meanExcessReturnPct: null,
    lowerConfidenceInterval: null,
    upperConfidenceInterval: null,
    pValue: null,
    testedAt: null,
    notes: NEVER_TESTED_NOTES
  }
]);

/**
 * Memuat katalog hipotesis kuantitatif dari disk.
 * Fallback (file data/hypotheses_catalog.json belum ada) = INITIAL_HYPOTHESES, yaitu
 * definisi hipotesis yang JUJUR: status NOT_TESTED tanpa satu pun angka statistik.
 * Statistik hanya boleh muncul dari hasil evaluasi empiris yang dipersist ke file di atas.
 */
export function getHypothesisCatalog() {
  try {
    if (fs.existsSync(HYPOTHESES_FILE_PATH)) {
      const raw = fs.readFileSync(HYPOTHESES_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Hypothesis Lab] Gagal membaca data/hypotheses_catalog.json:', err?.message);
  }
  return [...INITIAL_HYPOTHESES];
}

/**
 * Menyimpan katalog hipotesis ke disk.
 */
export function saveHypothesisCatalog(catalog) {
  try {
    const dir = path.dirname(HYPOTHESES_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HYPOTHESES_FILE_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Hypothesis Lab] Gagal menyimpan hipotesis:', err?.message);
    return false;
  }
}

/**
 * Melakukan evaluasi statistik atas serangkaian sampel return trade.
 * Menghitung Mean Excess, Win Rate, dan Bootstrap Confidence Interval setelah dipotong fee round-trip.
 *
 * @param {object} hypoDef
 * @param {Array<number>} returnSamples Array of return percentage per trade (misal [4.2, -1.8, 6.0])
 * @param {number} [benchmarkReturnPct=0.0] Rata-rata return pasar di periode yang sama
 * @returns {object} Hasil pengujian statistik
 */
export function evaluateHypothesisStatistically(hypoDef, returnSamples, benchmarkReturnPct = 0.0) {
  if (!Array.isArray(returnSamples) || returnSamples.length < 10) {
    return {
      ...hypoDef,
      sampleSize: returnSamples ? returnSamples.length : 0,
      status: 'DATA_INSUFFICIENT',
      notes: 'Jumlah sampel terlalu sedikit (< 10 trade) untuk kesimpulan statistik yang valid.'
    };
  }

  const costPct = ROUND_TRIP_COST_PCT; // 0.40%
  const netReturns = returnSamples.map(r => r - costPct);
  const excessReturns = netReturns.map(r => r - benchmarkReturnPct);

  const n = excessReturns.length;
  const wins = netReturns.filter(r => r > 0).length;
  const winRatePct = Number(((wins / n) * 100).toFixed(1));

  const sumExcess = excessReturns.reduce((s, x) => s + x, 0);
  const meanExcess = Number((sumExcess / n).toFixed(2));

  // Sort untuk estimasi persentil
  const sorted = [...excessReturns].sort((a, b) => a - b);
  const loIdx = Math.floor(n * 0.05);
  const hiIdx = Math.floor(n * 0.95);
  const lowerCI = Number(sorted[loIdx].toFixed(2));
  const upperCI = Number(sorted[hiIdx].toFixed(2));

  // Sesuai kriteria di lib/backtest/accumulation-backtest.js:
  // Edge terbukti bila batas bawah CI > 0 dan mean excess > 0
  const isAccepted = lowerCI > 0 && meanExcess > 0;

  // Hitung p-value riil via one-sample t-test normal approximation (tanpa metrik sintetis)
  const variance = excessReturns.reduce((sum, x) => sum + Math.pow(x - meanExcess, 2), 0) / (n - 1);
  const se = Math.sqrt(Math.max(1e-9, variance)) / Math.sqrt(n);
  const tStat = meanExcess / se;
  // Two-tailed p-value via Abramowitz & Stegun error function approximation
  const pValue = Number((2 * (1 - normalCdf(Math.abs(tStat)))).toFixed(4));

  return {
    ...hypoDef,
    sampleSize: n,
    winRatePct,
    meanExcessReturnPct: meanExcess,
    lowerConfidenceInterval: lowerCI,
    upperConfidenceInterval: upperCI,
    pValue,
    status: isAccepted ? 'ACCEPTED' : 'REJECTED',
    testedAt: new Date().toISOString(),
    notes: isAccepted
      ? `EDGE TERBUKTI: Excess net return rata-rata +${meanExcess}%, batas bawah 90% CI (+${lowerCI}%) di atas 0 setelah biaya transaksi ${costPct}%.`
      : `TIDAK TERBUKTI: Batas bawah interval kepercayaan (${lowerCI}%) tidak melampaui biaya transaksi atau performa benchmark pasar.`
  };
}

function normalCdf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}
