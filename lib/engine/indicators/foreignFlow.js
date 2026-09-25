/**
 * FOREIGN — NetForeignValue = ForeignBuyValue - ForeignSellValue,
 * ForeignParticipation = abs(NetForeignValue) / TotalTradedValue, default
 * minimum participation = 0.02. Direction: positive=BUY, negative=SELL,
 * zero=NEUTRAL.
 *
 * DEACTIVATED (2026-09-25) — no strategies/*.json currently include
 * FOREIGN in their `weights`, so this function is not called by
 * StrategyEngine.js's runStrategyForTicker()/runStrategyForUniverse()
 * (both gate the whole foreign-movers fetch behind
 * `Object.keys(strategyDef.weights).includes('FOREIGN')`). Root cause:
 * the field this was fed from, `netValueRp`, was built from Invezgo's
 * /analysis/top/foreign `calculated_value` field — assumed to be a net
 * Rupiah amount, but a real captured response (user-verified against
 * Invezgo's own API client, no documented field description found)
 * shows it's actually a small-magnitude, sometimes-negative score
 * (matching the last point of that row's own `graph` series), the exact
 * same kind of ranking value /analysis/top/accumulation's
 * `calculated_value` already carries (see getUniverseAccumulationDistribution()
 * in lib/idx-data-engine.js). Dividing that score by a genuine Rupiah
 * totalValueRp collapsed `participation` to ~0 for virtually every
 * ticker, making FOREIGN's `passed` almost never true — a real problem
 * since FOREIGN was a `mandatoryCondition` for hidden-accumulation and
 * momentum-candidate, likely explaining their near-zero STRONG/QUALIFIED
 * signal rate.
 *
 * Re-enabling this needs a genuine, documented meaning/scale for
 * `calculated_value` under kind='foreign' from Invezgo (their docs had
 * no field description as of this date) — until then, re-introducing
 * FOREIGN into any strategy's weights without fixing this formula would
 * reintroduce the same silent-failure bug. See git history for this
 * commit's message for the full incident writeup.
 *
 * REAL tapi PARSIAL (when re-enabled): sumbernya /analysis/top/foreign
 * (Invezgo), yang cuma mengembalikan saham dengan aktivitas net-foreign
 * signifikan hari itu (top movers), bukan seluruh universe on-demand, dan
 * cuma NET value (bukan gross ForeignBuyValue/ForeignSellValue terpisah).
 * Ticker yang tidak muncul di top movers hari itu WAJIB UNAVAILABLE, bukan
 * 0/NEUTRAL (0 secara implisit berarti "sudah dicek, benar-benar netral" —
 * beda dengan "tidak ada datanya sama sekali").
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
