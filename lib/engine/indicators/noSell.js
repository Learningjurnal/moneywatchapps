/**
 * NO_SELL — SellPressure = OfferDepth / (BidDepth + OfferDepth), default
 * maximum SellPressure = 0.30. Same level-1-only caveat as highBidOffer.js
 * (Invezgo order-book has no 5-level depth — see that file's header).
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';

const NAME = 'NO_SELL';
const DEFAULT_MAX_SELL_PRESSURE = Number(process.env.STRATEGY_ENGINE_MAX_SELL_PRESSURE || 0.30);

function computeNoSell(marketData, maxSellPressure = DEFAULT_MAX_SELL_PRESSURE) {
  if (!marketData || !marketData.orderBook) {
    return unavailableIndicator(NAME, 'ORDER_BOOK_UNAVAILABLE', maxSellPressure, ['orderBook.bid1lot', 'orderBook.offer1lot']);
  }
  const { bid1lot, offer1lot } = marketData.orderBook;
  const denom = bid1lot + offer1lot;
  if (!(denom > 0)) {
    return unavailableIndicator(NAME, 'ORDER_BOOK_EMPTY', maxSellPressure, ['orderBook.bid1lot', 'orderBook.offer1lot']);
  }

  const sellPressure = offer1lot / denom;
  const passed = sellPressure <= maxSellPressure;
  // Lower sellPressure = better (more buy-side dominance) -> higher score.
  const score = clampScore((1 - sellPressure) * 100);

  return buildIndicatorResult({
    name: NAME,
    status: DATA_STATUS.VALID,
    value: Math.round(sellPressure * 1000) / 1000,
    score,
    passed,
    threshold: maxSellPressure,
    sourceFields: ['orderBook.bid1lot (level 1 only)', 'orderBook.offer1lot (level 1 only)']
  });
}

export { computeNoSell };
