/**
 * test_meta_labeler.js — Test suite untuk ML Meta-Labeling Veto Layer
 */

import assert from 'assert';
import {
  evaluateMetaLabelFilter,
  getRegimeScore,
  sigmoid,
  META_LABELER_CONFIG
} from './lib/engine/meta-labeler.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: ML META-LABELING VETO LAYER');
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

test('getRegimeScore: memetakan regime pasar secara kuantitatif', () => {
  assert.strictEqual(getRegimeScore('BULL_TREND'), 1.0);
  assert.strictEqual(getRegimeScore('SIDEWAYS'), 0.7);
  assert.strictEqual(getRegimeScore('HIGH_VOLATILITY'), 0.45);
  assert.strictEqual(getRegimeScore('BEAR_TREND'), 0.20);
  assert.strictEqual(getRegimeScore('RISK_OFF'), 0.20);
  assert.strictEqual(getRegimeScore('UNKNOWN'), 0.50);
});

test('sigmoid: menghitung probabilitas kontinu 0 sampai 1 secara presisi', () => {
  assert.strictEqual(Number(sigmoid(0).toFixed(2)), 0.50);
  assert.ok(sigmoid(5) > 0.99);
  assert.ok(sigmoid(-5) < 0.01);
});

test('evaluateMetaLabelFilter: meloloskan kandidat setup grade A+ di bull market', () => {
  const result = evaluateMetaLabelFilter({
    confluenceScore: 85,
    volumeSurge: 2.5,
    foreignStreak: 3,
    regime: 'BULL_TREND',
    spreadPct: 0.3,
    atrPct: 2.5,
    der: 0.6
  });

  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.recommendation, 'PROCEED');
  assert.ok(result.probability >= META_LABELER_CONFIG.PROBABILITY_THRESHOLD);
  assert.ok(result.reason.includes('lolos verifikasi'));
});

test('evaluateMetaLabelFilter: memveto kandidat lemah dengan risiko false breakout tinggi', () => {
  const result = evaluateMetaLabelFilter({
    confluenceScore: 45,
    volumeSurge: 0.7,
    foreignStreak: 0,
    regime: 'BEAR_TREND',
    spreadPct: 1.5,
    atrPct: 2.0,
    der: 2.2 // Hutang tinggi
  });

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.recommendation, 'VETOED_BY_ML');
  assert.ok(result.probability < META_LABELER_CONFIG.PROBABILITY_THRESHOLD);
  assert.ok(result.reason.includes('diveto Meta-Labeler'));
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} META-LABELER TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
