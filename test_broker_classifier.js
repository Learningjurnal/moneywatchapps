/**
 * test_broker_classifier.js — Unit tests untuk IDX Broker Classification, Cohort Flow & Anchored Bandar VWAP
 */

import assert from 'assert';
import {
  BROKER_CATEGORIES,
  classifyBroker,
  analyzeBrokerCohortFlow,
  calculateAnchoredBandarVwap
} from './lib/engine/broker-classifier.js';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: IDX BROKER CLASSIFICATION & BANDAR VWAP');
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

// ── 1. TEST BROKER REGISTRY & CLASSIFICATION ──────────────────────────
test('classifyBroker: mengklasifikasikan broker asing (Bulge Bracket)', () => {
  const ak = classifyBroker('AK');
  assert.strictEqual(ak.category, BROKER_CATEGORIES.FOREIGN_INSTITUTION);
  assert.strictEqual(ak.isSmartMoney, true);
  assert.strictEqual(ak.isRetail, false);
  assert.strictEqual(ak.isForeign, true);
  assert.strictEqual(ak.badge, 'Asing / Bulge');

  const bk = classifyBroker('BK');
  assert.strictEqual(bk.name, 'J.P. Morgan Sekuritas Indonesia');
  assert.strictEqual(bk.isSmartMoney, true);
});

test('classifyBroker: mengklasifikasikan broker institusi domestik & BUMN', () => {
  const cc = classifyBroker('CC');
  assert.strictEqual(cc.category, BROKER_CATEGORIES.DOMESTIC_INSTITUTION);
  assert.strictEqual(cc.isSmartMoney, true);
  assert.strictEqual(cc.isRetail, false);
  assert.strictEqual(cc.badge, 'BUMN / Institusi');

  const od = classifyBroker('OD');
  assert.strictEqual(od.name, 'BRI Danareksa Sekuritas');
  assert.strictEqual(od.isSmartMoney, true);
});

test('classifyBroker: mengklasifikasikan broker ritel massal', () => {
  const yp = classifyBroker('YP');
  assert.strictEqual(yp.category, BROKER_CATEGORIES.RETAIL);
  assert.strictEqual(yp.isSmartMoney, false);
  assert.strictEqual(yp.isRetail, true);
  assert.strictEqual(yp.badge, 'Retail Heavy');

  const pd = classifyBroker('PD');
  assert.strictEqual(pd.name, 'Indo Premier Sekuritas (IPOT)');
  assert.strictEqual(pd.isRetail, true);

  const xc = classifyBroker('XC');
  assert.strictEqual(xc.name, 'Ajaib Sekuritas Asia');
  assert.strictEqual(xc.isRetail, true);
});

test('classifyBroker: menangani broker tidak dikenal secara elegan', () => {
  const unknown = classifyBroker('ZZ');
  assert.strictEqual(unknown.category, BROKER_CATEGORIES.OTHER);
  assert.strictEqual(unknown.isSmartMoney, false);
  assert.strictEqual(unknown.isRetail, false);
  assert.strictEqual(unknown.badge, 'Unclassified');
});

// ── 2. TEST COHORT FLOW ANALYSIS (INSTITUSI VS RITEL) ─────────────────
test('analyzeBrokerCohortFlow: mendeteksi SMART_MONEY_ABSORPTION & retailCapitulation', () => {
  const topBuyers = [
    { broker: 'AK', value: 10000000000, volume: 20000, avgPrice: 5000 },
    { broker: 'BK', value: 6000000000, volume: 12000, avgPrice: 5000 }
  ];
  const topSellers = [
    { broker: 'YP', value: 8000000000, volume: 16000, avgPrice: 5000 },
    { broker: 'PD', value: 5000000000, volume: 10000, avgPrice: 5000 }
  ];

  const analysis = analyzeBrokerCohortFlow(topBuyers, topSellers);
  assert.strictEqual(analysis.retailCapitulation, true);
  assert.strictEqual(analysis.verdict, 'SMART_MONEY_ABSORPTION');
  assert.ok(analysis.smartMoneyNet > 0, 'Smart money harus net buy');
  assert.ok(analysis.retailNet < 0, 'Retail harus net sell');
  assert.strictEqual(analysis.smartMoneyParticipationPct, 55); // (16B / 29B) = 55%
});

test('analyzeBrokerCohortFlow: mendeteksi DISTRIBUTION_TO_RETAIL & retailChasing', () => {
  const topBuyers = [
    { broker: 'YP', value: 12000000000, volume: 24000, avgPrice: 5000 },
    { broker: 'XC', value: 5000000000, volume: 10000, avgPrice: 5000 }
  ];
  const topSellers = [
    { broker: 'AK', value: 11000000000, volume: 22000, avgPrice: 5000 },
    { broker: 'ZP', value: 6000000000, volume: 12000, avgPrice: 5000 }
  ];

  const analysis = analyzeBrokerCohortFlow(topBuyers, topSellers);
  assert.strictEqual(analysis.retailChasing, true);
  assert.strictEqual(analysis.verdict, 'DISTRIBUTION_TO_RETAIL');
  assert.ok(analysis.smartMoneyNet < 0, 'Smart money harus net sell (distribusi)');
  assert.ok(analysis.retailNet > 0, 'Retail harus net buy (fomo / nyangkut)');
});

// ── 3. TEST ANCHORED BANDAR VWAP ──────────────────────────────────────
test('calculateAnchoredBandarVwap: menghitung VWAP bandar institusi dan zonasi harga', () => {
  const topBuyers = [
    { broker: 'AK', value: 10000000000, volume: 2000000, avgPrice: 5000 }, // 10M / 2M = 5000
    { broker: 'BK', value: 5000000000, volume: 1000000, avgPrice: 5000 }   // 5M / 1M = 5000
  ];

  // Kasus 1: Harga dekat VWAP Bandar (+1%) -> OPTIMAL_ACCUMULATION
  const zoneOptimal = calculateAnchoredBandarVwap(topBuyers, 5050);
  assert.strictEqual(zoneOptimal.vwap, 5000);
  assert.strictEqual(zoneOptimal.spreadPct, 1.0);
  assert.strictEqual(zoneOptimal.zone, 'OPTIMAL_ACCUMULATION');

  // Kasus 2: Harga di bawah VWAP Bandar (-3%) -> DISCOUNT_ABSORPTION
  const zoneDiscount = calculateAnchoredBandarVwap(topBuyers, 4850);
  assert.strictEqual(zoneDiscount.spreadPct, -3.0);
  assert.strictEqual(zoneDiscount.zone, 'DISCOUNT_ABSORPTION');

  // Kasus 3: Harga sudah naik jauh (+8%) -> MARKUP_ZONE
  const zoneMarkup = calculateAnchoredBandarVwap(topBuyers, 5400);
  assert.strictEqual(zoneMarkup.spreadPct, 8.0);
  assert.strictEqual(zoneMarkup.zone, 'MARKUP_ZONE');

  // Kasus 4: Harga sudah terlalu tinggi di atas VWAP Bandar (+16%) -> DISTRIBUTION_RISK
  const zoneRisk = calculateAnchoredBandarVwap(topBuyers, 5800);
  assert.strictEqual(zoneRisk.spreadPct, 16.0);
  assert.strictEqual(zoneRisk.zone, 'DISTRIBUTION_RISK');
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} BROKER CLASSIFIER TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
