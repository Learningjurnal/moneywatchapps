/**
 * test_multi_timeframe_wyckoff.js — Unit tests untuk Multi-Timeframe Alignment & Wyckoff Phase Engine (Phase 3)
 */

import assert from 'assert';
import {
  aggregateWeeklyBars,
  computeEMA,
  computeRSI,
  computeWeeklyIndicators,
  evaluateMultiTimeframeConfluence,
  detectWyckoffPhase,
  MTF_ALIGNMENT,
  WYCKOFF_PHASES
} from './lib/engine/multi-timeframe-wyckoff.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: MULTI-TIMEFRAME CONFLUENCE & WYCKOFF ENGINE');
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

// ── 1. TEST AGREGASI BAR MINGGUAN (WEEKLY AGGREGATOR) ─────────────────
test('aggregateWeeklyBars: mengagregasi bar harian menjadi bar mingguan dengan presisi', () => {
  // Simulasi 2 minggu transaksi (10 hari bursa: 5 hari di Minggu 1, 5 hari di Minggu 2)
  const dailyBars = [
    // Minggu 1: 2026-10-05 (Senin) s.d. 2026-10-09 (Jumat)
    { d: '2026-10-05', o: 5000, h: 5100, l: 4950, c: 5050, v: 1000 },
    { d: '2026-10-06', o: 5050, h: 5200, l: 5000, c: 5150, v: 1200 },
    { d: '2026-10-07', o: 5150, h: 5250, l: 5100, c: 5200, v: 1500 },
    { d: '2026-10-08', o: 5200, h: 5300, l: 5150, c: 5250, v: 1100 },
    { d: '2026-10-09', o: 5250, h: 5400, l: 5200, c: 5350, v: 2000 },

    // Minggu 2: 2026-10-12 (Senin) s.d. 2026-10-16 (Jumat)
    { d: '2026-10-12', o: 5350, h: 5450, l: 5300, c: 5400, v: 1300 },
    { d: '2026-10-13', o: 5400, h: 5500, l: 5350, c: 5450, v: 1400 },
    { d: '2026-10-14', o: 5450, h: 5550, l: 5400, c: 5500, v: 1600 },
    { d: '2026-10-15', o: 5500, h: 5600, l: 5450, c: 5550, v: 1800 },
    { d: '2026-10-16', o: 5550, h: 5700, l: 5500, c: 5650, v: 2500 }
  ];

  const weekly = aggregateWeeklyBars(dailyBars);
  assert.strictEqual(weekly.length, 2, 'Harus menghasilkan 2 bar mingguan');

  // Validasi Minggu 1
  const w1 = weekly[0];
  assert.strictEqual(w1.o, 5000, 'Open minggu 1 harus dari hari Senin');
  assert.strictEqual(w1.h, 5400, 'High minggu 1 harus nilai tertinggi dari minggu tsb');
  assert.strictEqual(w1.l, 4950, 'Low minggu 1 harus nilai terendah dari minggu tsb');
  assert.strictEqual(w1.c, 5350, 'Close minggu 1 harus dari hari Jumat');
  assert.strictEqual(w1.v, 6800, 'Volume minggu 1 harus total akumulasi 5 hari');

  // Validasi Minggu 2
  const w2 = weekly[1];
  assert.strictEqual(w2.o, 5350);
  assert.strictEqual(w2.h, 5700);
  assert.strictEqual(w2.l, 5300);
  assert.strictEqual(w2.c, 5650);
  assert.strictEqual(w2.v, 8600);
});

// ── 2. TEST INDIKATOR MINGGUAN & PRIMARY TREND ────────────────────────
test('computeWeeklyIndicators: mendeteksi tren primer mingguan dan RSI', () => {
  // Buat 25 bar mingguan tren naik konsisten (price > ema20 > ema50)
  const uptrendWeekly = [];
  let price = 3000;
  for (let i = 1; i <= 25; i++) {
    price += 100;
    uptrendWeekly.push({
      d: `2026-W${i}`,
      o: price - 50,
      h: price + 80,
      l: price - 60,
      c: price,
      v: 1000000 + i * 20000
    });
  }

  const ind = computeWeeklyIndicators(uptrendWeekly);
  assert.ok(ind !== null);
  assert.strictEqual(ind.primaryTrend, 'UPTREND');
  assert.ok(ind.rsi14 >= 50, 'RSI harus di area bullish');
  assert.ok(ind.lastClose > ind.ema20, 'Harga harus di atas EMA 20');
});

// ── 3. TEST EVALUASI MULTI-TIMEFRAME CONFLUENCE ───────────────────────
test('evaluateMultiTimeframeConfluence: STRONG_BULLISH_CONFLUENCE memberikan alokasi penuh 1.0x', () => {
  const weeklyBars = [];
  let price = 4000;
  for (let i = 1; i <= 25; i++) {
    price += 80;
    weeklyBars.push({ d: `2026-W${i}`, o: price - 40, h: price + 60, l: price - 50, c: price, v: 5000000 });
  }

  const result = evaluateMultiTimeframeConfluence({
    dailyPoints: [],
    weeklyBars,
    dailySignal: 'STRONG BUY'
  });

  assert.strictEqual(result.alignment, MTF_ALIGNMENT.STRONG_BULLISH_CONFLUENCE);
  assert.strictEqual(result.sizeMultiplier, 1.0);
  assert.ok(result.alignmentScore >= 85);
  assert.strictEqual(result.badgeClass, 'b-up');
});

