/**
 * lib/providers/tradingview-scanner-client.js
 * TradingView Scanner provider adapter — screener teknikal + fundamental
 * SELURUH pasar BEI dalam 1 panggilan HTTP.
 *
 * STATUS (2026-10-03): PROTOTIPE. Skema respons diverifikasi dari respons
 * NYATA (bukan dokumentasi resmi — endpoint ini internal/tidak berdokumen
 * milik TradingView, tidak ada jaminan stabilitas dan bisa memunculkan
 * masalah ToS). Hasil uji nyata 2026-10-03:
 *   - POST https://scanner.tradingview.com/indonesia/scan dengan
 *     { columns, range:[0,2000] } -> 887 baris (844 saham + 43 ETF/dana),
 *     data tertunda 600 detik (update_mode "delayed_streaming_600").
 *   - Dari 965 kode di universe aplikasi: 841 ada di scanner; sisa 124
 *     hampir semuanya delisting/suspensi (cek Yahoo), kecuali ±7 yang aktif
 *     diperdagangkan tapi TIDAK ada di scanner (ADHI, INPS, NICK, PPGL,
 *     IPAC, LCKM, COAL). Kode-kode tak tercakup TIDAK di-hardcode di sini:
 *     dihitung dinamis (universe aplikasi dikurangi hasil scanner), jadi
 *     tetap benar kalau cakupan TradingView berubah.
 *
 * Aturan #1/#3 (CLAUDE.md): nilai yang tidak dikirim scanner (null) tetap
 * null — tidak pernah diisi tebakan/rumus. Rating `Recommend.*` dikembalikan
 * sebagai angka mentah skala -1..1; label (Buy/Sell) sengaja TIDAK dibuat
 * karena ambang batasnya belum terverifikasi dari sumber resmi.
 */

const TV_SCAN_URL = process.env.TV_SCAN_URL || 'https://scanner.tradingview.com/indonesia/scan';
const TV_TIMEOUT_MS = Number(process.env.TV_TIMEOUT_MS || 12000);
const TV_CACHE_TTL_MS = Number(process.env.TV_CACHE_TTL_MS || 5 * 60 * 1000);
// Batas atas jumlah baris; pasar BEI ±890 baris, 2000 memberi ruang tumbuh.
const TV_RANGE_MAX = 2000;

// [nama field output, kolom scanner]. Urutan = urutan kolom di request.
const TV_COLUMNS = Object.freeze([
  ['code', 'name'],
  ['name', 'description'],
  ['sector', 'sector'],
  ['industry', 'industry'],
  ['type', 'type'],
  ['subtype', 'subtype'],
  ['updateMode', 'update_mode'],
  ['price', 'close'],
  ['volume', 'volume'],
  ['valueTraded', 'Value.Traded'],
  ['marketCap', 'market_cap_basic'],
  ['pe', 'price_earnings_ttm'],
  ['pb', 'price_book_fq'],
  ['dividendYield', 'dividends_yield_current'],
  ['roe', 'return_on_equity_fq'],
  ['netMargin', 'net_margin_ttm'],
  ['debtToEquity', 'debt_to_equity_fq'],
  ['currentRatio', 'current_ratio_fq'],
  ['epsTtm', 'earnings_per_share_diluted_ttm'],
  ['perf1M', 'Perf.1M'],
  ['perfYtd', 'Perf.YTD'],
  ['perf1Y', 'Perf.Y'],
  ['high52w', 'price_52_week_high'],
  ['low52w', 'price_52_week_low'],
  ['rsi', 'RSI'],
  ['macd', 'MACD.macd'],
  ['adx', 'ADX'],
  ['sma50', 'SMA50'],
  ['sma200', 'SMA200'],
  ['ratingAll1H', 'Recommend.All|60'],
  ['ratingAll4H', 'Recommend.All|240'],
  ['ratingAll1D', 'Recommend.All'],
  ['ratingAll1W', 'Recommend.All|1W'],
  ['ratingAll1M', 'Recommend.All|1M'],
  ['ratingMA1D', 'Recommend.MA'],
  ['ratingOscillator1D', 'Recommend.Other']
]);

