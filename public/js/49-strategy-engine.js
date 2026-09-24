/**
 * public/js/49-strategy-engine.js — Strategy Engine V1 tab inside the
 * Unified Screener page (public/js/48-unified-screener.js switches into
 * this via US_STATE.pageTab === 'strategy').
 *
 * Data: GET /api/strategy-engine/strategies (list of 4 strategies) and
 * GET /api/strategy-engine/scan?strategy=...&tickers=... (on-demand run,
 * explicit ticker list — see server.js route comment for why there is no
 * "scan whole market" button here: that belongs in a scheduled cron, not
 * an unauthenticated on-demand endpoint).
 *
 * This UI never labels a result BUY/SELL — only the engine's own
 * STRONG/QUALIFIED/WATCH/REJECT/DATA_INSUFFICIENT vocabulary.
 */

var SE_STATE = {
  strategiesLoaded: false,
  strategies: [],
  selectedStrategy: 'swing-flow',
  tickersInput: '',
  loading: false,
  error: null,
  data: null, // last /scan response
  expandedTicker: null,
  latest: { loading: false, fetchedFor: null, data: null, error: null }
};

// "Hasil Cron Terakhir" — sinyal STRONG/QUALIFIED yang sudah terkumpul
// hari ini dari warmStrategyEngineRotating() (lib/engine/strategy/
// StrategyEngine.js), bukan hasil scan on-demand. Cron ini TIDAK otomatis
// jalan lewat Vercel native cron (lihat komentar server.js pada
// GET /api/cron/warm-strategy-engine) — kalau panel ini kosong terus,
// kemungkinan besar penjadwal eksternalnya belum di-set up.
async function seLoadLatest(strategyId) {
  SE_STATE.latest.loading = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var resp = await fetch('/api/strategy-engine/latest?strategy=' + encodeURIComponent(strategyId));
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat hasil cron');
    SE_STATE.latest.data = json;
    SE_STATE.latest.fetchedFor = strategyId;
    SE_STATE.latest.error = null;
  } catch (e) {
    SE_STATE.latest.error = e.message;
  } finally {
    SE_STATE.latest.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

function seStatusBadgeClass(status) {
  if (status === 'STRONG') return 'b-up';
  if (status === 'QUALIFIED') return 'b-up';
  if (status === 'WATCH') return 'b-amb';
  if (status === 'REJECT') return 'b-dn';
  return 'b-neu'; // DATA_INSUFFICIENT
}

async function seLoadStrategies() {
  try {
    var resp = await fetch('/api/strategy-engine/strategies');
    var json = await resp.json();
    if (json.success) {
      SE_STATE.strategies = json.strategies || [];
      if (!SE_STATE.strategies.find(function (s) { return s.id === SE_STATE.selectedStrategy; }) && SE_STATE.strategies.length) {
        SE_STATE.selectedStrategy = SE_STATE.strategies[0].id;
      }
    }
  } catch (e) { /* silent — form still usable with the default strategy id */ }
  SE_STATE.strategiesLoaded = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seOnStrategyChange() {
  var sel = document.getElementById('se-strategy-select');
  if (sel) SE_STATE.selectedStrategy = sel.value;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seReadForm() {
  var sel = document.getElementById('se-strategy-select');
  var tk = document.getElementById('se-tickers-input');
  if (sel) SE_STATE.selectedStrategy = sel.value;
  if (tk) SE_STATE.tickersInput = tk.value;
}

async function seRunScan() {
  seReadForm();
  var tickers = SE_STATE.tickersInput.split(',').map(function (t) { return t.trim().toUpperCase(); }).filter(Boolean);
  if (!tickers.length) {
    SE_STATE.error = 'Isi minimal 1 ticker (pisahkan dengan koma), mis. BBCA,BBRI';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  if (tickers.length > 50) {
    SE_STATE.error = 'Maksimal 50 ticker per scan (proteksi kuota Invezgo)';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  SE_STATE.loading = true;
  SE_STATE.error = null;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var url = '/api/strategy-engine/scan?strategy=' + encodeURIComponent(SE_STATE.selectedStrategy) + '&tickers=' + encodeURIComponent(tickers.join(','));
    var resp = await fetch(url);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Scan gagal');
    SE_STATE.data = json;
  } catch (e) {
    SE_STATE.error = e.message;
    SE_STATE.data = null;
  } finally {
    SE_STATE.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

function seToggleExplain(ticker) {
  SE_STATE.expandedTicker = (SE_STATE.expandedTicker === ticker) ? null : ticker;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seRenderStrategyEnginePage(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!SE_STATE.strategiesLoaded) {
    container.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--text-mute)">Memuat daftar strategi…</div>';
    seLoadStrategies();
    return;
  }

  if (SE_STATE.latest.fetchedFor !== SE_STATE.selectedStrategy && !SE_STATE.latest.loading) {
    seLoadLatest(SE_STATE.selectedStrategy);
    return; // seLoadLatest re-renders when it resolves
  }

  var strat = SE_STATE.strategies.find(function (s) { return s.id === SE_STATE.selectedStrategy; });

  var html = '<div class="card" style="padding:14px;margin-bottom:12px">'
    + '<div style="font-weight:700;margin-bottom:6px">Money Watch Strategy Engine V1</div>'
    + '<div style="font-size:11.5px;color:var(--text-mute);margin-bottom:10px">'
    + 'Engine deterministik berbasis order book &amp; frekuensi transaksi real (Invezgo). '
    + 'Hasil hanya salah satu dari: <b>STRONG</b> / <b>QUALIFIED</b> / <b>WATCH</b> / <b>REJECT</b> / <b>DATA_INSUFFICIENT</b> — tidak pernah label BUY/SELL, dan bukan rekomendasi keuangan. '
    + 'Threshold di sini adalah default awal yang bisa dikalibrasi ulang, bukan parameter yang sudah tervalidasi empiris.'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Strategi</label>'
    + '<select id="se-strategy-select" class="finput fsel" onchange="seOnStrategyChange()" style="padding:5px 9px;font-size:11.5px;border-radius:6px;min-width:220px">'
    + SE_STATE.strategies.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === SE_STATE.selectedStrategy ? ' selected' : '') + '>' + s.name + '</option>';
      }).join('')
    + '</select></div>'
    + '<div style="flex:1;min-width:220px"><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Ticker (pisah koma, maks 50)</label>'
    + '<input id="se-tickers-input" type="text" placeholder="BBCA,BBRI,TLKM" value="' + (SE_STATE.tickersInput || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:5px 9px;font-size:11.5px;border-radius:6px" class="finput"></div>'
    + '<button class="btn btn-primary btn-sm" onclick="seRunScan()"' + (SE_STATE.loading ? ' disabled' : '') + '>' + (SE_STATE.loading ? 'Memindai…' : '▶ Jalankan Scan') + '</button>'
    + '</div>';

  if (strat) {
    html += '<div style="margin-top:10px;font-size:11px;color:var(--text-mute)">'
      + 'Bobot: ' + Object.keys(strat.weights).map(function (k) { return k + ' ' + Math.round(strat.weights[k] * 100) + '%'; }).join(', ')
      + (strat.mandatoryConditions && strat.mandatoryConditions.length ? ' · Mandatory: ' + strat.mandatoryConditions.join(', ') : '')
      + '</div>';
  }
  html += '</div>';

  // "Hasil Cron Terakhir" — akumulasi sinyal STRONG/QUALIFIED hari ini
  // dari warmStrategyEngineRotating(), bukan hasil scan manual di atas.
  html += '<div class="card" style="padding:14px;margin-bottom:12px">'
    + '<div style="font-weight:700;margin-bottom:6px">Hasil Cron Terakhir (Hari Ini)</div>';
  if (SE_STATE.latest.error) {
    html += '<div style="font-size:11.5px;color:var(--down,#dc2626)">' + SE_STATE.latest.error + '</div>';
  } else if (SE_STATE.latest.loading) {
    html += '<div style="font-size:11.5px;color:var(--text-mute)">Memuat…</div>';
  } else if (SE_STATE.latest.data && SE_STATE.latest.data.signals && SE_STATE.latest.data.signals.length > 0) {
    html += '<div style="font-size:11.5px;color:var(--text-mute);margin-bottom:8px">Tanggal ' + SE_STATE.latest.data.date + ' — ' + SE_STATE.latest.data.signals.length + ' sinyal STRONG/QUALIFIED terkumpul sejauh ini.</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
      + SE_STATE.latest.data.signals.map(function (s) {
          return '<span class="badge ' + seStatusBadgeClass(s.status) + '" style="font-size:10px">' + s.ticker + ' · ' + s.status + ' (' + s.score + ')</span>';
        }).join('')
      + '</div>';
  } else {
    html += '<div style="font-size:11.5px;color:var(--text-mute)">Belum ada sinyal terkumpul hari ini. Cron GET /api/cron/warm-strategy-engine belum otomatis jalan lewat Vercel native cron (2 slot Hobby sudah dipakai 2 cron lain) — perlu penjadwal eksternal (cron-job.org, GitHub Actions, dll) yang memanggil URL itu dengan header Authorization Bearer CRON_SECRET, atau jalankan manual dulu untuk tes.</div>';
  }
  html += '</div>';

  if (SE_STATE.error) {
    html += '<div class="card" style="padding:12px;color:var(--down,#dc2626);margin-bottom:12px">' + SE_STATE.error + '</div>';
  }

  if (SE_STATE.data) {
    var d = SE_STATE.data;
    if (d.regulatoryDataSource && !d.regulatoryDataSource.available) {
      html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;font-size:11.5px;border:1px solid var(--border)">'
        + '⚠️ Data notasi khusus BEI (Regulatory Health Gate) sedang tidak tersedia' + (d.regulatoryDataSource.isStale ? ' (memakai cache lama)' : '') + ' — semua ticker default DATA_INSUFFICIENT sampai data ini pulih.'
        + '</div>';
    }
    html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;font-size:11.5px;color:var(--text-mute)">'
      + 'STRONG: ' + d.summary.strong + ' · QUALIFIED: ' + d.summary.qualified + ' · WATCH: ' + d.summary.watch + ' · REJECT: ' + d.summary.reject + ' · DATA_INSUFFICIENT: ' + d.summary.dataInsufficient
      + '</div>';

    html += '<div class="card" style="padding:0;overflow-x:auto">'
      + '<table class="tbl" style="width:100%;font-size:12.5px">'
      + '<thead><tr><th>Ticker</th><th>Status</th><th>Score</th><th>Detail</th></tr></thead><tbody>';

    d.results.forEach(function (r) {
      html += '<tr>'
        + '<td><b>' + r.ticker + '</b></td>'
        + '<td><span class="badge ' + seStatusBadgeClass(r.status) + '" style="font-size:9px">' + r.status + '</span></td>'
        + '<td>' + (r.score != null ? r.score : '<span style="color:var(--text-mute)">-</span>') + '</td>'
        + '<td><button class="btn btn-ghost btn-xs" onclick="seToggleExplain(\'' + r.ticker + '\')">' + (SE_STATE.expandedTicker === r.ticker ? 'Tutup' : 'Lihat penjelasan') + '</button></td>'
        + '</tr>';
      if (SE_STATE.expandedTicker === r.ticker) {
        html += '<tr><td colspan="4" style="background:var(--bg-alt,#f8fafc);font-size:11px;padding:10px 14px">'
          + (r.explanations || []).map(function (line) { return '<div>' + line.replace(/</g, '&lt;') + '</div>'; }).join('')
          + '</td></tr>';
      }
    });

    html += '</tbody></table></div>';
  }

  container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────
// SIDEBAR DAILY PICKS WIDGET
// User request (2026-09-24): "1 sidebar recommendation, isinya adalah
// rekomendasi stock pick dari analisa anda, sifatnya harian, setiap hari
// berubah kecuali libur bursa, dan akan reload tiap 15 menit, stock pick
// cukup 10 saham aja, namun anda beri score dan alasan nya."
//
// ZERO FABRICATION (CLAUDE.md #1/#3): this widget invents NOTHING. It
// reads GET /api/strategy-engine/daily-picks, which itself only ever
// returns tickers that warmStrategyEngineRotating()'s cron already scored
// STRONG/QUALIFIED with the real Strategy Engine V1 formulas (see that
// endpoint's server.js comment and getDailyTopPicks() in
// lib/engine/strategy/StrategyEngine.js). "Changes daily except market
// holidays" and "10 stocks" are honored by the backend, not faked here:
// the backend walks back to the most recent date that actually has
// signals (weekends/holidays naturally reuse the last trading day's real
// results) and returns fewer than 10 with an honest `note` if the day's
// rotation hasn't found that many yet — this widget renders that note
// verbatim rather than padding the list.
// ─────────────────────────────────────────────────────────────────────────

var SIDE_PICKS_REFRESH_MS = 15 * 60 * 1000; // 15 minutes, as requested
var SIDE_PICKS_STATE = { loading: false, data: null, error: null };
var _sidePicksTimer = null;

function sideDailyPicksInit() {
  var el = document.getElementById('side-daily-picks');
  if (!el) return; // markup not present on this build — no-op, not an error
  sideDailyPicksLoad();
  if (_sidePicksTimer) clearInterval(_sidePicksTimer);
  _sidePicksTimer = setInterval(sideDailyPicksLoad, SIDE_PICKS_REFRESH_MS);
}

async function sideDailyPicksLoad() {
  SIDE_PICKS_STATE.loading = true;
  SIDE_PICKS_STATE.error = null;
  sideDailyPicksRender();
  try {
    var resp = await fetch('/api/strategy-engine/daily-picks?limit=10', { signal: AbortSignal.timeout(15000) });
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat rekomendasi harian');
    SIDE_PICKS_STATE.data = json;
  } catch (e) {
    SIDE_PICKS_STATE.error = e.message || String(e);
  } finally {
    SIDE_PICKS_STATE.loading = false;
    sideDailyPicksRender();
  }
}

function sideDailyPicksStatusColor(status) {
  if (status === 'STRONG') return 'var(--green,#10b981)';
  if (status === 'QUALIFIED') return 'var(--blue,#38bdf8)';
  return 'var(--text3,#94a3b8)';
}

function sideDailyPicksEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function sideDailyPicksRender() {
  var el = document.getElementById('side-daily-picks');
  if (!el) return;

  var header = '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 6px">'
    + '<span style="font-size:10.5px;font-weight:800;letter-spacing:0.4px;color:var(--text3,#94a3b8);text-transform:uppercase">Rekomendasi Harian</span>'
    + '<span class="badge b-accent" style="font-size:8px">STRATEGY ENGINE</span>'
    + '</div>';

  var body;
  if (SIDE_PICKS_STATE.loading && !SIDE_PICKS_STATE.data) {
    body = '<div style="padding:10px 4px;font-size:11px;color:var(--text3,#94a3b8)">Memuat rekomendasi...</div>';
  } else if (SIDE_PICKS_STATE.error && !SIDE_PICKS_STATE.data) {
    body = '<div style="padding:10px 4px;font-size:11px;color:var(--text3,#94a3b8)">Gagal memuat: ' + sideDailyPicksEsc(SIDE_PICKS_STATE.error) + '</div>';
  } else if (SIDE_PICKS_STATE.data && SIDE_PICKS_STATE.data.count === 0) {
    body = '<div style="padding:10px 4px;font-size:11px;color:var(--text3,#94a3b8);line-height:1.5">Belum ada saham STRONG/QUALIFIED untuk ' + sideDailyPicksEsc(SIDE_PICKS_STATE.data.date) + '. Kemungkinan hari libur bursa atau rotasi scan harian belum menemukan sinyal.</div>';
  } else if (SIDE_PICKS_STATE.data) {
    var d = SIDE_PICKS_STATE.data;
    var rows = d.picks.map(function (p) {
      return '<div onclick="if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stock-dossier\');" '
        + 'style="padding:7px 6px;border-radius:6px;cursor:pointer;transition:background 0.15s" '
        + 'onmouseover="this.style.background=\'var(--bg3,rgba(255,255,255,0.04))\'" onmouseout="this.style.background=\'transparent\'">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">'
        + '<span style="font-size:10px;font-weight:700;color:var(--text3,#94a3b8);width:14px;flex-shrink:0">' + p.rank + '</span>'
        + '<span class="mono" style="font-size:12px;font-weight:800;color:var(--text);flex:1">' + sideDailyPicksEsc(p.ticker) + '</span>'
        + '<span class="mono" style="font-size:11px;font-weight:800;color:' + sideDailyPicksStatusColor(p.status) + '">' + (p.score != null ? p.score : '-') + '</span>'
        + '</div>'
        + '<div style="font-size:9px;color:var(--text3,#94a3b8);margin:1px 0 3px 20px">' + sideDailyPicksEsc(p.strategyName) + ' · <span style="color:' + sideDailyPicksStatusColor(p.status) + '">' + p.status + '</span></div>'
        + '<div style="font-size:10px;color:var(--text2,#cbd5e1);line-height:1.4;margin-left:20px">' + sideDailyPicksEsc(p.reason).slice(0, 160) + (p.reason && p.reason.length > 160 ? '…' : '') + '</div>'
        + '</div>';
    }).join('<div style="height:1px;background:var(--border2,rgba(255,255,255,0.06));margin:2px 0"></div>');

    body = '<div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column">' + rows + '</div>';
    if (d.note) {
      body += '<div style="padding:6px 4px 2px;font-size:9.5px;color:var(--text3,#94a3b8);line-height:1.4">' + sideDailyPicksEsc(d.note) + '</div>';
    }
    body += '<div style="padding:6px 4px 0;font-size:9px;color:var(--text3,#94a3b8);border-top:1px solid var(--border2,rgba(255,255,255,0.06));margin-top:6px;line-height:1.4">'
      + 'Data ' + sideDailyPicksEsc(d.date) + ' · bukan nasihat investasi, hasil skor otomatis dari data real Invezgo.'
      + '</div>';
  } else {
    body = '';
  }

  el.innerHTML = header + body;
}