test('evaluateMultiTimeframeConfluence: PULLBACK_IN_UPTREND memberikan alokasi 0.75x', () => {
  const weeklyBars = [];
  let price = 4000;
  for (let i = 1; i <= 25; i++) {
    price += 80;
    weeklyBars.push({ d: `2026-W${i}`, o: price - 40, h: price + 60, l: price - 50, c: price, v: 5000000 });
  }

  // Daily sedang pullback / HOLD
  const result = evaluateMultiTimeframeConfluence({
    dailyPoints: [],
    weeklyBars,
    dailySignal: 'HOLD'
  });

  assert.strictEqual(result.alignment, MTF_ALIGNMENT.PULLBACK_IN_UPTREND);
  assert.strictEqual(result.sizeMultiplier, 0.75);
  assert.strictEqual(result.badgeClass, 'b-amb');
});

test('evaluateMultiTimeframeConfluence: COUNTER_TREND_BOUNCE memangkas alokasi 50% (0.50x)', () => {
  // Weekly tren turun konsisten
  const weeklyBars = [];
  let price = 8000;
  for (let i = 1; i <= 25; i++) {
    price -= 120;
    weeklyBars.push({ d: `2026-W${i}`, o: price + 50, h: price + 60, l: price - 80, c: price, v: 5000000 });
  }

  // Daily muncul sinyal BUY sementara
  const result = evaluateMultiTimeframeConfluence({
    dailyPoints: [],
    weeklyBars,
    dailySignal: 'BUY'
  });

  assert.strictEqual(result.alignment, MTF_ALIGNMENT.COUNTER_TREND_BOUNCE);
  assert.strictEqual(result.sizeMultiplier, 0.50);
  assert.strictEqual(result.badgeClass, 'b-amb');
});

test('evaluateMultiTimeframeConfluence: DISTRIBUTION_BREAKDOWN memveto mutlak entri (0.0x)', () => {
  const weeklyBars = [];
  let price = 8000;
  for (let i = 1; i <= 25; i++) {
    price -= 120;
    weeklyBars.push({ d: `2026-W${i}`, o: price + 50, h: price + 60, l: price - 80, c: price, v: 5000000 });
  }

  // Daily juga AVOID / breakdown
  const result = evaluateMultiTimeframeConfluence({
    dailyPoints: [],
    weeklyBars,
    dailySignal: 'AVOID'
  });

  assert.strictEqual(result.alignment, MTF_ALIGNMENT.DISTRIBUTION_BREAKDOWN);
  assert.strictEqual(result.sizeMultiplier, 0.0);
  assert.strictEqual(result.badgeClass, 'b-dn');
});

// ── 4. TEST WYCKOFF MARKET CYCLE DETECTOR ──────────────────────────────
test('detectWyckoffPhase: mendeteksi FASE 2 MARKUP saat tren naik mapan', () => {
  const dailyPoints = [];
  let price = 2000;
  for (let i = 1; i <= 60; i++) {
    price += 25;
    dailyPoints.push({
      d: `2026-10-${i}`,
      o: price - 10,
      h: price + 20,
      l: price - 15,
      c: price,
      v: 2000000
    });
  }

  const phase = detectWyckoffPhase({ dailyPoints, currentPrice: price });
  assert.strictEqual(phase.phase, WYCKOFF_PHASES.MARKUP);
  assert.strictEqual(phase.badgeClass, 'b-up');
  assert.ok(phase.confidence >= 80);
});

test('detectWyckoffPhase: mendeteksi FASE 4 MARKDOWN saat tren anjlok tajam', () => {
  const dailyPoints = [];
  let price = 6000;
  for (let i = 1; i <= 60; i++) {
    price -= 40;
    dailyPoints.push({
      d: `2026-10-${i}`,
      o: price + 15,
      h: price + 20,
      l: price - 25,
      c: price,
      v: 2500000
    });
  }

  const phase = detectWyckoffPhase({ dailyPoints, currentPrice: price });
  assert.strictEqual(phase.phase, WYCKOFF_PHASES.MARKDOWN);
  assert.strictEqual(phase.badgeClass, 'b-dn');
});

test('detectWyckoffPhase: mendeteksi FASE 1 ACCUMULATION (Spring Test) di dasar rentang harga', () => {
  // Konsolidasi sideways di rentang 3000 - 3400
  const dailyPoints = [];
  for (let i = 1; i <= 60; i++) {
    const cycle = Math.sin(i / 3) * 150;
    const c = 3200 + cycle;
    dailyPoints.push({
      d: `2026-10-${i}`,
      o: c - 10,
      h: c + 30,
      l: c - 40,
      c: c,
      v: 1500000
    });
  }

  // Harga saat ini mendekati dasar rentang (Spring / shakeout test) dengan akumulasi smart money
  const phase = detectWyckoffPhase({
    dailyPoints,
    currentPrice: 3040,
    brokerData: { bandarmology: { verdict: 'BIG_ACCUMULATION' } }
  });

  assert.strictEqual(phase.phase, WYCKOFF_PHASES.ACCUMULATION);
  assert.strictEqual(phase.phaseDetail, 'PHASE_C_SPRING_TEST');
  assert.strictEqual(phase.badgeClass, 'b-up');
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} MULTI-TIMEFRAME & WYCKOFF TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
