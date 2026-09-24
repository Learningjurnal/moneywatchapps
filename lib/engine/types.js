/**
 * lib/engine/types.js — Money Watch Strategy Engine V1, shared constants.
 *
 * Spesifikasi lengkap: pesan user "IMPLEMENT MONEY WATCH STRATEGY ENGINE
 * V1" (2026-09-24). Diimplementasikan sebagai JavaScript ESM murni
 * (bukan TypeScript — repo ini tidak punya toolchain TS), mengikuti pola
 * arsitektur yang sudah ada (lib/regulatory-gate.js).
 *
 * NON-NEGOTIABLE (CLAUDE.md Aturan #1/#3):
 *   - AI tidak pernah menghitung indikator — hanya boleh menjelaskan hasil
 *     deterministik dari engine ini SETELAH dihitung.
 *   - Tidak pernah label hasil BUY/SELL — hanya QUALIFIED/WATCH/REJECT/
 *     DATA_INSUFFICIENT.
 *   - Data yang tidak tersedia WAJIB UNAVAILABLE/DATA_INSUFFICIENT, tidak
 *     pernah dikonversi jadi 0 atau angka pengganti.
 */

const DATA_STATUS = Object.freeze({
  VALID: 'VALID',
  INVALID: 'INVALID',
  UNAVAILABLE: 'UNAVAILABLE'
});

const STRATEGY_RESULT_STATUS = Object.freeze({
  STRONG: 'STRONG',
  QUALIFIED: 'QUALIFIED',
  WATCH: 'WATCH',
  REJECT: 'REJECT',
  DATA_INSUFFICIENT: 'DATA_INSUFFICIENT'
});

// Skema resmi (bukan tebakan) — arti RG/NG/TN diverifikasi dari
// terminologi resmi BEI, lihat catatan panjang di lib/invezgo-client.js
// dekat BEI_MARKET_SEGMENT untuk detail & batas keyakinannya.
const CALCULATION_VERSION = '1.0.0';
const STRATEGY_SCHEMA_VERSION = '1.0.0';

/**
 * Bangun IndicatorResult standar — setiap indikator WAJIB mengembalikan
 * bentuk ini persis (spec: name/status/value/score/passed/threshold/
 * sourceFields/calculationVersion).
 */
function buildIndicatorResult({ name, status, value = null, score = null, passed = false, threshold = null, sourceFields = [], reason = null }) {
  return {
    name,
    status,
    value,
    score,
    passed,
    threshold,
    sourceFields,
    calculationVersion: CALCULATION_VERSION,
    reason
  };
}

function unavailableIndicator(name, reason, threshold = null, sourceFields = []) {
  return buildIndicatorResult({ name, status: DATA_STATUS.UNAVAILABLE, threshold, sourceFields, reason });
}

// Normalisasi linear generik 0..100, di-clamp. Dipakai Normalizer.js dan
// tiap indikator untuk skor individual sebelum dibobot.
function clampScore(x) {
  if (typeof x !== 'number' || !isFinite(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x * 10) / 10));
}

export {
  DATA_STATUS,
  STRATEGY_RESULT_STATUS,
  CALCULATION_VERSION,
  STRATEGY_SCHEMA_VERSION,
  buildIndicatorResult,
  unavailableIndicator,
  clampScore
};
