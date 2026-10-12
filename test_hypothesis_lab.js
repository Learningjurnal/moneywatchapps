/**
 * test_hypothesis_lab.js — Test suite untuk Autonomous Hypothesis Lab Engine
 */

import assert from 'assert';
import {
  getHypothesisCatalog,
  evaluateHypothesisStatistically
} from './lib/engine/hypothesis-lab.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: AUTONOMOUS HYPOTHESIS LAB');
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

test('getHypothesisCatalog: mengembalikan daftar hipotesis kuantitatif dengan metrik statistik', () => {
  const catalog = getHypothesisCatalog();
  assert.ok(Array.isArray(catalog), 'Katalog harus berupa array');
  assert.ok(catalog.length >= 4, 'Minimal 4 hipotesis default institusional');

  const first = catalog[0];
  assert.ok(first.id);
  assert.ok(first.statement);
  assert.ok(typeof first.winRatePct === 'number');
  assert.ok(typeof first.meanExcessReturnPct === 'number');
  assert.ok(['ACCEPTED', 'REJECTED', 'TESTING'].includes(first.status));
});

test('evaluateHypothesisStatistically: menolak evaluasi jika sampel data < 10', () => {
  const hypo = { id: 'TEST-1', title: 'Test Sample Kecil' };
  const res = evaluateHypothesisStatistically(hypo, [2.0, 3.0, -1.0]);
  assert.strictEqual(res.status, 'DATA_INSUFFICIENT');
  assert.strictEqual(res.sampleSize, 3);
});

test('evaluateHypothesisStatistically: memberi status ACCEPTED bila lower CI > 0 setelah biaya 0.40%', () => {
  const hypo = { id: 'TEST-2', title: 'Test Edge Kuat' };
  // Sampel return positif kuat (semua > +1.5%)
  const returns = [3.5, 4.0, 2.8, 5.1, 3.9, 6.2, 4.4, 3.1, 5.0, 4.2, 3.8, 4.9];
  const res = evaluateHypothesisStatistically(hypo, returns, 0.5);

  assert.strictEqual(res.status, 'ACCEPTED');
  assert.ok(res.meanExcessReturnPct > 0);
  assert.ok(res.lowerConfidenceInterval > 0);
  assert.ok(res.pValue < 0.05);
});

test('evaluateHypothesisStatistically: memberi status REJECTED bila sinyal tergerus biaya transaksi', () => {
  const hypo = { id: 'TEST-3', title: 'Test Tanpa Edge' };
  // Sampel tipis (di bawah 0.40% atau negatif)
  const returns = [0.2, -0.5, 0.1, -1.2, 0.3, -0.4, 0.2, -0.8, 0.0, -0.1, 0.3, -0.2];
  const res = evaluateHypothesisStatistically(hypo, returns, 0.0);

  assert.strictEqual(res.status, 'REJECTED');
  assert.ok(res.lowerConfidenceInterval <= 0);
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} HYPOTHESIS LAB TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
