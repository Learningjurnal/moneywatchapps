/**
 * 52-tv-scanner.js — Tab "TradingView" di halaman Screener (Unified Screener)
 *
 * Screener teknikal + fundamental seluruh emiten BEI dari
 * GET /api/idx/tv-scan (lib/providers/tradingview-scanner-client.js):
 * 1 panggilan, ~840 emiten, difilter & diurutkan di sisi klien.
 *
 * Kejujuran data (CLAUDE.md #1/#3):
 * - Sumber tidak resmi + tertunda ±10 menit → selalu ditampilkan di strip
 *   amber (pola disclosure DESIGN.md), bukan disembunyikan.
 * - Nilai yang tidak dikirim sumber tampil "–", tidak pernah diisi tebakan.
 *   Filter numerik yang aktif mengecualikan baris bernilai kosong (nilai
 *   yang tidak diketahui tidak bisa dinyatakan lolos filter).
 * - Emiten universe aplikasi yang tidak tercakup scanner dilaporkan apa
 *   adanya (coverage.notCovered), bukan dianggap "tidak ada".
 * - Rating = angka mentah -1..+1 dari sumber, tanpa label Buy/Sell buatan.
 * - Tab ini TIDAK menerapkan Regulatory Health Gate (notasi khusus BEI);
 *   hal itu dinyatakan di ikon info.
 *
 * Strategi preset (TVS_PRESETS): kumpulan filter siap pakai yang mengisi
 * kolom filter otomatis. Ambang batasnya heuristik umum yang dikalibrasi
 * terhadap sebaran data nyata (2026-10-03: tiap preset menghasilkan 15–103
 * emiten dari 335 emiten likuid), BUKAN hasil backtest — panel strategi
 * selalu menyatakan itu. Kriteria yang tampil di UI dibangkitkan dari
 * state filter aktual sehingga tidak bisa berbeda dari yang dijalankan.
 *
 * Wrapper dibangun sekali; render berikutnya hanya mengganti isi tabel
 * supaya input filter tidak hilang saat tick refresh periodik 03-engine.js.
 */

var TVS_PAGE_SIZE = 100;
var TVS_REFRESH_AFTER_MS = 5 * 60 * 1000;
var TVS_DEFAULT_PRESET = 'quality';

function tvsIsNum(v) { return typeof v === 'number' && isFinite(v); }
function tvsAtLeast(v, min) { return min == null || (tvsIsNum(v) && v >= min); }
function tvsAtMost(v, max) { return max == null || (tvsIsNum(v) && v <= max); }

// Satu spesifikasi per filter numerik: nama state, label, placeholder, lebar
// input, fungsi uji (r = baris, v = angka), dan teks ringkasan kriteria.
var TVS_FILTER_SPECS = [
  { name: 'minValueTradedB', label: 'Nilai trx min (M/hari)', ph: 'mis. 1', w: 112, test: function (r, v) { return tvsAtLeast(r.valueTraded, v * 1e9); }, text: function (v) { return 'Nilai transaksi ≥ Rp ' + v + ' M/hari'; } },
  { name: 'minMarketCapT', label: 'Mkt Cap min (T)', ph: 'mis. 2', w: 100, test: function (r, v) { return tvsAtLeast(r.marketCap, v * 1e12); }, text: function (v) { return 'Mkt Cap ≥ ' + v + ' T'; } },
  { name: 'minPe', label: 'P/E min', ph: '0', w: 70, test: function (r, v) { return tvsAtLeast(r.pe, v); }, text: function (v) { return 'P/E ≥ ' + v; } },
  { name: 'maxPe', label: 'P/E maks', ph: 'mis. 15', w: 82, test: function (r, v) { return tvsAtMost(r.pe, v); }, text: function (v) { return 'P/E ≤ ' + v; } },
  { name: 'maxPb', label: 'P/B maks', ph: 'mis. 1,5', w: 82, test: function (r, v) { return tvsAtMost(r.pb, v); }, text: function (v) { return 'P/B ≤ ' + v; } },
  { name: 'minRoe', label: 'ROE min %', ph: 'mis. 10', w: 82, test: function (r, v) { return tvsAtLeast(r.roe, v); }, text: function (v) { return 'ROE ≥ ' + v + '%'; } },
  { name: 'maxDer', label: 'DER maks', ph: 'mis. 1', w: 82, test: function (r, v) { return tvsAtMost(r.debtToEquity, v); }, text: function (v) { return 'DER ≤ ' + v; } },
  { name: 'minYield', label: 'Yield min %', ph: 'mis. 4', w: 88, test: function (r, v) { return tvsAtLeast(r.dividendYield, v); }, text: function (v) { return 'Yield ≥ ' + v + '%'; } },
  { name: 'minRsi', label: 'RSI min', ph: '0-100', w: 76, test: function (r, v) { return tvsAtLeast(r.rsi, v); }, text: function (v) { return 'RSI ≥ ' + v; } },
  { name: 'maxRsi', label: 'RSI maks', ph: '0-100', w: 76, test: function (r, v) { return tvsAtMost(r.rsi, v); }, text: function (v) { return 'RSI ≤ ' + v; } },
  { name: 'minAdx', label: 'ADX min', ph: 'mis. 25', w: 80, test: function (r, v) { return tvsAtLeast(r.adx, v); }, text: function (v) { return 'ADX ≥ ' + v; } },
  { name: 'minPerf1M', label: 'Perf 1B min %', ph: 'mis. 0', w: 92, test: function (r, v) { return tvsAtLeast(r.perf1M, v); }, text: function (v) { return 'Perf 1B ≥ ' + v + '%'; } },
  { name: 'maxFromHigh52w', label: 'Jarak High 52M maks %', ph: 'mis. 5', w: 128, test: function (r, v) { return tvsAtLeast(r.distHigh52w, -v); }, text: function (v) { return 'Maks ' + v + '% di bawah High 52M'; } },
  { name: 'minRating1D', label: 'Rating 1D min', ph: '-1 s/d 1', w: 92, test: function (r, v) { return tvsAtLeast(r.ratingAll1D, v); }, text: function (v) { return 'Rating 1D ≥ ' + v; }, info: 'rating' },
  { name: 'minRating1W', label: 'Rating 1W min', ph: '-1 s/d 1', w: 92, test: function (r, v) { return tvsAtLeast(r.ratingAll1W, v); }, text: function (v) { return 'Rating 1W ≥ ' + v; }, info: 'rating' }
];

