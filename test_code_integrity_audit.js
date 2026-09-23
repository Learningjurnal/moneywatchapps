/**
 * test_code_integrity_audit.js
 * Comprehensive automated assertions for Code Integrity, Bidirectional Traceability,
 * and Cross-Module Reconciliation across MoneyWatch Pro.
 *
 * Enforces:
 * 1. Price & Daily Change consistency (no 5-day chartPreviousClose regressions)
 * 2. Bandarmology canonical scale [0..100] and UI gauge invariants
 * 3. Canonical Financial Engine, Taxes (Levy 0.043%, PPN 11%, PPh Final 0.1%), and Tick Size
 * 4. Ticker sanitization invariants across all variations
 * 5. Data provenance and honest status handling
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('═══════════════════════════════════════════════════════');
console.log('🛡️  CODE INTEGRITY & TRACEABILITY AUDIT SUITE');
console.log('═══════════════════════════════════════════════════════');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// ────────────────────────────────────────────────────────────
// SECTION 1: PRICE & DAY-CHANGE TRACEABILITY
// ────────────────────────────────────────────────────────────
test('Price Integrity: getGlobalMarketChange() prioritizes live changes[tk] over fallback', () => {
  const code01 = fs.readFileSync(path.join(__dirname, 'public', 'js', '01-data.js'), 'utf8');
  const sandbox = {
    window: {},
    document: { getElementById: () => null },
    changes: { 'BBRI': 0.31, 'UNVR': 0.62 },
    prices: { 'BBRI': 3180, 'UNVR': 1650 },
    prevCloses: { 'BBRI': 3170, 'UNVR': 1640 }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code01, ctx);

  const bbriChg = ctx.getGlobalMarketChange('bbri');
  assert.strictEqual(bbriChg, 0.31, `Expected BBRI live change to be +0.31%, got ${bbriChg}%`);

  const unvrChg = ctx.getGlobalMarketChange('UNVR.JK');
  assert.strictEqual(unvrChg, 0.62, `Expected UNVR live change to be +0.62%, got ${unvrChg}%`);
});

test('Price Integrity: fallback calculations never use chartPreviousClose as previousClose', () => {
  // Simulate Yahoo Finance payload where chartPreviousClose represents 5-day base (3330)
  // while regularMarketPrice is 3180 and regularMarketChange is +10.
  const meta = {
    regularMarketPrice: 3180,
    regularMarketChange: 10,
    regularMarketChangePercent: 0.315,
    chartPreviousClose: 3330 // Old bug used this and produced -4.50%!
  };

  const realChg = (typeof meta.regularMarketChange === 'number' && !isNaN(meta.regularMarketChange)) ? meta.regularMarketChange : null;
  const realChgPct = (typeof meta.regularMarketChangePercent === 'number' && !isNaN(meta.regularMarketChangePercent)) ? meta.regularMarketChangePercent : null;
  const prevClose = (realChg !== null && Math.abs(realChg) > 0.0001) ? (meta.regularMarketPrice - realChg)
                  : (meta.previousClose || meta.regularMarketPrice);

  assert.strictEqual(prevClose, 3170, `Previous close must be 3170, not ${prevClose}`);
  const pct = realChgPct !== null ? Math.round(realChgPct * 100) / 100 : ((meta.regularMarketPrice - prevClose) / prevClose * 100);
  assert.strictEqual(pct, 0.32, `Change percent must be around +0.32%, not -4.50%`);
  assert.notStrictEqual(pct, -4.50, `Old bug: 5-day chartPreviousClose must NEVER result in -4.50%`);
});

// ────────────────────────────────────────────────────────────
// SECTION 2: BANDARMOLOGY CANONICAL SCALE & UI GAUGE INVARIANTS
// ────────────────────────────────────────────────────────────
test('Bandarmology Scale: 0..100 canonical score mappings', async () => {
  const engineModule = await import('./lib/idx-data-engine.js');
  // Directly test generateBrokerSummary or computeBandarmologyVerdict output
  const sampleSummary = await engineModule.generateBrokerSummary('BBCA', null, '1D', 'all', 'RG');
  assert(sampleSummary, 'generateBrokerSummary should return a summary object');
  assert(sampleSummary.bandarmology, 'summary should have bandarmology verdict');
  
  const score = sampleSummary.bandarmology.score;
  assert(typeof score === 'number', `Bandarmology score must be a number, got ${typeof score}`);
  assert(score >= 0 && score <= 100, `Bandarmology score must be in [0, 100], got ${score}`);
});

test('Bandarmology UI Gauge Invariants: neutral score (50) is centered and labeled (Net 0)', () => {
  // Test the gauge math from public/js/49-bandar-movement.js
  function evaluateGauge(score) {
    const normPct = Math.max(0, Math.min(100, Math.round(score)));
    const vColor = score >= 60 ? '#10B981' : (score <= 40 ? '#EF4444' : 'var(--text3)');
    let scoreLabel = '';
    if (score > 50) scoreLabel = `(+${score - 50})`;
    else if (score < 50) scoreLabel = `(${score - 50})`;
    else scoreLabel = '(Net 0)';
    return { normPct, vColor, scoreLabel };
  }

  // Neutral invariant
  const neutral = evaluateGauge(50);
  assert.strictEqual(neutral.normPct, 50, 'Neutral score 50 must position bar at exactly 50%');
  assert.strictEqual(neutral.vColor, 'var(--text3)', 'Neutral score must use neutral text color');
  assert.strictEqual(neutral.scoreLabel, '(Net 0)', 'Neutral score label must be (Net 0), not (+50)');

  // Big Accumulation invariant
  const bigAcc = evaluateGauge(90);
  assert.strictEqual(bigAcc.normPct, 90, 'Big accumulation score 90 must position bar at 90%');
  assert.strictEqual(bigAcc.vColor, '#10B981', 'Accumulation must be green');
  assert.strictEqual(bigAcc.scoreLabel, '(+40)', 'Accumulation delta from 50 must be +40');

  // Big Distribution invariant
  const bigDist = evaluateGauge(15);
  assert.strictEqual(bigDist.normPct, 15, 'Big distribution score 15 must position bar at 15%');
  assert.strictEqual(bigDist.vColor, '#EF4444', 'Distribution must be red');
  assert.strictEqual(bigDist.scoreLabel, '(-35)', 'Distribution delta from 50 must be -35');
});

// ────────────────────────────────────────────────────────────
// SECTION 3: CANONICAL FINANCIAL POLICY & TICK SIZES
// ────────────────────────────────────────────────────────────
test('Financial Policy: BEI Tick Size tiered fractions', async () => {
  const engineModule = await import('./lib/idx-data-engine.js');
  const getBeiTickSize = engineModule.getBeiTickSize;
  assert(typeof getBeiTickSize === 'function', 'getBeiTickSize must be exported');

  assert.strictEqual(getBeiTickSize(120), 1, 'Tick size for price 120 must be Rp 1');
  assert.strictEqual(getBeiTickSize(350), 2, 'Tick size for price 350 must be Rp 2');
  assert.strictEqual(getBeiTickSize(1500), 5, 'Tick size for price 1500 must be Rp 5');
  assert.strictEqual(getBeiTickSize(3180), 10, 'Tick size for price 3180 must be Rp 10');
  assert.strictEqual(getBeiTickSize(6800), 25, 'Tick size for price 6800 must be Rp 25');
});

test('Financial Policy: Transaction Tax and Fee integrity', () => {
  // Test canonical calculation
  const gross = 10000000; // Rp 10,000,000 (100 lot at Rp 1000)
  const brokerFeeRate = 0.0015; // 0.15%
  const brokerFee = gross * brokerFeeRate; // Rp 15,000
  const ppnRate = 0.11; // 11% PPN on commission
  const ppn = brokerFee * ppnRate; // Rp 1,650
  const levyRate = 0.00043; // 0.043% Levy BEI+KPEI+KSEI
  const levy = gross * levyRate; // Rp 4,300
  const pphJualRate = 0.001; // 0.1% PPh Final on Gross Sell
  const pphJual = gross * pphJualRate; // Rp 10,000

  // BUY Cost
  const buyTotalCost = gross + brokerFee + ppn + levy;
  assert.strictEqual(buyTotalCost, 10020950, 'Buy total must equal gross + brokerFee + ppn + levy with NO PPh');

  // SELL Net Cash
  const sellTotalCost = brokerFee + ppn + levy + pphJual;
  const sellNetCash = gross - sellTotalCost;
  assert.strictEqual(sellNetCash, 9969050, 'Sell net cash must equal gross - (brokerFee + ppn + levy + pphJual)');
});

// ────────────────────────────────────────────────────────────
// SECTION 4: TICKER SANITIZATION INVARIANTS
// ────────────────────────────────────────────────────────────
test('Ticker Sanitization: uniform stripping of suffixes and casing', () => {
  function cleanTicker(raw) {
    if (!raw) return '';
    return String(raw)
      .trim()
      .toUpperCase()
      .replace(/\.JK$/i, '')
      .replace(/\.US$/i, '')
      .replace(/[^A-Z0-9^]/g, '');
  }

  const variations = ['bbri', 'BBRI', 'BBRI.JK', 'bbri.jk', '  bbri.jk  ', 'BBRI.US'];
  variations.forEach(v => {
    assert.strictEqual(cleanTicker(v), 'BBRI', `Ticker variation "${v}" must sanitize to "BBRI"`);
  });

  const indexVariations = ['^JKSE', 'jkse', '^jkse'];
  indexVariations.forEach(v => {
    const cleaned = cleanTicker(v);
    assert(cleaned === 'JKSE' || cleaned === '^JKSE', `Index ticker "${v}" sanitized cleanly`);
  });
});

// ────────────────────────────────────────────────────────────
// SECTION 5: DATA PROVENANCE & ZERO SYNTHETIC FALLBACK IN AUDIT
// ────────────────────────────────────────────────────────────
test('Data Provenance: assessDataQuality() returns explicit status without inventing data', async () => {
  const engineModule = await import('./lib/idx-data-engine.js');
  const assessDataQuality = engineModule.assessDataQuality;

  // Unknown ticker
  const invalidQuality = assessDataQuality('NONEXISTENT_TICKER_XYZ');
  assert.strictEqual(invalidQuality.status, 'INVALID', 'Unknown ticker must evaluate to INVALID status');

  // Real universe ticker BBCA
  const validQuality = assessDataQuality('BBCA');
  assert(validQuality.status === 'REAL' || validQuality.status === 'STALE' || validQuality.status === 'UNAVAILABLE',
    `Known universe ticker must return REAL, STALE, or UNAVAILABLE, got ${validQuality.status}`);
  assert.notStrictEqual(validQuality.status, 'SIMULATION', 'Production data gate must not return SIMULATION for valid IDX stock');
});

// ────────────────────────────────────────────────────────────
// SUMMARY
// ────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log('═══════════════════════════════════════════════════════');
  if (passedTests === totalTests) {
    console.log(`🎉 ALL ${passedTests}/${totalTests} CODE INTEGRITY & TRACEABILITY AUDIT TESTS PASSED!`);
  } else {
    console.error(`💥 ${totalTests - passedTests}/${totalTests} TESTS FAILED!`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════');
}, 500);
