/**
 * lib/engine/strategy/StrategyEngine.js — orchestrator:
 * Provider Adapter -> NormalizedMarketData -> Indicator Engine ->
 * Strategy Engine -> Scoring Engine -> Strategy Result.
 *
 * ARCHITECTURAL RULE (spec): StrategyEngine MUST NOT call Yahoo/IDX/Broker
 * APIs directly — all network access goes through MarketDataProvider.js
 * (which itself only calls the normalized invezgo-client.js functions).
 *
 * FILTER FIRST -> VALIDATE -> ANALYZE: tickers are passed through the
 * existing Regulatory Health Gate (lib/regulatory-gate.js) BEFORE any
 * Invezgo call is made, so a FLAGGED/UNKNOWN/DATA_ERROR ticker never
 * consumes quota on this engine's indicators.
 */
import { getRegulatoryHealthGate } from '../../regulatory-gate.js';
import { fetchInvezgoTopMovers, storeGet, storeSetEx } from '../../invezgo-client.js';
import { loadBaseUniverse } from '../../universe.js';
import { getStrategyById } from './StrategyRegistry.js';
import { buildNormalizedMarketData } from '../MarketDataProvider.js';
import { scoreStrategy } from '../scoring/ScoreEngine.js';
import { explainStrategyResult } from '../explanation/SignalExplanation.js';
import { computeHighBidOffer } from '../indicators/highBidOffer.js';
import { computeNoSell } from '../indicators/noSell.js';
import { computeCloseHigh } from '../indicators/closeHigh.js';
import { computeHighATS } from '../indicators/highATS.js';
import { computeHighNonRegular } from '../indicators/highNonRegular.js';
import { computeForeignFlow } from '../indicators/foreignFlow.js';
import { computeVolume } from '../indicators/volume.js';
import { computeFrequency } from '../indicators/frequency.js';
import { STRATEGY_RESULT_STATUS } from '../types.js';

const SYNC_INDICATORS = {
  HIGH_BID_OFFER: computeHighBidOffer,
  NO_SELL: computeNoSell,
  CLOSE_HIGH: computeCloseHigh,
  HIGH_NON_REGULAR: computeHighNonRegular,
  FOREIGN: computeForeignFlow
};
const ASYNC_INDICATORS = {
  HIGH_ATS: computeHighATS,
  VOLUME: computeVolume,
  FREQUENCY: computeFrequency
};

function cleanTicker(t) {
  return String(t || '').toUpperCase().replace(/\.JK$/i, '').trim();
}

/**
 * runStrategyForTicker(ticker, strategyId, opts) — single-ticker entry
 * point (also used internally by the batch runner below).
 */
async function runStrategyForTicker(ticker, strategyId, opts = {}) {
  const strategyDef = getStrategyById(strategyId);
  if (!strategyDef) throw new Error(`Unknown strategy id: ${strategyId}`);
  const code = cleanTicker(ticker);
  const { date = null, foreignRow = null, regulatoryEligible = null } = opts;

  if (regulatoryEligible === false) {
    return {
      ticker: code,
      timestamp: new Date().toISOString(),
      strategy: { id: strategyDef.id, version: strategyDef.version },
      indicators: [],
      score: null,
      mandatoryChecks: [],
      status: STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT,
      explanations: [`DATA_INSUFFICIENT: ${code} tidak lolos Regulatory Health Gate (notasi khusus BEI/status tidak terverifikasi) — tidak di-scan`]
    };
  }

  const neededIndicators = Object.keys(strategyDef.weights);
  const includeNonRegular = neededIndicators.includes('HIGH_NON_REGULAR');
  const marketData = await buildNormalizedMarketData(code, { date, includeNonRegular, foreignRow });

  const indicators = [];
  for (const name of neededIndicators) {
    if (SYNC_INDICATORS[name]) {
      indicators.push(SYNC_INDICATORS[name](marketData));
    } else if (ASYNC_INDICATORS[name]) {
      indicators.push(await ASYNC_INDICATORS[name](marketData));
    }
  }

  const scored = scoreStrategy(strategyDef, indicators);
  const result = {
    ticker: code,
    timestamp: new Date().toISOString(),
    strategy: { id: strategyDef.id, version: strategyDef.version },
    indicators,
    score: scored.finalScore,
    mandatoryChecks: scored.mandatoryChecks,
    status: scored.status,
    reason: scored.reason || null,
    marketDataErrors: marketData.dataErrors
  };
  result.explanations = explainStrategyResult(result);
  return result;
}

