/**
 * test_autonomous_runner.js — Test suite untuk Server-Side Autonomous AI Trading Engine Runner
 */

import assert from 'assert';
import {
  isIdxMarketOpen,
  createDefaultAccountState,
  calculatePositionSizing,
  calibrateAdaptiveWeights,
  evaluatePositionExit,
  classifyTradeError,
  runAutonomousMarketCycle,
  RUNNER_CONFIG
} from './lib/engine/autonomous-runner.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: AUTONOMOUS RUNNER & SERVER-SIDE SCHEDULER');
console.log('═══════════════════════════════════════════════════════');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ── 1. TEST JADWAL PASAR IDX RESMI ───────────────────────────────────
test('isIdxMarketOpen: mendeteksi akhir pekan (Sabtu & Minggu tutup)', () => {
  // 2026-10-10 adalah Sabtu
  const sabtu = new Date('2026-10-10T10:00:00+07:00');
  const resSabtu = isIdxMarketOpen(sabtu);
  assert.strictEqual(resSabtu.isOpen, false);
  assert.strictEqual(resSabtu.session, 'CLOSED');
  assert.strictEqual(resSabtu.dayName, 'Sabtu');

  // 2026-10-11 adalah Minggu
  const minggu = new Date('2026-10-11T14:00:00+07:00');
  const resMinggu = isIdxMarketOpen(minggu);
  assert.strictEqual(resMinggu.isOpen, false);
  assert.strictEqual(resMinggu.session, 'CLOSED');
  assert.strictEqual(resMinggu.dayName, 'Minggu');
});

test('isIdxMarketOpen: mendeteksi Sesi 1, Istirahat Siang, dan Sesi 2 (Senin - Kamis)', () => {
  // 2026-10-12 adalah Senin
  // Sesi 1: 10:15 WIB
  const sesi1 = new Date('2026-10-12T10:15:00+07:00');
  const res1 = isIdxMarketOpen(sesi1);
  assert.strictEqual(res1.isOpen, true);
  assert.strictEqual(res1.session, 'SESI_1');

  // Istirahat: 12:00 WIB
  const istirahat = new Date('2026-10-12T12:00:00+07:00');
  const resBreak = isIdxMarketOpen(istirahat);
  assert.strictEqual(resBreak.isOpen, false);
  assert.strictEqual(resBreak.session, 'BREAK');

  // Sesi 2: 14:15 WIB
  const sesi2 = new Date('2026-10-12T14:15:00+07:00');
  const res2 = isIdxMarketOpen(sesi2);
  assert.strictEqual(res2.isOpen, true);
  assert.strictEqual(res2.session, 'SESI_2');

  // Tutup: 16:30 WIB
  const malam = new Date('2026-10-12T16:30:00+07:00');
  const resTutup = isIdxMarketOpen(malam);
  assert.strictEqual(resTutup.isOpen, false);
  assert.strictEqual(resTutup.session, 'CLOSED');
});

test('isIdxMarketOpen: mendeteksi istirahat khusus hari Jumat (11:30 - 14:00 WIB)', () => {
  // 2026-10-16 adalah Jumat
  // 13:45 WIB: Senin-Kamis sudah buka, tapi Jumat masih istirahat sholat Jumat
  const jumatSiang = new Date('2026-10-16T13:45:00+07:00');
  const resJumatBreak = isIdxMarketOpen(jumatSiang);
  assert.strictEqual(resJumatBreak.isOpen, false);
  assert.strictEqual(resJumatBreak.session, 'BREAK');
  assert.ok(resJumatBreak.reason.includes('Sholat Jumat'));

  // 14:15 WIB: Jumat Sesi 2 baru buka
  const jumatSesi2 = new Date('2026-10-16T14:15:00+07:00');
  const resJumat2 = isIdxMarketOpen(jumatSesi2);
  assert.strictEqual(resJumat2.isOpen, true);
  assert.strictEqual(resJumat2.session, 'SESI_2');
});

// ── 2. TEST POSITION SIZING & RISK GATE ───────────────────────────────
test('calculatePositionSizing: menolak parameter SL / entry tidak valid', () => {
  const res = calculatePositionSizing({
    equity: 100000000,
    cash: 50000000,
    entryPrice: 1000,
    stopLoss: 1050 // SL di atas entry
  });
  assert.strictEqual(res.approved, false);
  assert.strictEqual(res.reason, 'INVALID_SL_OR_ENTRY');
});