var TVS_CHECK_SPECS = [
  { name: 'aboveSma50', label: 'Harga di atas SMA50', test: function (r) { return tvsIsNum(r.distSma50) && r.distSma50 > 0; }, text: 'Harga > SMA50' },
  { name: 'aboveSma200', label: 'Harga di atas SMA200', test: function (r) { return tvsIsNum(r.distSma200) && r.distSma200 > 0; }, text: 'Harga > SMA200' }
];

function tvsEmptyFilters() {
  var f = { search: '', sector: 'ALL' };
  TVS_FILTER_SPECS.forEach(function (s) { f[s.name] = ''; });
  TVS_CHECK_SPECS.forEach(function (s) { f[s.name] = false; });
  return f;
}

var TVS_LIQ = 1; // nilai transaksi min (miliar Rp/hari): buang emiten yang nyaris tak diperdagangkan

// criteria memakai nama filter di TVS_FILTER_SPECS / TVS_CHECK_SPECS.
var TVS_PRESETS = [
  { id: 'all', label: 'Semua', criteria: {}, sort: { key: 'marketCap', dir: 'desc' },
    desc: 'Seluruh emiten yang tercakup scanner, tanpa filter. Urut Market Cap terbesar.' },
  { id: 'quality', label: 'Kualitas Likuid',
    criteria: { minValueTradedB: TVS_LIQ, minRoe: 10, minPe: 0, maxPe: 25 }, sort: { key: 'marketCap', dir: 'desc' },
    desc: 'Perusahaan yang laba atas ekuitasnya baik, P/E positif dan tidak terlalu mahal, serta cukup likuid. Titik awal umum sebelum dipersempit. P/E positif berarti emiten merugi tidak ikut. Diurut Market Cap terbesar, bukan ROE: ROE sangat tinggi sering dipicu ekuitas yang kecil, bukan kualitas.' },
  { id: 'value', label: 'Value Sehat',
    criteria: { minValueTradedB: TVS_LIQ, minPe: 0, maxPe: 15, maxPb: 1.5, minRoe: 10, maxDer: 1 }, sort: { key: 'pe', dir: 'asc' },
    desc: 'Valuasi relatif murah (P/E dan P/B rendah) tetapi masih menghasilkan laba (ROE) dan utangnya terkendali. Murah bisa berarti prospek memburuk (value trap) — cek tren laba di halaman detail. DER kurang bermakna untuk bank dan sektor Finance.' },
  { id: 'dividend', label: 'Dividen Tinggi',
    criteria: { minValueTradedB: TVS_LIQ, minYield: 5, minPe: 0, maxPe: 20, minRoe: 8, minMarketCapT: 2 }, sort: { key: 'dividendYield', dir: 'desc' },
    desc: 'Yield dividen menurut TradingView tinggi, tetapi emitennya masih untung, tidak terlalu mahal, dan berukuran menengah ke atas. Yield tinggi bisa muncul karena harga jatuh, dan data ini tidak menunjukkan rasio payout maupun kepastian dividen berikutnya.' },
  { id: 'oversold', label: 'Oversold Berkualitas',
    criteria: { minValueTradedB: TVS_LIQ, maxRsi: 35, minRoe: 10, minPe: 0, maxPe: 20, maxDer: 1.5 }, sort: { key: 'rsi', dir: 'asc' },
    desc: 'Saham yang secara teknikal jenuh jual (RSI rendah) tetapi fundamentalnya masih sehat. RSI rendah bisa terus turun — gunakan sebagai daftar pantauan, lalu cari konfirmasi tren/volume. DER kurang bermakna untuk sektor Finance.' },
  { id: 'momentum', label: 'Momentum Tren Naik',
    criteria: { minValueTradedB: TVS_LIQ, aboveSma50: true, aboveSma200: true, minRsi: 50, maxRsi: 70, minAdx: 25, minPerf1M: 0, minRating1D: 0.3 }, sort: { key: 'ratingAll1D', dir: 'desc' },
    desc: 'Tren naik yang sudah terbentuk: harga di atas SMA50 dan SMA200, RSI di zona kuat tetapi belum ekstrem, ADX menunjukkan tren berarah, dan performa 1 bulan tidak negatif. Saat pasar lemah hasilnya wajar sedikit.' },
  { id: 'nearhigh', label: 'Dekat High 52 Minggu',
    criteria: { minValueTradedB: TVS_LIQ, maxFromHigh52w: 5, aboveSma200: true }, sort: { key: 'distHigh52w', dir: 'desc' },
    desc: 'Harga berada maksimal 5% di bawah titik tertinggi 52 minggu dan di atas SMA200: kandidat yang sedang menguji atau menembus puncak lama. Penembusan bisa gagal (false breakout).' },
  { id: 'consensus', label: 'Konsensus Teknikal',
    criteria: { minValueTradedB: TVS_LIQ, minRating1D: 0.5, minRating1W: 0.3 }, sort: { key: 'ratingAll1D', dir: 'desc' },
    desc: 'Rating gabungan TradingView positif di dua horizon sekaligus (harian dan mingguan). Angka mentah dari sumber, bukan rekomendasi MoneyWatch.' }
];

