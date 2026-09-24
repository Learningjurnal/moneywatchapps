/**
 * VOLUME — weighted component used directly by SWING FLOW/DAY TRADING/
 * MOMENTUM/HIDDEN ACCUMULATION strategies (separate from HIGH_ATS, which
 * uses volume only as part of Volume/Frequency). Scored as today's real
 * volume relative to its own rolling median (same incremental-baseline
 * approach as HIGH_ATS — see RollingHistory.js), not a fabricated
 * cross-sectional comparison against the rest of the market.
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';
import { getRollingMedian, pushValue } from '../RollingHistory.js';

const NAME = 'VOLUME';
const NAMESPACE = 'volume';

async function computeVolume(marketData, opts = {}) {
  if (!marketData || marketData.volume == null) {
    return unavailableIndicator(NAME, 'VOLUME_UNAVAILABLE', null, ['volume']);
  }
  const dateKey = marketData.date || new Date().toISOString().slice(0, 10);
  if (opts.recordToday !== false) {
    await pushValue(NAMESPACE, marketData.ticker, dateKey, marketData.volume);
  }
  const baseline = await getRollingMedian(NAMESPACE, marketData.ticker);
  if (!baseline.available || !(baseline.median > 0)) {
    return buildIndicatorResult({
      name: NAME, status: DATA_STATUS.UNAVAILABLE, value: marketData.volume, sourceFields: ['volume'],
      reason: `ROLLING_BASELINE_INSUFFICIENT (${baseline.sampleSize} hari terekam)`
    });
  }
  const relative = marketData.volume / baseline.median;
  const score = clampScore(Math.min(2, relative) / 2 * 100);
  return buildIndicatorResult({
    name: NAME, status: DATA_STATUS.VALID, value: Math.round(relative * 1000) / 1000, score, passed: relative >= 1,
    threshold: 1, sourceFields: ['volume', `rollingMedianVolume(${baseline.sampleSize} hari)`]
  });
}

export { computeVolume };