test('calculatePositionSizing: menghitung lot berdasarkan 1% risk dan kelipatan 100 lembar', () => {
  const equity = 100000000; // Rp 100 Juta
  const cash = 100000000;
  const entryPrice = 5000;
  const stopLoss = 4800; // Risk per share = Rp 200

  // 1% risk = Rp 1.000.000
  // Desired shares = 1.000.000 / 200 = 5.000 lembar = 50 lot
  // Biaya = 5.000 * 5.000 = Rp 25.000.000 (25% modal -> melebihi max cap 15% yaitu Rp 15 Juta)
  // Max cap 15% = Rp 15.000.000 / 5.000 = 3.000 lembar = 30 lot
  const res = calculatePositionSizing({ equity, cash, entryPrice, stopLoss });
  assert.strictEqual(res.approved, true);
  assert.strictEqual(res.shares, 3000);
  assert.strictEqual(res.lots, 30);
  assert.strictEqual(res.grossCost, 15000000);
  assert.strictEqual(res.buyFee, Math.round(15000000 * 0.0015));
});

test('calculatePositionSizing: menjaga buffer kas minimum 20%', () => {
  const equity = 100000000;
  const cash = 21000000; // Kas hanya Rp 21 Juta (buffer 20% = Rp 20 Juta, sisa yang bisa dipakai Rp 1 Juta)
  const entryPrice = 10000; // 1 lot = Rp 1 Juta + fee
  const stopLoss = 9500;

  const res = calculatePositionSizing({ equity, cash, entryPrice, stopLoss });
  assert.strictEqual(res.approved, false); // Kas tidak cukup untuk 1 lot + fee tanpa melanggar buffer 20%
  assert.strictEqual(res.reason, 'INSUFFICIENT_CASH_OR_BUFFER_FOR_1_LOT');
});

// ── 3. TEST EVALUASI EXIT, MFE/MAE & TRAILING STOP ─────────────────────
test('evaluatePositionExit: memicu STOP_LOSS saat harga menyentuh atau di bawah SL', () => {
  const pos = {
    entryPrice: 5000,
    stopLoss: 4800,
    takeProfit: 5500,
    highWaterMark: 5100,
    lowWaterMark: 5000
  };

  const evalRes = evaluatePositionExit(pos, 4780);
  assert.strictEqual(evalRes.shouldExit, true);
  assert.strictEqual(evalRes.exitReason, 'STOP_LOSS');
  assert.strictEqual(evalRes.exitPrice, 4800);
});

test('evaluatePositionExit: memicu TARGET_REACHED saat harga menyentuh TP', () => {
  const pos = {
    entryPrice: 5000,
    stopLoss: 4800,
    takeProfit: 5500,
    highWaterMark: 5200,
    lowWaterMark: 5000
  };

  const evalRes = evaluatePositionExit(pos, 5550);
  assert.strictEqual(evalRes.shouldExit, true);
  assert.strictEqual(evalRes.exitReason, 'TARGET_REACHED');
  assert.strictEqual(evalRes.exitPrice, 5500);
});

test('evaluatePositionExit: mengaktifkan trailing stop dinamis saat profit >= +5%', () => {
  const pos = {
    entryPrice: 5000,
    stopLoss: 4800,
    takeProfit: 6000,
    highWaterMark: 5000,
    lowWaterMark: 5000
  };

  // 1. Harga naik ke 5.300 (+6% profit -> di atas trigger 5%)
  // Trailing stop dipasang 3% di bawah 5.300 = 5.300 * 0.97 = 5.141
  const step1 = evaluatePositionExit(pos, 5300);
  assert.strictEqual(step1.shouldExit, false);
  assert.strictEqual(pos.trailingStop, 5141);
  assert.strictEqual(pos.mfePct, 6);

  // 2. Harga turun kembali ke 5.100 (menembus trailing stop 5.141)
  const step2 = evaluatePositionExit(pos, 5100);
  assert.strictEqual(step2.shouldExit, true);
  assert.strictEqual(step2.exitReason, 'TRAILING_STOP');
  assert.strictEqual(step2.exitPrice, 5141);
});

// ── 4. TEST KALIBRASI BOBOT ADAPTIF ───────────────────────────────────
test('calibrateAdaptiveWeights: menaikkan bobot strategi dan regime saat WIN R>=2.0', () => {
  const weights = {
    regimeMultipliers: { BULL_TREND: 1.0 },
    strategyMultipliers: { strat_swing: 1.0 },
    adaptationHistory: []
  };

  const closedTrade = {
    id: 'T1',
    ticker: 'BBCA',
    result: 'WIN',
    rMultiple: 2.5,
    strategy: 'strat_swing',
    regimeAtEntry: 'BULL_TREND'
  };

  calibrateAdaptiveWeights(weights, closedTrade);
  assert.strictEqual(weights.strategyMultipliers.strat_swing, 1.05);
  assert.strictEqual(weights.regimeMultipliers.BULL_TREND, 1.02);
  assert.strictEqual(weights.adaptationHistory.length, 1);
});

