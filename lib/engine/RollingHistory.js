/**
 * lib/engine/RollingHistory.js — persisted rolling window (default 20
 * trading days) for indicators that need a baseline to compare "today"
 * against (RelativeATS = ATS / rollingMedianATS(20)), so the median
 * survives across serverless cold-starts/instances the same way the
 * Invezgo quota counter does (Redis via lib/invezgo-client.js's shared
 * store, falling back to in-memory when Redis isn't configured).
 *
 * This does NOT fetch 20 days of history retroactively (that would cost
 * ~20x the API calls per ticker on day one) — it builds the window up
 * incrementally, one real data point per day, via pushValue(). Until the
 * window has at least MIN_SAMPLES points, callers must treat the relative
 * metric as UNAVAILABLE (not a fabricated ratio against a 1-2 sample
 * "median").
 */

import { storeGet, storeSetEx } from '../invezgo-client.js';

const WINDOW_SIZE = Number(process.env.STRATEGY_ENGINE_ROLLING_WINDOW || 20);
const MIN_SAMPLES = Number(process.env.STRATEGY_ENGINE_ROLLING_MIN_SAMPLES || 5);
const ROLLING_TTL_SEC = 60 * 60 * 24 * 40; // 40 days — comfortably covers a 20-trading-day window

function key(namespace, ticker) {
  return `strategy_engine:rolling:${namespace}:${ticker}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * getRollingMedian(namespace, ticker) — read-only, does not mutate.
 * Returns { available, median, sampleSize } — available=false when fewer
 * than MIN_SAMPLES points have been recorded yet.
 */
async function getRollingMedian(namespace, ticker) {
  const raw = await storeGet(key(namespace, ticker));
  const series = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.values) ? raw.values : []);
  if (series.length < MIN_SAMPLES) return { available: false, median: null, sampleSize: series.length };
  return { available: true, median: median(series), sampleSize: series.length };
}

/**
 * pushValue(namespace, ticker, dateKey, value) — append today's real value
 * (idempotent per dateKey: pushing the same trading day twice does not
 * double-count it, so a retried cron run stays safe).
 */
async function pushValue(namespace, ticker, dateKey, value) {
  if (typeof value !== 'number' || !isFinite(value)) return;
  const storeKey = key(namespace, ticker);
  const raw = await storeGet(storeKey);
  const entry = (raw && Array.isArray(raw.entries)) ? raw : { entries: [] };
  if (entry.entries.some(e => e.date === dateKey)) return; // already recorded today
  entry.entries.push({ date: dateKey, value });
  entry.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (entry.entries.length > WINDOW_SIZE) entry.entries = entry.entries.slice(-WINDOW_SIZE);
  entry.values = entry.entries.map(e => e.value);
  await storeSetEx(storeKey, entry, ROLLING_TTL_SEC);
}

export { getRollingMedian, pushValue, WINDOW_SIZE, MIN_SAMPLES };
