/**
 * FREQUENCY — weighted component (same pattern as volume.js: today's real
 * trade frequency relative to its own rolling median).
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';
import { getRollingMedian, pushValue } from '../RollingHistory.js';

const NAME = 'FREQUENCY';
const NAMESPACE = 'frequency';

async function computeFrequency(marketData, opts = {}) {
  if (!marketData || marketData.freq == null) {
    return unavailableIndicator(NAME, 'FREQUENCY_UNAVAILABLE', null, ['freq']);
  }
  const dateKey = marketData.date || new Date().toISOString().slice(0, 10);
  if (opts.recordToday !== false) {
    await pushValue(NAMESPACE, marketData.ticker, dateKey, marketData.freq);
  }
  const baseline = await getRollingMedian(NAMESPACE, marketData.ticker);
  if (!baseline.available || !(baseline.median > 0)) {
    return buildIndicatorResult({
      name: NAME, status: DATA_STATUS.UNAVAILABLE, value: marketData.freq, sourceFields: ['freq'],
      reason: `ROLLING_BASELINE_INSUFFICIENT (${baseline.sampleSize} hari terekam)`
    });
  }
  const relative = marketData.freq / baseline.median;
  const score = clampScore(Math.min(2, relative) / 2 * 100);
  return buildIndicatorResult({
    name: NAME, status: DATA_STATUS.VALID, value: Math.round(relative * 1000) / 1000, score, passed: relative >= 1,
    threshold: 1, sourceFields: ['freq', `rollingMedianFrequency(${baseline.sampleSize} hari)`]
  });
}

export { computeFrequency };