var TVS_STATE = {
  loading: false,
  error: null,
  data: null,
  fetchedAtMs: 0,
  visible: TVS_PAGE_SIZE,
  showNotCovered: false,
  presetId: TVS_DEFAULT_PRESET,
  sort: { key: 'marketCap', dir: 'desc' },
  filters: tvsEmptyFilters()
};

// Kolom tabel. key harus nama field baris (termasuk field turunan di tvsDerive).
var TVS_COLS = [
  { key: 'sector', label: 'Sektor', num: false },
  { key: 'price', label: 'Harga', num: true, fmt: 'int' },
  { key: 'perf1M', label: '1B %', num: true, fmt: 'pct', signed: true },
  { key: 'perfYtd', label: 'YTD %', num: true, fmt: 'pct', signed: true },
  { key: 'distHigh52w', label: 'vs High 52M %', num: true, fmt: 'pct', signed: true },
  { key: 'valueTraded', label: 'Nilai Trx (M)', num: true, fmt: 'billion' },
  { key: 'marketCap', label: 'Mkt Cap (T)', num: true, fmt: 'trillion' },
  { key: 'pe', label: 'P/E', num: true, fmt: 'dec' },
  { key: 'pb', label: 'P/B', num: true, fmt: 'dec' },
  { key: 'roe', label: 'ROE %', num: true, fmt: 'pct' },
  { key: 'debtToEquity', label: 'DER', num: true, fmt: 'dec' },
  { key: 'dividendYield', label: 'Yield %', num: true, fmt: 'pct' },
  { key: 'rsi', label: 'RSI', num: true, fmt: 'dec1' },
  { key: 'adx', label: 'ADX', num: true, fmt: 'dec1' },
  { key: 'distSma200', label: 'vs SMA200 %', num: true, fmt: 'pct', signed: true },
  { key: 'ratingAll1D', label: 'Rating 1D', num: true, fmt: 'rating', signed: true },
  { key: 'ratingAll1W', label: 'Rating 1W', num: true, fmt: 'rating', signed: true }
];

