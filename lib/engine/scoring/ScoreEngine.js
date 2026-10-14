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

function scoreStrategy(strategyDef, indicatorResults, options = {}) {
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

  // REZIM PASAR DINAMIS & RISK-OFF OVERRIDE (AGENTS.md §6 & §8)
  const regime = options.marketRegime || null;
  const isRiskOffRegime = regime === 'BEAR_TREND' || regime === 'RISK_OFF';
  const regimeCapped = Boolean(isRiskOffRegime && (status === STRATEGY_RESULT_STATUS.STRONG || status === STRATEGY_RESULT_STATUS.QUALIFIED));
  let finalStatus = regimeCapped ? STRATEGY_RESULT_STATUS.WATCH : status;

  if (regimeCapped) {
    const regimeNote = `Market Regime (${regime}) membatasi status ke WATCH demi pelestarian modal`;
    reason = reason ? `${reason}. ${regimeNote}` : regimeNote;
  }

  // KONTRADIKSI HARGA / LOSS BESAR OVERRIDE (AGENTS.md §8, §10, §20, §28)
  // Sinyal kuantitatif (mis. rasio bid/offer tebal di harga bawah) TIDAK boleh meloloskan
  // saham yang sedang anjlok / loss besar ke status STRONG/QUALIFIED (kasus SBMA -14.58%).
  const rawChangePct = options.changePct ?? options.marketData?.changePct ?? options.marketData?.ohlc?.changePct ?? null;
  const ohlc = options.ohlc || options.marketData?.ohlc || null;
  const computedChangePct = (rawChangePct != null && Number.isFinite(Number(rawChangePct)))
    ? Number(rawChangePct)
    : ((ohlc && typeof ohlc.prev === 'number' && ohlc.prev > 0 && typeof ohlc.close === 'number')
      ? Math.round(((ohlc.close - ohlc.prev) / ohlc.prev) * 10000) / 100
      : null);
  const intradayChangePct = (ohlc && typeof ohlc.open === 'number' && ohlc.open > 0 && typeof ohlc.close === 'number')
    ? Math.round(((ohlc.close - ohlc.open) / ohlc.open) * 10000) / 100
    : null;

  const effectiveChangePct = computedChangePct != null ? computedChangePct : intradayChangePct;
  const isMomentumStrategy = strategyDef.id === 'momentum-candidate';

  let priceCapped = false;
  let priceRejected = false;

  if (effectiveChangePct != null && effectiveChangePct < 0) {
    if (isMomentumStrategy) {
      // Pada strategi momentum: momentum negatif (< 0%) menggugurkan status sinyal
      if (effectiveChangePct <= -2.0) {
        // Anjlok >= 2% (misal ARB / crash -14.58%): REJECT total
        priceRejected = true;
        finalStatus = STRATEGY_RESULT_STATUS.REJECT;
        const priceNote = `Kontradiksi Momentum: Return harga negatif (${effectiveChangePct}%). Sinyal momentum gugur demi pelestarian modal (AGENTS.md §8 & §20)`;
        reason = reason ? `${reason}. ${priceNote}` : priceNote;
      } else if (finalStatus === STRATEGY_RESULT_STATUS.STRONG || finalStatus === STRATEGY_RESULT_STATUS.QUALIFIED) {
        // Penurunan minor (-0.1% s/d -1.9%): dibatasi ke WATCH
        priceCapped = true;
        finalStatus = STRATEGY_RESULT_STATUS.WATCH;
        const priceNote = `Kontradiksi Momentum: Return harga negatif (${effectiveChangePct}%), status dibatasi ke WATCH`;
        reason = reason ? `${reason}. ${priceNote}` : priceNote;
      }
    } else {
      // Strategi bullish lain (day-trading, swing-flow, hidden-accumulation):
      if (effectiveChangePct <= -3.0) {
        // Anjlok >= 3% (loss besar / panic sell): REJECT total
        priceRejected = true;
        finalStatus = STRATEGY_RESULT_STATUS.REJECT;
        const priceNote = `Kontradiksi Harga: Saham anjlok ${effectiveChangePct}% (loss besar hari ini), setup bullish gugur demi pelestarian modal (AGENTS.md §8 & §20)`;
        reason = reason ? `${reason}. ${priceNote}` : priceNote;
      } else if (finalStatus === STRATEGY_RESULT_STATUS.STRONG || finalStatus === STRATEGY_RESULT_STATUS.QUALIFIED) {
        priceCapped = true;
        finalStatus = STRATEGY_RESULT_STATUS.WATCH;
        const priceNote = `Kontradiksi Harga: Return harian negatif (${effectiveChangePct}%), status dibatasi ke WATCH`;
        reason = reason ? `${reason}. ${priceNote}` : priceNote;
      }
    }
  }

  const multiplier = (Number(options.regimeMultiplier) || 1.0) * (Number(options.strategyMultiplier) || 1.0);
  let adaptedScore = Math.max(0, Math.min(100, Math.round(finalScore * multiplier * 10) / 10));
  if (priceRejected) {
    adaptedScore = Math.min(adaptedScore, 40);
  } else if (priceCapped) {
    adaptedScore = Math.min(adaptedScore, 65);
  }

  return {
    status: finalStatus,
    finalScore,
    adaptedScore,
    weightCoverage: Math.round(weightCovered * 1000) / 1000,
    rawStatus,
    evidenceCapped,
    regimeCapped,
    priceCapped,
    priceRejected,
    priceChangePct: effectiveChangePct,
    mandatoryChecks,
    reason
  };
}

export { scoreStrategy, MIN_WEIGHT_COVERAGE_FOR_SIGNAL };