/**
 * runStrategyForUniverse(tickers, strategyId, opts) — batch entry point.
 * Excludes non-eligible tickers via the Regulatory Health Gate BEFORE
 * fetching any Invezgo data, and fetches the day's foreign-movers list
 * ONCE for the whole batch (not per ticker) when the strategy needs FOREIGN.
 */
async function runStrategyForUniverse(tickers, strategyId, opts = {}) {
  const strategyDef = getStrategyById(strategyId);
  if (!strategyDef) throw new Error(`Unknown strategy id: ${strategyId}`);
  const codes = (Array.isArray(tickers) ? tickers : []).map(cleanTicker).filter(Boolean);
  const { date = null } = opts;

  const gate = await getRegulatoryHealthGate(codes);

  let foreignByTicker = {};
  if (Object.keys(strategyDef.weights).includes('FOREIGN')) {
    const moversDate = date || undefined;
    const movers = await fetchInvezgoTopMovers('foreign', moversDate);
    if (movers.ok) {
      [...(movers.accum || []), ...(movers.dist || [])].forEach(row => {
        foreignByTicker[cleanTicker(row.code)] = { netValueRp: Number(row.calculated_value) || 0, valueRp: Number(row.value) || 0 };
      });
    }
  }

  const results = [];
  for (const code of codes) {
    const gateEntry = gate.byTicker[code];
    const eligible = gateEntry ? gateEntry.eligible : false;
    if (!eligible) {
      results.push(await runStrategyForTicker(code, strategyId, { date, regulatoryEligible: false }));
      continue;
    }
    results.push(await runStrategyForTicker(code, strategyId, { date, regulatoryEligible: true, foreignRow: foreignByTicker[code] || null }));
  }

  const summary = { totalRequested: codes.length, excludedByRegulatoryGate: 0, strong: 0, qualified: 0, watch: 0, reject: 0, dataInsufficient: 0 };
  results.forEach(r => {
    if (r.status === STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT && r.mandatoryChecks.length === 0 && r.indicators.length === 0) summary.excludedByRegulatoryGate++;
    if (r.status === STRATEGY_RESULT_STATUS.STRONG) summary.strong++;
    else if (r.status === STRATEGY_RESULT_STATUS.QUALIFIED) summary.qualified++;
    else if (r.status === STRATEGY_RESULT_STATUS.WATCH) summary.watch++;
    else if (r.status === STRATEGY_RESULT_STATUS.REJECT) summary.reject++;
    else if (r.status === STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT) summary.dataInsufficient++;
  });

  return { strategy: { id: strategyDef.id, version: strategyDef.version }, results, summary, regulatoryDataSource: { available: gate.dataAvailable, isStale: gate.isStale, checkedAt: gate.checkedAt } };
}

// ── Rotating whole-universe cron warmer ─────────────────────────────────
// Same rotating-cursor pattern as warmTechnicalRotating()/
// warmRadarFundamentalsRotating() (lib/idx-data-engine.js): pick up where
// the last run left off, stop once the time budget runs out, persist the
// cursor for next time. Full ~958-ticker coverage happens progressively
// over many runs, not in one pass.
//
// THIS IS NOT WIRED INTO vercel.json's `crons` array. Vercel's Hobby plan
// caps a project at 2 scheduled cron jobs, and this app's 2 slots are
// already used (warm-radar-fundamentals, warm-technical-indicators — see
// their comments in server.js). Adding a 3rd workload onto either of
// those risks starving their own already-tight time budgets with a
// slower, network-heavier job (real Invezgo order-book/intraday-data
// calls, not cache-only reads). The route below
// (GET /api/cron/warm-strategy-engine) is real and CRON_SECRET-guarded —
// it just needs the USER to point something at it on a schedule: an
// external free scheduler (e.g. cron-job.org, a GitHub Actions scheduled
// workflow) hitting this URL with `Authorization: Bearer <CRON_SECRET>`,
// or swapping out one of the 2 existing Vercel-native cron slots.
//
// Also important beyond "coverage": this cron is what makes HIGH_ATS/
// VOLUME/FREQUENCY's rolling 20-day baselines (RollingHistory.js) actually
// accumulate samples day over day. Without SOME daily process calling the
// indicators for a ticker, its baseline never builds up, no matter how
// many on-demand /api/strategy-engine/scan calls happen.
const STRATEGY_WARM_CURSOR_KEY = 'strategy_engine:warm:cursor';
const STRATEGY_SIGNAL_LOG_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

