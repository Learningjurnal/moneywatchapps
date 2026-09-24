/**
 * FOREIGN — NetForeignValue = ForeignBuyValue - ForeignSellValue,
 * ForeignParticipation = abs(NetForeignValue) / TotalTradedValue, default
 * minimum participation = 0.02. Direction: positive=BUY, negative=SELL,
 * zero=NEUTRAL.
 *
 * REAL tapi PARSIAL: sumbernya /analysis/top/foreign (Invezgo), yang cuma
 * mengembalikan saham dengan aktivitas net-foreign signifikan hari itu
 * (top movers), bukan seluruh universe on-demand, dan cuma NET value
 * (bukan gross ForeignBuyValue/ForeignSellValue terpisah). Ticker yang
 * tidak muncul di top movers hari itu WAJIB UNAVAILABLE, bukan 0/NEUTRAL
 * (0 secara implisit berarti "sudah dicek, benar-benar netral" — beda
 * dengan "tidak ada datanya sama sekali").
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';

const NAME = 'FOREIGN';
const DEFAULT_MIN_PARTICIPATION = Number(process.env.STRATEGY_ENGINE_FOREIGN_MIN_PARTICIPATION || 0.02);

function computeForeignFlow(marketData, minParticipation = DEFAULT_MIN_PARTICIPATION) {
  if (!marketData || !marketData.foreign) {
    return unavailableIndicator(NAME, 'NOT_IN_TODAYS_TOP_MOVERS', minParticipation, ['foreign.netValueRp', 'foreign.totalValueRp']);
  }
  const { netValueRp, totalValueRp } = marketData.foreign;
  if (!(totalValueRp > 0)) {
    return unavailableIndicator(NAME, 'ZERO_TOTAL_TRADED_VALUE', minParticipation, ['foreign.netValueRp', 'foreign.totalValueRp']);
  }

  const participation = Math.abs(netValueRp) / totalValueRp;
  const direction = netValueRp > 0 ? 'BUY' : (netValueRp < 0 ? 'SELL' : 'NEUTRAL');
  const passed = participation >= minParticipation;
  const score = clampScore(passed ? 60 + Math.min(40, ((participation - minParticipation) / (minParticipation * 4 || 1)) * 40) : (participation / minParticipation) * 60);

  return buildIndicatorResult({
    name: NAME,
    status: DATA_STATUS.VALID,
    value: Math.round(participation * 10000) / 10000,
    score,
    passed,
    threshold: minParticipation,
    sourceFields: ['foreign.netValueRp (top/foreign, hari ini saja)', 'foreign.totalValueRp'],
    reason: `direction=${direction}`
  });
}

export { computeForeignFlow };
