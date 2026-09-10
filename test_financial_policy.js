/**
 * test_financial_policy.js — FINANCIAL_POLICY.md drift detector
 *
 * PURPOSE: FINANCIAL_POLICY.md (repo root) is a governance document, not
 * just a comment — Section 17 explicitly requires "automated tests should
 * verify that the implementation matches this document." This file is
 * that verification, for the subset of the policy that is actually
 * implemented in code today.
 *
 * WHAT THIS DOES NOT DO: it does not check every section of the policy.
 * As reviewed against the codebase (Sept 2026), large parts of the
 * document describe infrastructure that does not exist yet in this app —
 * a formal trading-mode state machine (RESEARCH/PAPER/SHADOW/LIVE_GATED/
 * LIVE), enforced position-size/cash-buffer limits, an ML model
 * promotion/Champion-Challenger pipeline, and a literal audit-trail
 * schema with the exact field names in Section 14. Those are correctly
 * marked PROVISIONAL/DRAFT in the document and are not tested here —
 * asserting their absence would just break the moment someone starts
 * building them, which is progress, not drift. This file only covers the
 * parts of the policy that ARE implemented, so a future change that
 * silently de-syncs the code from the document (in either direction)
 * fails loudly here instead of being discovered by a user's numbers not
 * matching a printed policy PDF.
 *
 * METHOD: values are extracted from the REAL source files (via regex on
 * the literal declaration, or by importing the real exported function —
 * never a hand-copied re-implementation) and compared against values
 * parsed from the REAL policy document text (never a hand-copied
 * duplicate of "what the doc currently says"). Both sides read the
 * primary source, so this test only passes when the two documents
 * actually agree — editing either one without the other breaks it.
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { assessDataQuality } from './lib/idx-data-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════');
console.log('📜 FINANCIAL_POLICY.md DRIFT DETECTOR');
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
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

const policyText = fs.readFileSync(path.join(__dirname, 'FINANCIAL_POLICY.md'), 'utf8');
const dataText = fs.readFileSync(path.join(__dirname, 'public/js/01-data.js'), 'utf8');
const engineText = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');

// ── Helper: extract the real TAX_SETTINGS literal from 01-data.js and
// evaluate ONLY that isolated snippet (not the whole browser-oriented
// file, which throws on missing `window`/`document`) — same "run the
// real source, don't re-type it" principle test_suite.js already uses
// for public/js/02b-price-index.js via vm.runInContext. ──
function loadRealTaxSettings() {
  const m = dataText.match(/var TAX_SETTINGS = (\{[\s\S]*?\n\});/);
  assert(m, 'Could not locate `var TAX_SETTINGS = {...};` in public/js/01-data.js — has it been renamed/restructured?');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext('TAX_SETTINGS = ' + m[1] + ';', sandbox, { filename: '01-data.js (TAX_SETTINGS extract)' });
  return sandbox.TAX_SETTINGS;
}
const TAX_SETTINGS = loadRealTaxSettings();

// ── Helper: extract a `const NAME = <number>;` literal from source text ──
function extractConst(text, name, sourceLabel) {
  const m = text.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\d.]+)\\s*;'));
  assert(m, `Could not locate \`const ${name} = <number>;\` in ${sourceLabel} — has it been renamed/restructured?`);
  return parseFloat(m[1]);
}

// ============================================================
// SECTION 3.1 — Canonical data-quality states
// ============================================================
test('Policy §3.1: the five canonical data-quality state names are the ones actually used by assessDataQuality()', () => {
  const section = policyText.match(/### 3\.1 Canonical states([\s\S]*?)### 3\.2/);
  assert(section, 'Could not locate "### 3.1 Canonical states" section in FINANCIAL_POLICY.md');
  const namesInDoc = [...section[1].matchAll(/\*\*(\w+):\*\*/g)].map(m => m[1]);
  assert.deepStrictEqual(
    namesInDoc.sort(),
    ['INVALID', 'REAL', 'SIMULATION', 'STALE', 'UNAVAILABLE'].sort(),
    'FINANCIAL_POLICY.md §3.1 state names changed — assessDataQuality() in lib/idx-data-engine.js must be updated (or reverted) to match'
  );
});

test('Behavior: assessDataQuality() actually returns REAL for good, fresh, real data', () => {
  const now = Date.now();
  const points = Array.from({ length: 260 }, (_, i) => ({
    t: now - (260 - i) * 86400000, o: 1000, h: 1010, l: 990, c: 1005, v: 1000000
  }));
  const r = assessDataQuality('BBCA', { points });
  assert.strictEqual(r.status, 'REAL');
  assert.strictEqual(r.passesGate, true);
});

test('Behavior: assessDataQuality() returns SIMULATION for synthetic fallback data, and it never passes the gate', () => {
  const r = assessDataQuality('BBCA', { points: [{ t: Date.now(), o: 1, h: 1, l: 1, c: 1, v: 1 }], isSimulated: true });
  assert.strictEqual(r.status, 'SIMULATION');
  assert.strictEqual(r.passesGate, false, 'Policy §3.2: SIMULATION must never be eligible for a live decision (BLOCKED)');
});

test('Behavior: assessDataQuality() returns INVALID for an unrecognized/non-universe ticker', () => {
  const r = assessDataQuality('NOTAREALTICKERXYZ', { points: [] });
  assert.strictEqual(r.status, 'INVALID');
  assert.strictEqual(r.passesGate, false);
});