var TVS_INFO_TITLE = 'Screener seluruh emiten BEI dari TradingView Scanner dalam satu panggilan: teknikal, fundamental, performa, dan rating. Data tertunda ±10 menit dan berasal dari endpoint tidak resmi. Tanda "–" berarti sumber tidak mengirim nilainya; tidak diisi tebakan. Sektor mengikuti klasifikasi TradingView (bahasa Inggris), bukan IDX-IC.';
var TVS_INFO_FILTER = 'Filter dijalankan di browser pada data yang sudah dimuat. Filter numerik yang aktif mengecualikan emiten yang nilainya kosong, karena nilai yang tidak diketahui tidak bisa dinyatakan lolos. Tab ini tidak menerapkan Regulatory Health Gate (notasi khusus BEI) seperti tab Screener — emiten bernotasi khusus tetap tampil.';
var TVS_INFO_RATING = 'Rating gabungan TradingView dari indikator moving average dan osilator, skala -1 (condong jual) sampai +1 (condong beli). Angka mentah dari sumber, bukan rekomendasi MoneyWatch.';
var TVS_INFO_PRESET = 'Strategi siap pakai: memilih satu akan mengisi kolom filter dan urutan otomatis, dan semuanya bisa Anda ubah. Ambang batas adalah heuristik umum yang dikalibrasi terhadap sebaran data saat ini, bukan hasil backtest.';
var TVS_NOT_VALIDATED = 'Kriteria heuristik umum — belum divalidasi backtest di data BEI aplikasi ini, bukan rekomendasi. Jumlah hasil berubah mengikuti kondisi pasar.';

function tvsInfo(text) {
  return typeof uiInfoIcon === 'function' ? uiInfoIcon(text) : '';
}

function tvsEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

// ── Formatting ───────────────────────────────────────────────────────────
function tvsFormat(v, fmt) {
  if (!tvsIsNum(v)) return null;
  var two = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  switch (fmt) {
    case 'int': return Math.round(v).toLocaleString('id-ID');
    case 'dec1': return v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case 'trillion': return (v / 1e12).toLocaleString('id-ID', two);
    case 'billion': return (v / 1e9).toLocaleString('id-ID', two);
    default: return v.toLocaleString('id-ID', two); // dec, pct, rating
  }
}

function tvsCellHtml(row, col) {
  var raw = row[col.key];
  if (!col.num) {
    return '<td style="font-size:11px;color:var(--text2)">' + (raw ? tvsEsc(raw) : '<span style="color:var(--text3)">–</span>') + '</td>';
  }
  var text = tvsFormat(raw, col.fmt);
  if (text == null) {
    return '<td class="mono num" style="color:var(--text3)" title="Tidak tersedia dari sumber">–</td>';
  }
  var color = '';
  if (col.signed) color = raw > 0 ? 'color:var(--green)' : (raw < 0 ? 'color:var(--red)' : '');
  var prefix = col.signed && raw > 0 ? '+' : '';
  return '<td class="mono num" style="' + color + '">' + prefix + text + '</td>';
}

// ── Data ─────────────────────────────────────────────────────────────────
// Field turunan hanya dihitung bila kedua operandnya nilai nyata dari sumber.
function tvsRelativeTo(price, ref) {
  return (tvsIsNum(price) && tvsIsNum(ref) && ref > 0) ? (price / ref - 1) * 100 : null;
}

function tvsDerive(row) {
  return Object.assign({}, row, {
    distSma50: tvsRelativeTo(row.price, row.sma50),
    distSma200: tvsRelativeTo(row.price, row.sma200),
    distHigh52w: tvsRelativeTo(row.price, row.high52w)
  });
}

async function tvsLoad(force) {
  if (TVS_STATE.loading) return;
  var fresh = TVS_STATE.data && (Date.now() - TVS_STATE.fetchedAtMs) < TVS_REFRESH_AFTER_MS;
  if (fresh && !force) return;
  TVS_STATE.loading = true;
  TVS_STATE.error = null;
  tvsRenderBody();
  try {
    var res = await fetch('/api/idx/tv-scan', { signal: AbortSignal.timeout(30000) });
    var json = await res.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat data TradingView');
    TVS_STATE.data = Object.assign({}, json, { rows: json.rows.map(tvsDerive) });
    TVS_STATE.fetchedAtMs = Date.now();
    TVS_STATE.visible = TVS_PAGE_SIZE;
  } catch (e) {
    TVS_STATE.error = e.message;
  } finally {
    TVS_STATE.loading = false;
    tvsRenderBody();
  }
}

