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
 * Wrapper dibangun sekali; render berikutnya hanya mengganti isi tabel
 * supaya input filter tidak hilang saat tick refresh periodik 03-engine.js.
 */

var TVS_PAGE_SIZE = 100;
var TVS_REFRESH_AFTER_MS = 5 * 60 * 1000;

var TVS_STATE = {
  loading: false,
  error: null,
  data: null,
  fetchedAtMs: 0,
  visible: TVS_PAGE_SIZE,
  showNotCovered: false,
  sort: { key: 'marketCap', dir: 'desc' },
  filters: {
    search: '', sector: 'ALL',
    minRsi: '', maxRsi: '', maxPe: '', maxPb: '', minRoe: '', maxDer: '',
    minYield: '', minMarketCapT: '', minRating: '', aboveSma200: false
  }
};

// [key, label, numeric?, formatter-key]
var TVS_COLS = [
  { key: 'sector', label: 'Sektor', num: false },
  { key: 'price', label: 'Harga', num: true, fmt: 'int' },
  { key: 'perf1M', label: '1B %', num: true, fmt: 'pct', signed: true },
  { key: 'perfYtd', label: 'YTD %', num: true, fmt: 'pct', signed: true },
  { key: 'marketCap', label: 'Mkt Cap (T)', num: true, fmt: 'trillion' },
  { key: 'pe', label: 'P/E', num: true, fmt: 'dec' },
  { key: 'pb', label: 'P/B', num: true, fmt: 'dec' },
  { key: 'roe', label: 'ROE %', num: true, fmt: 'pct' },
  { key: 'debtToEquity', label: 'DER', num: true, fmt: 'dec' },
  { key: 'dividendYield', label: 'Yield %', num: true, fmt: 'pct' },
  { key: 'rsi', label: 'RSI', num: true, fmt: 'dec1' },
  { key: 'distSma200', label: 'vs SMA200 %', num: true, fmt: 'pct', signed: true },
  { key: 'ratingAll1D', label: 'Rating 1D', num: true, fmt: 'rating', signed: true },
  { key: 'ratingAll1W', label: 'Rating 1W', num: true, fmt: 'rating', signed: true }
];

var TVS_INFO_TITLE = 'Screener seluruh emiten BEI dari TradingView Scanner dalam satu panggilan: teknikal, fundamental, performa, dan rating. Data tertunda ±10 menit dan berasal dari endpoint tidak resmi. Tanda "–" berarti sumber tidak mengirim nilainya; tidak diisi tebakan. Sektor mengikuti klasifikasi TradingView (bahasa Inggris), bukan IDX-IC.';
var TVS_INFO_FILTER = 'Filter dijalankan di browser pada data yang sudah dimuat. Filter numerik yang aktif mengecualikan emiten yang nilainya kosong, karena nilai yang tidak diketahui tidak bisa dinyatakan lolos. Tab ini tidak menerapkan Regulatory Health Gate (notasi khusus BEI) seperti tab Screener — emiten bernotasi khusus tetap tampil.';
var TVS_INFO_RATING = 'Rating gabungan TradingView dari indikator moving average dan osilator, skala -1 (condong jual) sampai +1 (condong beli). Angka mentah dari sumber, bukan rekomendasi MoneyWatch.';

function tvsInfo(text) {
  return typeof uiInfoIcon === 'function' ? uiInfoIcon(text) : '';
}

function tvsEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

// ── Formatting ───────────────────────────────────────────────────────────
function tvsIsNum(v) { return typeof v === 'number' && isFinite(v); }

