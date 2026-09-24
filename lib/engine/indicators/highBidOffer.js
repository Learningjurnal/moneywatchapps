/**
 * HIGH_BID_OFFER
 *
 * Spec asli: BidDepth = sum(top N=5 bid levels), BidOfferRatio =
 * BidDepth/OfferDepth, default threshold 1.5.
 *
 * DEVIASI DARI SPEC (wajib didisclose, bukan didiamkan): Invezgo
 * (/analysis/order-book/{code}, dikonfirmasi dari OpenAPI spec vendor)
 * hanya expose LEVEL 1 (top-of-book) — tidak ada bid2..bid5/offer2..offer5
 * di skema manapun yang ditemukan. Jadi N efektif = 1, bukan 5. Formula
 * tetap sama (BidOfferRatio = BidDepth/OfferDepth), cuma BidDepth/OfferDepth
 * di sini adalah bid1lot/offer1lot, bukan sum 5 level.
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';

const NAME = 'HIGH_BID_OFFER';
const DEFAULT_THRESHOLD = Number(process.env.STRATEGY_ENGINE_BID_OFFER_THRESHOLD || 1.5);
const EFFECTIVE_DEPTH_LEVELS = 1; // real data ceiling, not a design choice

function computeHighBidOffer(marketData, threshold = DEFAULT_THRESHOLD) {
  if (!marketData || !marketData.orderBook) {
    return unavailableIndicator(NAME, 'ORDER_BOOK_UNAVAILABLE', threshold, ['orderBook.bid1lot', 'orderBook.offer1lot']);
  }
  const { bid1lot, offer1lot } = marketData.orderBook;
  if (!(offer1lot > 0)) {
    // Zero live offers is a real, valid (if unusual) market state — not an
    // error — but a ratio against zero is undefined, so DATA_INSUFFICIENT
    // rather than +Infinity or a fabricated cap.
    return unavailableIndicator(NAME, 'OFFER_DEPTH_ZERO', threshold, ['orderBook.bid1lot', 'orderBook.offer1lot']);
  }

  const bidOfferRatio = bid1lot / offer1lot;
  const passed = bidOfferRatio >= threshold;
  // Normalize to 0..100: threshold itself maps to 60 (a passing-but-not-
  // exceptional reading), scaling up to 100 at 3x threshold, down toward 0
  // as the ratio approaches 0. This is an explicit, documented scoring
  // curve — not a fitted/backtested one (see CLAUDE.md note: thresholds
  // here are configurable defaults, not empirically validated parameters).
  const score = clampScore(bidOfferRatio >= threshold
    ? 60 + Math.min(40, ((bidOfferRatio - threshold) / (threshold * 2)) * 40)
    : (bidOfferRatio / threshold) * 60);

  return buildIndicatorResult({
    name: NAME,
    status: DATA_STATUS.VALID,
    value: Math.round(bidOfferRatio * 1000) / 1000,
    score,
    passed,
    threshold,
    sourceFields: ['orderBook.bid1lot (level 1 only)', 'orderBook.offer1lot (level 1 only)']
  });
}

export { computeHighBidOffer, EFFECTIVE_DEPTH_LEVELS };
