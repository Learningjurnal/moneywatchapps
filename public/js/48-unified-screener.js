/**
 * public/js/48-unified-screener.js
 * Unified Screener — 1 halaman filterable menggantikan Opportunity Radar,
 * Market Radar, dan Smart Money Screener (2026-09-18, user-directed:
 * "Opportunity Radar dan market radar kenapa tidak disatukan saja menjadi
 * screener yang bisa di filter... kedepan screener kedepan hanya ada 1
 * tidak banyak lagi dan terpisah pisah").
 *
 * Data & skor dari GET /api/idx/unified-screener (generateUnifiedScreener()
 * di lib/idx-data-engine.js) — lihat komentar di sana untuk formula
 * lengkap skor Whale/Akumulasi (kategorikal, -3..+4) dan Potensi Uptrend
 * (0-100). Bobot formula adalah kalibrasi AWAL yang disetujui user
 * ("saya setuju karna bisa kalibrasi ulang") — boleh disesuaikan lagi
 * nanti tanpa mengubah struktur halaman ini.
 */

var US_STATE = {
  loading: false,
  loaded: false,
  error: null,
  rows: [],
  summary: null,
  dataSources: null,
  total: 0,
  filters: {
    search: '',
    index: 'ALL',
    whale: 'ALL',
    minUptrend: '',
    maxPer: '',
    minRoe: '',
    confirmedOnly: false
  },
  sort: 'uptrendScore',
  order: 'desc'
};

function usWhaleBadgeClass(label) {
  if (label === 'Akumulasi Kuat') return 'b-up';
  if (label === 'Akumulasi Lemah') return 'b-amb';
  if (label === 'Distribusi') return 'b-dn';
  return 'b-neu';
}

function usUptrendColor(score) {
  if (score == null) return 'var(--text-mute)';
  if (score >= 70) return 'var(--up, #16a34a)';
  if (score >= 50) return 'var(--amber, #d97706)';
  return 'var(--down, #dc2626)';
}

async function usFetchAndRender() {
  US_STATE.loading = true;
  US_STATE.error = null;
  usRenderShell();

  var f = US_STATE.filters;
  var qs = new URLSearchParams();
  if (f.search) qs.set('search', f.search);
  if (f.index && f.index !== 'ALL') qs.set('index', f.index);
  if (f.whale && f.whale !== 'ALL') qs.set('whale', f.whale);
  if (f.minUptrend !== '') qs.set('minUptrend', f.minUptrend);
  if (f.maxPer !== '') qs.set('maxPer', f.maxPer);
  if (f.minRoe !== '') qs.set('minRoe', f.minRoe);
  if (f.confirmedOnly) qs.set('confirmedOnly', 'true');
  qs.set('sort', US_STATE.sort);
  qs.set('order', US_STATE.order);
  qs.set('limit', '100');

  try {
    var resp = await fetch('/api/idx/unified-screener?' + qs.toString());
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat Unified Screener');
    US_STATE.rows = json.rows || [];
    US_STATE.summary = json.summary || null;
    US_STATE.dataSources = json.dataSources || null;
    US_STATE.total = json.total || 0;
    US_STATE.loaded = true;
  } catch (e) {
    US_STATE.error = e.message || 'Gagal memuat data';
  } finally {
    US_STATE.loading = false;
    usRenderShell();
  }
}

function usApplyFilters() {
  US_STATE.filters.search = (el('us-f-search') && el('us-f-search').value) || '';
  US_STATE.filters.index = (el('us-f-index') && el('us-f-index').value) || 'ALL';
  US_STATE.filters.whale = (el('us-f-whale') && el('us-f-whale').value) || 'ALL';
  US_STATE.filters.minUptrend = (el('us-f-minuptrend') && el('us-f-minuptrend').value) || '';
  US_STATE.filters.maxPer = (el('us-f-maxper') && el('us-f-maxper').value) || '';
  US_STATE.filters.minRoe = (el('us-f-minroe') && el('us-f-minroe').value) || '';
  US_STATE.filters.confirmedOnly = !!(el('us-f-confirmed') && el('us-f-confirmed').checked);
  usFetchAndRender();
}