test('Behavior: assessDataQuality() returns UNAVAILABLE when no candles exist for an otherwise-valid ticker', () => {
  const r = assessDataQuality('BBCA', { points: [] });
  assert.strictEqual(r.status, 'UNAVAILABLE');
  assert.strictEqual(r.passesGate, false);
});

test('Behavior: assessDataQuality() returns STALE when the last candle is older than the freshness threshold', () => {
  const staleTime = Date.now() - 10 * 86400000; // 10 days old
  const points = Array.from({ length: 260 }, (_, i) => ({
    t: staleTime - (260 - i) * 86400000, o: 1000, h: 1010, l: 990, c: 1005, v: 1000000
  }));
  const r = assessDataQuality('BBCA', { points });
  assert.strictEqual(r.status, 'STALE');
  assert.strictEqual(r.passesGate, false, 'Policy §3.2: STALE must not be treated as eligible for a NEW position entry');
});

// ============================================================
// SECTION 5 — Transaction fees and taxes (Indonesia)
// ============================================================
test('Policy §5: Levy rate (BEI/KPEI/KSEI) in the document matches TAX_SETTINGS.levy in code', () => {
  const m = policyText.match(/Levy \(BEI\/KPEI\/KSEI\)\s*([\d.]+)%/);
  assert(m, 'Could not find the Levy percentage in FINANCIAL_POLICY.md §5 — has the wording changed?');
  const docLevy = parseFloat(m[1]) / 100;
  assert.strictEqual(TAX_SETTINGS.levy, docLevy,
    `Doc says Levy = ${m[1]}% (${docLevy}) but TAX_SETTINGS.levy in public/js/01-data.js = ${TAX_SETTINGS.levy} — one of them changed without the other`);
});

test('Policy §5: PPN rate on broker commission in the document matches TAX_SETTINGS.ppn in code', () => {
  const m = policyText.match(/PPN \((\d+)% × Broker Fee\)/);
  assert(m, 'Could not find the PPN percentage in FINANCIAL_POLICY.md §5 — has the wording changed?');
  const docPpn = parseFloat(m[1]) / 100;
  assert.strictEqual(TAX_SETTINGS.ppn, docPpn,
    `Doc says PPN = ${m[1]}% (${docPpn}) but TAX_SETTINGS.ppn in public/js/01-data.js = ${TAX_SETTINGS.ppn} — one of them changed without the other. ` +
    `NOTE: Indonesia's general VAT nominally rose to 12% under the HPP Law effective 2025, though public reporting says the higher rate was ultimately applied narrowly ` +
    `(e.g. luxury goods) with most transactions kept at an effective 11% via a DPP nilai lain adjustment. This needs verification against a current DJP source/tax advisor — ` +
    `this test only guards against the CODE and the POLICY DOC silently disagreeing with EACH OTHER, not against real-world regulation changing under both of them.`);
});

test('Policy §5: PPh Final rate on SELL gross value in the document matches TAX_SETTINGS.pphJual in code', () => {
  const m = policyText.match(/PPh Final Penjualan Saham\s*([\d.]+)% × Gross Sell Value/);
  assert(m, 'Could not find the PPh Final percentage in FINANCIAL_POLICY.md §5 — has the wording changed?');
  const docPphJual = parseFloat(m[1]) / 100;
  assert.strictEqual(TAX_SETTINGS.pphJual, docPphJual,
    `Doc says PPh Final (sell) = ${m[1]}% (${docPphJual}) but TAX_SETTINGS.pphJual in public/js/01-data.js = ${TAX_SETTINGS.pphJual} — one of them changed without the other`);
});

test('Policy §5: BUY pays no PPh Final (document explicitly states 0% for Buy, matched by the Buy Cost formula omitting it)', () => {
  const buySection = policyText.match(/### BUY\s*```text([\s\S]*?)```/);
  assert(buySection, 'Could not find the "### BUY" cost formula block in FINANCIAL_POLICY.md §5');
  assert(!/PPh/.test(buySection[1]), 'Policy §5 BUY cost formula should not include a PPh Final line (PPh Final applies only to SELL per Indonesian regulation)');
});

// ============================================================
// SECTION 7 — Portfolio risk policy (approved values — see §16)
// ============================================================
test('Policy §7: "Maximum capital at risk per trade" approved value matches RISK_PER_TRADE_PCT already hardcoded in the backtest engine', () => {
  const m = policyText.match(/\|\s*Maximum capital at risk per trade\s*\|\s*(\d+)% of portfolio\s*\|/);
  assert(m, 'Could not find the "Maximum capital at risk per trade" row in FINANCIAL_POLICY.md §7 table — has the wording/table layout changed?');
  const docPct = parseFloat(m[1]);
  const codePct = extractConst(engineText, 'RISK_PER_TRADE_PCT', 'lib/idx-data-engine.js');
  assert.strictEqual(codePct, docPct,
    `Doc approves ${docPct}% max capital at risk per trade but RISK_PER_TRADE_PCT in lib/idx-data-engine.js = ${codePct}% — ` +
    `either the code's default needs to change to match the approved value, or a policy-change-control step (§15) is needed before changing the doc.`);
});

// ============================================================
console.log('═══════════════════════════════════════════════════════');
if (passedTests === totalTests) {
  console.log(`🎉 ALL ${passedTests}/${totalTests} FINANCIAL POLICY CHECKS PASSED — code and FINANCIAL_POLICY.md agree`);
} else {
  console.log(`⚠️  ${passedTests}/${totalTests} PASSED — code and FINANCIAL_POLICY.md have drifted apart, see failures above`);
}
console.log('═══════════════════════════════════════════════════════');