function tvsToNumber(s) {
  if (s === '' || s == null) return null;
  var n = Number(String(s).replace(',', '.'));
  return isFinite(n) ? n : null;
}

// Filter aktif + nilai kosong => baris dikecualikan (lihat TVS_INFO_FILTER).
function tvsRowPasses(r, f, q) {
  if (q && r.code.toLowerCase().indexOf(q) === -1 && String(r.name || '').toLowerCase().indexOf(q) === -1) return false;
  if (f.sector !== 'ALL' && r.sector !== f.sector) return false;
  for (var i = 0; i < TVS_CHECK_SPECS.length; i++) {
    if (f[TVS_CHECK_SPECS[i].name] && !TVS_CHECK_SPECS[i].test(r)) return false;
  }
  for (var j = 0; j < TVS_FILTER_SPECS.length; j++) {
    var v = tvsToNumber(f[TVS_FILTER_SPECS[j].name]);
    if (v != null && !TVS_FILTER_SPECS[j].test(r, v)) return false;
  }
  return true;
}

function tvsCompare(a, b, key, sign) {
  var av = a[key], bv = b[key];
  var an = av == null || av === '', bn = bv == null || bv === '';
  if (an && bn) return a.code < b.code ? -1 : 1;
  if (an) return 1;   // nilai kosong selalu di bawah, apa pun arah urut
  if (bn) return -1;
  if (typeof av === 'string') return sign * av.localeCompare(bv);
  return sign * (av - bv);
}

function tvsFilteredRows() {
  var rows = (TVS_STATE.data && TVS_STATE.data.rows) || [];
  var f = TVS_STATE.filters;
  var q = f.search.trim().toLowerCase();
  var sign = TVS_STATE.sort.dir === 'asc' ? 1 : -1;
  var key = TVS_STATE.sort.key;
  return rows.filter(function (r) { return tvsRowPasses(r, f, q); })
    .sort(function (a, b) { return tvsCompare(a, b, key, sign); });
}

// Ringkasan kriteria dibangkitkan dari state filter nyata.
function tvsCriteriaSummary() {
  var f = TVS_STATE.filters;
  var parts = [];
  TVS_FILTER_SPECS.forEach(function (s) {
    var v = tvsToNumber(f[s.name]);
    if (v != null) parts.push(s.text(v));
  });
  TVS_CHECK_SPECS.forEach(function (s) { if (f[s.name]) parts.push(s.text); });
  if (f.sector !== 'ALL') parts.push('Sektor ' + f.sector);
  if (f.search.trim()) parts.push('Cari "' + f.search.trim() + '"');
  return parts;
}

// ── Actions (dipanggil dari atribut onclick/oninput) ─────────────────────
function tvsApplyPreset(id) {
  var preset = TVS_PRESETS.find(function (p) { return p.id === id; });
  if (!preset) return;
  var filters = tvsEmptyFilters();
  Object.keys(preset.criteria).forEach(function (name) {
    var v = preset.criteria[name];
    filters[name] = typeof v === 'boolean' ? v : String(v);
  });
  TVS_STATE.filters = filters;
  TVS_STATE.presetId = id;
  TVS_STATE.sort = Object.assign({}, preset.sort);
  TVS_STATE.visible = TVS_PAGE_SIZE;
  tvsSyncControls();
  tvsRenderBody();
}

function tvsSetFilter(name, value) {
  var next = {};
  next[name] = value;
  TVS_STATE.filters = Object.assign({}, TVS_STATE.filters, next);
  TVS_STATE.presetId = 'custom';
  TVS_STATE.visible = TVS_PAGE_SIZE;
  tvsRenderPresets();
  tvsRenderBody();
}

// Selaraskan elemen input dengan TVS_STATE.filters (setelah preset diterapkan).
function tvsSyncControls() {
  var root = document.getElementById('tvs-root');
  if (root) {
    root.querySelectorAll('[data-tvs-filter]').forEach(function (inp) {
      var v = TVS_STATE.filters[inp.getAttribute('data-tvs-filter')];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else inp.value = v == null ? '' : v;
    });
  }
  tvsRenderPresets();
}

function tvsSortBy(key) {
  var cur = TVS_STATE.sort;
  var dir = cur.key === key ? (cur.dir === 'desc' ? 'asc' : 'desc') : (key === 'sector' || key === 'code' ? 'asc' : 'desc');
  TVS_STATE.sort = { key: key, dir: dir };
  tvsRenderBody();
}

