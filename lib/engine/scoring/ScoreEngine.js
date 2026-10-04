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

// FIX (2026-10-04): skor dinormalkan ke bobot yang tersedia, TANPA batas minimum — satu indikator
// valid (bobot 20%) yang lolos ambang sudah cukup untuk "STRONG 100" (bukti produksi: ASDM,
// day-trading, 1 dari 5 indikator valid, tampil sebagai rekomendasi #1). Status STRONG/QUALIFIED
// sekarang mensyaratkan cakupan bobot >= 50% (keputusan pengguna); di bawah itu dibatasi ke WATCH
// dan skor mentahnya tetap dilaporkan apa adanya (rawStatus/evidenceCapped) — bukan disembunyikan.
const MIN_WEIGHT_COVERAGE_FOR_SIGNAL = 0.5;

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
  let rawStatus;
  if (finalScore >= bands.strong) rawStatus = STRATEGY_RESULT_STATUS.STRONG;
  else if (finalScore >= bands.qualified) rawStatus = STRATEGY_RESULT_STATUS.QUALIFIED;
  else if (finalScore >= bands.watch) rawStatus = STRATEGY_RESULT_STATUS.WATCH;
  else rawStatus = STRATEGY_RESULT_STATUS.REJECT;

  const coveragePct = Math.round(weightCovered * 100);
  const isSignalStatus = rawStatus === STRATEGY_RESULT_STATUS.STRONG || rawStatus === STRATEGY_RESULT_STATUS.QUALIFIED;
  const evidenceCapped = isSignalStatus && (weightCovered + 1e-9) < MIN_WEIGHT_COVERAGE_FOR_SIGNAL;
  const status = evidenceCapped ? STRATEGY_RESULT_STATUS.WATCH : rawStatus;

  let reason = null;
  if (weightCovered < 1) reason = `Skor dihitung dari ${coveragePct}% bobot (sisanya indikator non-mandatory UNAVAILABLE)`;
  if (evidenceCapped) {
    reason += `. Bukti kurang: cakupan ${coveragePct}% < ${MIN_WEIGHT_COVERAGE_FOR_SIGNAL * 100}% sehingga status dibatasi ke WATCH (skor mentah ${finalScore} akan berstatus ${rawStatus} jika bukti cukup)`;
  }

  return {
    status,
    finalScore,
    weightCoverage: Math.round(weightCovered * 1000) / 1000,
    rawStatus,
    evidenceCapped,
    mandatoryChecks,
    reason
  };
}

export { scoreStrategy, MIN_WEIGHT_COVERAGE_FOR_SIGNAL };