const DELAY_MODE_RE = /^delayed_streaming_(\d+)$/;

let _cache = null; // { rows, fetchedAt }
let _inflight = null;

/**
 * Ubah respons mentah scanner menjadi daftar objek bernama. Murni (tanpa
 * I/O) supaya bisa diuji tanpa jaringan. Baris tak valid dilewati, nilai
 * tidak terkirim tetap null.
 */
function parseScanResponse(json) {
  const data = json && Array.isArray(json.data) ? json.data : null;
  if (!data) throw new Error('Respons scanner TradingView tidak berisi array "data"');
  const rows = [];
  for (const entry of data) {
    const d = entry && Array.isArray(entry.d) ? entry.d : null;
    if (!d || typeof d[0] !== 'string' || !d[0]) continue;
    const row = {};
    TV_COLUMNS.forEach(([field], i) => {
      const v = d[i];
      row[field] = v === undefined ? null : v;
    });
    row.symbol = typeof entry.s === 'string' ? entry.s : `IDX:${row.code}`;
    row.delaySeconds = delaySecondsFromMode(row.updateMode);
    rows.push(Object.freeze(row));
  }
  return rows;
}

function delaySecondsFromMode(mode) {
  const m = typeof mode === 'string' ? DELAY_MODE_RE.exec(mode) : null;
  return m ? Number(m[1]) : null;
}

async function requestScan(fetchImpl) {
  const resp = await fetchImpl(TV_SCAN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      columns: TV_COLUMNS.map(([, column]) => column),
      range: [0, TV_RANGE_MAX]
    }),
    signal: AbortSignal.timeout(TV_TIMEOUT_MS)
  });
  if (!resp.ok) throw new Error(`Scanner TradingView HTTP ${resp.status}`);
  return parseScanResponse(await resp.json());
}

/**
 * Ambil snapshot seluruh pasar. Cache in-memory (TTL 5 menit — data sumber
 * sendiri sudah tertunda 10 menit), permintaan bersamaan digabung jadi 1.
 * Kalau refresh gagal dan masih ada cache lama, kembalikan cache lama
 * dengan stale:true (bukan error diam-diam, bukan angka karangan).
 */
async function getMarketScan({ fetchImpl = fetch, now = Date.now, force = false } = {}) {
  const t = now();
  if (!force && _cache && t - _cache.fetchedAt < TV_CACHE_TTL_MS) {
    return { rows: _cache.rows, fetchedAt: _cache.fetchedAt, stale: false };
  }
  if (!_inflight) {
    _inflight = requestScan(fetchImpl)
      .then(rows => {
        _cache = { rows, fetchedAt: now() };
        return { rows, fetchedAt: _cache.fetchedAt, stale: false };
      })
      .catch(err => {
        if (_cache) return { rows: _cache.rows, fetchedAt: _cache.fetchedAt, stale: true, error: err.message };
        throw err;
      })
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

/**
 * Bandingkan hasil scanner dengan universe aplikasi. Kode universe yang
 * tidak ada di scanner dikembalikan di `notCovered` (tanpa tebakan alasan
 * — scanner tidak memberi alasan). Baris scanner di luar universe
 * (ETF/dana/DIRE) tidak ikut `rows`, hanya dihitung di `outsideUniverse`.
 */
function reconcileWithUniverse(rows, universe) {
  const universeCodes = Object.keys(universe);
  const byCode = new Map(rows.map(r => [r.code, r]));
  const covered = rows.filter(r => universe[r.code]);
  const notCovered = universeCodes.filter(code => !byCode.has(code)).sort();
  return {
    rows: covered,
    coverage: {
      universeSize: universeCodes.length,
      covered: covered.length,
      notCovered,
      outsideUniverse: rows.length - covered.length
    }
  };
}

function _resetCacheForTests() {
  _cache = null;
  _inflight = null;
}

export {
  TV_COLUMNS,
  parseScanResponse,
  getMarketScan,
  reconcileWithUniverse,
  _resetCacheForTests
};
