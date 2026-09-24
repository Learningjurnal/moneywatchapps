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
import { fetchInvezgoTopMovers } from '../../invezgo-client.js';
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

export { runStrategyForTicker, runStrategyForUniverse };
