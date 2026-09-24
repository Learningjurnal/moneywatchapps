/**
 * HIGH_ATS — ATS = Volume / Frequency, RelativeATS = ATS /
 * rollingMedianATS(20 trading days), default threshold 1.25.
 *
 * Volume & Frequency are REAL (Invezgo intraday-data market=RG `volume`/
 * `freq` fields). RelativeATS needs a 20-trading-day baseline that this
 * engine builds up incrementally (see RollingHistory.js) — it does NOT
 * retro-fetch 20 days of history (that would cost ~20x calls/ticker on
 * day one). Until STRATEGY_ENGINE_ROLLING_MIN_SAMPLES days have been
 * recorded for a ticker, this returns DATA_INSUFFICIENT, never a ratio
 * against a 1-2-sample "median" dressed up as a real baseline.
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';
import { getRollingMedian, pushValue } from '../RollingHistory.js';

const NAME = 'HIGH_ATS';
const DEFAULT_THRESHOLD = Number(process.env.STRATEGY_ENGINE_ATS_THRESHOLD || 1.25);
const NAMESPACE = 'ats';

async function computeHighATS(marketData, threshold = DEFAULT_THRESHOLD, opts = {}) {
  if (!marketData || marketData.volume == null || marketData.freq == null) {
    return unavailableIndicator(NAME, 'VOLUME_OR_FREQUENCY_UNAVAILABLE', threshold, ['volume', 'freq']);
  }
  if (!(marketData.freq > 0)) {
    return unavailableIndicator(NAME, 'ZERO_FREQUENCY', threshold, ['volume', 'freq']);
  }

  const ats = marketData.volume / marketData.freq;
  const dateKey = marketData.date || new Date().toISOString().slice(0, 10);

  // Record today's ATS into the rolling window for FUTURE calls — this is
  // how the baseline builds up over time without a retroactive backfill.
  if (opts.recordToday !== false) {
    await pushValue(NAMESPACE, marketData.ticker, dateKey, ats);
  }

  const baseline = await getRollingMedian(NAMESPACE, marketData.ticker);
  if (!baseline.available) {
    return buildIndicatorResult({
      name: NAME,
      status: DATA_STATUS.UNAVAILABLE,
      value: Math.round(ats * 100) / 100,
      threshold,
      sourceFields: ['volume', 'freq'],
      reason: `ROLLING_BASELINE_INSUFFICIENT (${baseline.sampleSize} hari terekam, butuh minimal beberapa hari lagi sebelum RelativeATS bisa dihitung jujur)`
    });
  }

  const relativeATS = baseline.median > 0 ? ats / baseline.median : null;
  if (relativeATS === null) {
    return unavailableIndicator(NAME, 'ZERO_BASELINE_MEDIAN', threshold, ['volume', 'freq']);
  }

  const passed = relativeATS >= threshold;
  const score = clampScore(relativeATS >= threshold
    ? 60 + Math.min(40, ((relativeATS - threshold) / (threshold * 2)) * 40)
    : (relativeATS / threshold) * 60);

  return buildIndicatorResult({
    name: NAME,
    status: DATA_STATUS.VALID,
    value: Math.round(relativeATS * 1000) / 1000,
    score,
    passed,
    threshold,
    sourceFields: ['volume', 'freq', `rollingMedianATS(${baseline.sampleSize} hari)`]
  });
}

export { computeHighATS };
