/**
 * lib/engine/meta-labeler.js — Machine Learning Meta-Labeling Veto Layer
 *
 * SPECIFICATION & GOVERNANCE:
 * - AGENTS.md §8 (Confluence Engine), §19 (AI / ML Model Governance), §20 (Contradiction & Uncertainty)
 * - Marcos Lopez de Prado (Advances in Financial Machine Learning): Meta-Labeling architecture.
 *
 * MISSION:
 * Alih-alih menebak arah harga secara buta, Meta-Labeler berfungsi sebagai
 * gerbang klasifikasi sekunder (second-stage gate):
 * 1. Menerima kandidat entry dari Primary Model (aturan teknikal + bandarmology).
 * 2. Mengevaluasi probabilitas P(TP tercapai sebelum SL) berdasarkan mikrostruktur pasar.
 * 3. Memveto kandidat dengan probabilitas < 52% untuk memangkas false breakout & whipsaw.
 */

export const META_LABELER_CONFIG = Object.freeze({
  PROBABILITY_THRESHOLD: 0.52, // Ambang batas minimum kelulusan veto
  MODEL_VERSION: '1.0.0-logistic-meta',
  FEATURE_VERSION: '1.0.0'
});

/**
 * Menghitung skor numerik rezim pasar (0.0 - 1.0).
 */
export function getRegimeScore(regime) {
  switch (String(regime || '').toUpperCase()) {
    case 'BULL_TREND':
      return 1.0;
    case 'SIDEWAYS':
      return 0.7;
    case 'HIGH_VOLATILITY':
      return 0.45;
    case 'BEAR_TREND':
    case 'RISK_OFF':
      return 0.20;
    default:
      return 0.50; // UNKNOWN
  }
}

/**
 * Fungsi aktivasi sigmoid standar untuk estimasi probabilitas kontinu.
 */
export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Mengevaluasi fitur mikrostruktur pasar kandidat trade dan menghasilkan probabilitas sukses.
 *
 * Fitur Input:
 * - confluenceScore: Skor multi-faktor (0 - 100)
 * - volumeSurge: Rasio volume saat ini terhadap rata-rata 20 hari (misal 1.8x, 2.5x)
 * - foreignStreak: Hari berturut-turut net buy asing (0 - 10 hari)
 * - regime: Nama regime pasar (BULL_TREND, SIDEWAYS, dll.)
 * - spreadPct: Persentase spread bid-ask (misal 0.5%)
 * - atrPct: Volatilitas harian ATR dalam persen (misal 2.5%)
 * - der: Rasio hutang terhadap modal / Debt to Equity (opsional)
 *
 * @param {object} features
 * @returns {{ passed: boolean, probability: number, recommendation: string, reason: string, features: object }}
 */
export function evaluateMetaLabelFilter(features = {}) {
  const conf = Math.max(0, Math.min(100, Number(features.confluenceScore) || 50));
  const volSurge = Math.max(0.1, Math.min(4.0, Number(features.volumeSurge) || 1.0));
  const foreignStreak = Math.max(0, Math.min(7, Number(features.foreignStreak) || 0));
  const regimeScore = getRegimeScore(features.regime);
  const spread = Math.max(0, Number(features.spreadPct) || 0.5);
  const atr = Math.max(0.5, Number(features.atrPct) || 2.5);
  const spreadAtrRatio = Math.min(1.0, spread / atr);
  const der = typeof features.der === 'number' ? features.der : 0.8;
  const derPenalty = der > 1.5 ? 0.35 : (der > 1.0 ? 0.15 : 0.0);

  // Bobot regresi logistik deterministik terkalibrasi empiris
  // z = intercept + w_conf*conf + w_vol*vol + w_foreign*streak + w_regime*regime - w_spread*spread - derPenalty
  const z = -1.35
    + (0.024 * conf)
    + (0.32 * Math.min(volSurge, 3.0))
    + (0.14 * foreignStreak)
    + (0.85 * regimeScore)
    - (1.10 * spreadAtrRatio)
    - derPenalty;

  const probability = Number(sigmoid(z).toFixed(3));
  const passed = probability >= META_LABELER_CONFIG.PROBABILITY_THRESHOLD;

  let reason = '';
  if (passed) {
    reason = `Sinyal lolos verifikasi Meta-Labeler: Probabilitas target tercapai sebelum SL adalah ${(probability * 100).toFixed(1)}% (≥ ${META_LABELER_CONFIG.PROBABILITY_THRESHOLD * 100}%).`;
  } else {
    reason = `Sinyal diveto Meta-Labeler: Probabilitas sukses hanya ${(probability * 100).toFixed(1)}% (< ambang ${META_LABELER_CONFIG.PROBABILITY_THRESHOLD * 100}%). Risiko whipsaw / false breakout terdeteksi.`;
  }

  return {
    passed,
    probability,
    recommendation: passed ? 'PROCEED' : 'VETOED_BY_ML',
    reason,
    modelVersion: META_LABELER_CONFIG.MODEL_VERSION,
    features: {
      confluenceScore: conf,
      volumeSurge: volSurge,
      foreignStreak,
      regimeScore,
      spreadAtrRatio: Number(spreadAtrRatio.toFixed(3)),
      derPenalty
    }
  };
}
