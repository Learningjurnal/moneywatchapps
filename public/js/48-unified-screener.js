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
 *
 * (2026-09-18, further consolidation) TradeWave's single-ticker "Wave
 * Cockpit" and "Risk Planner" tabs were moved in here too, as 2 more
 * top-level tabs (US_STATE.pageTab) alongside the main Screener table —
 * the standalone TradeWave page/toolbar is gone entirely now. Their
 * computation/render logic still lives in 37-tradewave-engine.js
 * (twAnalyzeWave(), twRenderSubPage()) — this file just owns which tab is
 * active and gives twRenderSubPage() a container to draw into.
 */

var US_STATE = {
  loading: false,
  loaded: false,
  error: null,
  rows: [],
  summary: null,
  dataSources: null,
  total: 0,
  pageTab: 'screener', // 'screener' | 'cockpit' | 'planner' | 'quant' | 'volspike' | 'strategy'
  filters: {
    search: '',
    index: 'ALL',
    whale: 'ALL',
    minUptrend: '',
    maxPer: '',
    minRoe: '',
    confirmedOnly: false,
    wavePhase: 'ALL'
  },
  sort: 'uptrendScore',
  order: 'desc'
};

function usSwitchPageTab(tab) {
  US_STATE.pageTab = tab;
  usRenderShell();
}

// Win-rate validation state (2026-09-18, user-requested: "bagaimana agar
// saya bisa menguji apakah screener benar atau salah"). Track A
// (historical backtest, technical+whale only) is run on demand (button —
// it costs several Invezgo calls, shouldn't fire on every page load).
// Track B (forward paper-trading log, full formula) auto-loads once —
// it's a cheap read of an already-resolved Redis log, not a live scan.
var US_VALIDATION = {
  backtest: { loading: false, data: null, error: null },
  signalLog: { loading: false, data: null, error: null, fetchedOnce: false }
};

function usWhaleBadgeClass(label) {
  if (label === 'Akumulasi Kuat') return 'b-up';
  if (label === 'Akumulasi Lemah') return 'b-amb';
  if (label === 'Distribusi') return 'b-dn';
  return 'b-neu';
}

var US_WAVE_PHASES = ['WAVE 1 BREAKOUT', 'WAVE 2 DIP BUY', 'WAVE 3 EXTENSION', 'WAVE 4 RETEST', 'WAVE 5 CLIMAX', 'CORRECTIVE ABC'];

function usWaveBadgeClass(phase) {
  if (phase === 'WAVE 1 BREAKOUT' || phase === 'WAVE 3 EXTENSION') return 'b-up';
  if (phase === 'WAVE 2 DIP BUY' || phase === 'WAVE 4 RETEST') return 'b-amb';
  if (phase === 'WAVE 5 CLIMAX' || phase === 'CORRECTIVE ABC') return 'b-dn';
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
  if (f.wavePhase && f.wavePhase !== 'ALL') qs.set('wavePhase', f.wavePhase);
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
  US_STATE.filters.wavePhase = (el('us-f-wavephase') && el('us-f-wavephase').value) || 'ALL';
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
  if (typeof sm360SelectTicker === 'function') {
    sm360SelectTicker(ticker);
  }
  if (typeof goPage === 'function') {
    goPage('stock-dossier');
  }
}

function usSortIndicator(field) {
  if (US_STATE.sort !== field) return '';
  return US_STATE.order === 'desc' ? ' ▼' : ' ▲';
}

function usPageTabBtnStyle(active) {
  return 'font-weight:700;' + (active ? 'background:rgba(0,200,255,0.15);border-color:#00c8ff;color:#00c8ff' : '');
}

