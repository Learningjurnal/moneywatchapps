/**
 * lib/engine/scoring/ScoreEngine.js — FinalScore = sum(indicatorScore *
 * strategyWeight), mandatory-condition override, and status banding.
 *
 * Mandatory conditions override score (spec): if ANY mandatory indicator
 * is UNAVAILABLE, the whole result is DATA_INSUFFICIENT — never REJECT
 * (REJECT means "we have the data and it's bad", not "we don't have the
 * data"). If every mandatory indicator has real data but at least one
 * fails its threshold, the result is REJECT regardless of FinalScore
 * (a strategy's mandatory conditions are hard gates, not just weighted
 * inputs).
 */
import { STRATEGY_RESULT_STATUS, DATA_STATUS } from '../types.js';

function scoreStrategy(strategyDef, indicatorResults) {
  const byName = {};
  indicatorResults.forEach(r => { byName[r.name] = r; });

  const mandatory = strategyDef.mandatoryConditions || [];
  const missingMandatory = mandatory.filter(name => !byName[name] || byName[name].status === DATA_STATUS.UNAVAILABLE);
  if (missingMandatory.length > 0) {
    return {
      status: STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT,
      finalScore: null,
      mandatoryChecks: mandatory.map(name => ({
        indicator: name,
        available: !!byName[name] && byName[name].status !== DATA_STATUS.UNAVAILABLE,
        passed: byName[name] ? byName[name].passed : null
      })),
      reason: `Data indikator mandatory tidak tersedia: ${missingMandatory.join(', ')}`
    };
  }

  const failedMandatory = mandatory.filter(name => byName[name] && byName[name].passed === false);
  const mandatoryChecks = mandatory.map(name => ({
    indicator: name,
    available: true,
    passed: byName[name] ? byName[name].passed : null
  }));

  if (failedMandatory.length > 0) {
    return {
      status: STRATEGY_RESULT_STATUS.REJECT,
      finalScore: null,
      mandatoryChecks,
      reason: `Kondisi mandatory gagal: ${failedMandatory.join(', ')}`
    };
  }

  // FinalScore only sums over indicators that actually have a numeric
  // score (VALID). An UNAVAILABLE non-mandatory indicator contributes 0 to
  // the weighted sum but its weight is excluded from the denominator, so a
  // partially-missing (non-mandatory) dataset doesn't silently drag the
  // score toward zero — it's scored on the weight it DOES have data for.
  let weightedSum = 0;
  let weightCovered = 0;
  const weights = strategyDef.weights || {};
  Object.keys(weights).forEach(indicatorName => {
    const result = byName[indicatorName];
    const w = weights[indicatorName];
    if (result && result.status === DATA_STATUS.VALID && typeof result.score === 'number') {
      weightedSum += result.score * w;
      weightCovered += w;
    }
  });

  if (weightCovered <= 0) {
    return {
      status: STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT,
      finalScore: null,
      mandatoryChecks,
      reason: 'Tidak ada indikator non-mandatory dengan data VALID untuk dihitung skornya'
    };
  }

  const finalScore = Math.round((weightedSum / weightCovered) * 10) / 10;
  const bands = strategyDef.scoreBands;
  let status;
  if (finalScore >= bands.strong) status = STRATEGY_RESULT_STATUS.STRONG;
  else if (finalScore >= bands.qualified) status = STRATEGY_RESULT_STATUS.QUALIFIED;
  else if (finalScore >= bands.watch) status = STRATEGY_RESULT_STATUS.WATCH;
  else status = STRATEGY_RESULT_STATUS.REJECT;

  return {
    status,
    finalScore,
    weightCoverage: Math.round(weightCovered * 1000) / 1000,
    mandatoryChecks,
    reason: weightCovered < 1 ? `Skor dihitung dari ${Math.round(weightCovered * 100)}% bobot (sisanya indikator non-mandatory UNAVAILABLE)` : null
  };
}

export { scoreStrategy };
