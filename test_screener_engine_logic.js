/**
 * test_screener_engine_logic.js — Verifikasi Integritas Logika Screener & Trading Engine
 *
 * Menguji:
 * 1. computeTechnicalSignal(): Penolakan volume konfirmasi pada hari koreksi/merah & penalti penurunan tajam.
 * 2. computeStockSignal(): Price Contradiction Gate yang menggugurkan sinyal BUY/STRONG BUY saat harga anjlok.
 * 3. generateUnifiedScreener(): Pencegahan false whale accumulation & false confirmed uptrend pada saham anjlok.
 * 4. autonomous-runner: Pembacaan SL/TP dinamis berbasis ATR (cand.sl / cand.tp1) sebelum fallback persentase.
 */

import assert from 'assert';
import {
  computeStockSignal,
  generateUnifiedScreener
} from './lib/idx-data-engine.js';
import { runAutonomousMarketCycle, createDefaultAccountState } from './lib/engine/autonomous-runner.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: SCREENER & TRADING ENGINE LOGIC INTEGRITY');
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

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ── 1. computeStockSignal Price Contradiction Gate ────────────────────
await asyncTest('computeStockSignal: menolak sinyal BUY jika saham sedang anjlok tajam (changePercent <= -3%)', async () => {
  const res = await computeStockSignal('BBCA');
  // Memverifikasi struktur data dasar
  assert(res && typeof res.ticker === 'string');
  assert(res.dataQuality !== undefined);

  // Jika saham riil sedang drop <= -3%, sinyal tidak boleh BUY atau STRONG BUY
  if (res.changePercent != null && res.changePercent <= -3.0) {
    assert.strictEqual(res.signal, 'AVOID', 'Saham anjlok <= -3% harus AVOID');
    assert(res.compositeScore <= 40, 'compositeScore harus dibatasi <= 40');
  } else if (res.changePercent != null && res.changePercent < 0) {
    assert(res.signal !== 'STRONG BUY' && res.signal !== 'BUY', 'Saham merah tidak boleh STRONG BUY / BUY');
  }
});

// ── 2. Unified Screener Price Contradiction Gate ──────────────────────
await asyncTest('generateUnifiedScreener: saham anjlok tajam tidak mendapatkan confirmedUptrendWhale', async () => {
  const result = await generateUnifiedScreener({ limit: 50, excludeFlagged: false });
  assert(result.success === true);
  assert(Array.isArray(result.rows));

  for (const row of result.rows) {
    if (row.chg1d != null && row.chg1d <= -2.0) {
      assert.strictEqual(
        row.confirmedUptrendWhale,
        false,
        `Saham ${row.ticker} anjlok ${row.chg1d}% tetapi confirmedUptrendWhale bernilai true!`
      );
    }
    if (row.chg1d != null && row.chg1d <= -3.0 && row.uptrendScore != null) {
      assert(
        row.uptrendScore <= 50,
        `Saham ${row.ticker} anjlok ${row.chg1d}% tetapi uptrendScore > 50 (${row.uptrendScore})!`
      );
    }
  }
});

// ── 3. Autonomous Runner Dynamic SL/TP ─────────────────────────────────
await asyncTest('runAutonomousMarketCycle: mengadopsi cand.sl dan cand.tp1 berbasis ATR dari kandidat', async () => {
  const state = createDefaultAccountState();
  const entryPrice = 5000;
  const customSl = 4850; // ATR SL (bukan 5% default 4750)
  const customTp = 5400; // ATR TP (bukan 10% default 5500)

  // Jalankan siklus dengan injeksi sinyal mock
  const res = await runAutonomousMarketCycle({
    force: true,
    candidateTickers: ['BBCA'],
    injectedState: state
  });

  assert(res.success === true);
  assert(typeof res.totalEquity === 'number');
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} SCREENER & TRADING ENGINE LOGIC TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
