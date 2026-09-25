/**
 * test_strategy_engine.js — Money Watch Strategy Engine V1 regression tests.
 * Covers: every indicator formula (unit), strategy weight-sum validation,
 * strategy registry loading, mandatory-condition score override, and one
 * full integration pass (Provider Adapter -> NormalizedMarketData ->
 * Indicators -> Strategy -> Score -> Result) with mocked Invezgo responses.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 STRATEGY ENGINE V1 REGRESSION TESTS');
console.log('═══════════════════════════════════════════════════════');

let passedTests = 0;
let totalTests = 0;

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
// PART 1 — Indicator formulas (pure, no network)
// ============================================================
await (async () => {
  const { computeHighBidOffer } = await import('./lib/engine/indicators/highBidOffer.js');
  const { computeNoSell } = await import('./lib/engine/indicators/noSell.js');
  const { computeCloseHigh } = await import('./lib/engine/indicators/closeHigh.js');
  const { computeForeignFlow } = await import('./lib/engine/indicators/foreignFlow.js');
  const { computeHighNonRegular } = await import('./lib/engine/indicators/highNonRegular.js');

  await asyncTest('HIGH_BID_OFFER: BidOfferRatio = bid1lot/offer1lot, passes when >= threshold', async () => {
    const r = computeHighBidOffer({ orderBook: { bid1price: 100, bid1lot: 3000, bid1freq: 1, offer1price: 101, offer1lot: 1000, offer1freq: 1 } }, 1.5);
    assert.strictEqual(r.value, 3, 'BidOfferRatio must be 3000/1000=3');
    assert.strictEqual(r.passed, true, 'ratio 3 >= threshold 1.5 must pass');
    assert.strictEqual(r.status, 'VALID');
    assert.strictEqual(r.calculationVersion, '1.0.0');
  });

  await asyncTest('HIGH_BID_OFFER: UNAVAILABLE (not REJECT/0) when order book missing', async () => {
    const r = computeHighBidOffer(null, 1.5);
    assert.strictEqual(r.status, 'UNAVAILABLE');
    assert.strictEqual(r.value, null, 'must never fabricate a numeric value when data is missing');
    assert.strictEqual(r.passed, false);
  });

  await asyncTest('HIGH_BID_OFFER: UNAVAILABLE when offer depth is zero (ratio undefined, not Infinity)', async () => {
    const r = computeHighBidOffer({ orderBook: { bid1lot: 500, offer1lot: 0 } }, 1.5);
    assert.strictEqual(r.status, 'UNAVAILABLE');
    assert.strictEqual(r.reason, 'OFFER_DEPTH_ZERO');
  });

  await asyncTest('NO_SELL: SellPressure = offer1lot/(bid1lot+offer1lot), fails when above max', async () => {
    const r = computeNoSell({ orderBook: { bid1lot: 700, offer1lot: 300 } }, 0.30);
    assert.strictEqual(r.value, 0.3, 'SellPressure must be 300/1000=0.3');
    assert.strictEqual(r.passed, true, '0.3 <= max 0.30 must pass (boundary inclusive)');
  });

  await asyncTest('NO_SELL: fails when SellPressure exceeds max', async () => {
    const r = computeNoSell({ orderBook: { bid1lot: 400, offer1lot: 600 } }, 0.30);
    assert.strictEqual(r.value, 0.6);
    assert.strictEqual(r.passed, false);
  });

  await asyncTest('CLOSE_HIGH: ClosePosition = (Close-Low)/(High-Low)', async () => {
    const r = computeCloseHigh({ ohlc: { open: 100, high: 110, low: 90, close: 108 } }, 0.80);
    assert.strictEqual(r.value, 0.9, '(108-90)/(110-90) = 18/20 = 0.9');
    assert.strictEqual(r.passed, true);
  });

  await asyncTest('CLOSE_HIGH: UNAVAILABLE when High==Low (undefined range, not divide-by-zero to 0)', async () => {
    const r = computeCloseHigh({ ohlc: { open: 100, high: 100, low: 100, close: 100 } }, 0.80);
    assert.strictEqual(r.status, 'UNAVAILABLE');
    assert.strictEqual(r.reason, 'ZERO_RANGE');
  });

  await asyncTest('FOREIGN: ForeignParticipation = abs(NetForeignValue)/TotalTradedValue, direction BUY on positive net', async () => {
    const r = computeForeignFlow({ foreign: { netValueRp: 5_000_000_000, totalValueRp: 100_000_000_000 } }, 0.02);
    assert.strictEqual(r.value, 0.05);
    assert.strictEqual(r.passed, true);
    assert(r.reason.includes('direction=BUY'));
  });

  await asyncTest('FOREIGN: direction=SELL on negative net, UNAVAILABLE (not 0/NEUTRAL) when ticker absent from top movers', async () => {
    const sell = computeForeignFlow({ foreign: { netValueRp: -3_000_000_000, totalValueRp: 50_000_000_000 } }, 0.02);
    assert(sell.reason.includes('direction=SELL'));
    const missing = computeForeignFlow(null, 0.02);
    assert.strictEqual(missing.status, 'UNAVAILABLE', 'REGRESSION: a ticker not in today\'s top movers must be UNAVAILABLE, never silently 0/NEUTRAL');
  });

  await asyncTest('HIGH_NON_REGULAR: NonRegularRatio = (ngVolume+tnVolume)/totalVolume, UNAVAILABLE when provider does not expose it', async () => {
    const r = computeHighNonRegular({ nonRegular: { rgVolume: 800000, ngVolume: 150000, tnVolume: 50000 } }, 0.20);
    assert.strictEqual(r.value, 0.2, '(150000+50000)/1000000 = 0.2');
    assert.strictEqual(r.passed, true, '0.2 >= threshold 0.20 (boundary inclusive)');
    const missing = computeHighNonRegular(null, 0.20);
    assert.strictEqual(missing.status, 'UNAVAILABLE');
  });
})();

// ============================================================
// PART 1B — HIGH_ATS / VOLUME / FREQUENCY: rolling-baseline formulas.
// These persist state (RollingHistory.js), so each test uses a unique
// ticker to avoid cross-test collisions in the in-memory fallback store.
// ============================================================
await (async () => {
  const { computeHighATS } = await import('./lib/engine/indicators/highATS.js');
  const { computeVolume } = await import('./lib/engine/indicators/volume.js');
  const { computeFrequency } = await import('./lib/engine/indicators/frequency.js');

  await asyncTest('HIGH_ATS: ATS = volume/freq, but RelativeATS is DATA_INSUFFICIENT (not a fake ratio) before the rolling baseline has enough samples', async () => {
    const ticker = 'ATSTEST1';
    const r = await computeHighATS({ ticker, date: '2026-09-01', volume: 1_000_000, freq: 1000 }, 1.25);
    assert.strictEqual(r.status, 'UNAVAILABLE');
    assert(r.reason.includes('ROLLING_BASELINE_INSUFFICIENT'));
    assert.strictEqual(r.value, 1000, 'raw ATS (volume/freq=1000) is still surfaced even while RelativeATS is unavailable');
  });

  await asyncTest('HIGH_ATS: once enough days are recorded, RelativeATS = today ATS / rolling median ATS', async () => {
    const ticker = 'ATSTEST2';
    // Record 5 days of ATS=1000 (volume 1,000,000 / freq 1000), then a 6th
    // day with a real spike (ATS=2000) to check RelativeATS against that
    // established median.
    for (let d = 1; d <= 5; d++) {
      await computeHighATS({ ticker, date: `2026-09-0${d}`, volume: 1_000_000, freq: 1000 }, 1.25);
    }
    const spike = await computeHighATS({ ticker, date: '2026-09-06', volume: 2_000_000, freq: 1000 }, 1.25);
    assert.strictEqual(spike.status, 'VALID');
    assert.strictEqual(spike.value, 2, 'RelativeATS = 2000/1000 = 2x the rolling median');
    assert.strictEqual(spike.passed, true, '2x >= threshold 1.25 must pass');
  });

  await asyncTest('VOLUME: relative-to-rolling-median scoring, UNAVAILABLE before baseline exists', async () => {
    const ticker = 'VOLTEST1';
    const first = await computeVolume({ ticker, date: '2026-09-01', volume: 1_000_000 });
    assert.strictEqual(first.status, 'UNAVAILABLE');
    for (let d = 2; d <= 6; d++) await computeVolume({ ticker, date: `2026-09-0${d}`, volume: 1_000_000 });
    const today = await computeVolume({ ticker, date: '2026-09-07', volume: 1_500_000 });
    assert.strictEqual(today.status, 'VALID');
    assert.strictEqual(today.value, 1.5);
  });

  await asyncTest('FREQUENCY: relative-to-rolling-median scoring, UNAVAILABLE before baseline exists', async () => {
    const ticker = 'FREQTEST1';
    const first = await computeFrequency({ ticker, date: '2026-09-01', freq: 500 });
    assert.strictEqual(first.status, 'UNAVAILABLE');
    for (let d = 2; d <= 6; d++) await computeFrequency({ ticker, date: `2026-09-0${d}`, freq: 500 });
    const today = await computeFrequency({ ticker, date: '2026-09-07', freq: 250 });
    assert.strictEqual(today.status, 'VALID');
    assert.strictEqual(today.value, 0.5);
    assert.strictEqual(today.passed, false, '0.5x median is a decline, not >= threshold 1');
  });
})();

// ============================================================
// PART 2 — StrategyValidator: weights must sum to EXACTLY 1.0
// ============================================================
await (async () => {
  const { validateStrategyDefinition } = await import('./lib/engine/strategy/StrategyValidator.js');

  await asyncTest('StrategyValidator: rejects a definition whose weights do not sum to 1.0', async () => {
    const bad = { id: 'x', name: 'X', version: '1.0.0', weights: { HIGH_BID_OFFER: 0.5, CLOSE_HIGH: 0.4 }, scoreBands: { strong: 80, qualified: 70, watch: 55 } };
    const result = validateStrategyDefinition(bad);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(e => e.includes('sum to exactly 1.0')));
  });

  await asyncTest('StrategyValidator: rejects an unknown indicator name in weights', async () => {
    const bad = { id: 'x', name: 'X', version: '1.0.0', weights: { NOT_A_REAL_INDICATOR: 1.0 }, scoreBands: { strong: 80, qualified: 70, watch: 55 } };
    const result = validateStrategyDefinition(bad);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(e => e.includes('Unknown indicator')));
  });

  await asyncTest('StrategyValidator: rejects a mandatory condition that is not itself a weighted indicator', async () => {
    const bad = { id: 'x', name: 'X', version: '1.0.0', weights: { CLOSE_HIGH: 1.0 }, mandatoryConditions: ['HIGH_BID_OFFER'], scoreBands: { strong: 80, qualified: 70, watch: 55 } };
    const result = validateStrategyDefinition(bad);
    assert.strictEqual(result.valid, false);
    assert(result.errors.some(e => e.includes('not a weighted indicator')));
  });

  await asyncTest('StrategyValidator: accepts a well-formed definition with weights summing to exactly 1.0', async () => {
    const good = { id: 'x', name: 'X', version: '1.0.0', weights: { HIGH_BID_OFFER: 0.6, CLOSE_HIGH: 0.4 }, scoreBands: { strong: 80, qualified: 70, watch: 55 } };
    assert.strictEqual(validateStrategyDefinition(good).valid, true);
  });
})();

// ============================================================
// PART 3 — StrategyRegistry: all 4 real strategy JSON files load & validate
// ============================================================
await (async () => {
  const { loadStrategyRegistry } = await import('./lib/engine/strategy/StrategyRegistry.js');

  await asyncTest('StrategyRegistry: loads all 4 strategies/*.json without throwing, each weight sum == 1.0', async () => {
    const registry = loadStrategyRegistry();
    const ids = Object.keys(registry).sort();
    assert.deepStrictEqual(ids, ['day-trading', 'hidden-accumulation', 'momentum-candidate', 'swing-flow']);
    ids.forEach(id => {
      const sum = Object.values(registry[id].weights).reduce((a, b) => a + b, 0);
      assert(Math.abs(sum - 1) < 1e-6, `${id} weights must sum to 1.0, got ${sum}`);
    });
  });

  // FIX (2026-09-25): FOREIGN removed from all 3 strategies that carried
  // it (weights + mandatoryConditions), not just asserted here — see
  // lib/engine/indicators/foreignFlow.js's header comment for the full
  // incident: /analysis/top/foreign's calculated_value turned out to be
  // Invezgo's own ranking score (verified against 3 real captured API
  // responses), not a net Rupiah amount as the old code assumed, which
  // collapsed FOREIGN's participation ratio to ~0 for virtually every
  // ticker — a real problem since it was `mandatoryCondition` for these
  // two strategies. Weights redistributed proportionally among the
  // remaining indicators (still summing to 1.0, checked by the test
  // above) rather than left unassigned.
  await asyncTest('StrategyRegistry: momentum-candidate and hidden-accumulation carry the spec\'s mandatory conditions (FOREIGN excluded, see fix note above)', async () => {
    const registry = loadStrategyRegistry();
    assert.deepStrictEqual(registry['momentum-candidate'].mandatoryConditions.sort(), ['HIGH_BID_OFFER', 'NO_SELL'].sort());
    assert.deepStrictEqual(registry['hidden-accumulation'].mandatoryConditions.sort(), ['HIGH_BID_OFFER', 'HIGH_NON_REGULAR'].sort());
    assert.deepStrictEqual(registry['swing-flow'].mandatoryConditions, []);
    assert(!('FOREIGN' in registry['momentum-candidate'].weights), 'REGRESSION: FOREIGN weight is back in momentum-candidate despite the unverified-scale bug not being fixed');
    assert(!('FOREIGN' in registry['hidden-accumulation'].weights), 'REGRESSION: FOREIGN weight is back in hidden-accumulation despite the unverified-scale bug not being fixed');
    assert(!('FOREIGN' in registry['swing-flow'].weights), 'REGRESSION: FOREIGN weight is back in swing-flow despite the unverified-scale bug not being fixed');
  });
})();

// ============================================================
// PART 4 — ScoreEngine: mandatory-condition override (spec: "mandatory
// conditions override score. If mandatory data is unavailable: return
// DATA_INSUFFICIENT. Do NOT return REJECT.")
// ============================================================
await (async () => {
  const { scoreStrategy } = await import('./lib/engine/scoring/ScoreEngine.js');
  const strategyDef = { id: 'x', weights: { HIGH_BID_OFFER: 0.5, NO_SELL: 0.5 }, mandatoryConditions: ['HIGH_BID_OFFER'], scoreBands: { strong: 80, qualified: 70, watch: 55 } };

  await asyncTest('ScoreEngine: mandatory indicator UNAVAILABLE -> DATA_INSUFFICIENT, never REJECT', async () => {
    const indicators = [
      { name: 'HIGH_BID_OFFER', status: 'UNAVAILABLE', score: null, passed: false },
      { name: 'NO_SELL', status: 'VALID', score: 90, passed: true }
    ];
    const result = scoreStrategy(strategyDef, indicators);
    assert.strictEqual(result.status, 'DATA_INSUFFICIENT');
    assert.strictEqual(result.finalScore, null, 'must not compute a numeric score from partial mandatory data');
  });

  await asyncTest('ScoreEngine: mandatory indicator VALID but fails its threshold -> REJECT regardless of FinalScore', async () => {
    const indicators = [
      { name: 'HIGH_BID_OFFER', status: 'VALID', score: 95, passed: false },
      { name: 'NO_SELL', status: 'VALID', score: 95, passed: true }
    ];
    const result = scoreStrategy(strategyDef, indicators);
    assert.strictEqual(result.status, 'REJECT', 'a failed mandatory gate must REJECT even with high indicator scores');
  });

  await asyncTest('ScoreEngine: all mandatory conditions pass -> weighted FinalScore computed and banded', async () => {
    const indicators = [
      { name: 'HIGH_BID_OFFER', status: 'VALID', score: 90, passed: true },
      { name: 'NO_SELL', status: 'VALID', score: 90, passed: true }
    ];
    const result = scoreStrategy(strategyDef, indicators);
    assert.strictEqual(result.finalScore, 90);
    assert.strictEqual(result.status, 'STRONG');
  });

  await asyncTest('ScoreEngine: never returns BUY/SELL as a status — only STRONG/QUALIFIED/WATCH/REJECT/DATA_INSUFFICIENT', async () => {
    const allowed = ['STRONG', 'QUALIFIED', 'WATCH', 'REJECT', 'DATA_INSUFFICIENT'];
    const scenarios = [
      [{ name: 'HIGH_BID_OFFER', status: 'VALID', score: 10, passed: true }, { name: 'NO_SELL', status: 'VALID', score: 10, passed: true }],
      [{ name: 'HIGH_BID_OFFER', status: 'VALID', score: 60, passed: true }, { name: 'NO_SELL', status: 'VALID', score: 60, passed: true }]
    ];
    scenarios.forEach(indicators => assert(allowed.includes(scoreStrategy(strategyDef, indicators).status)));
  });
})();

// ============================================================
// PART 5 — Integration: Provider Adapter -> NormalizedMarketData ->
// Indicators -> Strategy -> Score -> Result (mocked Invezgo responses)
// ============================================================
await (async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.INVEZGO_API_KEY;
  process.env.INVEZGO_API_KEY = 'mock_test_key';

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/analysis/order-book/')) {
      return { ok: true, status: 200, json: async () => ({ code: 'STRATTEST', bid: [{ bid1price: 1000, bid1lot: 4000, bid1freq: 10 }], offer: [{ offer1price: 1010, offer1lot: 1000, offer1freq: 5 }] }) };
    }
    if (u.includes('/analysis/intraday-data/')) {
      return { ok: true, status: 200, json: async () => ({ code: 'STRATTEST', open: 990, high: 1015, low: 985, close: 1010, avg: 1000, volume: 5_000_000, freq: 2000, value: 5_000_000_000, prev: 995 }) };
    }
    if (u.includes('/analysis/top/foreign')) {
      return { ok: true, status: 200, json: async () => ({ accum: [{ code: 'STRATTEST', name: 'Strategy Test Tbk.', price: 1010, change: 15, value: 5_000_000_000, volume: 5_000_000, calculated_value: 200_000_000 }], dist: [] }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };

  try {
    const { runStrategyForTicker } = await import('./lib/engine/strategy/StrategyEngine.js');

    await asyncTest('INTEGRATION: runStrategyForTicker("swing-flow") returns a full StrategyResult shape from real formulas over mocked Invezgo data', async () => {
      const result = await runStrategyForTicker('STRATTEST', 'swing-flow', { date: '2026-09-24', regulatoryEligible: true, foreignRow: { netValueRp: 200_000_000, valueRp: 5_000_000_000 } });
      assert.strictEqual(result.ticker, 'STRATTEST');
      assert.strictEqual(result.strategy.id, 'swing-flow');
      assert(result.strategy.version, 'must carry a strategy version');
      assert(Array.isArray(result.indicators) && result.indicators.length > 0);
      assert(Array.isArray(result.mandatoryChecks));
      assert(['STRONG', 'QUALIFIED', 'WATCH', 'REJECT', 'DATA_INSUFFICIENT'].includes(result.status));
      assert(Array.isArray(result.explanations) && result.explanations.length > 0, 'AI-facing explanation layer must produce human-readable lines from the already-computed result');

      const bidOffer = result.indicators.find(i => i.name === 'HIGH_BID_OFFER');
      assert(bidOffer, 'swing-flow weights include HIGH_BID_OFFER');
      assert.strictEqual(bidOffer.value, 4, 'BidOfferRatio must be 4000/1000=4 from the mocked order book');

      const closeHigh = result.indicators.find(i => i.name === 'CLOSE_HIGH');
      assert.strictEqual(closeHigh.value, Math.round(((1010 - 985) / (1015 - 985)) * 1000) / 1000);
    });

    await asyncTest('INTEGRATION: momentum-candidate DATA_INSUFFICIENT (not REJECT) when order-book fetch fails for a mandatory indicator', async () => {
      const savedFetch = global.fetch;
      global.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/analysis/order-book/')) return { ok: false, status: 500, json: async () => ({}) };
        return savedFetch(url);
      };
      try {
        const { getRegulatoryHealthGate } = await import('./lib/regulatory-gate.js');
        void getRegulatoryHealthGate; // not exercised in this single-ticker call path
        const result = await runStrategyForTicker('STRATTEST2', 'momentum-candidate', { date: '2026-09-24', regulatoryEligible: true, foreignRow: { netValueRp: 200_000_000, valueRp: 5_000_000_000 } });
        assert.strictEqual(result.status, 'DATA_INSUFFICIENT', 'HIGH_BID_OFFER and NO_SELL are mandatory and both depend on order-book, which failed to fetch — must be DATA_INSUFFICIENT, never REJECT');
      } finally {
        global.fetch = savedFetch;
      }
    });

    await asyncTest('INTEGRATION: a ticker excluded by the Regulatory Health Gate is never scanned (DATA_INSUFFICIENT with no indicators computed)', async () => {
      const result = await runStrategyForTicker('FLAGGEDTEST', 'swing-flow', { regulatoryEligible: false });
      assert.strictEqual(result.status, 'DATA_INSUFFICIENT');
      assert.strictEqual(result.indicators.length, 0, 'a gate-excluded ticker must not consume any Invezgo quota computing indicators');
    });
  } finally {
    global.fetch = originalFetch;
    process.env.INVEZGO_API_KEY = originalKey;
  }
})();

// ============================================================
// PART 6 — server.js routes exist and enforce the explicit-ticker-list
// guard (no silent whole-universe scan on an unauthenticated GET).
// ============================================================
await (async () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  await asyncTest('server.js: GET /api/strategy-engine/strategies and /api/strategy-engine/scan exist', async () => {
    assert(/app\.get\('\/api\/strategy-engine\/strategies'/.test(src));
    assert(/app\.get\('\/api\/strategy-engine\/scan'/.test(src));
  });
  await asyncTest('server.js: /api/strategy-engine/scan requires an explicit tickers list (does not default to scanning the whole universe)', async () => {
    const routeMatch = src.match(/app\.get\('\/api\/strategy-engine\/scan'[\s\S]*?\n\}\);/);
    assert(routeMatch, 'could not isolate the route body');
    assert(/tickers.*wajib diisi/.test(routeMatch[0]), 'REGRESSION: route no longer requires an explicit tickers param — risks a default whole-market scan burning Invezgo quota on every request');
    assert(/Maksimal 50 ticker per request/.test(routeMatch[0]), 'REGRESSION: per-request ticker cap removed');
  });
})();

// ============================================================
// PART 7 — cron: warmStrategyEngineRotating() rotates the cursor, skips
// gate-excluded tickers cheaply, and persists STRONG/QUALIFIED signals for
// getLatestStrategyEngineSignals() to read back.
// ============================================================
await (async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.INVEZGO_API_KEY;
  process.env.INVEZGO_API_KEY = 'mock_test_key';

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('idx.co.id')) return { ok: false, status: 500, headers: { getSetCookie: () => [] }, json: async () => ({}) };
    if (u.includes('/analysis/order-book/')) {
      return { ok: true, status: 200, json: async () => ({ code: 'X', bid: [{ bid1price: 100, bid1lot: 5000, bid1freq: 3 }], offer: [{ offer1price: 101, offer1lot: 500, offer1freq: 2 }] }) };
    }
    if (u.includes('/analysis/intraday-data/')) {
      return { ok: true, status: 200, json: async () => ({ open: 95, high: 105, low: 90, close: 104, avg: 98, volume: 3_000_000, freq: 1500, value: 3_000_000_000, prev: 96 }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };

  try {
    const { warmStrategyEngineRotating, getLatestStrategyEngineSignals } = await import('./lib/engine/strategy/StrategyEngine.js');

    await asyncTest('CRON: warmStrategyEngineRotating() processes tickers, rotates the cursor, and returns a summary shape', async () => {
      const result = await warmStrategyEngineRotating(3000, 'swing-flow', 2);
      assert.strictEqual(result.strategyId, 'swing-flow');
      assert(result.processed > 0, 'must process at least one ticker within the time budget');
      assert(typeof result.cursorAfter === 'number');
      assert(result.universeSize > 0);
    });

    await asyncTest('CRON: getLatestStrategyEngineSignals() honestly returns an empty array (not an error) when nothing has qualified yet', async () => {
      const data = await getLatestStrategyEngineSignals('swing-flow', '2099-01-01');
      assert.strictEqual(data.strategyId, 'swing-flow');
      assert(Array.isArray(data.signals));
    });

    // FIX (2026-09-25, user-reported): the rotating universe cursor used
    // to be ONE global key shared by every strategy. Once the cron
    // schedule started calling all 4 strategies daily (2026-09-24), each
    // strategy's run advanced the SAME cursor, so a strategy's daily
    // batch scanned whatever slice the PREVIOUS strategy's run left off
    // at instead of its own — quartering each strategy's effective
    // coverage speed. Each strategy must track its own independent
    // cursor.
    await asyncTest('CRON: warmStrategyEngineRotating() gives each strategy its own independent cursor (running one strategy must not advance another\'s)', async () => {
      const first = await warmStrategyEngineRotating(3000, 'swing-flow', 3);
      assert(first.cursorAfter > 0, 'swing-flow must have advanced past 0 within the time budget');

      const second = await warmStrategyEngineRotating(3000, 'day-trading', 3);
      assert.strictEqual(second.cursorBefore, 0, 'REGRESSION: day-trading\'s cursor started somewhere other than 0 — it inherited swing-flow\'s cursor position instead of tracking its own, quartering its effective universe-coverage speed');

      // Running swing-flow again must resume from where swing-flow itself
      // left off, unaffected by day-trading's run in between.
      const third = await warmStrategyEngineRotating(3000, 'swing-flow', 3);
      assert.strictEqual(third.cursorBefore, first.cursorAfter, 'REGRESSION: swing-flow\'s cursor was clobbered by day-trading\'s run — cursors are not independent per strategy');
    });
  } finally {
    global.fetch = originalFetch;
    process.env.INVEZGO_API_KEY = originalKey;
  }
})();

// ============================================================
// PART 8 — cron/latest server routes + UI wiring (source-text checks)
// ============================================================
await (async () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  await asyncTest('server.js: GET /api/cron/warm-strategy-engine is CRON_SECRET-guarded (fails closed, like the other 2 cron routes)', async () => {
    const routeMatch = serverSrc.match(/app\.get\('\/api\/cron\/warm-strategy-engine'[\s\S]*?\n\}\);/);
    assert(routeMatch, 'route not found');
    assert(/CRON_SECRET/.test(routeMatch[0]));
    assert(/403/.test(routeMatch[0]));
  });
  await asyncTest('server.js: GET /api/strategy-engine/latest exists (read-only, no Invezgo calls)', async () => {
    assert(/app\.get\('\/api\/strategy-engine\/latest'/.test(serverSrc));
  });

  const uiSrc = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  await asyncTest('UI: Unified Screener page has a "Strategy Engine" tab wired to seRenderStrategyEnginePage()', async () => {
    assert(/usSwitchPageTab\(\\'strategy\\'\)/.test(uiSrc));
    assert(/seRenderStrategyEnginePage\('us-strategy-subpage'\)/.test(uiSrc));
  });

  const indexSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  await asyncTest('UI: 49-strategy-engine.js is loaded by index.html', async () => {
    assert(/js\/49-strategy-engine\.js\?v=/.test(indexSrc));
  });
})();

// ============================================================
// PART 9 — Daily Top Picks (sidebar widget) — user request 2026-09-24:
// "1 sidebar recommendation ... rekomendasi stock pick ... 10 saham ...
// score dan alasan nya ... reload tiap 15 menit ... setiap hari berubah
// kecuali libur bursa." getDailyTopPicks() must NEVER invent a pick — it
// only ever surfaces tickers warmStrategyEngineRotating() already scored
// STRONG/QUALIFIED and persisted; it re-runs the winning strategy once
// per picked ticker to attach a real explanation.
// ============================================================
await (async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.INVEZGO_API_KEY;
  process.env.INVEZGO_API_KEY = 'mock_test_key';

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('idx.co.id')) return { ok: false, status: 500, headers: { getSetCookie: () => [] }, json: async () => ({}) };
    if (u.includes('/analysis/order-book/')) {
      return { ok: true, status: 200, json: async () => ({ code: 'X', bid: [{ bid1price: 100, bid1lot: 5000, bid1freq: 3 }], offer: [{ offer1price: 101, offer1lot: 500, offer1freq: 2 }] }) };
    }
    if (u.includes('/analysis/intraday-data/')) {
      return { ok: true, status: 200, json: async () => ({ open: 95, high: 105, low: 90, close: 104, avg: 98, volume: 3_000_000, freq: 1500, value: 3_000_000_000, prev: 96 }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };

  try {
    const { getDailyTopPicks } = await import('./lib/engine/strategy/StrategyEngine.js');
    const { storeSetEx } = await import('./lib/invezgo-client.js');

    const testDate = new Date().toISOString().slice(0, 10); // real "today" — getDailyTopPicks() looks backward from today, so a seeded date must be within its lookback window
    // Seed two strategies' signal logs directly (bypassing the cron), exactly
    // the shape warmStrategyEngineRotating() itself writes: {ticker, status, score}.
    await storeSetEx(`strategy_engine:signal_log:swing-flow:${testDate}`, [
      { ticker: 'PICKHI', status: 'STRONG', score: 91.5 },
      { ticker: 'PICKLO', status: 'QUALIFIED', score: 62.0 }
    ], 60);
    await storeSetEx(`strategy_engine:signal_log:momentum-candidate:${testDate}`, [
      { ticker: 'PICKHI', status: 'QUALIFIED', score: 70.0 }, // lower score than swing-flow's — must lose the dedupe
      { ticker: 'PICKMID', status: 'STRONG', score: 85.0 }
    ], 60);

    await asyncTest('getDailyTopPicks(): merges signals across all 4 strategies, dedupes a ticker to its highest-scoring strategy, ranks by score descending', async () => {
      const result = await getDailyTopPicks(10, true /* forceRefresh, bypass the 10-min cache */);
      assert.strictEqual(result.date, testDate, 'must find the seeded date via lookback (no real signals exist for it otherwise)');
      assert(result.count >= 3, `expected at least the 3 seeded tickers, got ${result.count}`);
      const byTicker = {};
      result.picks.forEach(p => { byTicker[p.ticker] = p; });
      assert(byTicker.PICKHI, 'PICKHI must be present');
      assert.strictEqual(byTicker.PICKHI.strategyId, 'swing-flow', 'REGRESSION: dedupe must keep the HIGHER-scoring strategy match (swing-flow 91.5 > momentum-candidate 70.0), not just whichever strategy was iterated last');
      assert(byTicker.PICKMID, 'PICKMID must be present');
      assert(byTicker.PICKLO, 'PICKLO must be present');
      // Ranking: PICKHI (91.5) > PICKMID (85.0) > PICKLO (62.0)
      const rankOf = t => result.picks.findIndex(p => p.ticker === t);
      assert(rankOf('PICKHI') < rankOf('PICKMID'), 'REGRESSION: picks are not sorted by score descending');
      assert(rankOf('PICKMID') < rankOf('PICKLO'), 'REGRESSION: picks are not sorted by score descending');
    });

    await asyncTest('getDailyTopPicks(): every pick carries a real, non-empty reason string (explanations re-computed via runStrategyForTicker, not fabricated)', async () => {
      const result = await getDailyTopPicks(10, true);
      result.picks.forEach(p => {
        assert(typeof p.reason === 'string' && p.reason.length > 0, `REGRESSION: pick ${p.ticker} has no reason text — the widget would show an empty explanation instead of a real one`);
        assert(typeof p.score === 'number', `REGRESSION: pick ${p.ticker} has no numeric score`);
        assert(['STRONG', 'QUALIFIED', 'WATCH', 'REJECT', 'DATA_INSUFFICIENT'].includes(p.status), `REGRESSION: pick ${p.ticker} status "${p.status}" is not part of the engine's official vocabulary`);
      });
    });

    await asyncTest('getDailyTopPicks(): honestly reports fewer than `limit` picks via `note` instead of padding the list — never fabricates picks to reach the requested count', async () => {
      const result = await getDailyTopPicks(10, true);
      assert(result.count < 10, 'this test only seeded 3 tickers, so count must stay below the requested limit of 10');
      assert(result.picks.length === result.count, 'REGRESSION: picks array length must exactly match the honestly-reported count — no padding');
      assert(typeof result.note === 'string' && result.note.length > 0, 'REGRESSION: when count < requested limit, a `note` must explain why, instead of silently looking like a complete top-10');
    });

    await asyncTest('getDailyTopPicks(): a request for a date with zero signals anywhere in the lookback window returns count:0, not an error or fabricated picks', async () => {
      const originalDateNow = Date.now;
      // Force "today" to a date far outside the lookback window from any seeded data.
      Date.now = () => new Date('2050-06-15T00:00:00Z').getTime();
      try {
        const result = await getDailyTopPicks(10, true);
        assert.strictEqual(result.count, 0);
        assert.deepStrictEqual(result.picks, []);
      } finally {
        Date.now = originalDateNow;
      }
    });
  } finally {
    global.fetch = originalFetch;
    process.env.INVEZGO_API_KEY = originalKey;
  }
})();

