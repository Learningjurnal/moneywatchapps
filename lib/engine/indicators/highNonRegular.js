/**
 * HIGH_NON_REGULAR — NonRegularRatio = NonRegularVolume / TotalVolume,
 * default threshold 0.20.
 *
 * PROVENANCE (baca sebelum ubah): NonRegularVolume = ngVolume + tnVolume,
 * dari BEI_MARKET_SEGMENT (lib/invezgo-client.js) — RG=Pasar Reguler,
 * NG=Pasar Negosiasi, TN=Pasar Tunai. Mapping ini terminologi resmi BEI,
 * TAPI TIDAK dikonfirmasi langsung dari dokumentasi Invezgo (yang tidak
 * pernah menjelaskan kepanjangan RG/NG/TN) maupun dari respons API real
 * (belum ada akses live untuk test call). Selama status ini belum
 * diverifikasi via test call live, indikator ini harus dianggap
 * PROVISIONAL — lihat catatan lengkap di lib/invezgo-client.js.
 *
 * Kalau provider tidak expose non-regular data untuk ticker ini (lihat
 * CLAUDE.md: "Non-regular data is provider-dependent... return UNAVAILABLE.
 * Never infer or fabricate it"), WAJIB UNAVAILABLE.
 */
import { buildIndicatorResult, unavailableIndicator, DATA_STATUS, clampScore } from '../types.js';

const NAME = 'HIGH_NON_REGULAR';
const DEFAULT_THRESHOLD = Number(process.env.STRATEGY_ENGINE_NON_REGULAR_THRESHOLD || 0.20);
const PROVISIONAL_NOTICE = 'PROVISIONAL: arti RG/NG/TN dari terminologi resmi BEI, belum diverifikasi dari respons real Invezgo (lihat lib/invezgo-client.js)';

function computeHighNonRegular(marketData, threshold = DEFAULT_THRESHOLD) {
  if (!marketData || !marketData.nonRegular) {
    return unavailableIndicator(NAME, 'NON_REGULAR_DATA_NOT_PROVIDED', threshold, ['nonRegular.rgVolume', 'nonRegular.ngVolume', 'nonRegular.tnVolume']);
  }
  const { rgVolume, ngVolume, tnVolume } = marketData.nonRegular;
  const totalVolume = rgVolume + ngVolume + tnVolume;
  if (!(totalVolume > 0)) {
    return unavailableIndicator(NAME, 'ZERO_TOTAL_VOLUME', threshold, ['nonRegular.rgVolume', 'nonRegular.ngVolume', 'nonRegular.tnVolume']);
  }

  const nonRegularVolume = ngVolume + tnVolume;
  const ratio = nonRegularVolume / totalVolume;
  const passed = ratio >= threshold;
  const score = clampScore(ratio >= threshold
    ? 60 + Math.min(40, ((ratio - threshold) / (1 - threshold || 1)) * 40)
    : (ratio / threshold) * 60);

  return buildIndicatorResult({
    name: NAME,
    status: DATA_STATUS.VALID,
    value: Math.round(ratio * 1000) / 1000,
    score,
    passed,
    threshold,
    sourceFields: ['nonRegular.rgVolume', 'nonRegular.ngVolume', 'nonRegular.tnVolume'],
    reason: PROVISIONAL_NOTICE
  });
}

export { computeHighNonRegular, PROVISIONAL_NOTICE };
