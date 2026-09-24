/**
 * lib/regulatory-gate.js — Regulatory Health Gate
 *
 * Spesifikasi lengkap: AGENTS.md §30. Prinsip inti:
 *
 *   FILTER FIRST -> VALIDATE REGULATORY STATUS -> ANALYZE SECOND
 *
 * Gate ini murni saringan REGULASI (Special Notation/Papan Pemantauan
 * Khusus resmi BEI) — BUKAN strategi investasi. Jangan tambahkan kriteria
 * valuasi/fundamental/teknikal di sini; itu tetap tugas layer analisis
 * sesudahnya.
 *
 * SUMBER DATA (diubah 2026-09-24, user-reported: "Regulatory Health Gate
 * cek apakah data ini bisa di dapatkan, atau data tidak pernah tersedia,
 * kalo data tidak pernah tersedia, screener akan terus 0"):
 *   1. PRIMARY: fetchInvezgoNotation() (invezgo-client.js, GET
 *      /analysis/notation) — API resmi Invezgo, 1 panggilan whole-market,
 *      dan SUDAH TERBUKTI reachable dari deployment Vercel app ini (cron
 *      Strategy Engine berhasil memproses 843/958 ticker lewat Invezgo).
 *   2. FALLBACK: fetchIdxSpecialNotations() (providers/idx-client.js) —
 *      scraping langsung idx.co.id. Reachability-nya dari Vercel BELUM
 *      pernah diverifikasi (situs bursa sering punya proteksi anti-bot
 *      untuk trafik datacenter) — makanya sekarang fallback, bukan primary,
 *      supaya gate (dan Screener yang bergantung padanya) tidak permanen
 *      mati kalau idx.co.id memang diblokir dari sana.
 * Whole-market di kedua sumber — gate ini TIDAK PERNAH melakukan panggilan
 * per-ticker tambahan.
 *
 * NON-NEGOTIABLE:
 *   - Yahoo Price != Regulatory Clearance
 *   - UNKNOWN != CLEAR
 *   - STALE != CLEAR
 *   - API Failure != CLEAR
 *   - No Synthetic Data
 *   - No Hardcoded Permanent Healthy-Stock List
 */

import { fetchIdxSpecialNotations, IDX_SPECIAL_NOTATION_DICT } from './providers/idx-client.js';
import { fetchInvezgoNotation } from './invezgo-client.js';

const REGULATORY_STATUS = Object.freeze({
  CLEAR: 'CLEAR',
  FLAGGED: 'FLAGGED',
  UNKNOWN: 'UNKNOWN',
  DATA_ERROR: 'DATA_ERROR'
});

const HIGH_RISK_CODES = ['E', 'B', 'M', 'D', 'L', 'S', 'A', 'X'];

function cleanTicker(t) {
  return String(t || '').toUpperCase().replace(/\.JK$/i, '').trim();
}

/**
 * normalizeInvezgoNotationRows(rows) — GET /analysis/notation returns a
 * flat array of {code, date, list:[{notation, description}]}. PROVENANCE
 * CAVEAT (see invezgo-client.js's fetchInvezgoNotation() header): it is
 * NOT confirmed from a live response whether a code can appear multiple
 * times (a real notation history) or always exactly once (current status
 * only). This takes the entry with the latest `date` per code as the
 * current status — a documented assumption, not a verified fact.
 */
function normalizeInvezgoNotationRows(rows) {
  const latestByCode = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const code = cleanTicker(row && row.code);
    if (!code) return;
    const d = row.date ? new Date(row.date).getTime() : 0;
    if (!latestByCode[code] || d > latestByCode[code]._d) {
      latestByCode[code] = { _d: d, row };
    }
  });

  const byTicker = {};
  Object.keys(latestByCode).forEach((code) => {
    const row = latestByCode[code].row;
    const list = Array.isArray(row.list) ? row.list : [];
    const notations = [];
    const details = [];
    let isHighRisk = false;

    list.forEach((item) => {
      const notationCode = String((item && item.notation) || '').toUpperCase().trim();
      if (!notationCode || notations.includes(notationCode)) return;
      notations.push(notationCode);
      const dict = IDX_SPECIAL_NOTATION_DICT[notationCode];
      details.push({
        notation: notationCode,
        name: dict ? dict.name : `Notasi ${notationCode}`,
        desc: (item && item.description) || (dict ? dict.desc : ''),
        severity: dict ? dict.severity : 'MEDIUM'
      });
      if (HIGH_RISK_CODES.includes(notationCode)) isHighRisk = true;
    });

    if (notations.length === 0) return; // no active notation for this code
    byTicker[code] = {
      code,
      name: code + ' Tbk.',
      notations,
      details,
      isHighRisk,
      isWatchlist: notations.includes('X'),
      updatedAt: row.date || new Date().toISOString()
    };
  });
  return byTicker;
}

/**
 * getCombinedNotationEnvelope() — tries Invezgo first, falls back to
 * idx.co.id. Returns the same {available, isStale, checkedAt, byTicker,
 * reason, source} shape regardless of which source actually answered.
 */
async function getCombinedNotationEnvelope(forceRefresh) {
  const invezgoRes = await fetchInvezgoNotation(forceRefresh);
  if (invezgoRes.ok) {
    return {
      available: true,
      isStale: false,
      checkedAt: new Date().toISOString(),
      byTicker: normalizeInvezgoNotationRows(invezgoRes.rows),
      reason: null,
      source: 'Invezgo (data notasi resmi BEI)'
    };
  }

  const idxRes = await fetchIdxSpecialNotations(forceRefresh);
  return {
    available: idxRes.available,
    isStale: idxRes.isStale,
    checkedAt: idxRes.checkedAt,
    byTicker: idxRes.byTicker || {},
    reason: idxRes.available ? null : (idxRes.reason || `Invezgo gagal (${invezgoRes.reason}) dan idx.co.id juga gagal`),
    source: (idxRes.available || idxRes.isStale) ? 'BEI (idx.co.id, fallback — Invezgo gagal)' : null
  };
}

/**
 * getRegulatoryHealthGate(tickers) — klasifikasi CLEAR/FLAGGED/UNKNOWN/
 * DATA_ERROR untuk setiap ticker di `tickers`, dari SATU snapshot
 * gabungan (Invezgo utama, idx.co.id fallback).
 *
 * - dataAvailable=false & isStale=false -> KEDUA sumber belum pernah
 *   berhasil dihubungi sama sekali (tidak ada cache di manapun) -> semua
 *   ticker DATA_ERROR.
 * - dataAvailable=false & isStale=true -> refresh terbaru gagal di kedua
 *   sumber, yang dikembalikan adalah cache lama idx.co.id (di luar TTL) ->
 *   semua ticker UNKNOWN (bukan CLEAR, bukan DATA_ERROR — datanya ADA tapi
 *   kedaluwarsa).
 * - dataAvailable=true -> data segar (dari Invezgo atau idx.co.id fresh),
 *   per-ticker CLEAR (tidak ada di peta notasi) atau FLAGGED (ada).
 */
async function getRegulatoryHealthGate(tickers, forceRefresh = false) {
  const envelope = await getCombinedNotationEnvelope(forceRefresh);
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
      reason = envelope.reason || 'REGULATORY_DATA_UNAVAILABLE';
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
      source: envelope.source || 'Sumber regulasi tidak tersedia',
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
    source: envelope.source,
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