function usRenderShell() {
  var c = el('page-radar');
  if (!c) return;
  var f = US_STATE.filters;
  var pt = US_STATE.pageTab || 'screener';

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle">Screener</div>'
    + '<div class="psub">Satu screener terpadu — akumulasi/distribusi whole-market, foreign flow, teknikal, dan fundamental digabung jadi 1 skor Whale + Uptrend yang bisa difilter. Termasuk analisis Wave per-ticker (tab "Wave Cockpit"), kalkulator ukuran posisi (tab "Risk Planner"), screener RSI/momentum (tab "Quant Screener"), dan scanner lonjakan volume (tab "Volume Spike") — bekas TradeWave/Quant Lab/Volume Spike, sekarang jadi bagian dari Screener ini.</div>'
    + '</div>';

  // Top-level page tabs — Screener (whole-market table) vs Wave Cockpit /
  // Risk Planner (single-ticker, bekas halaman TradeWave terpisah,
  // digabung ke sini 2026-09-18 atas permintaan user: "toolbar trade wave
  // di hilangkan saja semua bergabung di scanner").
  html += '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">'
    + '<button class="btn btn-ghost btn-sm" onclick="usSwitchPageTab(\'screener\')" style="' + usPageTabBtnStyle(pt === 'screener') + '">📊 Screener</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="usSwitchPageTab(\'cockpit\')" style="' + usPageTabBtnStyle(pt === 'cockpit') + '">🌊 Wave Cockpit</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="usSwitchPageTab(\'planner\')" style="' + usPageTabBtnStyle(pt === 'planner') + '">📐 Risk Planner</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="usSwitchPageTab(\'quant\')" style="' + usPageTabBtnStyle(pt === 'quant') + '">🔬 Quant Screener</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="usSwitchPageTab(\'volspike\')" style="' + usPageTabBtnStyle(pt === 'volspike') + '">⚡ Volume Spike</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="usSwitchPageTab(\'strategy\')" style="' + usPageTabBtnStyle(pt === 'strategy') + '">🎯 Strategy Engine</button>'
    + '</div>';

  if (pt === 'strategy') {
    html += '<div id="us-strategy-subpage"></div>';
    c.innerHTML = html;
    if (typeof seRenderStrategyEnginePage === 'function') seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }

  if (pt === 'cockpit' || pt === 'planner') {
    html += '<div id="us-wave-subpage"></div>';
    c.innerHTML = html;
    if (typeof twRenderSubPage === 'function') {
      twRenderSubPage('us-wave-subpage', pt === 'cockpit' ? 1 : 3);
    }
    return;
  }

  // Quant Screener / Volume Spike both run their own progressive
  // whole-market scan (staggered batched fetches across hundreds of
  // tickers) with their own in-flight guards — rebuilding this wrapper's
  // HTML on every usRenderShell() call (as the simpler cockpit/planner
  // branch above does) would wipe their filter inputs/table mid-scan on
  // every re-render, including 03-engine.js's periodic same-page refresh
  // tick. So the wrapper is only (re)built the FIRST time each of these
  // tabs becomes active; later calls just re-invoke that tab's own
  // render/scan function, which manages its own DOM in place.
  if (pt === 'quant') {
    var alreadyShowingQuant = document.getElementById('sc-tbody');
    if (!alreadyShowingQuant) {
      html += '<div id="us-wave-subpage">' + (typeof qtScreenerSubPageHtml === 'function' ? qtScreenerSubPageHtml() : '') + '</div>';
      c.innerHTML = html;
    }
    if (typeof scRenderTable !== 'undefined') {
      if (!QT.scData.length) scBuildSim(scRenderTable); else scRenderTable();
    }
    return;
  }

  if (pt === 'volspike') {
    var alreadyShowingVolSpike = document.getElementById('us-wave-subpage') && document.getElementById('vs-detail-col');
    if (!alreadyShowingVolSpike) {
      html += '<div id="us-wave-subpage"></div>';
      c.innerHTML = html;
    }
    VS_CONTAINER_ID = 'us-wave-subpage';
    if (typeof renderVolumeSpikePage === 'function') renderVolumeSpikePage();
    return;
  }

  // Data-source honesty banner
  if (US_STATE.dataSources) {
    var ds = US_STATE.dataSources;
    var accSim = ds.accumulationDistribution && ds.accumulationDistribution.isSimulated;
    var flowSim = ds.foreignFlow && ds.foreignFlow.isSimulated;
    if (accSim || flowSim) {
      html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;border:1px solid var(--border);font-size:12.5px">'
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
      + 'Cakupan Wave Analysis: ' + (s.waveCoverage != null ? s.waveCoverage : 0) + '/' + s.totalUniverse + ' saham. '
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
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px;white-space:nowrap">Min Uptrend</label>'
      + '<input id="us-f-minuptrend" type="number" min="0" max="100" placeholder="0-100" value="' + (f.minUptrend || '') + '" style="min-width:90px;width:90px;' + fis + '" class="finput"></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px;white-space:nowrap">Max PER</label>'
      + '<input id="us-f-maxper" type="number" min="0" placeholder="mis. 15" value="' + (f.maxPer || '') + '" style="min-width:90px;width:90px;' + fis + '" class="finput"></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px;white-space:nowrap">Min ROE %</label>'
      + '<input id="us-f-minroe" type="number" placeholder="mis. 10" value="' + (f.minRoe || '') + '" style="min-width:90px;width:90px;' + fis + '" class="finput"></div>'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Wave Phase</label>'
      + '<select id="us-f-wavephase" class="finput fsel" style="' + fis + '">'
        + '<option value="ALL"' + (f.wavePhase === 'ALL' ? ' selected' : '') + '>Semua</option>'
        + US_WAVE_PHASES.map(function (v) {
            return '<option value="' + v + '"' + (f.wavePhase === v ? ' selected' : '') + '>' + v + '</option>';
          }).join('')
      + '</select></div>'
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
        + '<th style="cursor:pointer" onclick="usSetSort(\'chg1d\')">Chg% (1D)' + usSortIndicator('chg1d') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'chg7d\')">Chg% (7D)' + usSortIndicator('chg7d') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'per\')">PER' + usSortIndicator('per') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'roe\')">ROE' + usSortIndicator('roe') + '</th>'
        + '<th>Trend</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'volRatio\')">Vol Ratio' + usSortIndicator('volRatio') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'uptrendScore\')">Uptrend' + usSortIndicator('uptrendScore') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'whaleScore\')">Whale' + usSortIndicator('whaleScore') + '</th>'
        + '<th style="cursor:pointer" onclick="usSetSort(\'waveScore\')">Wave Phase' + usSortIndicator('waveScore') + '</th>'
      + '</tr></thead><tbody>';

    if (US_STATE.rows.length === 0 && US_STATE.loaded) {
      html += '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-mute)">Tidak ada saham yang cocok dengan filter ini.</td></tr>';
    }

    US_STATE.rows.forEach(function (r) {
      var c1d = r.chg1d != null ? (r.chg1d >= 0 ? '+' : '') + r.chg1d.toFixed(2) + '%' : '<span style="color:var(--text-mute)">N/A</span>';
      var c1dCol = r.chg1d != null ? (r.chg1d >= 0 ? 'var(--green)' : 'var(--red)') : 'inherit';
      var c7d = r.chg7d != null ? (r.chg7d >= 0 ? '+' : '') + r.chg7d.toFixed(2) + '%' : '<span style="color:var(--text-mute)">N/A</span>';
      var c7dCol = r.chg7d != null ? (r.chg7d >= 0 ? 'var(--green)' : 'var(--red)') : 'inherit';

      html += '<tr style="cursor:pointer" onclick="usOpenTicker(\'' + r.ticker + '\')">'
        + '<td><b>' + r.ticker + '</b>' + (r.confirmedUptrendWhale ? ' <span class="badge b-up" style="font-size:8px;padding:1px 4px" title="Uptrend + Akumulasi Terkonfirmasi">🐋+📈</span>' : '') + '</td>'
        + '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.name || '-') + '</td>'
        + '<td style="font-weight:700;color:' + c1dCol + ';font-family:var(--font-mono)">' + c1d + '</td>'
        + '<td style="font-weight:700;color:' + c7dCol + ';font-family:var(--font-mono)">' + c7d + '</td>'
        + '<td>' + (r.per != null ? r.per.toFixed(1) + 'x' : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.roe != null ? r.roe.toFixed(1) + '%' : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.trend ? ('<span class="badge ' + (r.trend === 'UPTREND' ? 'b-up' : r.trend === 'DOWNTREND' ? 'b-dn' : 'b-neu') + '" style="font-size:9px">' + r.trend + '</span>') : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.volRatio != null ? r.volRatio.toFixed(2) + 'x' : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td>' + (r.uptrendScore != null ? ('<b style="color:' + usUptrendColor(r.uptrendScore) + '">' + r.uptrendScore + '</b>') : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '<td><span class="badge ' + usWhaleBadgeClass(r.whaleLabel) + '" style="font-size:9px">' + r.whaleLabel + '</span></td>'
        + '<td>' + (r.wavePhase ? ('<span class="badge ' + usWaveBadgeClass(r.wavePhase) + '" style="font-size:9px">' + r.wavePhase + '</span>') : '<span style="color:var(--text-mute)">N/A</span>') + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div style="margin-top:8px;font-size:11px;color:var(--text-mute)">Menampilkan ' + US_STATE.rows.length + ' dari ' + US_STATE.total + ' saham yang cocok filter (dari total universe ' + (US_STATE.summary ? US_STATE.summary.totalUniverse : '-') + ').</div>';
  }

  html += '<div id="us-validation-panel" style="margin-top:20px"></div>';

  c.innerHTML = html;
  usRenderValidationPanel();
  if (!US_VALIDATION.signalLog.fetchedOnce) {
    US_VALIDATION.signalLog.fetchedOnce = true;
    usFetchSignalLog();
  }
}

// ── Win-rate validation panel (Track A: backtest, Track B: forward log) ──
function usFmtPct(v) {
  if (v == null) return 'N/A';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

async function usRunBacktest() {
  US_VALIDATION.backtest.loading = true;
  US_VALIDATION.backtest.error = null;
  usRenderValidationPanel();
  var lookback = (document.getElementById('us-bt-lookback') && document.getElementById('us-bt-lookback').value) || 45;
  var forward = (document.getElementById('us-bt-forward') && document.getElementById('us-bt-forward').value) || 20;
  try {
    var resp = await fetch('/api/idx/unified-screener-backtest?lookbackDays=' + lookback + '&forwardDays=' + forward);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal menjalankan backtest');
    US_VALIDATION.backtest.data = json;
  } catch (e) {
    US_VALIDATION.backtest.error = e.message;
  } finally {
    US_VALIDATION.backtest.loading = false;
    usRenderValidationPanel();
  }
}

async function usFetchSignalLog() {
  US_VALIDATION.signalLog.loading = true;
  usRenderValidationPanel();
  try {
    var resp = await fetch('/api/idx/screener-signal-log');
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat forward signal log');
    US_VALIDATION.signalLog.data = json;
  } catch (e) {
    US_VALIDATION.signalLog.error = e.message;
  } finally {
    US_VALIDATION.signalLog.loading = false;
    usRenderValidationPanel();
  }
}

function usRenderValidationPanel() {
  var el = document.getElementById('us-validation-panel');
  if (!el) return;

  var html = '<div class="ptitle" style="font-size:15px;margin-bottom:4px">Uji Win Rate Formula</div>'
    + '<div class="psub" style="margin-bottom:12px">2 cara menguji apakah formula Whale+Uptrend ini benar-benar bekerja — bukan cuma "kelihatan masuk akal".</div>';

  // Track A: Backtest
  var bt = US_VALIDATION.backtest;
  html += '<div class="card" style="padding:14px;margin-bottom:12px">'
    + '<div style="font-weight:700;font-size:13px;margin-bottom:6px">A. Backtest Historis (cepat, teknikal+whale saja)</div>'
    + '<div style="font-size:11.5px;color:var(--text-mute);margin-bottom:10px">Komponen valuasi (PER/ROE) TIDAK disertakan di sini — aplikasi ini tidak punya snapshot fundamental historis per tanggal, menyertakannya akan jadi look-ahead bias (hasil kelihatan bagus tapi palsu).</div>'
    + '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">'
    + '<div><label style="font-size:10.5px;color:var(--text-mute);display:block">Lookback (hari)</label><input id="us-bt-lookback" type="number" value="45" min="10" max="90" style="width:70px;padding:5px 8px;font-size:11.5px;border-radius:6px" class="finput"></div>'
    + '<div><label style="font-size:10.5px;color:var(--text-mute);display:block">Forward (hari)</label><input id="us-bt-forward" type="number" value="20" min="5" max="60" style="width:70px;padding:5px 8px;font-size:11.5px;border-radius:6px" class="finput"></div>'
    + '<button class="btn btn-primary btn-sm" onclick="usRunBacktest()"' + (bt.loading ? ' disabled' : '') + '>' + (bt.loading ? 'Menjalankan…' : 'Jalankan Backtest') + '</button>'
    + '</div>';

  if (bt.error) {
    html += '<div style="color:var(--down,#dc2626);font-size:12px">Gagal: ' + bt.error + '</div>';
  } else if (bt.data) {
    var d = bt.data;
    if (!d.available) {
      html += '<div style="color:var(--text-mute);font-size:12px">' + d.reason + '</div>';
    } else if (d.totalSignals === 0) {
      html += '<div style="color:var(--text-mute);font-size:12px">Tidak ada sinyal "confirmed" (Whale≥3 + Teknikal≥80) pada ' + d.datesScanned + ' tanggal yang di-scan. Coba perbesar lookback.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:8px">'
        + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">WIN RATE</div><div class="mval mono" style="font-size:18px;color:' + (d.winRate >= 50 ? 'var(--up,#16a34a)' : 'var(--down,#dc2626)') + '">' + d.winRate + '%</div></div>'
        + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">AVG RETURN</div><div class="mval mono" style="font-size:16px">' + usFmtPct(d.avgReturnPct) + '</div></div>'
        + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">AVG ALPHA vs IHSG</div><div class="mval mono" style="font-size:16px">' + usFmtPct(d.avgAlphaPct) + '</div></div>'
        + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">KALAHKAN IHSG</div><div class="mval mono" style="font-size:16px">' + (d.beatBenchmarkRate != null ? d.beatBenchmarkRate + '%' : 'N/A') + '</div></div>'
        + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">JUMLAH SINYAL</div><div class="mval mono" style="font-size:16px">' + d.totalSignals + '</div></div>'
        + '</div>';
      if (d.totalSignals < 20) {
        html += '<div style="font-size:11px;color:var(--amber,#d97706);margin-bottom:6px">⚠ Sampel cuma ' + d.totalSignals + ' sinyal — terlalu kecil untuk disimpulkan statistik signifikan, jangan langsung percaya angka ini. Perbesar lookback atau tunggu Track B (forward log) terkumpul lebih banyak.</div>';
      }
      html += '<div style="font-size:11px;color:var(--text-mute)">Metodologi: ' + d.methodology + '</div>';
    }
  }
  html += '</div>';

  // Track B: Forward paper-trading log
  var sl = US_VALIDATION.signalLog;
  html += '<div class="card" style="padding:14px">'
    + '<div style="font-weight:700;font-size:13px;margin-bottom:6px">B. Forward Paper-Trading Log (lambat, formula lengkap termasuk valuasi)</div>'
    + '<div style="font-size:11.5px;color:var(--text-mute);margin-bottom:10px">Setiap hari (via cron), sinyal "confirmed" hari itu dicatat otomatis dengan harga entry real. Setelah 20 hari bursa, hasilnya dihitung dari harga real — nol look-ahead bias, tapi butuh waktu terkumpul.</div>';

  if (sl.loading && !sl.data) {
    html += '<div style="color:var(--text-mute);font-size:12px">Memuat…</div>';
  } else if (sl.error) {
    html += '<div style="color:var(--down,#dc2626);font-size:12px">Gagal: ' + sl.error + '</div>';
  } else if (sl.data) {
    var s = sl.data;
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:8px">'
      + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">WIN RATE</div><div class="mval mono" style="font-size:18px">' + (s.winRate != null ? s.winRate + '%' : 'Belum ada') + '</div></div>'
      + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">AVG ALPHA vs IHSG</div><div class="mval mono" style="font-size:16px">' + usFmtPct(s.avgAlphaPct) + '</div></div>'
      + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">SUDAH SELESAI</div><div class="mval mono" style="font-size:16px">' + s.resolvedCount + '</div></div>'
      + '<div class="metric" style="padding:8px"><div class="mlabel" style="font-size:9px">MASIH BERJALAN</div><div class="mval mono" style="font-size:16px">' + s.pendingCount + '</div></div>'
      + '</div>';
    if (s.resolvedCount === 0) {
      html += '<div style="font-size:11.5px;color:var(--text-mute)">Belum ada sinyal yang selesai horizonnya (20 hari bursa). ' + (s.pendingCount > 0 ? s.pendingCount + ' sinyal sedang berjalan.' : 'Log akan mulai terisi setelah cron harian pertama kali berjalan.') + '</div>';
    } else if (s.entries && s.entries.length) {
      html += '<div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:11.5px"><thead><tr><th>Tanggal</th><th>Ticker</th><th>Entry</th><th>Exit</th><th>Return</th><th>vs IHSG</th><th>Hasil</th></tr></thead><tbody>';
      s.entries.slice(0, 20).forEach(function (e) {
        html += '<tr>'
          + '<td>' + e.date + '</td>'
          + '<td><b>' + e.ticker + '</b></td>'
          + '<td>' + (e.entryPrice != null ? Number(e.entryPrice).toLocaleString('id-ID') : '-') + '</td>'
          + '<td>' + (e.exitPrice != null ? Number(e.exitPrice).toLocaleString('id-ID') : (e.status === 'pending' ? '<span style="color:var(--text-mute)">Berjalan</span>' : '-')) + '</td>'
          + '<td>' + (e.returnPct != null ? usFmtPct(e.returnPct) : '-') + '</td>'
          + '<td>' + (e.alphaPct != null ? usFmtPct(e.alphaPct) : '-') + '</td>'
          + '<td>' + (e.outcome ? ('<span class="badge ' + (e.outcome === 'WIN' ? 'b-up' : 'b-dn') + '" style="font-size:9px">' + e.outcome + '</span>') : '<span class="badge b-neu" style="font-size:9px">PENDING</span>') + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }
  }
  html += '</div>';

  el.innerHTML = html;
}

// FIX (2026-09-19, user-reported): US_STATE.pageTab is sticky across
// renders (usSwitchPageTab() only sets it, never clears it), which is
// correct WHILE the user is on this page switching its own tabs. A fresh
// navigation into this page (goPage('radar')/'ranking'/'scanner'/
// 'tradewave'/'screener'/'volume-spike', or the Dashboard's "Lihat Semua
// ->" shortcut) should reset it to 'screener' — but that reset lives in
// goPage() itself (06-analysis-router.js), NOT here. Reason: this function
// is also invoked by 03-engine.js's periodic same-page refresh tick
// (`renderPage(currentPage)`, fired every few seconds while ANY page is
// open, never going through goPage()) — resetting pageTab here would have
// silently kicked a user back to the main Screener tab mid-read every time
// that tick fired while they were on Wave Cockpit/Risk Planner/Quant
// Screener/Volume Spike.
function renderUnifiedScreenerPage() {
  if (!US_STATE.loaded && !US_STATE.loading) {
    usFetchAndRender();
  } else {
    usRenderShell();
  }
}

window.renderUnifiedScreenerPage = renderUnifiedScreenerPage;
window.usSwitchPageTab = usSwitchPageTab;
window.usRenderShell = usRenderShell;
window.usApplyFilters = usApplyFilters;
window.usSetSort = usSetSort;
window.usOpenTicker = usOpenTicker;
window.usRunBacktest = usRunBacktest;
window.usFetchSignalLog = usFetchSignalLog;
