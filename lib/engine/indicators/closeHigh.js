/**
 * CLOSE_HIGH — ClosePosition = (Close - Low) / (High - Low), default
 * threshold 0.80. Real data: marketData.ohlc from Invezgo intraday-data
 * (market=RG), same call already used for HIGH_ATS — no extra API cost.
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';

const NAME = 'CLOSE_HIGH';
const DEFAULT_THRESHOLD = Number(process.env.STRATEGY_ENGINE_CLOSE_HIGH_THRESHOLD || 0.80);

function computeCloseHigh(marketData, threshold = DEFAULT_THRESHOLD) {
  if (!marketData || !marketData.ohlc) {
    return unavailableIndicator(NAME, 'OHLC_UNAVAILABLE', threshold, ['ohlc.close', 'ohlc.high', 'ohlc.low']);
  }
  const { close, high, low, open, prev } = marketData.ohlc;
  const range = high - low;
  if (!(range > 0)) {
    // No intraday range (single-print/halted day) — ClosePosition is
    // mathematically undefined, not zero.
    return unavailableIndicator(NAME, 'ZERO_RANGE', threshold, ['ohlc.close', 'ohlc.high', 'ohlc.low']);
  }

  const closePosition = (close - low) / range;
  const isRedCandle = (typeof open === 'number' && open > 0 && close < open);
  const isNegativeDay = (typeof prev === 'number' && prev > 0 && close < prev);

  let passed = closePosition >= threshold;
  let score = clampScore(closePosition * 100);

  // Jika saham mengalami hari negatif (close < prev) atau red candle (close < open),
  // posisi close di rentang intraday tidak boleh dianggap sebagai breakout/momentum bullish murni.
  if (isNegativeDay || isRedCandle) {
    passed = false;
    const penaltyMultiplier = (isNegativeDay && isRedCandle) ? 0.3 : (isNegativeDay ? 0.5 : 0.7);
    score = clampScore(Math.round(score * penaltyMultiplier * 10) / 10);
  }

  const contradictionNote = (isNegativeDay || isRedCandle)
    ? `BEARISH_CONTRADICTION (${isNegativeDay ? 'close < prev' : ''}${isNegativeDay && isRedCandle ? ', ' : ''}${isRedCandle ? 'close < open' : ''})`
    : null;

  return buildIndicatorResult({
    name: NAME,
    status: DATA_STATUS.VALID,
    value: Math.round(closePosition * 1000) / 1000,
    score,
    passed,
    threshold,
    reason: contradictionNote,
    sourceFields: ['ohlc.close', 'ohlc.high', 'ohlc.low']
  });
}

export { computeCloseHigh };