function usSetSort(field) {
  if (US_STATE.sort === field) {
    US_STATE.order = US_STATE.order === 'desc' ? 'asc' : 'desc';
  } else {
    US_STATE.sort = field;
    US_STATE.order = 'desc';
  }
  usFetchAndRender();
}

function usOpenTicker(ticker) {
  if (typeof goPage === 'function') goPage('stock-intel');
  if (typeof selectStockIntelTicker === 'function') selectStockIntelTicker(ticker);
}

function usSortIndicator(field) {
  if (US_STATE.sort !== field) return '';
  return US_STATE.order === 'desc' ? ' ▼' : ' ▲';
}

function usRenderShell() {
  var c = el('page-radar');
  if (!c) return;
  var f = US_STATE.filters;

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle">Screener</div>'
    + '<div class="psub">Satu screener terpadu — akumulasi/distribusi whole-market, foreign flow, teknikal, dan fundamental digabung jadi 1 skor Whale + Uptrend yang bisa difilter.</div>'
    + '</div>';

  // Data-source honesty banner
  if (US_STATE.dataSources) {
    var ds = US_STATE.dataSources;
    var accSim = ds.accumulationDistribution && ds.accumulationDistribution.isSimulated;
    var flowSim = ds.foreignFlow && ds.foreignFlow.isSimulated;
    if (accSim || flowSim) {
      html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;border-left:3px solid var(--amber,#d97706);font-size:12.5px">'
        + '<b>Data Whale/Akumulasi belum real:</b> ' + (accSim ? (ds.accumulationDistribution.dataSource || 'Invezgo tidak dikonfigurasi') : '')
        + (flowSim ? ' / ' + (ds.foreignFlow.dataSource || 'Invezgo tidak dikonfigurasi') : '')
        + ' — skor Whale akan selalu netral sampai INVEZGO_API_KEY dikonfigurasi.'
        + '</div>';
    }
  }
  if (US_STATE.summary) {
    var s = US_STATE.summary;
    html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text-mute)">'
      + 'Cakupan teknikal (cron-warmed): ' + s.technicalCoverage + '/' + s.totalUniverse + ' saham. '
      + 'Cakupan fundamental: ' + s.fundamentalCoverage + '/' + s.totalUniverse + ' saham. '
      + 'Saham di luar cakupan tampil "N/A" (bukan skor 0) — akan mengisi bertahap lewat cron harian.'
      + '</div>';
  }

  // Filter panel (finput/fsel — same input/select classes used app-wide,
  // e.g. Portfolio/RDN/Dividen filter bars in public/index.html)
  var fis = 'padding:5px 9px;font-size:11.5px;border-radius:6px';
  html += '<div class="card" style="padding:14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Cari</label>'
      + '<input id="us-f-search" type="text" placeholder="Ticker/nama" value="' + (f.search || '').replace(/"/g, '&quot;') + '" style="width:120px;' + fis + '" class="finput"></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Index</label>'
      + '<select id="us-f-index" class="finput fsel" style="' + fis + '">'
        + ['ALL', 'LQ45', 'IDX30', 'IDX80', 'KOMPAS100'].map(function (v) {
            return '<option value="' + v + '"' + (f.index === v ? ' selected' : '') + '>' + v + '</option>';
          }).join('')
      + '</select></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Whale</label>'
      + '<select id="us-f-whale" class="finput fsel" style="' + fis + '">'
        + '<option value="ALL"' + (f.whale === 'ALL' ? ' selected' : '') + '>Semua</option>'
        + '<option value="ACCUM"' + (f.whale === 'ACCUM' ? ' selected' : '') + '>Akumulasi</option>'
        + '<option value="DIST"' + (f.whale === 'DIST' ? ' selected' : '') + '>Distribusi</option>'
      + '</select></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Min Uptrend</label>'
      + '<input id="us-f-minuptrend" type="number" min="0" max="100" placeholder="0-100" value="' + (f.minUptrend || '') + '" style="width:70px;' + fis + '" class="finput"></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Max PER</label>'
      + '<input id="us-f-maxper" type="number" min="0" placeholder="mis. 15" value="' + (f.maxPer || '') + '" style="width:70px;' + fis + '" class="finput"></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Min ROE %</label>'
      + '<input id="us-f-minroe" type="number" placeholder="mis. 10" value="' + (f.minRoe || '') + '" style="width:70px;' + fis + '" class="finput"></div>'
    + '<div style="display:flex;align-items:center;gap:6px">'
      + '<input id="us-f-confirmed" type="checkbox"' + (f.confirmedOnly ? ' checked' : '') + '> '
      + '<label style="font-size:11.5px" for="us-f-confirmed">Uptrend + Akumulasi Terkonfirmasi saja</label></div>'
    + '<button class="btn btn-primary btn-sm" onclick="usApplyFilters()">Terapkan Filter</button>'
    + '</div>';

  if (US_STATE.error) {
    html += '<div class="card" style="padding:14px;color:var(--down,#dc2626)">Gagal memuat data: ' + US_STATE.error + '</div>';
  } else if (US_STATE.loading && !US_STATE.loaded) {
    html += '<div class="card" style="padding:24px;text-align:center;color:var(--text-mute)">Memuat Unified Screener…</div>';
  } else {
    html += '<div class="card" style="padding:0;overflow-x:auto">'
      + '<table class="tbl" style="width:100%;font-size:12.5px">'
      + '<thead><tr>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'ticker\')">Ticker' + usSortIndicator('ticker') + '</th>'
        + '<th>Nama</th>'
        + '<th>Sektor</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'per\')">PER' + usSortIndicator('per') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'roe\')">ROE' + usSortIndicator('roe') + '</th>'
        + '<th>Trend</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'volRatio\')">Vol Ratio' + usSortIndicator('volRatio') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'uptrendScore\')">Uptrend' + usSortIndicator('uptrendScore') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'whaleScore\')">Whale' + usSortIndicator('whaleScore') + '</th>'
      + '</tr></thead><tbody>';

    if (US_STATE.rows.length === 0 && US_STATE.loaded) {
      html += '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-mute)">Tidak ada saham yang cocok dengan filter ini.</td></tr>';
    }

    US_STATE.rows.forEach(function (r) {
      html += '<tr style="cursor:pointer" onclick="usOpenTicker(\'' + r.ticker + '\')">'
        + '<td><b>' + r.ticker + '</b>' + (r.confirmedUptrendWhale ? ' <span class="badge b-up" style="font-size:8px;padding:1px 4px" title="Uptrend + Akumulasi Terkonfirmasi">🐋+📈</span>' : '') + '</td>'
        + '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.name || '-') + '</td>'
        + '<td style="font-size:11px;color:var(--text-mute)">' + (r.sector || '-') + '</td>'
        + '<td>' + (r.per != null ? r.per.toFixed(1) + 'x' : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.roe != null ? r.roe.toFixed(1) + '%' : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.trend ? ('<span class="badge ' + (r.trend === 'UPTREND' ? 'b-up' : r.trend === 'DOWNTREND' ? 'b-dn' : 'b-neu') + '" style="font-size:9px">' + r.trend + '</span>') : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.volRatio != null ? r.volRatio.toFixed(2) + 'x' : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.uptrendScore != null ? ('<b style="color:' + usUptrendColor(r.uptrendScore) + '">' + r.uptrendScore + '</b>') : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td><span class="badge ' + usWhaleBadgeClass(r.whaleLabel) + '" style="font-size:9px">' + r.whaleLabel + '</span></td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div style="margin-top:8px;font-size:11px;color:var(--text-mute)">Menampilkan ' + US_STATE.rows.length + ' dari ' + US_STATE.total + ' saham yang cocok filter (dari total universe ' + (US_STATE.summary ? US_STATE.summary.totalUniverse : '-') + ').</div>';
  }

  c.innerHTML = html;
}

function renderUnifiedScreenerPage() {
  if (!US_STATE.loaded && !US_STATE.loading) {
    usFetchAndRender();
  } else {
    usRenderShell();
  }
}

window.renderUnifiedScreenerPage = renderUnifiedScreenerPage;
window.usApplyFilters = usApplyFilters;
window.usSetSort = usSetSort;
window.usOpenTicker = usOpenTicker;
