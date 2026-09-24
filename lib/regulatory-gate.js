/**
 * lib/regulatory-gate.js — Regulatory Health Gate
 *
 * Spesifikasi lengkap: docs/regulatory-health-gate.md (AGENTS.md juga
 * meringkas versi singkatnya). Prinsip inti:
 *
 *   FILTER FIRST -> VALIDATE REGULATORY STATUS -> ANALYZE SECOND
 *
 * Gate ini murni saringan REGULASI (Special Notation/Papan Pemantauan
 * Khusus resmi BEI) — BUKAN strategi investasi. Jangan tambahkan kriteria
 * valuasi/fundamental/teknikal di sini; itu tetap tugas layer analisis
 * sesudahnya.
 *
 * Sumber data: fetchIdxSpecialNotations() (lib/providers/idx-client.js),
 * yang sudah whole-market (1-2 panggilan ke idx.co.id untuk SELURUH
 * emiten sekaligus) — gate ini TIDAK PERNAH melakukan panggilan per-ticker
 * tambahan, jadi bisa diterapkan ke seluruh ~958 emiten BEI tanpa biaya
 * kuota ekstra.
 *
 * NON-NEGOTIABLE (lihat docs/regulatory-health-gate.md §29):
 *   - Yahoo Price != Regulatory Clearance
 *   - UNKNOWN != CLEAR
 *   - STALE != CLEAR
 *   - API Failure != CLEAR
 *   - No Synthetic Data
 *   - No Hardcoded Permanent Healthy-Stock List
 */

import { fetchIdxSpecialNotations } from './providers/idx-client.js';

const REGULATORY_STATUS = Object.freeze({
  CLEAR: 'CLEAR',
  FLAGGED: 'FLAGGED',
  UNKNOWN: 'UNKNOWN',
  DATA_ERROR: 'DATA_ERROR'
});

function cleanTicker(t) {
  return String(t || '').toUpperCase().replace(/\.JK$/i, '').trim();
}

/**
 * getRegulatoryHealthGate(tickers) — klasifikasi CLEAR/FLAGGED/UNKNOWN/
 * DATA_ERROR untuk setiap ticker di `tickers`, dari SATU snapshot
 * fetchIdxSpecialNotations() (whole-market).
 *
 * - dataAvailable=false & isStale=false -> sumber idx.co.id belum pernah
 *   berhasil dihubungi sama sekali (tidak ada cache) -> semua ticker
 *   DATA_ERROR.
 * - dataAvailable=false & isStale=true -> refresh terbaru gagal, yang
 *   dikembalikan adalah cache lama (di luar TTL 12 jam) -> semua ticker
 *   UNKNOWN (bukan CLEAR, bukan DATA_ERROR — datanya ADA tapi kedaluwarsa).
 * - dataAvailable=true -> data segar, per-ticker CLEAR (tidak ada di
 *   peta notasi) atau FLAGGED (ada).
 */
async function getRegulatoryHealthGate(tickers, forceRefresh = false) {
  const envelope = await fetchIdxSpecialNotations(forceRefresh);
  const list = Array.isArray(tickers) ? tickers : [];
  const byTicker = {};

  list.forEach((raw) => {
    const code = cleanTicker(raw);
    if (!code || byTicker[code]) return;

    let status;
    let eligible = false;
    let reason = null;
    let detail = null;

    if (!envelope.available && !envelope.isStale) {
      status = REGULATORY_STATUS.DATA_ERROR;
      reason = envelope.reason || 'IDX_DATA_UNAVAILABLE';
    } else if (!envelope.available && envelope.isStale) {
      status = REGULATORY_STATUS.UNKNOWN;
      reason = 'STALE_DATA';
    } else {
      const entry = envelope.byTicker[code] || null;
      if (entry) {
        status = REGULATORY_STATUS.FLAGGED;
        reason = (entry.notations || []).join(', ');
        detail = entry;
      } else {
        status = REGULATORY_STATUS.CLEAR;
        eligible = true;
      }
    }

    byTicker[code] = {
      ticker: code,
      status,
      eligible,
      reason,
      detail,
      source: 'BEI (idx.co.id)',
      checkedAt: envelope.checkedAt
    };
  });

  const summary = { totalChecked: Object.keys(byTicker).length, clear: 0, flagged: 0, unknown: 0, dataError: 0 };
  Object.values(byTicker).forEach((r) => {
    if (r.status === REGULATORY_STATUS.CLEAR) summary.clear++;
    else if (r.status === REGULATORY_STATUS.FLAGGED) summary.flagged++;
    else if (r.status === REGULATORY_STATUS.UNKNOWN) summary.unknown++;
    else summary.dataError++;
  });

  return {
    dataAvailable: envelope.available,
    isStale: envelope.isStale,
    checkedAt: envelope.checkedAt,
    byTicker,
    summary
  };
}

/**
 * filterEligibleTickers(tickers) — helper untuk caller yang cuma butuh
 * daftar ticker yang lolos gate (mis. membangun ELIGIBLE_UNIVERSE),
 * bukan detail klasifikasi lengkap.
 */
async function filterEligibleTickers(tickers) {
  const gate = await getRegulatoryHealthGate(tickers);
  return tickers.filter((raw) => {
    const code = cleanTicker(raw);
    return gate.byTicker[code] && gate.byTicker[code].eligible;
  });
}

export { getRegulatoryHealthGate, filterEligibleTickers, REGULATORY_STATUS };