function tvsShowMore() {
  TVS_STATE.visible += TVS_PAGE_SIZE;
  tvsRenderBody();
}

function tvsToggleNotCovered() {
  TVS_STATE.showNotCovered = !TVS_STATE.showNotCovered;
  tvsRenderBody();
}

function tvsOpenTicker(code) {
  if (typeof window.goStockIntelCockpit === 'function') window.goStockIntelCockpit(code);
  else if (typeof goPage === 'function') goPage('stock-intel');
}

// ── Render ───────────────────────────────────────────────────────────────
function tvsFilterInput(spec) {
  var v = TVS_STATE.filters[spec.name];
  return '<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;white-space:nowrap">' + spec.label + (spec.info === 'rating' ? tvsInfo(TVS_INFO_RATING) : '') + '</label>'
    + '<input class="finput" type="number" step="any" data-tvs-filter="' + spec.name + '" placeholder="' + spec.ph + '" value="' + tvsEsc(v) + '"'
    + ' oninput="tvsSetFilter(\'' + spec.name + '\', this.value)" style="width:' + spec.w + 'px;min-width:' + spec.w + 'px;padding:5px 9px;font-size:11.5px;border-radius:6px"></div>';
}

function tvsCheckInput(spec) {
  return '<div style="display:flex;align-items:center;gap:6px;padding-bottom:5px"><input id="tvs-' + spec.name + '" type="checkbox" data-tvs-filter="' + spec.name + '"'
    + (TVS_STATE.filters[spec.name] ? ' checked' : '') + ' onchange="tvsSetFilter(\'' + spec.name + '\', this.checked)"> <label for="tvs-' + spec.name + '" style="font-size:11.5px">' + spec.label + '</label></div>';
}

function tvsShellHtml() {
  var sectors = {};
  ((TVS_STATE.data && TVS_STATE.data.rows) || []).forEach(function (r) { if (r.sector) sectors[r.sector] = true; });
  var sectorOpts = ['ALL'].concat(Object.keys(sectors).sort());
  var f = TVS_STATE.filters;
  var fis = 'padding:5px 9px;font-size:11.5px;border-radius:6px';

  return '<div id="tvs-root" class="card" style="padding:14px 16px;margin-bottom:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px 12px;min-width:0;margin-bottom:10px">'
      + '<div style="display:flex;align-items:center;min-width:0;font-weight:700;font-size:13px;word-break:break-word">Screener TradingView' + tvsInfo(TVS_INFO_TITLE) + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span id="tvs-updated" class="mono" style="font-size:10.5px;color:var(--text3)"></span>'
      + '<button class="sm-btn" onclick="tvsLoad(true)"><i class="ti ti-refresh"></i> Muat Ulang</button></div>'
    + '</div>'
    + '<div id="tvs-disclosure"></div>'
    + '<div style="height:1px;background:var(--border-subtle);margin:12px 0"></div>'
    + '<div style="display:flex;align-items:center;margin-bottom:8px;font-size:11px;color:var(--text3)">Strategi' + tvsInfo(TVS_INFO_PRESET) + '</div>'
    + '<div id="tvs-presets" style="display:flex;gap:6px;flex-wrap:wrap"></div>'
    + '<div id="tvs-strategy" style="margin-top:10px"></div>'
    + '<div style="height:1px;background:var(--border-subtle);margin:12px 0"></div>'
    + '<div style="display:flex;align-items:center;margin-bottom:8px;font-size:11px;color:var(--text3)">Filter' + tvsInfo(TVS_INFO_FILTER) + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">'
      + '<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px">Cari</label>'
        + '<input class="finput" type="text" data-tvs-filter="search" placeholder="Ticker/nama" value="' + tvsEsc(f.search) + '" oninput="tvsSetFilter(\'search\', this.value)" style="width:120px;' + fis + '"></div>'
      + '<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px">Sektor</label>'
        + '<select class="finput fsel" id="tvs-sector" data-tvs-filter="sector" onchange="tvsSetFilter(\'sector\', this.value)" style="' + fis + '">'
        + sectorOpts.map(function (s) { return '<option value="' + tvsEsc(s) + '"' + (f.sector === s ? ' selected' : '') + '>' + (s === 'ALL' ? 'Semua' : tvsEsc(s)) + '</option>'; }).join('')
        + '</select></div>'
      + TVS_FILTER_SPECS.map(tvsFilterInput).join('')
      + TVS_CHECK_SPECS.map(tvsCheckInput).join('')
      + '<button class="btn btn-ghost btn-sm" onclick="tvsApplyPreset(\'all\')">Reset</button>'
    + '</div>'
    + '<div style="height:1px;background:var(--border-subtle);margin:12px 0"></div>'
    + '<div id="tvs-table"></div>'
  + '</div>';
}