function tvsFormat(v, fmt) {
  if (!tvsIsNum(v)) return null;
  switch (fmt) {
    case 'int': return Math.round(v).toLocaleString('id-ID');
    case 'dec': return v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'dec1': return v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case 'pct': return v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'trillion': return (v / 1e12).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'rating': return v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    default: return String(v);
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
function tvsDerive(row) {
  var dist = (tvsIsNum(row.price) && tvsIsNum(row.sma200) && row.sma200 > 0)
    ? (row.price / row.sma200 - 1) * 100
    : null;
  return Object.assign({}, row, { distSma200: dist });
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

function tvsFilteredRows() {
  var rows = (TVS_STATE.data && TVS_STATE.data.rows) || [];
  var f = TVS_STATE.filters;
  var q = f.search.trim().toLowerCase();
  var num = function (s) { return s === '' ? null : Number(s); };
  var minRsi = num(f.minRsi), maxRsi = num(f.maxRsi), maxPe = num(f.maxPe), maxPb = num(f.maxPb);
  var minRoe = num(f.minRoe), maxDer = num(f.maxDer), minYield = num(f.minYield);
  var minCapT = num(f.minMarketCapT), minRating = num(f.minRating);

  // Filter aktif + nilai kosong => baris dikecualikan (lihat TVS_INFO_FILTER).
  var atLeast = function (v, min) { return min == null || (tvsIsNum(v) && v >= min); };
  var atMost = function (v, max) { return max == null || (tvsIsNum(v) && v <= max); };

  var out = rows.filter(function (r) {
    if (q && r.code.toLowerCase().indexOf(q) === -1 && String(r.name || '').toLowerCase().indexOf(q) === -1) return false;
    if (f.sector !== 'ALL' && r.sector !== f.sector) return false;
    if (f.aboveSma200 && !(tvsIsNum(r.distSma200) && r.distSma200 > 0)) return false;
    return atLeast(r.rsi, minRsi) && atMost(r.rsi, maxRsi) && atMost(r.pe, maxPe) && atMost(r.pb, maxPb)
      && atLeast(r.roe, minRoe) && atMost(r.debtToEquity, maxDer) && atLeast(r.dividendYield, minYield)
      && atLeast(r.marketCap, minCapT == null ? null : minCapT * 1e12) && atLeast(r.ratingAll1D, minRating);
  });

  var key = TVS_STATE.sort.key;
  var sign = TVS_STATE.sort.dir === 'asc' ? 1 : -1;
  return out.slice().sort(function (a, b) {
    var av = a[key], bv = b[key];
    var an = av == null || av === '', bn = bv == null || bv === '';
    if (an && bn) return a.code < b.code ? -1 : 1;
    if (an) return 1;   // nilai kosong selalu di bawah, apa pun arah urut
    if (bn) return -1;
    if (typeof av === 'string') return sign * av.localeCompare(bv);
    return sign * (av - bv);
  });
}

// ── Actions (dipanggil dari atribut onclick/oninput) ─────────────────────
function tvsSetFilter(name, value) {
  var next = {};
  next[name] = value;
  TVS_STATE.filters = Object.assign({}, TVS_STATE.filters, next);
  TVS_STATE.visible = TVS_PAGE_SIZE;
  tvsRenderBody();
}

function tvsResetFilters() {
  TVS_STATE.filters = Object.assign({}, TVS_STATE.filters, {
    search: '', sector: 'ALL', minRsi: '', maxRsi: '', maxPe: '', maxPb: '', minRoe: '', maxDer: '',
    minYield: '', minMarketCapT: '', minRating: '', aboveSma200: false
  });
  var root = document.getElementById('tvs-root');
  if (root) {
    root.querySelectorAll('[data-tvs-filter]').forEach(function (inp) {
      if (inp.type === 'checkbox') inp.checked = false;
      else inp.value = inp.tagName === 'SELECT' ? 'ALL' : '';
    });
  }
  TVS_STATE.visible = TVS_PAGE_SIZE;
  tvsRenderBody();
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
function tvsFilterInput(name, label, placeholder, width) {
  var v = TVS_STATE.filters[name];
  return '<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;white-space:nowrap">' + label + '</label>'
    + '<input class="finput" type="number" data-tvs-filter="' + name + '" placeholder="' + placeholder + '" value="' + tvsEsc(v) + '"'
    + ' oninput="tvsSetFilter(\'' + name + '\', this.value)" style="width:' + width + 'px;min-width:' + width + 'px;padding:5px 9px;font-size:11.5px;border-radius:6px"></div>';
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
    + '<div style="display:flex;align-items:center;margin-bottom:8px;font-size:11px;color:var(--text3)">Filter' + tvsInfo(TVS_INFO_FILTER) + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">'
      + '<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px">Cari</label>'
        + '<input class="finput" type="text" data-tvs-filter="search" placeholder="Ticker/nama" value="' + tvsEsc(f.search) + '" oninput="tvsSetFilter(\'search\', this.value)" style="width:120px;' + fis + '"></div>'
      + '<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px">Sektor</label>'
        + '<select class="finput fsel" id="tvs-sector" data-tvs-filter="sector" onchange="tvsSetFilter(\'sector\', this.value)" style="' + fis + '">'
        + sectorOpts.map(function (s) { return '<option value="' + tvsEsc(s) + '"' + (f.sector === s ? ' selected' : '') + '>' + (s === 'ALL' ? 'Semua' : tvsEsc(s)) + '</option>'; }).join('')
        + '</select></div>'
      + tvsFilterInput('minRsi', 'RSI min', '0-100', 76)
      + tvsFilterInput('maxRsi', 'RSI maks', '0-100', 76)
      + tvsFilterInput('maxPe', 'P/E maks', 'mis. 15', 82)
      + tvsFilterInput('maxPb', 'P/B maks', 'mis. 1,5', 82)
      + tvsFilterInput('minRoe', 'ROE min %', 'mis. 10', 82)
      + tvsFilterInput('maxDer', 'DER maks', 'mis. 1', 82)
      + tvsFilterInput('minYield', 'Yield min %', 'mis. 4', 88)
      + tvsFilterInput('minMarketCapT', 'Mkt Cap min (T)', 'mis. 10', 100)
      + tvsFilterInput('minRating', 'Rating 1D min' + tvsInfo(TVS_INFO_RATING), '-1 s/d 1', 96)
      + '<div style="display:flex;align-items:center;gap:6px;padding-bottom:5px"><input id="tvs-above200" type="checkbox" data-tvs-filter="aboveSma200"' + (f.aboveSma200 ? ' checked' : '') + ' onchange="tvsSetFilter(\'aboveSma200\', this.checked)"> <label for="tvs-above200" style="font-size:11.5px">Harga di atas SMA200</label></div>'
      + '<button class="btn btn-ghost btn-sm" onclick="tvsResetFilters()">Reset</button>'
    + '</div>'
    + '<div style="height:1px;background:var(--border-subtle);margin:12px 0"></div>'
    + '<div id="tvs-table"></div>'
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
  return '<div style="font-size:11px;color:var(--text3);margin-bottom:8px"><span class="mono">' + rows.length + '</span> emiten sesuai filter</div>'
    + '<div class="tbl-wrap" style="max-height:70vh;overflow:auto"><table class="tbl tbl-freeze-col"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + more;
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
  tvsRenderBody();
  tvsLoad(false).then(function () {
    // Sektor baru diketahui setelah data pertama masuk: bangun ulang hanya dropdown-nya.
    var sel = document.getElementById('tvs-sector');
    if (sel && sel.options.length <= 1 && TVS_STATE.data) {
      var host2 = document.getElementById(containerId);
      if (host2) host2.innerHTML = tvsShellHtml();
      tvsRenderBody();
    }
  });
}