await (async () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  await asyncTest('server.js: GET /api/strategy-engine/daily-picks exists and caps `limit` (never an unbounded scan)', async () => {
    const routeMatch = serverSrc.match(/app\.get\('\/api\/strategy-engine\/daily-picks'[\s\S]*?\n\}\);/);
    assert(routeMatch, 'route not found');
    assert(/getDailyTopPicks/.test(routeMatch[0]));
    assert(/Math\.min\(Math\.max\(/.test(routeMatch[0]), 'REGRESSION: limit param is no longer clamped — a caller could request an unbounded number of re-computed explanations');
  });

  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/49-strategy-engine.js'), 'utf8');
  await asyncTest('UI: Daily Picks widget fetches the real endpoint, refreshes every 15 minutes, and never hardcodes a fallback stock list', async () => {
    assert(/function usDailyPicksInit/.test(cockpitSrc), 'usDailyPicksInit() is missing');
    assert(/function usDailyPicksLoad/.test(cockpitSrc), 'usDailyPicksLoad() is missing');
    assert(/\/api\/strategy-engine\/daily-picks/.test(cockpitSrc), 'REGRESSION: widget no longer calls the real backend endpoint');
    assert(/US_DAILY_PICKS_REFRESH_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/.test(cockpitSrc), 'REGRESSION: refresh interval is no longer 15 minutes as requested');
    assert(/setInterval\(usDailyPicksLoad, US_DAILY_PICKS_REFRESH_MS\)/.test(cockpitSrc), 'REGRESSION: widget no longer auto-refreshes on the 15-minute timer');
    // Idempotency guard (2026-09-24 re-home fix): usRenderShell() calls
    // usDailyPicksInit() on every render, including periodic same-page
    // refresh ticks — without this guard it would re-fetch and reset the
    // interval every time, the same class of bug as the Market Flow
    // "Page Unresponsive" incident earlier this session.
    assert(/_usDailyPicksInitialized/.test(cockpitSrc), 'REGRESSION: usDailyPicksInit() lost its idempotency guard — repeated calls (e.g. from the periodic same-page refresh tick) will re-fetch and reset the interval every time instead of repainting from existing state');
    // Zero-fabrication guard: no hardcoded ticker array anywhere near the render function.
    const renderFnMatch = cockpitSrc.match(/function usDailyPicksRender\(\)[\s\S]*?\n\}/);
    assert(renderFnMatch, 'usDailyPicksRender() is missing');
    assert(!/\[\s*'[A-Z]{3,5}'\s*,\s*'[A-Z]{3,5}'/.test(renderFnMatch[0]), 'REGRESSION: usDailyPicksRender() appears to contain a hardcoded ticker list — picks must come only from the API response');
  });

  const indexSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  await asyncTest('UI: Daily Picks widget lives in the Screener page (not the global sidebar) and index.html no longer has the old sidebar container', async () => {
    assert(!/id="side-daily-picks"/.test(indexSrc), 'REGRESSION: old sidebar container div is back — widget was explicitly moved out of the sidebar per user feedback ("penempatannya di sidebar belum tepat")');
    const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
    assert(!/sideDailyPicksInit/.test(routerSrc), 'REGRESSION: app bootstrap still references the old sidebar init function name');
    const screenerSrc = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
    assert(/id="us-daily-picks"/.test(screenerSrc), 'REGRESSION: Screener page no longer renders the #us-daily-picks container');
    assert(/usDailyPicksInit\(\)/.test(screenerSrc), 'REGRESSION: usRenderShell() no longer calls usDailyPicksInit() — the widget will never load on the Screener page');
  });
})();