function tvsRenderPresets() {
  var box = document.getElementById('tvs-presets');
  if (box) {
    box.innerHTML = TVS_PRESETS.map(function (p) {
      return '<button class="pbtn' + (TVS_STATE.presetId === p.id ? ' on' : '') + '" onclick="tvsApplyPreset(\'' + p.id + '\')">' + tvsEsc(p.label) + '</button>';
    }).join('');
  }
  tvsRenderStrategy();
}

function tvsRenderStrategy() {
  var box = document.getElementById('tvs-strategy');
  if (!box) return;
  var preset = TVS_PRESETS.find(function (p) { return p.id === TVS_STATE.presetId; });
  var title = preset ? preset.label : 'Filter kustom';
  var info = preset ? tvsInfo(preset.desc) : '';
  var parts = tvsCriteriaSummary();
  var sortCol = TVS_COLS.find(function (c) { return c.key === TVS_STATE.sort.key; });
  var sortText = sortCol ? ('Urut: ' + sortCol.label + (TVS_STATE.sort.dir === 'asc' ? ' naik' : ' turun')) : '';
  var criteria = parts.length ? parts.map(tvsEsc).join(' · ') : 'Tanpa filter';
  var showWarn = preset ? preset.id !== 'all' : parts.length > 0;
  box.innerHTML = '<div style="background:var(--bg3);border-radius:8px;padding:10px 14px">'
    + '<div style="display:flex;align-items:center;font-weight:700;font-size:12.5px">' + tvsEsc(title) + info + '</div>'
    + '<div class="mono" style="margin-top:4px;font-size:11px;line-height:1.7;color:var(--text2);word-break:break-word">' + criteria + (sortText ? ' · <span style="color:var(--text3)">' + tvsEsc(sortText) + '</span>' : '') + '</div>'
    + (showWarn ? '<div style="margin-top:6px;display:inline-block;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;padding:3px 8px;font-size:10.5px;color:var(--text2)">' + tvsEsc(TVS_NOT_VALIDATED) + '</div>' : '')
    + '</div>';
}

function tvsDisclosureHtml() {
  var d = TVS_STATE.data;
  if (!d) return '';
  var delayRow = d.rows.find(function (r) { return tvsIsNum(r.delaySeconds); });
  var delayText = delayRow ? ('tertunda ±' + Math.round(delayRow.delaySeconds / 60) + ' menit') : 'status keterlambatan tidak diketahui';
  var cov = d.coverage || { covered: 0, universeSize: 0, notCovered: [] };
  var staleNote = d.stale ? ' · <b>cache lama</b> (pembaruan gagal: ' + tvsEsc(d.refreshError || 'tidak diketahui') + ')' : '';
  var chip = cov.notCovered.length
    ? ' · <a href="javascript:void(0)" onclick="tvsToggleNotCovered()" style="color:inherit;text-decoration:underline">' + cov.notCovered.length + ' kode tidak tercakup</a>'
      + tvsInfo('Kode di universe aplikasi yang tidak ada di scanner TradingView. Sebagian besar kemungkinan delisting atau suspensi, tetapi sebagian kecil yang masih aktif diperdagangkan juga tidak tercakup (mis. ADHI). Untuk emiten ini gunakan tab Screener lain atau halaman detail saham.')
    : '';
  var list = TVS_STATE.showNotCovered && cov.notCovered.length
    ? '<div class="mono" style="margin-top:8px;font-size:10.5px;color:var(--text2);line-height:1.7;word-break:break-word">' + cov.notCovered.map(tvsEsc).join(' · ') + '</div>'
    : '';
  return '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:8px 12px;font-size:11.5px;line-height:1.5;color:var(--text2)">'
    + 'Sumber: TradingView (tidak resmi) · ' + delayText + ' · <b>' + cov.covered + '/' + cov.universeSize + '</b> emiten universe tercakup' + chip + staleNote + list
    + '</div>';
}

