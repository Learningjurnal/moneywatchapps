/**
 * test_provider_functions.js — regression tests for two real production
 * incidents (2026-09-10, see INCIDENT_LOG.md #1 and #2).
 *
 * WHY THIS FILE EXISTS: both incidents happened in code that had ZERO
 * automated test coverage before this — the Yahoo/IDX provider functions
 * need live network (finance.yahoo.com / idx.co.id), which this sandbox
 * doesn't have, so they were never exercised by npm test at all; the
 * Stock Intel auto-fetch guard is DOM-driven browser code, also outside
 * every existing test file's reach. Both gaps are closed here the same
 * way the rest of this project's tests avoid re-implementing logic:
 * import/execute the REAL source (via a real ESM import for the Yahoo
 * client, via vm.runInContext for the plain-script browser file — same
 * technique test_suite.js already uses for public/js/02b-price-index.js),
 * with the network layer mocked rather than the logic being tested.
 *
 * SCOPE: this only covers the two specific failure modes that actually
 * happened, not general fuzzing of every provider function. That is a
 * deliberate, narrow start — expand it the next time a similar bug is
 * found, not preemptively now.
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 PROVIDER FUNCTION REGRESSION TESTS');
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

async function asyncTest(name, fn) {
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

// ============================================================
// INCIDENT #1 (2026-09-10): getBeiTickSize was not imported into
// lib/providers/yahoo-client.js after the provider-adapter refactor
// moved it to lib/providers/idx-client.js — every real-time quote fetch
// threw "getBeiTickSize is not defined" and silently degraded to an
// error response. Fixed in PR #87. ESLint's no-undef (see eslint.config.js)
// now catches this class of bug statically before merge; this test
// additionally proves the RUNTIME behavior is correct end-to-end —
// exercising the real fetchYahooQuote() against a mocked Yahoo response,
// the same way the real incident would have been caught before shipping.
// ============================================================
await (async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('v8/finance/chart')) {
      return {
        ok: true,
        json: async () => ({
          chart: { result: [{
            meta: {
              regularMarketPrice: 9500, chartPreviousClose: 9400,
              regularMarketDayHigh: 9600, regularMarketDayLow: 9400,
              regularMarketVolume: 1000000
            },
            timestamp: [1700000000],
            indicators: { quote: [{ open: [9400], high: [9600], low: [9400], close: [9500], volume: [1000000] }] }
          }] }
        })
      };
    }
    // Crumb/fundamentals endpoints — simulate unavailable so
    // fetchYahooFundamentals() degrades to its own honest fallback
    // instead of this test needing to mock that whole flow too.
    return { ok: false, status: 500, headers: { get: () => null }, text: async () => '', json: async () => ({}) };
  };

  try {
    const { fetchYahooQuote } = await import('./lib/providers/yahoo-client.js');
    await asyncTest('INCIDENT #1: fetchYahooQuote() completes and returns a real quote+orderBook without throwing "getBeiTickSize is not defined"', async () => {
      const q = await fetchYahooQuote('BBCA');
      assert(q && typeof q === 'object', 'fetchYahooQuote() returned nothing');
      assert.strictEqual(q.price, 9500, `Expected price 9500, got ${q.price}`);
      assert(q.orderBook && q.orderBook.bids && q.orderBook.bids.length > 0,
        'orderBook.bids missing — this is exactly the field getBeiTickSize() builds; its absence means the bug regressed');
      assert(typeof q.orderBook.bids[0].price === 'number' && q.orderBook.bids[0].price > 0,
        'orderBook.bids[0].price is not a valid number');
    });
  } finally {
    global.fetch = originalFetch;
  }
})();

// ============================================================
// INCIDENT #2 (2026-09-10): fetchRealStockIntelData()'s `finally` block
// calls renderStockIntelPage(), which re-enters its own auto-fetch guard
// with no cooldown — a fetch that keeps failing retried itself with zero
// delay, forever, for as long as the tab stayed open (observed: ~2-9
// requests/second sustained in production). Fixed in PR #88 by extracting
// the guard into intelShouldAutoFetch() (public/js/27-stockintel.js) and
// requiring a 30s cooldown since the last attempt. This test runs the
// REAL source file in a sandboxed VM context (same technique
// loadBaseUniverse() uses for 01-data.js) and calls the real function —
// not a re-typed copy of its logic.
// ============================================================
test('INCIDENT #2: intelShouldAutoFetch() blocks re-entrant auto-fetch within the cooldown window, and allows it again after', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');

  // Minimal sandbox: only what's needed for this file's top-level
  // `var`/`function` declarations to parse and run without throwing.
  // Nothing here fakes intelShouldAutoFetch()'s own logic — that
  // function's real body executes unmodified.
  const sandbox = {
    window: {},
    document: { getElementById: () => null, addEventListener: () => {} },
    console,
    fetch: async () => ({ ok: false, status: 500 }),
    setTimeout,
    Date, Math, JSON, Array, Object, String, Number, Set, Map, Promise,
    isNaN, parseFloat, parseInt, encodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '27-stockintel.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.intelShouldAutoFetch, 'function',
    'intelShouldAutoFetch() not found in public/js/27-stockintel.js — has it been renamed/removed?');

  // Simulate: cache empty, not loading, never attempted before -> first
  // visit should be allowed to fetch.
  assert.strictEqual(ctx.intelShouldAutoFetch('BBCA', true), true,
    'First-ever call for a ticker with no cache and no prior attempt should be allowed to auto-fetch');

  // Simulate the exact incident: the fetch "failed" (cache still empty),
  // and record the attempt the same way fetchRealStockIntelData() does.
  ctx.MW_INTEL_LAST_ATTEMPT['BBCA'] = Date.now();

  // Immediately re-check (as renderStockIntelPage() does in the `finally`
  // block, with zero delay) — before the fix, this returned true forever;
  // now it must be blocked by the cooldown.
  assert.strictEqual(ctx.intelShouldAutoFetch('BBCA', true), false,
    'REGRESSION: intelShouldAutoFetch() allowed an immediate re-fetch with no cooldown elapsed — this is the exact infinite-loop bug from the 2026-09-10 incident');

  // Simulate the cooldown having elapsed (30s + a margin) — should allow
  // a fresh attempt again (self-healing once the underlying provider
  // recovers), not block forever.
  ctx.MW_INTEL_LAST_ATTEMPT['BBCA'] = Date.now() - (ctx.MW_INTEL_RETRY_COOLDOWN_MS + 1000);
  assert.strictEqual(ctx.intelShouldAutoFetch('BBCA', true), true,
    'Auto-fetch should be allowed again once the cooldown window has elapsed');

  // A successful fetch (cache populated) should never trigger another
  // auto-fetch, cooldown or not — the guard's first and most basic job.
  ctx.MW_INTEL_CACHE['BBCA'] = { quote: { price: 9500 } };
  assert.strictEqual(ctx.intelShouldAutoFetch('BBCA', true), false,
    'A ticker with a cached quote should never trigger another auto-fetch');

  // A non-IDX ticker should never auto-fetch regardless of cache state.
  assert.strictEqual(ctx.intelShouldAutoFetch('AAPL', false), false,
    'A non-IDX ticker should never trigger an IDX auto-fetch');
});

// ============================================================
// INCIDENT #3 (2026-09-10): found proactively via a sweep for the same
// `finally { ...; render() }` pattern across public/js — not from a
// reported symptom. lib/38-ai-autonomous-trading.js's
// ensureFullUniverseLoaded() had the identical bug to Stock Intel's:
// fetchAiScanData()'s `finally` block always calls renderAiTradingPage(),
// which re-enters ensureFullUniverseLoaded()'s "fetch if AI_UNIVERSE is
// still empty" check. On failure, AI_UNIVERSE is never populated (the
// catch block only sets AI_SCAN_ERROR), so without a cooldown, the very
// next render would re-fire the fetch immediately, forever. Fixed the
// same way: extracted aiShouldAutoLoadUniverse() (pure, no DOM/network)
// with a 30s cooldown via AI_SCAN_LAST_ATTEMPT/AI_SCAN_RETRY_COOLDOWN_MS.
// ============================================================
await asyncTest('INCIDENT #3: aiShouldAutoLoadUniverse() blocks re-entrant auto-load within the cooldown window, and allows it again after', async () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');

  // This file is wrapped in `(function(window, document) {...})(window,
  // document)` (unlike 27-stockintel.js) — AI_SCAN_LAST_ATTEMPT and
  // AI_UNIVERSE are closure-private, not reachable as ctx.AI_SCAN_LAST_
  // ATTEMPT from outside. So this test drives time through a controllable
  // Date.now() and state through the REAL fetchAiScanData()/
  // aiShouldAutoLoadUniverse() functions instead of poking internals —
  // closer to what actually happens in the browser, and doesn't depend on
  // this file's variables staying accessible from outside the IIFE.
  let mockNow = 1700000000000;
  class ControllableDate extends Date {
    static now() { return mockNow; }
  }

  const sandbox = {
    window: {},
    document: { getElementById: () => null, addEventListener: () => {}, querySelectorAll: () => [] },
    console,
    fetch: async () => { throw new Error('simulated network failure'); },
    setTimeout, setInterval: () => {}, clearInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    Date: ControllableDate, Math, JSON, Array, Object, String, Number, Set, Map, Promise,
    isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '38-ai-autonomous-trading.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.aiShouldAutoLoadUniverse, 'function',
    'aiShouldAutoLoadUniverse() not found in public/js/38-ai-autonomous-trading.js — has it been renamed/removed?');
  assert.strictEqual(typeof ctx.fetchAiScanData, 'function',
    'fetchAiScanData() not found — has it been renamed/removed?');

  // Empty universe, never attempted before -> first visit should load.
  assert.strictEqual(ctx.aiShouldAutoLoadUniverse(), true,
    'First-ever check with an empty universe and no prior attempt should be allowed to auto-load');

  // Run the REAL fetchAiScanData() against the always-failing mocked
  // fetch — this is exactly what ensureFullUniverseLoaded() would have
  // triggered, and exactly what recorded AI_SCAN_LAST_ATTEMPT in the
  // real incident.
  await ctx.fetchAiScanData();

  // Immediately re-check at the SAME mocked instant (as renderAiTradingPage()
  // does in the `finally` block, with zero real delay) — before the fix,
  // this returned true forever.
  assert.strictEqual(ctx.aiShouldAutoLoadUniverse(), false,
    'REGRESSION: aiShouldAutoLoadUniverse() allowed an immediate re-load right after a failed scan with no cooldown elapsed — this is the same infinite-loop bug class as the Stock Intel incident');

  // Advance the mocked clock past the cooldown -> should self-heal.
  mockNow += 31000;
  assert.strictEqual(ctx.aiShouldAutoLoadUniverse(), true,
    'Auto-load should be allowed again once the cooldown window has elapsed');
});

// ============================================================
// FEATURE (2026-09-10): AI Trading Scanner universe selector — user
// reported the Scanner only ever shows 45 signals ("Semua Sinyal (45)")
// and asked how to scan beyond LQ45. aiSetScanUniverse()/fetchAiScanData()
// now support 'idx80'/'kompas100' by resolving a ticker list from
// /api/idx/stocks?index=... and scanning it in sequential batches of
// AI_SCAN_BATCH_SIZE (80) against /api/idx/ai-scan, merging all batches
// into AI_UNIVERSE. This locks down that the batching/merging actually
// works end-to-end through the real functions, not a re-implementation.
// ============================================================
await asyncTest('aiSetScanUniverse(): a universe larger than one batch is fetched in sequential batches and merged into AI_UNIVERSE', async () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');

  // 127 fake Kompas100 tickers — deliberately > AI_SCAN_BATCH_SIZE (80) so
  // this must split into 2 batches to be handled correctly.
  const fakeTickers = [];
  for (let i = 0; i < 127; i++) fakeTickers.push('T' + String(i).padStart(3, '0'));
  const LQ45_FAKE_TICKERS = [];
  for (let i = 0; i < 45; i++) LQ45_FAKE_TICKERS.push('L' + String(i).padStart(3, '0'));

  const fetchCalls = [];
  function fakeSignalFor(ticker) {
    return {
      ticker, price: 5000, changePercent: 1.2, volume: 1000000,
      signal: 'BUY', trend: 'UPTREND', compositeScore: 70,
      technicalScore: 75, fundamentalScore: 60, rsi14: 55, ema20: 4900, ema50: 4800,
      volRatio: 1.3, probability: 60, evPerShare: 50,
      entry: 5000, sl: 4800, tp1: 5300, tp2: 5500, rrRatio: 1.5,
      dataQuality: { price: true, technical: true, fundamental: true },
      gateStatus: { status: 'REAL', reasons: [] }
    };
  }

  const sandbox = {
    window: {},
    document: { getElementById: () => null, addEventListener: () => {}, querySelectorAll: () => [] },
    console,
    fetch: async (url) => {
      fetchCalls.push(url);
      if (url.indexOf('/api/idx/stocks') === 0) {
        return { json: async () => ({ success: true, data: fakeTickers.map(t => ({ code: t })) }) };
      }
      // /api/idx/ai-scan?tickers=A,B,C,... — no ?tickers= at all means the
      // 'lq45' case (server default), simulated here as 45 fake tickers.
      const qs = url.split('?')[1] || '';
      const params = new URLSearchParams(qs);
      const requested = qs ? (params.get('tickers') || '').split(',').filter(Boolean) : LQ45_FAKE_TICKERS;
      return { json: async () => ({ success: true, signals: requested.map(fakeSignalFor) }) };
    },
    setTimeout, setInterval: () => {}, clearInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    Date, Math, JSON, Array, Object, String, Number, Set, Map, Promise, URLSearchParams,
    isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '38-ai-autonomous-trading.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.aiSetScanUniverse, 'function',
    'aiSetScanUniverse() not found — has it been renamed/removed?');

  await ctx.aiSetScanUniverse('kompas100');

  assert.strictEqual(ctx.AI_UNIVERSE.length, 127,
    'All 127 tickers across both batches should end up merged into AI_UNIVERSE, not just the first batch');

  const stocksCall = fetchCalls.find(u => u.indexOf('/api/idx/stocks') === 0);
  assert(stocksCall && stocksCall.indexOf('index=kompas100') !== -1,
    'Should have fetched the Kompas100 ticker list via /api/idx/stocks?index=kompas100');

  const scanCalls = fetchCalls.filter(u => u.indexOf('/api/idx/ai-scan') === 0);
  assert.strictEqual(scanCalls.length, 2,
    'REGRESSION: 127 tickers at AI_SCAN_BATCH_SIZE=80 must split into exactly 2 /api/idx/ai-scan requests, not 1 (which would silently truncate to 80) or more');

  // Switching back to LQ45 must not carry over the Kompas100-sized result.
  await ctx.aiSetScanUniverse('lq45');
  assert.strictEqual(ctx.AI_UNIVERSE.length, 45,
    'Switching the universe back to LQ45 must produce a clean 45-ticker result, not the previous Kompas100 scan left mixed in');
});

// ============================================================
console.log('═══════════════════════════════════════════════════════');
if (passedTests === totalTests) {
  console.log(`🎉 ALL ${passedTests}/${totalTests} PROVIDER FUNCTION TESTS PASSED`);
} else {
  console.log(`⚠️  ${passedTests}/${totalTests} PASSED — see failures above`);
}
console.log('═══════════════════════════════════════════════════════');