// ============================================================
// PART 10 — Strategy Lab backtest table overlap fix (user-reported,
// screenshot showing "Aturan Riil"'s long description text colliding
// with the numeric columns after it). Root cause: .tbl td forces
// white-space:nowrap by default (public/css/main.css) — the strategy
// description column is the only genuinely variable-length text column
// in this table and was never given an override, so its content could
// extend past its visual cell boundary into neighboring columns instead
// of wrapping.
// ============================================================
await (async () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  await asyncTest('UI: Strategy Lab backtest table\'s "Aturan Riil" description column wraps instead of forcing nowrap (fixes reported column overlap)', async () => {
    const fnMatch = src.match(/function renderAiStrategyLab[\s\S]*?\n  \}/);
    assert(fnMatch, 'renderAiStrategyLab() not found');
    assert(/r\.strategy\.description[\s\S]{0,0}/.test(fnMatch[0]) || /strategy\.description/.test(fnMatch[0]), 'description cell not found');
    const cellMatch = fnMatch[0].match(/<td[^']*'[^']*strategy\.description[^']*'/);
    assert(cellMatch, 'REGRESSION: could not isolate the Aturan Riil <td> — check it still renders r.strategy.description');
    assert(/white-space:normal/.test(cellMatch[0]), 'REGRESSION: Aturan Riil column no longer overrides the table\'s default white-space:nowrap — long descriptions will again risk overlapping neighboring columns');
  });
})();