function tvsTableHtml(rows) {
  var shown = rows.slice(0, TVS_STATE.visible);
  var s = TVS_STATE.sort;
  var total = TVS_STATE.data ? TVS_STATE.data.rows.length : 0;
  var arrow = function (k) { return s.key === k ? (s.dir === 'desc' ? ' ↓' : ' ↑') : ''; };
  var th = function (key, label, num) {
    return '<th class="' + (num ? 'num' : '') + '" style="cursor:pointer;white-space:nowrap" onclick="tvsSortBy(\'' + key + '\')">' + label + arrow(key) + '</th>';
  };
  var head = '<tr>' + th('code', 'Emiten', false) + TVS_COLS.map(function (c) { return th(c.key, c.label, c.num); }).join('') + '</tr>';
  var body = shown.map(function (r) {
    return '<tr><td><a href="javascript:void(0)" role="button" data-code="' + tvsEsc(r.code) + '" onclick="tvsOpenTicker(this.dataset.code)" style="display:block;text-decoration:none;color:inherit">'
      + '<span class="mono" style="font-weight:800;color:var(--text)">' + tvsEsc(r.code) + '</span>'
      + '<div style="font-size:10px;color:var(--text3);font-weight:400;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + tvsEsc(r.name) + '</div></a></td>'
      + TVS_COLS.map(function (c) { return tvsCellHtml(r, c); }).join('') + '</tr>';
  }).join('');
  var more = rows.length > shown.length
    ? '<div style="text-align:center;margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="tvsShowMore()">Tampilkan ' + Math.min(TVS_PAGE_SIZE, rows.length - shown.length) + ' lagi (' + shown.length + ' dari ' + rows.length + ')</button></div>'
    : '';
  var empty = rows.length ? '' : '<div style="padding:14px 0;font-size:12px;color:var(--text3)">Tidak ada emiten yang lolos kriteria ini saat ini. Longgarkan salah satu filter atau pilih strategi lain.</div>';
  return '<div style="font-size:11px;color:var(--text3);margin-bottom:8px"><span class="mono" style="color:var(--text);font-weight:700">' + rows.length + '</span> dari <span class="mono">' + total + '</span> emiten lolos filter</div>'
    + empty
    + (rows.length ? '<div class="tbl-wrap" style="max-height:70vh;overflow:auto"><table class="tbl tbl-freeze-col"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' : '') + more;
}

function tvsSkeletonHtml() {
  var rows = '';
  for (var i = 0; i < 8; i++) rows += '<div class="skeleton-box" style="height:30px;margin-bottom:6px"></div>';
  return rows;
}

function tvsRenderBody() {
  var table = document.getElementById('tvs-table');
  if (!table) return;
  var disc = document.getElementById('tvs-disclosure');
  var upd = document.getElementById('tvs-updated');
  tvsRenderStrategy();

  if (TVS_STATE.error && !TVS_STATE.data) {
    table.innerHTML = '<div style="padding:12px 0;color:var(--red);font-size:12.5px">Gagal memuat data: ' + tvsEsc(TVS_STATE.error)
      + ' <button class="sm-btn" onclick="tvsLoad(true)" style="margin-left:6px">Coba Lagi</button></div>';
    if (disc) disc.innerHTML = '';
    return;
  }
  if (!TVS_STATE.data) {
    table.innerHTML = tvsSkeletonHtml();
    return;
  }
  if (disc) disc.innerHTML = tvsDisclosureHtml();
  if (upd) upd.textContent = TVS_STATE.data.fetchedAt ? 'Diperbarui: ' + new Date(TVS_STATE.data.fetchedAt).toLocaleTimeString('id-ID') : '';
  table.innerHTML = (TVS_STATE.loading ? '<div class="skeleton-box" style="height:3px;margin-bottom:8px"></div>' : '') + tvsTableHtml(tvsFilteredRows());
}

function tvsRenderSubPage(containerId) {
  var host = document.getElementById(containerId);
  if (!host) return;
  if (!document.getElementById('tvs-root')) host.innerHTML = tvsShellHtml();
  tvsRenderPresets();
  tvsRenderBody();
  tvsLoad(false).then(function () {
    // Sektor baru diketahui setelah data pertama masuk: bangun ulang shell
    // (nilai filter tetap karena dirender dari TVS_STATE.filters).
    var sel = document.getElementById('tvs-sector');
    if (sel && sel.options.length <= 1 && TVS_STATE.data) {
      var host2 = document.getElementById(containerId);
      if (host2) host2.innerHTML = tvsShellHtml();
      tvsRenderPresets();
      tvsRenderBody();
    }
  });
}

// Strategi bawaan: kolom filter terisi otomatis saat tab pertama dibuka.
tvsApplyPreset(TVS_DEFAULT_PRESET);