function signalLogKey(strategyId, dateKey) {
  return `strategy_engine:signal_log:${strategyId}:${dateKey}`;
}

async function warmStrategyEngineRotating(timeBudgetMs, strategyId, batchSize) {
  const budget = timeBudgetMs || 20000;
  const start = Date.now();
  const strategyDef = getStrategyById(strategyId);
  if (!strategyDef) throw new Error(`Unknown strategy id: ${strategyId}`);

  const universe = loadBaseUniverse();
  const sortedCodes = Object.values(universe).map(s => s.code).sort();
  const total = sortedCodes.length;
  const BATCH = batchSize || Number(process.env.STRATEGY_ENGINE_CRON_BATCH_SIZE) || 5;
  const dateKey = new Date().toISOString().slice(0, 10);

  const cursorBefore = Number((await storeGet(STRATEGY_WARM_CURSOR_KEY)) || 0);
  let idx = total > 0 ? cursorBefore % total : 0;
  let processed = 0;
  let attempts = 0;
  const signals = [];

  // Fetch the day's foreign-movers list ONCE for this whole run (not per
  // ticker) — same optimization as runStrategyForUniverse().
  let foreignByTicker = {};
  if (Object.keys(strategyDef.weights).includes('FOREIGN')) {
    const movers = await fetchInvezgoTopMovers('foreign', undefined);
    if (movers.ok) {
      [...(movers.accum || []), ...(movers.dist || [])].forEach(row => {
        foreignByTicker[cleanTicker(row.code)] = { netValueRp: Number(row.calculated_value) || 0, valueRp: Number(row.value) || 0 };
      });
    }
  }

  while (total > 0 && attempts < total && (Date.now() - start) < budget) {
    const code = sortedCodes[idx];
    idx = (idx + 1) % total;
    attempts++;

    const gate = await getRegulatoryHealthGate([code]);
    const gateEntry = gate.byTicker[code];
    const eligible = gateEntry ? gateEntry.eligible : false;

    const result = await runStrategyForTicker(code, strategyId, {
      date: dateKey,
      regulatoryEligible: eligible,
      foreignRow: foreignByTicker[code] || null
    });
    processed++;

    if (result.status === STRATEGY_RESULT_STATUS.STRONG || result.status === STRATEGY_RESULT_STATUS.QUALIFIED) {
      signals.push({ ticker: result.ticker, status: result.status, score: result.score });
    }

    // Give the loop a natural batch-sized breather point without changing
    // behavior — reserved for future concurrency; kept for parity with
    // the other rotating warmers' BATCH constant, currently just controls
    // how often we re-check the time budget below inside a tighter unit.
    if (attempts % BATCH === 0 && (Date.now() - start) >= budget) break;
  }

  await storeSetEx(STRATEGY_WARM_CURSOR_KEY, idx, 0);

  if (signals.length > 0) {
    const key = signalLogKey(strategyId, dateKey);
    const existing = (await storeGet(key)) || [];
    const merged = [...existing];
    signals.forEach(s => {
      if (!merged.some(m => m.ticker === s.ticker)) merged.push(s);
    });
    await storeSetEx(key, merged, STRATEGY_SIGNAL_LOG_TTL_SEC);
  }

  return { strategyId, processed, cursorBefore, cursorAfter: idx, universeSize: total, newSignalsToday: signals.length, durationMs: Date.now() - start };
}

/**
 * getLatestStrategyEngineSignals(strategyId, date?) — read-only, for the
 * UI's "hasil cron terakhir" panel. Returns today's persisted STRONG/
 * QUALIFIED signals accumulated so far by warmStrategyEngineRotating().
 */
async function getLatestStrategyEngineSignals(strategyId, date) {
  const dateKey = date || new Date().toISOString().slice(0, 10);
  const signals = (await storeGet(signalLogKey(strategyId, dateKey))) || [];
  return { strategyId, date: dateKey, signals };
}

export { runStrategyForTicker, runStrategyForUniverse, warmStrategyEngineRotating, getLatestStrategyEngineSignals };