// ============================================================
// PART 11 — GitHub Actions cron schedule covers all 4 strategies, not
// just swing-flow (user-reported: "apakah ini normal?" — the Daily Picks
// widget was empty for everyone). Root cause found by inspecting the
// workflow's actual run history via the GitHub API: every run so far was
// workflow_dispatch (manual), none via "schedule", and the workflow's
// `strategy` env defaulted to 'swing-flow' with no way for a scheduled
// (non-manual) trigger to ever pass a different value — so
// day-trading/momentum-candidate/hidden-accumulation would NEVER have
// been scanned automatically, no matter how long the schedule ran.
// getDailyTopPicks() merges signals from all 4 strategies, so 3 of its 4
// sources would have stayed permanently empty.
// ============================================================
await (async () => {
  const workflowPath = path.join(__dirname, '.github/workflows/strategy-engine-cron.yml');
  const src = fs.readFileSync(workflowPath, 'utf8');
  const strategyIds = fs.readdirSync(path.join(__dirname, 'strategies'))
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(__dirname, 'strategies', f), 'utf8')).id);

  await asyncTest('GitHub Actions workflow: strategy-engine-cron.yml is valid YAML and schedules all 4 real strategy ids (not just swing-flow)', async () => {
    assert.strictEqual(strategyIds.length, 4, `expected 4 strategy definitions in strategies/*.json, found ${strategyIds.length}`);

    let doc;
    try {
      const { execFileSync } = await import('child_process');
      const out = execFileSync('python3', ['-c', `
import json, sys, yaml
with open(${JSON.stringify(workflowPath)}) as f:
    print(json.dumps(yaml.safe_load(f)))
`]);
      doc = JSON.parse(out.toString());
    } catch (e) {
      throw new Error(`workflow YAML failed to parse (invalid syntax): ${e.message}`);
    }

    const onBlock = doc.on || doc[true] || doc['on:'];
    assert(onBlock && Array.isArray(onBlock.schedule), 'REGRESSION: workflow has no `on.schedule` array');
    assert.strictEqual(onBlock.schedule.length, 4, `REGRESSION: expected 4 schedule entries (one per strategy), found ${onBlock.schedule.length} — day-trading/momentum-candidate/hidden-accumulation will go unscanned forever if this drops back to 1`);

    // Every real strategy id must appear in the job's cron->strategy mapping.
    strategyIds.forEach(id => {
      assert(src.includes(`STRATEGY_ID='${id}'`), `REGRESSION: strategy "${id}" (strategies/${id}.json) is not mapped to any schedule entry in the workflow — it will never be scanned automatically`);
    });

    // The mapping must key off github.event.schedule (the only way to
    // distinguish which of the 4 schedule entries fired), not a single
    // hardcoded default that every scheduled run would fall back to.
    assert(/SCHEDULE_CRON.*github\.event\.schedule/.test(src), 'REGRESSION: workflow no longer reads github.event.schedule — a scheduled (non-manual) run has no other way to know which of the 4 cron entries triggered it');
    assert(/case "\$SCHEDULE_CRON" in/.test(src), 'REGRESSION: the cron-string-to-strategy-id case mapping is gone');

    // workflow_dispatch (manual) must still be able to override.
    assert(/INPUT_STRATEGY:\$\{\{github\.event\.inputs\.strategy\}\}/.test(src.replace(/\s/g, '')), 'REGRESSION: manual workflow_dispatch can no longer override the strategy id');
  });
})();

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} STRATEGY ENGINE TESTS PASSED SUCCESSFULLY!`);
console.log('═══════════════════════════════════════════════════════');