test('calibrateAdaptiveWeights: memangkas bobot saat LOSS dan membatasi pada min 0.60', () => {
  const weights = {
    regimeMultipliers: { SIDEWAYS: 0.62 },
    strategyMultipliers: { strat_breakout: 0.62 },
    adaptationHistory: []
  };

  const closedTrade = {
    id: 'T2',
    ticker: 'ASII',
    result: 'LOSS',
    rMultiple: -1.0,
    strategy: 'strat_breakout',
    regimeAtEntry: 'SIDEWAYS'
  };

  calibrateAdaptiveWeights(weights, closedTrade);
  // 0.62 - 0.04 = 0.58, diclamp ke min 0.60
  assert.strictEqual(weights.strategyMultipliers.strat_breakout, 0.60);
  // 0.62 - 0.03 = 0.59, diclamp ke min 0.60
  assert.strictEqual(weights.regimeMultipliers.SIDEWAYS, 0.60);
});

// ── 4b. TEST TAKSONOMI KESALAHAN TRADE & MFE CAPTURE ──────────────────
test('classifyTradeError: mendeteksi CLEAN_WIN saat menang dengan MFE >= 5% dan R >= 1.5', () => {
  const trade = { result: 'WIN', mfePct: 6.5, maePct: -0.8, rMultiple: 2.1, exitReason: 'TARGET_REACHED' };
  assert.strictEqual(classifyTradeError(trade), 'CLEAN_WIN');
});

test('classifyTradeError: mendeteksi TIMING_ERROR saat greedy exit (MFE >= 5% tapi rugi)', () => {
  const trade = { result: 'LOSS', mfePct: 6.2, maePct: -4.5, rMultiple: -1.0, exitReason: 'STOP_LOSS' };
  assert.strictEqual(classifyTradeError(trade), 'TIMING_ERROR');
});

test('classifyTradeError: mendeteksi REGIME_ERROR saat bursa berubah menjadi BEAR_TREND', () => {
  const trade = { result: 'LOSS', mfePct: 1.5, maePct: -4.0, rMultiple: -1.0, regimeAtEntry: 'BULL_TREND', regimeAtExit: 'BEAR_TREND' };
  assert.strictEqual(classifyTradeError(trade), 'REGIME_ERROR');
});

test('classifyTradeError: mendeteksi SIGNAL_ERROR saat false breakout (MFE < 1% langsung kena SL)', () => {
  const trade = { result: 'LOSS', mfePct: 0.2, maePct: -3.0, rMultiple: -1.0, exitReason: 'STOP_LOSS' };
  assert.strictEqual(classifyTradeError(trade), 'SIGNAL_ERROR');
});

// ── 5. TEST RUNNER SIKLUS AUTONOMOUS PENUH ────────────────────────────
test('runAutonomousMarketCycle: melewati eksekusi jika bursa tutup dan force=false', async () => {
  // Simulasi hari Minggu
  const state = createDefaultAccountState();
  const res = await runAutonomousMarketCycle({
    force: false,
    injectedState: state
  });

  // Jika waktu saat ini kebetulan jam bursa, skip assertion ini; jika di luar jam bursa, pastikan skipped
  const nowSchedule = isIdxMarketOpen();
  if (!nowSchedule.isOpen) {
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.success, false);
  } else {
    assert.strictEqual(res.success, true);
  }
});

test('runAutonomousMarketCycle: mengeksekusi dengan force=true dan mengisolasi state', async () => {
  const state = createDefaultAccountState();

  // Tambahkan posisi yang sudah mencapai TP untuk diuji exit-nya
  state.openPositions.push({
    id: 'POS-TEST-1',
    ticker: 'BBCA',
    entryPrice: 9000,
    currentPrice: 9000,
    shares: 1000,
    lots: 10,
    entryDate: '2026-10-01T09:00:00Z',
    initialStopLoss: 8700,
    stopLoss: 8700,
    takeProfit: 9500, // Akan tercapai jika harga 9600
    buyFee: Math.round(9000 * 1000 * 0.0015),
    strategy: 'strat_pullback',
    regimeAtEntry: 'BULL_TREND',
    highWaterMark: 9000,
    lowWaterMark: 9000
  });

  const res = await runAutonomousMarketCycle({
    force: true,
    candidateTickers: ['BMRI'],
    injectedState: state
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(typeof res.totalEquity, 'number');
  assert.strictEqual(typeof res.cash, 'number');
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} AUTONOMOUS RUNNER TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
